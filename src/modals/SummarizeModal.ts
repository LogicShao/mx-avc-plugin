import {App, Modal, Notice} from "obsidian";
import type {AutoVoicePlugin} from "../../main";
import {nowTimestamp, slugify} from "../utils";

/**
 * 文本学术总结界面
 */
export class SummarizeModal extends Modal {
  plugin: AutoVoicePlugin;
  textArea!: HTMLTextAreaElement;
  titleInput!: HTMLInputElement;
  sourceSelect!: HTMLSelectElement;

  constructor(app: App, plugin: AutoVoicePlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const {contentEl} = this;
    contentEl.empty();
    contentEl.createEl("h2", {text: "文本学术总结"});

    // 文本来源选择
    const sourceWrapper = contentEl.createDiv("source-wrapper");
    sourceWrapper.style.marginBottom = "10px";
    sourceWrapper.createEl("label", {text: "文本来源："});
    const select = sourceWrapper.createEl("select");
    this.sourceSelect = select as HTMLSelectElement;
    this.sourceSelect.style.marginLeft = "10px";
    this.sourceSelect.style.padding = "5px";
    this.sourceSelect.style.width = "200px";

    const option1 = this.sourceSelect.createEl("option", {text: "当前笔记", value: "current"});
    const option2 = this.sourceSelect.createEl("option", {text: "手动输入", value: "manual"});

    // 标题输入
    const titleWrapper = contentEl.createDiv("title-wrapper");
    titleWrapper.style.marginBottom = "10px";
    titleWrapper.createEl("label", {text: "文本标题（可选）："});
    titleWrapper.createEl("br");
    const titleInput = titleWrapper.createEl("input", {type: "text", placeholder: "输入标题以提供更好的总结上下文..."});
    this.titleInput = titleInput as HTMLInputElement;
    this.titleInput.style.width = "100%";
    this.titleInput.style.marginTop = "5px";
    this.titleInput.style.padding = "8px";

    // 文本输入区域
    const textWrapper = contentEl.createDiv("text-wrapper");
    textWrapper.style.marginBottom = "15px";
    const textLabel = textWrapper.createEl("label", {text: "要总结的文本："});
    textLabel.style.display = "block";
    textLabel.style.marginBottom = "5px";
    const textarea = textWrapper.createEl("textarea", {placeholder: "在此输入要总结的文本..."});
    this.textArea = textarea as HTMLTextAreaElement;
    this.textArea.style.width = "100%";
    this.textArea.style.minHeight = "200px";
    this.textArea.style.padding = "8px";
    this.textArea.style.fontFamily = "monospace";
    this.textArea.style.fontSize = "14px";

    // 监听来源切换
    this.sourceSelect.addEventListener('change', () => {
      if (this.sourceSelect.value === 'current') {
        this.loadCurrentNote();
      } else {
        this.textArea.value = '';
        this.textArea.disabled = false;
      }
    });

    // 默认加载当前笔记
    this.loadCurrentNote();

    // 提交按钮
    const submitBtn = contentEl.createEl("button", {text: "生成总结"});
    submitBtn.style.width = "100%";
    submitBtn.style.padding = "10px";
    submitBtn.style.cursor = "pointer";
    submitBtn.style.backgroundColor = "#4a9eff";
    submitBtn.style.color = "white";
    submitBtn.style.border = "none";
    submitBtn.style.borderRadius = "5px";

    submitBtn.onclick = async () => {
      const text = this.textArea.value.trim();
      const title = this.titleInput.value.trim();

      if (!text) {
        new Notice("请输入要总结的文本！");
        return;
      }

      if (text.length < 100) {
        new Notice("文本太短，无法生成有意义的总结（建议至少 100 字符）");
        return;
      }

      // 在提交前检查 API 状态
      const apiHealthy = await this.plugin.ensureAPIHealthy();
      if (!apiHealthy) {
        return; // API 不可用，不继续提交
      }

      new Notice("正在生成学术总结...");
      this.close();

      try {
        const result = await this.plugin.apiClient.summarizeText(text, title);

        if (result.status === 'success' && result.summary) {
          const summary = result.summary;
          const originalLength = result.original_length || text.length;
          const summaryLength = result.summary_length || summary.length;

          let content = `# 学术总结\n\n`;
          if (title) {
            content += `**标题:** ${title}\n\n`;
          }
          content += `**原始文本长度:** ${originalLength} 字符  \n`;
          content += `**总结长度:** ${summaryLength} 字符  \n`;
          content += `**生成时间:** ${new Date().toLocaleString()}\n\n`;
          content += `---\n\n`;
          content += `## 总结内容\n\n${summary}\n\n`;
          content += `---\n\n`;
          content += `<details>\n<summary>原始文本（点击展开）</summary>\n\n${text}\n\n</details>\n`;

          // 生成文件名
          let baseName = title ? `总结_${slugify(title, 40)}` : `总结`;
          if (this.plugin.settings.includeTimestamp) baseName += `_${nowTimestamp()}`;

          await this.plugin.fileWriter.writeToMarkdown(baseName, content);
          await this.plugin.fileWriter.writeToRepo(baseName, content);
          new Notice("学术总结已生成并保存 ✅");
        } else {
          new Notice(`总结失败: ${result.message || '未知错误'}`);
        }
      } catch (err) {
        console.error(err);
        new Notice(`出错：${err?.message || String(err)}`);
      }
    };
  }

  loadCurrentNote() {
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile) {
      this.app.vault.read(activeFile).then((content) => {
        this.textArea.value = content;
        this.textArea.disabled = true;
        if (!this.titleInput.value) {
          this.titleInput.value = activeFile.basename;
        }
      }).catch((err) => {
        new Notice("无法读取当前笔记");
        console.error(err);
        this.textArea.disabled = false;
      });
    } else {
      new Notice("没有打开的笔记，请手动输入文本");
      this.sourceSelect.value = 'manual';
      this.textArea.disabled = false;
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}
