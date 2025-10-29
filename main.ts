import {Notice, Plugin} from "obsidian";

// 导入模块
import {AutoVoiceSettings, DEFAULT_SETTINGS} from "./src/settings";
import {APIClient} from "./src/api";
import {FileWriter} from "./src/fileWriter";
import {AutoVoiceModal} from "./src/modals/AutoVoiceModal";
import {SummarizeModal} from "./src/modals/SummarizeModal";
import {AutoVoiceSettingTab} from "./src/settingTab";

/**
 * AutoVoiceCollation 主插件类
 */
export class AutoVoicePlugin extends Plugin {
  settings: AutoVoiceSettings = DEFAULT_SETTINGS;
  apiHealthy: boolean = false;
  apiClient!: APIClient;
  fileWriter!: FileWriter;

  async onload() {
    await this.loadSettings();

    // 初始化 API 客户端和文件写入器
    this.apiClient = new APIClient(this.settings);
    this.fileWriter = new FileWriter(this.app, this.settings);

    // 注册命令
    this.addCommand({
      id: "open-autovoice-modal",
      name: "提交 AutoVoiceCollation 任务",
      callback: () => new AutoVoiceModal(this.app, this).open(),
    });

    this.addCommand({
      id: "summarize-text",
      name: "对文本进行学术总结",
      callback: () => new SummarizeModal(this.app, this).open(),
    });

    this.addCommand({
      id: "check-api-health",
      name: "检查 API 服务状态",
      callback: async () => {
        new Notice("正在检查 API 服务状态...");
        const result = await this.apiClient.checkHealth();
        if (result.healthy) {
          new Notice(`✅ API 服务正常\n版本: ${result.version || 'N/A'}\nASR 模型: ${result.config?.asr_model || 'N/A'}`);
        } else {
          new Notice(`❌ API 服务不可用\n${result.error || '请检查服务是否启动'}`);
        }
      },
    });

    // 添加设置面板
    this.addSettingTab(new AutoVoiceSettingTab(this.app, this));

    // 插件加载时检查 API 状态
    this.checkAPIHealthOnLoad();
  }

  async loadSettings() {
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data || {});
  }

  async saveSettings() {
    await this.saveData(this.settings);
    // 更新 API 客户端和文件写入器的设置引用
    this.apiClient = new APIClient(this.settings);
    this.fileWriter = new FileWriter(this.app, this.settings);
  }

  /**
   * 提交前检查 API 状态
   */
  async ensureAPIHealthy(): Promise<boolean> {
    const result = await this.apiClient.checkHealth();
    if (!result.healthy) {
      new Notice(
        `❌ API 服务不可用\n${result.error || '请先启动后端服务'}\n\n启动命令：python api.py 或 python webui.py`,
        10000
      );
      return false;
    }
    this.apiHealthy = true;
    return true;
  }

  /**
   * 插件加载时检查 API 健康状态
   */
  private async checkAPIHealthOnLoad() {
    const result = await this.apiClient.checkHealth();
    if (result.healthy) {
      this.apiHealthy = true;
      new Notice("AutoVoiceCollation 插件已加载 ✅\nAPI 服务已连接");
    } else {
      this.apiHealthy = false;
      new Notice("⚠️ AutoVoiceCollation 插件已加载\n但 API 服务未启动，请先启动后端服务", 8000);
    }
  }
}

// Obsidian 插件导出
export default AutoVoicePlugin;
