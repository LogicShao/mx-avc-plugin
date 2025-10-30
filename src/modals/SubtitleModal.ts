import {App, Modal, Notice} from "obsidian";
import type {AutoVoicePlugin} from "../../main";
import {nowTimestamp, slugify} from "../utils";

/**
 * 视频字幕生成界面
 */
export class SubtitleModal extends Modal {
  plugin: AutoVoicePlugin;
  fileInputEl!: HTMLInputElement;

  constructor(app: App, plugin: AutoVoicePlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const {contentEl} = this;
    contentEl.empty();
    contentEl.createEl("h2", {text: "生成视频字幕"});

    // 说明文本
    const desc = contentEl.createDiv("description");
    desc.style.marginBottom = "15px";
    desc.style.padding = "10px";
    desc.style.backgroundColor = "var(--background-secondary)";
    desc.style.borderRadius = "5px";
    desc.style.fontSize = "13px";
    desc.innerHTML = `
      <p style="margin: 0 0 8px 0;"><strong>功能说明：</strong></p>
      <ul style="margin: 0; padding-left: 20px;">
        <li>上传视频文件，系统将自动识别语音并生成字幕</li>
        <li>字幕将被硬编码到视频中</li>
        <li>支持格式：mp4, avi, mkv, mov</li>
        <li>处理时间较长，请耐心等待</li>
      </ul>
    `;

    // 文件选择
    const fileWrapper = contentEl.createDiv("file-wrapper");
    fileWrapper.style.marginBottom = "15px";
    const fileLabel = fileWrapper.createEl("label", {text: "选择视频文件："});
    fileLabel.style.display = "block";
    fileLabel.style.marginBottom = "5px";
    const fileInput = fileWrapper.createEl("input", {type: "file"});
    this.fileInputEl = fileInput as HTMLInputElement;
    this.fileInputEl.accept = ".mp4,.avi,.mkv,.mov";
    this.fileInputEl.style.width = "100%";

    const submitBtn = contentEl.createEl("button", {text: "开始生成字幕"});
    submitBtn.style.width = "100%";
    submitBtn.style.padding = "8px";
    submitBtn.style.cursor = "pointer";

    submitBtn.onclick = async () => {
      const files = this.fileInputEl.files;
      if (!files || files.length === 0) {
        new Notice("请选择视频文件！");
        return;
      }

      const file = files[0];

      // 验证文件格式
      const validExts = ['.mp4', '.avi', '.mkv', '.mov'];
      const fileName = file.name.toLowerCase();
      if (!validExts.some(ext => fileName.endsWith(ext))) {
        new Notice("不支持的视频格式！支持：mp4, avi, mkv, mov");
        return;
      }

      // 检查文件大小（可选，避免上传过大文件）
      const maxSize = 500 * 1024 * 1024; // 500MB
      if (file.size > maxSize) {
        new Notice(`文件太大！最大支持 ${maxSize / 1024 / 1024}MB`);
        return;
      }

      // 检查 API 状态
      const apiHealthy = await this.plugin.ensureAPIHealthy();
      if (!apiHealthy) {
        return;
      }

      new Notice(`正在上传视频并生成字幕，文件大小: ${(file.size / 1024 / 1024).toFixed(2)}MB...`);
      this.close();

      try {
        // 读取文件为 ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();

        const taskResp = await this.plugin.apiClient.processSubtitle(arrayBuffer, file.name);
        const taskId = taskResp?.task_id || taskResp?.id || taskResp;
        if (!taskId) {
          new Notice('未收到任务 ID，提交可能失败');
          return;
        }

        new Notice(`任务已提交，ID: ${taskId}，开始生成字幕（可能需要较长时间）`);
        const finalStatus = await this.plugin.apiClient.pollTaskUntilDone(taskId, 10000, 60 * 60 * 1000); // 1小时超时

        if (finalStatus.status === 'completed') {
          const result = finalStatus.result || {};
          let content = `# 视频字幕生成结果\n\n**任务ID:** ${finalStatus.task_id}  \n**文件名:** ${finalStatus.filename}  \n**状态:** ${finalStatus.status}  \n**消息:** ${finalStatus.message || ''}\n\n`;

          content += `## 输出文件\n\n`;
          const outputVideo = result.output_video || result.video_file || '';
          const outputSrt = result.subtitle_file || result.srt_file || '';
          const outputDir = result.output_dir || '';

          if (outputVideo) content += `- **带字幕视频:** ${outputVideo}\n`;
          if (outputSrt) content += `- **字幕文件 (SRT):** ${outputSrt}\n`;
          if (outputDir) content += `- **输出目录:** ${outputDir}\n`;

          if (result.extract_time !== undefined) {
            content += `\n**处理时长:** ${result.extract_time.toFixed(2)}秒\n`;
          }

          content += `\n可使用 \`/api/v1/download/${finalStatus.task_id}\` 下载结果。\n`;

          // 如果有字幕文本，显示预览
          if (result.subtitle_text || result.text) {
            const subtitleText = result.subtitle_text || result.text || '';
            content += `\n## 字幕预览\n\n`;
            content += `<details>\n<summary>点击展开字幕文本</summary>\n\n\`\`\`\n${subtitleText}\n\`\`\`\n\n</details>\n`;
          }

          // 生成文件名
          let baseName = `字幕_${slugify(file.name.replace(/\.[^.]+$/, ''), 30)}`;
          if (this.plugin.settings.includeTimestamp) baseName += `_${nowTimestamp()}`;

          await this.plugin.fileWriter.writeToMarkdown(baseName, content);
          await this.plugin.fileWriter.writeToRepo(baseName, content);
          new Notice(`字幕生成完成并已保存结果 ✅`);
        } else {
          const failContent = `字幕生成失败：${finalStatus.message || JSON.stringify(finalStatus)}`;
          let failName = `字幕_${finalStatus.task_id}_failed`;
          if (this.plugin.settings.includeTimestamp) failName += `_${nowTimestamp()}`;
          await this.plugin.fileWriter.writeToMarkdown(failName, failContent);
          await this.plugin.fileWriter.writeToRepo(failName, failContent);
          new Notice(`字幕生成失败: ${finalStatus.message || ''}`);
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
