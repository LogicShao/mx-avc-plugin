import {
  App,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  requestUrl,
  Setting,
  ToggleComponent,
  TextComponent
} from "obsidian";

// ------------------- 设置接口 -------------------

interface AutoVoiceSettings {
  apiBaseUrl: string;
  outputFolder: string;
  // 新增设置
  saveToRepo: boolean; // 是否同时保存到仓库
  repoSavePath?: string; // 仓库保存路径（可选，空则使用 process.cwd()）
  includeTimestamp: boolean; // 文件名是否包含时间戳
  includeTitle: boolean; // 文件名是否包含视频标题（如果后端返回）
}

const DEFAULT_SETTINGS: AutoVoiceSettings = {
  apiBaseUrl: "http://localhost:8000",
  outputFolder: "AutoVoiceResults",
  saveToRepo: true,
  repoSavePath: "",
  includeTimestamp: true,
  includeTitle: true,
};

// ------------------- 工具函数 -------------------

function slugify(input: string, maxLen = 40) {
  if (!input) return '';
  return input
    .toString()
    .normalize('NFKD')
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x00-\x7F]/g, '') // strip non-ascii to avoid weird filenames
    .replace(/[^\w\s-]/g, '') // remove non-word chars
    .trim()
    .replace(/\s+/g, '-') // spaces to dashes
    .substring(0, maxLen)
    .replace(/-+$/g, '');
}

