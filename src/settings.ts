// ------------------- 设置接口和默认值 -------------------

export interface AutoVoiceSettings {
  apiBaseUrl: string;
  outputFolder: string;
  // 新增设置
  saveToRepo: boolean; // 是否同时保存到仓库
  repoSavePath?: string; // 仓库保存路径（可选，空则使用 process.cwd()）
  includeTimestamp: boolean; // 文件名是否包含时间戳
  includeTitle: boolean; // 文件名是否包含视频标题（如果后端返回）
  textOnly: boolean; // 是否只返回纯文本结果（不生成 PDF/ZIP）
  summarize: boolean; // 是否生成学术风格总结（需配合 textOnly=true）
  llmTemperature: number; // LLM 温度参数
  llmMaxTokens: number; // LLM 最大 token 数
}

export const DEFAULT_SETTINGS: AutoVoiceSettings = {
  apiBaseUrl: "http://localhost:8000",
  outputFolder: "AutoVoiceResults",
  saveToRepo: true,
  repoSavePath: "",
  includeTimestamp: true,
  includeTitle: true,
  textOnly: true,
  summarize: false,
  llmTemperature: 0.1,
  llmMaxTokens: 6000,
};
