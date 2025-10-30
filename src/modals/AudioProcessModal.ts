import {App, Modal, Notice} from "obsidian";
import type {AutoVoicePlugin} from "../../main";
import {nowTimestamp, slugify} from "../utils";

/**
 * 音频文件处理界面
 */
export class AudioProcessModal extends Modal {
  plugin: AutoVoicePlugin;
  fileInputEl!: HTMLInputElement;
  textOnlyToggle!: HTMLInputElement;
  summarizeToggle!: HTMLInputElement;

  constructor(app: App, plugin: AutoVoicePlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const {contentEl} = this;
    contentEl.empty();
    contentEl.createEl("h2", {text: "处理音频文件"});

    // 文件选择
    const fileWrapper = contentEl.createDiv("file-wrapper");
    fileWrapper.style.marginBottom = "15px";
    const fileLabel = fileWrapper.createEl("label", {text: "选择音频文件："});
    fileLabel.style.display = "block";
    fileLabel.style.marginBottom = "5px";
    const fileInput = fileWrapper.createEl("input", {type: "file"});
    this.fileInputEl = fileInput as HTMLInputElement;
    this.fileInputEl.accept = ".mp3,.wav,.m4a,.flac";
    this.fileInputEl.style.width = "100%";

    // text_only 复选框
    const textOnlyWrapper = contentEl.createDiv("checkbox-wrapper");
    textOnlyWrapper.style.marginBottom = "8px";
    const textOnlyLabel = textOnlyWrapper.createEl("label");
    textOnlyLabel.style.display = "flex";
    textOnlyLabel.style.alignItems = "center";
    textOnlyLabel.style.cursor = "pointer";
    const textOnlyCheckbox = textOnlyLabel.createEl("input", {type: "checkbox"});
    this.textOnlyToggle = textOnlyCheckbox as HTMLInputElement;
    this.textOnlyToggle.checked = this.plugin.settings.textOnly;
    this.textOnlyToggle.style.marginRight = "8px";
    textOnlyLabel.createSpan({text: "仅返回文本（不生成 PDF/ZIP）"});

    // summarize 复选框
    const summarizeWrapper = contentEl.createDiv("checkbox-wrapper");
    summarizeWrapper.style.marginBottom = "15px";
    const summarizeLabel = summarizeWrapper.createEl("label");
    summarizeLabel.style.display = "flex";
    summarizeLabel.style.alignItems = "center";
    summarizeLabel.style.cursor = "pointer";
    const summarizeCheckbox = summarizeLabel.createEl("input", {type: "checkbox"});
    this.summarizeToggle = summarizeCheckbox as HTMLInputElement;
    this.summarizeToggle.checked = this.plugin.settings.summarize;
    this.summarizeToggle.style.marginRight = "8px";
    summarizeLabel.createSpan({text: "生成学术总结（需配合上一选项）"});

    // 自动勾选 textOnly
    this.summarizeToggle.addEventListener('change', () => {
      if (this.summarizeToggle.checked) {
        this.textOnlyToggle.checked = true;
      }
    });

    const submitBtn = contentEl.createEl("button", {text: "提交任务"});
    submitBtn.style.width = "100%";
    submitBtn.style.padding = "8px";
    submitBtn.style.cursor = "pointer";

    submitBtn.onclick = async () => {
      const files = this.fileInputEl.files;
      if (!files || files.length === 0) {
        new Notice("请选择音频文件！");
        return;
      }

      const file = files[0];
      const textOnly = this.textOnlyToggle.checked;
      const summarize = this.summarizeToggle.checked;

      // 验证文件格式
      const validExts = ['.mp3', '.wav', '.m4a', '.flac'];
      const fileName = file.name.toLowerCase();
      if (!validExts.some(ext => fileName.endsWith(ext))) {
        new Notice("不支持的音频格式！支持：mp3, wav, m4a, flac");
        return;
      }

      // 验证 summarize 配置
      if (summarize && !textOnly) {
        new Notice("⚠️ 生成总结功能需要同时勾选「仅返回文本」选项");
        return;
      }

      // 检查 API 状态
      const apiHealthy = await this.plugin.ensureAPIHealthy();
      if (!apiHealthy) {
        return;
      }

      const modeText = textOnly ? (summarize ? "（文本+总结模式）" : "（纯文本模式）") : "（文件模式）";
      new Notice(`正在上传并处理音频${modeText}...`);
      this.close();

      try {
        // 读取文件为 ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();

        const taskResp = await this.plugin.apiClient.processAudio(arrayBuffer, file.name, {textOnly, summarize});
        const taskId = taskResp?.task_id || taskResp?.id || taskResp;
        if (!taskId) {
          new Notice('未收到任务 ID，提交可能失败');
          return;
        }

        new Notice(`任务已提交，ID: ${taskId}，开始处理${modeText}`);
        const finalStatus = await this.plugin.apiClient.pollTaskUntilDone(taskId);

        if (finalStatus.status === 'completed') {
          const result = finalStatus.result || {};
          let content = `# 音频处理结果\n\n**任务ID:** ${finalStatus.task_id}  \n**文件名:** ${finalStatus.filename}  \n**状态:** ${finalStatus.status}  \n**消息:** ${finalStatus.message || ''}\n\n`;

          if (textOnly) {
            const text = result.polished_text || result.audio_text || '';
            const summary = result.summary || '';
            const metaLines: string[] = [];
            if (result.extract_time !== undefined) metaLines.push(`提取时长: ${result.extract_time}s`);
            if (result.polish_time !== undefined) metaLines.push(`润色时长: ${result.polish_time}s`);

            if (summary) {
              content += `## 学术总结\n\n${summary}\n\n---\n\n`;
            }

            if (text) {
              content += `## 文本内容\n\n${text}\n\n`;
            }

            if (result.audio_text && result.polished_text) {
              content += `<details>\n<summary>原始ASR文本（点击展开）</summary>\n\n${result.audio_text}\n\n</details>\n\n`;
            }

            if (metaLines.length) content += `---\n**处理信息:**\n` + metaLines.map((l) => `- ${l}`).join('\n') + '\n';
          } else {
            const zipFile = result.zip_file || '';
            const outputDir = result.output_dir || '';
            content += `## 文件输出\n\n`;
            if (zipFile) content += `- **ZIP 文件:** ${zipFile}\n`;
            if (outputDir) content += `- **输出目录:** ${outputDir}\n`;
            content += `\n可使用 \`/api/v1/download/${finalStatus.task_id}\` 下载结果。\n`;
          }

          // 生成文件名
          let baseName = `音频_${slugify(file.name.replace(/\.[^.]+$/, ''), 30)}`;
          if (this.plugin.settings.includeTimestamp) baseName += `_${nowTimestamp()}`;

          await this.plugin.fileWriter.writeToMarkdown(baseName, content);
          await this.plugin.fileWriter.writeToRepo(baseName, content);
          new Notice(`音频处理完成并已保存结果 ✅ ${modeText}`);
        } else {
          const failContent = `任务失败：${finalStatus.message || JSON.stringify(finalStatus)}`;
          let failName = `音频_${finalStatus.task_id}_failed`;
          if (this.plugin.settings.includeTimestamp) failName += `_${nowTimestamp()}`;
          await this.plugin.fileWriter.writeToMarkdown(failName, failContent);
          await this.plugin.fileWriter.writeToRepo(failName, failContent);
          new Notice(`任务失败: ${finalStatus.message || ''}`);
        }
      } catch (err) {
        console.error(err);
        new Notice(`出错：${err?.message || String(err)}`);
      }
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}
