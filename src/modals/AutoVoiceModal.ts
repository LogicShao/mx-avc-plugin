import {App, Modal, Notice} from "obsidian";
import type {AutoVoicePlugin} from "../../main";
import {nowTimestamp, slugify} from "../utils";

/**
 * AutoVoiceCollation 任务提交界面
 */
export class AutoVoiceModal extends Modal {
  plugin: AutoVoicePlugin;
  inputEl!: HTMLInputElement;
  textOnlyToggle!: HTMLInputElement;
  summarizeToggle!: HTMLInputElement;

  constructor(app: App, plugin: AutoVoicePlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const {contentEl} = this;
    contentEl.empty();
    contentEl.createEl("h2", {text: "提交 AutoVoiceCollation 任务"});

    const inputWrapper = contentEl.createDiv("input-wrapper");
    const input = inputWrapper.createEl("input", {type: "text", placeholder: "请输入 Bilibili 视频链接..."});
    // createEl returns HTMLElement; cast safely
    this.inputEl = input as HTMLInputElement;
    this.inputEl.style.width = "100%";
    this.inputEl.style.marginBottom = "10px";

    // 添加 text_only 复选框
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

    // 添加 summarize 复选框
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

    // 当 summarize 被勾选时，自动勾选 textOnly
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
      const videoUrl = this.inputEl.value.trim();
      if (!videoUrl) {
        new Notice("请输入视频链接！");
        return;
      }

      const textOnly = this.textOnlyToggle.checked;
      const summarize = this.summarizeToggle.checked;

      // 验证：summarize 必须配合 textOnly
      if (summarize && !textOnly) {
        new Notice("⚠️ 生成总结功能需要同时勾选「仅返回文本」选项");
        return;
      }

      // 在提交前检查 API 状态
      const apiHealthy = await this.plugin.ensureAPIHealthy();
      if (!apiHealthy) {
        return; // API 不可用，不继续提交
      }

      const modeText = textOnly ? (summarize ? "（文本+总结模式）" : "（纯文本模式）") : "（文件模式）";
      new Notice(`正在提交任务${modeText}...`);
      this.close();

      try {
        const taskResp = await this.plugin.apiClient.processBilibili(videoUrl, {textOnly, summarize});
        const taskId = taskResp?.task_id || taskResp?.id || taskResp;
        if (!taskId) {
          new Notice('未收到任务 ID，提交可能失败');
          return;
        }
        new Notice(`任务已提交，ID: ${taskId}，开始轮询结果${modeText}`);
        const finalStatus = await this.plugin.apiClient.pollTaskUntilDone(taskId);
        if (finalStatus.status === 'completed') {
          const result = finalStatus.result || {};

          let content = `# AutoVoiceCollation 任务结果\n\n**任务ID:** ${finalStatus.task_id}  \n**状态:** ${finalStatus.status}  \n**消息:** ${finalStatus.message || ''}\n\n`;

          if (textOnly) {
            // text_only 模式：显示文本和总结
            const text = result.polished_text || '';
            const summary = result.summary || '';
            const metaLines: string[] = [];
            if (result.extract_time !== undefined) metaLines.push(`提取时长: ${result.extract_time}s`);
            if (result.polish_time !== undefined) metaLines.push(`润色时长: ${result.polish_time}s`);

            if (summary) {
              content += `## 学术总结\n\n${summary}\n\n---\n\n`;
            }

            if (text) {
              content += `## 润色后文本\n\n${text}\n\n`;
            } else {
              content += `未在 result 中找到 polished_text 字段。\n\n`;
            }

            if (result.audio_text) {
              content += `<details>\n<summary>原始ASR文本（点击展开）</summary>\n\n${result.audio_text}\n\n</details>\n\n`;
            }

            if (metaLines.length) content += `---\n**处理信息:**\n` + metaLines.map((l) => `- ${l}`).join('\n') + '\n';
          } else {
            // 文件模式：显示下载信息
            const zipFile = result.zip_file || '';
            const outputDir = result.output_dir || '';
            content += `## 文件输出\n\n`;
            if (zipFile) content += `- **ZIP 文件:** ${zipFile}\n`;
            if (outputDir) content += `- **输出目录:** ${outputDir}\n`;
            content += `\n可使用 \`/api/v1/download/${finalStatus.task_id}\` 下载结果。\n`;
          }

          // 生成文件名
          let baseName = `任务_${finalStatus.task_id}`;
          if (this.plugin.settings.includeTitle) {
            const title = result.title || result.video_title || result.title_raw || '';
            if (title) baseName += `_${slugify(title, 50)}`;
          }
          if (this.plugin.settings.includeTimestamp) baseName += `_${nowTimestamp()}`;

          await this.plugin.fileWriter.writeToMarkdown(baseName, content);
          await this.plugin.fileWriter.writeToRepo(baseName, content);
          new Notice(`任务完成并已保存结果 ✅ ${modeText}`);
        } else {
          const failContent = `任务失败：${finalStatus.message || JSON.stringify(finalStatus)}`;
          let failName = `任务_${finalStatus.task_id}_failed`;
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
