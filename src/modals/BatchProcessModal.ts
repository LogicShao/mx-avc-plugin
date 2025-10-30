import {App, Modal, Notice} from "obsidian";
import type {AutoVoicePlugin} from "../../main";
import {nowTimestamp} from "../utils";

/**
 * 批量处理视频界面
 */
export class BatchProcessModal extends Modal {
  plugin: AutoVoicePlugin;
  textArea!: HTMLTextAreaElement;
  textOnlyToggle!: HTMLInputElement;
  summarizeToggle!: HTMLInputElement;

  constructor(app: App, plugin: AutoVoicePlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const {contentEl} = this;
    contentEl.empty();
    contentEl.createEl("h2", {text: "批量处理 B站视频"});

    // URL输入区域
    const urlWrapper = contentEl.createDiv("url-wrapper");
    urlWrapper.style.marginBottom = "15px";
    const urlLabel = urlWrapper.createEl("label", {text: "输入视频链接（每行一个）："});
    urlLabel.style.display = "block";
    urlLabel.style.marginBottom = "5px";
    const textarea = urlWrapper.createEl("textarea", {
      placeholder: "https://www.bilibili.com/video/BV1...\nhttps://www.bilibili.com/video/BV2...\n..."
    });
    this.textArea = textarea as HTMLTextAreaElement;
    this.textArea.style.width = "100%";
    this.textArea.style.minHeight = "150px";
    this.textArea.style.padding = "8px";
    this.textArea.style.fontFamily = "monospace";
    this.textArea.style.fontSize = "13px";

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

    const submitBtn = contentEl.createEl("button", {text: "提交批量任务"});
    submitBtn.style.width = "100%";
    submitBtn.style.padding = "8px";
    submitBtn.style.cursor = "pointer";

    submitBtn.onclick = async () => {
      const urlsText = this.textArea.value.trim();
      if (!urlsText) {
        new Notice("请输入至少一个视频链接！");
        return;
      }

      // 解析URL列表
      const urls = urlsText
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && line.startsWith('http'));

      if (urls.length === 0) {
        new Notice("未找到有效的视频链接！");
        return;
      }

      const textOnly = this.textOnlyToggle.checked;
      const summarize = this.summarizeToggle.checked;

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
      new Notice(`正在提交 ${urls.length} 个视频的批量任务${modeText}...`);
      this.close();

      try {
        const taskResp = await this.plugin.apiClient.processBatch(urls, {textOnly, summarize});
        const taskId = taskResp?.task_id || taskResp?.id || taskResp;
        if (!taskId) {
          new Notice('未收到任务 ID，提交可能失败');
          return;
        }

        new Notice(`批量任务已提交，ID: ${taskId}，共 ${urls.length} 个视频，开始处理${modeText}`);
        const finalStatus = await this.plugin.apiClient.pollTaskUntilDone(taskId, 5000, 30 * 60 * 1000); // 30分钟超时

        if (finalStatus.status === 'completed') {
          const result = finalStatus.result || {};
          let content = `# 批量处理结果\n\n**任务ID:** ${finalStatus.task_id}  \n**视频数量:** ${urls.length}  \n**状态:** ${finalStatus.status}  \n**消息:** ${finalStatus.message || ''}\n\n`;

          if (textOnly) {
            // 文本模式：显示每个视频的结果
            content += `## 处理结果\n\n`;

            // 后端可能返回 videos 数组或 summaries 数组
            const videos = result.videos || result.summaries || [];
            if (videos.length > 0) {
              videos.forEach((video: any, index: number) => {
                content += `### ${index + 1}. ${video.title || video.video_title || `视频 ${index + 1}`}\n\n`;
                if (video.url) content += `**URL:** ${video.url}\n\n`;

                if (summarize && video.summary) {
                  content += `**总结:**\n\n${video.summary}\n\n`;
                }

                if (video.polished_text) {
                  content += `<details>\n<summary>润色后文本（点击展开）</summary>\n\n${video.polished_text}\n\n</details>\n\n`;
                }

                content += `---\n\n`;
              });
            } else {
              content += `处理完成，但未返回详细结果。\n\n`;
            }
          } else {
            // 文件模式
            const zipFile = result.zip_file || '';
            const outputDir = result.output_dir || '';
            content += `## 文件输出\n\n`;
            if (zipFile) content += `- **ZIP 文件:** ${zipFile}\n`;
            if (outputDir) content += `- **输出目录:** ${outputDir}\n`;
            content += `\n可使用 \`/api/v1/download/${finalStatus.task_id}\` 下载结果。\n`;
          }

          // 生成文件名
          let baseName = `批量任务_${urls.length}个视频`;
          if (this.plugin.settings.includeTimestamp) baseName += `_${nowTimestamp()}`;

          await this.plugin.fileWriter.writeToMarkdown(baseName, content);
          await this.plugin.fileWriter.writeToRepo(baseName, content);
          new Notice(`批量任务完成并已保存结果 ✅ ${modeText}`);
        } else {
          const failContent = `批量任务失败：${finalStatus.message || JSON.stringify(finalStatus)}`;
          let failName = `批量任务_${finalStatus.task_id}_failed`;
          if (this.plugin.settings.includeTimestamp) failName += `_${nowTimestamp()}`;
          await this.plugin.fileWriter.writeToMarkdown(failName, failContent);
          await this.plugin.fileWriter.writeToRepo(failName, failContent);
          new Notice(`批量任务失败: ${finalStatus.message || ''}`);
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