function nowTimestamp() {
  const d = new Date();
  const YYYY = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const DD = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${YYYY}${MM}${DD}_${hh}${mm}${ss}`;
}

// ------------------- 主插件类 -------------------

export class AutoVoicePlugin extends Plugin {
  settings: AutoVoiceSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "open-autovoice-modal",
      name: "提交 AutoVoiceCollation 任务",
      callback: () => new AutoVoiceModal(this.app, this).open(),
    });

    this.addSettingTab(new AutoVoiceSettingTab(this.app, this));

    new Notice("AutoVoiceCollation 插件已加载 ✅");
  }

  async loadSettings() {
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data || {});
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  // 提交 Bilibili 处理任务
  // 使用 text_only=true 时，后端仅返回纯文本结果（result.text）及处理元数据，不生成 PDF/ZIP
  async callBilibiliAPI(videoUrl: string): Promise<any> {
    const apiUrl = `${this.settings.apiBaseUrl.replace(/\/$/, '')}/api/v1/process/bilibili`;
    try {
      const response = await requestUrl({
        url: apiUrl,
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          video_url: videoUrl,
          llm_api: "deepseek-chat",
          temperature: 0.1,
          max_tokens: 6000,
          text_only: true,
        }),
      });
      return response.json;
    } catch (error) {
      console.error(error);
      throw new Error("API 请求失败，请检查服务是否运行。" + (error?.message ? ` ${error.message}` : ""));
    }
  }

  // 查询单个任务状态
  async getTaskStatus(taskId: string): Promise<any> {
    const apiUrl = `${this.settings.apiBaseUrl.replace(/\/$/, '')}/api/v1/task/${taskId}`;
    try {
      const response = await requestUrl({url: apiUrl, method: "GET"});
      return response.json;
    } catch (error) {
      console.error(error);
      throw new Error("查询任务状态失败：" + (error?.message || ""));
    }
  }

  // 轮询直到完成/失败
  async pollTaskUntilDone(taskId: string, intervalMs = 3000, timeoutMs = 10 * 60 * 1000): Promise<any> {
    const start = Date.now();
    let polling = true;
    while (polling) {
      if (Date.now() - start > timeoutMs) throw new Error('轮询超时');
      const status = await this.getTaskStatus(taskId);
      if (!status || !status.status) {
        await new Promise((r) => setTimeout(r, intervalMs));
        continue;
      }
      if (status.status === 'completed' || status.status === 'failed') {
        polling = false;
        return status;
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  async writeResultToMarkdown(filename: string, content: string) {
    try {
      const folder = this.settings.outputFolder || DEFAULT_SETTINGS.outputFolder;
      // use vault API safely
      if (!this.app.vault.getAbstractFileByPath(folder)) {
        // createFolder will throw if folder is a file; wrap in try
        try {
          await this.app.vault.createFolder(folder);
        } catch (e) {
          // ignore if already exists or cannot create — we'll still try to create the file path
        }
      }
      const pathInVault = `${folder}/${filename}.md`;
      // if file exists, overwrite by delete/create
      const existing = this.app.vault.getAbstractFileByPath(pathInVault);
      if (existing) {
        // try to modify existing file
        try {
          await this.app.vault.modify(existing as any, content);
        } catch (e) {
          // fallback to create (some adapters may not support modify)
          await this.app.vault.create(pathInVault, content);
        }
      } else {
        await this.app.vault.create(pathInVault, content);
      }
      new Notice(`结果已保存到 Vault：${pathInVault}`);
    } catch (err) {
      console.error('写入 Vault 失败', err);
      new Notice(`写入 Vault 失败: ${err?.message || String(err)}`);
    }
  }

  async writeResultToRepo(filename: string, content: string) {
    if (!this.settings.saveToRepo) return;
    // Lazy require to avoid bundler/node issues in Obsidian environment
    let fs: any = null;
    let pathModule: any = null;
    try {
      // window.require exists in Obsidian (Electron) renderer; guard for other environments
      const w = (typeof window !== 'undefined') ? (window as any) : null;
      if (w && typeof w.require === 'function') {
        fs = w.require('fs');
        pathModule = w.require('path');
      } else if (typeof require === 'function') {
        // fallback (rare in strict bundlers)
        fs = require('fs'); // eslint-disable-line @typescript-eslint/no-var-requires
        pathModule = require('path'); // eslint-disable-line @typescript-eslint/no-var-requires
      }
    } catch (e) {
      // ignore — we'll handle null fs below
    }

    if (!fs || !pathModule) {
      new Notice('无法访问 Node 文件系统（fs/path），跳过仓库保存');
      return;
    }

    try {
      const repoRoot = this.settings.repoSavePath && this.settings.repoSavePath.trim()
        ? pathModule.resolve(this.settings.repoSavePath)
        : process.cwd();
      const outDir = pathModule.join(repoRoot, this.settings.outputFolder || DEFAULT_SETTINGS.outputFolder);
      fs.mkdirSync(outDir, {recursive: true});
      const filePath = pathModule.join(outDir, `${filename}.md`);
      fs.writeFileSync(filePath, content, {encoding: 'utf8'});
      new Notice(`结果已保存到仓库: ${filePath}`);
    } catch (err) {
      console.error('写入仓库失败', err);
      new Notice(`写入仓库失败: ${err?.message || String(err)}`);
    }
  }
}

// ------------------- 输入界面 Modal -------------------

class AutoVoiceModal extends Modal {
  plugin: AutoVoicePlugin;
  inputEl!: HTMLInputElement;

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
      new Notice("正在提交任务（text_only=true）...");
      this.close();
      try {
        const taskResp = await this.plugin.callBilibiliAPI(videoUrl);
        const taskId = taskResp?.task_id || taskResp?.id || taskResp;
        if (!taskId) {
          new Notice('未收到任务 ID，提交可能失败');
          return;
        }
        new Notice(`任务已提交，ID: ${taskId}，开始轮询结果（text_only=true）`);
        const finalStatus = await this.plugin.pollTaskUntilDone(taskId);
        if (finalStatus.status === 'completed') {
          const result = finalStatus.result || {};
          const text = result.polished_text || '';
          const metaLines: string[] = [];
          if (result.extract_time !== undefined) metaLines.push(`提取时长: ${result.extract_time}s`);
          if (result.polish_time !== undefined) metaLines.push(`润色时长: ${result.polish_time}s`);

          let content = `# AutoVoiceCollation 任务结果\n\n**任务ID:** ${finalStatus.task_id}  \n**状态:** ${finalStatus.status}  \n**消息:** ${finalStatus.message || ''}\n\n`;
          if (text) {
            content += `## 文本结果\n\n${text}\n\n`;
          }
          else {
            content += `未在 result 中找到 polished_text 字段，可能服务生成了文件输出，请检查下载端点。\n\n`;
          }
          if (metaLines.length) content += `---\n**处理信息:**\n` + metaLines.map((l) => `- ${l}`).join('\n') + '\n';

          // 生成文件名
          let baseName = `任务_${finalStatus.task_id}`;
          if (this.plugin.settings.includeTitle) {
            const title = result.title || result.video_title || result.title_raw || '';
            if (title) baseName += `_${slugify(title, 50)}`;
          }
          if (this.plugin.settings.includeTimestamp) baseName += `_${nowTimestamp()}`;

          await this.plugin.writeResultToMarkdown(baseName, content);
          await this.plugin.writeResultToRepo(baseName, content);
          new Notice('任务完成并已保存结果（text_only 模式）');
        } else {
          const failContent = `任务失败：${finalStatus.message || JSON.stringify(finalStatus)}`;
          let failName = `任务_${finalStatus.task_id}_failed`;
          if (this.plugin.settings.includeTimestamp) failName += `_${nowTimestamp()}`;
          await this.plugin.writeResultToMarkdown(failName, failContent);
          await this.plugin.writeResultToRepo(failName, failContent);
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

// ------------------- 设置面板 -------------------

class AutoVoiceSettingTab extends PluginSettingTab {
  plugin: AutoVoicePlugin;

  constructor(app: App, plugin: AutoVoicePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const {containerEl} = this;
    containerEl.empty();
    containerEl.createEl("h2", {text: "AutoVoiceCollation 设置"});

    new Setting(containerEl)
      .setName("API 地址")
      .setDesc("AutoVoiceCollation 服务基础 URL")
      .addText((text) =>
        text
          .setPlaceholder("http://localhost:8000")
          .setValue(this.plugin.settings.apiBaseUrl)
          .onChange(async (value) => {
            this.plugin.settings.apiBaseUrl = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("结果保存目录")
      .setDesc("保存 .md 文件的路径（相对 Vault 根目录）")
      .addText((text) =>
        text
          .setPlaceholder("AutoVoiceResults")
          .setValue(this.plugin.settings.outputFolder)
          .onChange(async (value) => {
            this.plugin.settings.outputFolder = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('同时保存到仓库')
      .setDesc('在 process.cwd()（或自定义路径）中保存一份 .md 结果，方便提交到代码仓库')
      .addToggle((toggle: ToggleComponent) =>
        toggle.setValue(this.plugin.settings.saveToRepo).onChange(async (v) => {
          this.plugin.settings.saveToRepo = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('仓库保存路径（可选）')
      .setDesc('填写绝对或相对路径；留空则使用 process.cwd()')
      .addText((text: TextComponent) =>
        text.setPlaceholder('')
          .setValue(this.plugin.settings.repoSavePath || '')
          .onChange(async (v) => {
            this.plugin.settings.repoSavePath = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('文件名包含时间戳')
      .setDesc('保存文件名是否附加时间戳（建议开启）')
      .addToggle((toggle: ToggleComponent) =>
        toggle.setValue(this.plugin.settings.includeTimestamp).onChange(async (v) => {
          this.plugin.settings.includeTimestamp = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('文件名包含视频标题')
      .setDesc('如果后端返回标题，是否在文件名中加入标题（会被 slugify）')
      .addToggle((toggle: ToggleComponent) =>
        toggle.setValue(this.plugin.settings.includeTitle).onChange(async (v) => {
          this.plugin.settings.includeTitle = v;
          await this.plugin.saveSettings();
        })
      );
  }
}

// Ensure Obsidian can load the plugin via default export
export default AutoVoicePlugin;
