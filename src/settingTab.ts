import {App, Notice, PluginSettingTab, Setting, TextComponent, ToggleComponent} from "obsidian";
import type {AutoVoicePlugin} from "../main";

/**
 * AutoVoiceCollation 设置面板
 */
export class AutoVoiceSettingTab extends PluginSettingTab {
  plugin: AutoVoicePlugin;

  constructor(app: App, plugin: AutoVoicePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const {containerEl} = this;
    containerEl.empty();
    containerEl.createEl("h2", {text: "AutoVoiceCollation 设置"});

    // === API 连接设置 ===
    containerEl.createEl("h3", {text: "API 连接"});

    // API 地址
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

    // API 状态检测和测试连接按钮
    const apiStatusSetting = new Setting(containerEl)
      .setName("API 服务状态")
      .setDesc("检查后端服务是否正常运行");

    // 创建状态显示元素
    const statusEl = apiStatusSetting.controlEl.createDiv();
    statusEl.style.display = "flex";
    statusEl.style.alignItems = "center";
    statusEl.style.gap = "10px";

    const statusIndicator = statusEl.createSpan();
    statusIndicator.style.padding = "5px 10px";
    statusIndicator.style.borderRadius = "5px";
    statusIndicator.style.fontSize = "12px";
    statusIndicator.style.fontWeight = "bold";

    const updateStatusDisplay = (healthy: boolean, version?: string, config?: any, error?: string) => {
      if (healthy) {
        statusIndicator.textContent = "✅ 已连接";
        statusIndicator.style.backgroundColor = "#4caf50";
        statusIndicator.style.color = "white";
        if (version || config) {
          const details = statusEl.createDiv();
          details.style.fontSize = "11px";
          details.style.color = "var(--text-muted)";
          const parts: string[] = [];
          if (version) parts.push(`版本: ${version}`);
          if (config?.asr_model) parts.push(`ASR: ${config.asr_model}`);
          details.textContent = parts.join(" | ");
        }
      } else {
        statusIndicator.textContent = "❌ 未连接";
        statusIndicator.style.backgroundColor = "#f44336";
        statusIndicator.style.color = "white";
        if (error) {
          const errorEl = statusEl.createDiv();
          errorEl.style.fontSize = "11px";
          errorEl.style.color = "#f44336";
          errorEl.textContent = error;
        }
      }
    };

    // 初始状态显示
    updateStatusDisplay(this.plugin.apiHealthy);

    // 测试连接按钮
    const testBtn = statusEl.createEl("button", {text: "测试连接"});
    testBtn.style.padding = "5px 15px";
    testBtn.style.cursor = "pointer";
    testBtn.onclick = async () => {
      testBtn.disabled = true;
      testBtn.textContent = "检测中...";

      // 清空之前的状态显示
      statusEl.empty();
      statusEl.appendChild(statusIndicator);
      statusEl.appendChild(testBtn);

      const result = await this.plugin.apiClient.checkHealth();

      testBtn.disabled = false;
      testBtn.textContent = "测试连接";

      // 重新添加测试按钮后再更新状态
      statusEl.empty();
      updateStatusDisplay(result.healthy, result.version, result.config, result.error);
      statusEl.appendChild(testBtn);

      if (result.healthy) {
        new Notice("✅ API 连接成功！");
      } else {
        new Notice(`❌ API 连接失败\n${result.error || '请检查服务是否启动'}\n\n启动命令：python api.py 或 python webui.py`, 8000);
      }
    };

    // 结果保存目录
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

    // === 处理模式设置 ===
    containerEl.createEl("h3", {text: "处理模式"});

    // text_only 默认值
    new Setting(containerEl)
      .setName('默认仅返回文本')
      .setDesc('提交任务时默认只返回纯文本，不生成 PDF/ZIP 文件')
      .addToggle((toggle: ToggleComponent) =>
        toggle.setValue(this.plugin.settings.textOnly).onChange(async (v) => {
          this.plugin.settings.textOnly = v;
          await this.plugin.saveSettings();
        })
      );

    // summarize 默认值
    new Setting(containerEl)
      .setName('默认生成学术总结')
      .setDesc('提交任务时默认生成学术风格的内容总结（需配合纯文本模式）')
      .addToggle((toggle: ToggleComponent) =>
        toggle.setValue(this.plugin.settings.summarize).onChange(async (v) => {
          this.plugin.settings.summarize = v;
          await this.plugin.saveSettings();
        })
      );

    // LLM 温度
    new Setting(containerEl)
      .setName('LLM 温度参数')
      .setDesc('控制生成文本的随机性（0.0-1.0，总结模式会自动使用 0.7）')
      .addText((text: TextComponent) =>
        text
          .setPlaceholder('0.1')
          .setValue(String(this.plugin.settings.llmTemperature))
          .onChange(async (v) => {
            const num = parseFloat(v);
            if (!isNaN(num) && num >= 0 && num <= 1) {
              this.plugin.settings.llmTemperature = num;
              await this.plugin.saveSettings();
            }
          })
      );

    // LLM max_tokens
    new Setting(containerEl)
      .setName('LLM 最大 Token 数')
      .setDesc('生成文本时的最大 token 数（总结模式会自动使用 4000）')
      .addText((text: TextComponent) =>
        text
          .setPlaceholder('6000')
          .setValue(String(this.plugin.settings.llmMaxTokens))
          .onChange(async (v) => {
            const num = parseInt(v);
            if (!isNaN(num) && num > 0) {
              this.plugin.settings.llmMaxTokens = num;
              await this.plugin.saveSettings();
            }
          })
      );

    // === 文件保存设置 ===
    containerEl.createEl("h3", {text: "文件保存"});

    // 同时保存到仓库
    new Setting(containerEl)
      .setName('同时保存到仓库')
      .setDesc('在 process.cwd()（或自定义路径）中保存一份 .md 结果，方便提交到代码仓库')
      .addToggle((toggle: ToggleComponent) =>
        toggle.setValue(this.plugin.settings.saveToRepo).onChange(async (v) => {
          this.plugin.settings.saveToRepo = v;
          await this.plugin.saveSettings();
        })
      );

    // 仓库保存路径
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

    // 文件名包含时间戳
    new Setting(containerEl)
      .setName('文件名包含时间戳')
      .setDesc('保存文件名是否附加时间戳（建议开启）')
      .addToggle((toggle: ToggleComponent) =>
        toggle.setValue(this.plugin.settings.includeTimestamp).onChange(async (v) => {
          this.plugin.settings.includeTimestamp = v;
          await this.plugin.saveSettings();
        })
      );

    // 文件名包含视频标题
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
