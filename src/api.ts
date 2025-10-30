import {requestUrl} from "obsidian";
import type {AutoVoiceSettings} from "./settings";

// ------------------- API 接口 -------------------

export interface APIHealthResult {
  healthy: boolean;
  version?: string;
  config?: any;
  error?: string;
}

export interface ProcessOptions {
  textOnly?: boolean;
  summarize?: boolean;
  temperature?: number;
  maxTokens?: number;
}

/**
 * API 客户端类，封装所有后端 API 调用
 */
export class APIClient {
  constructor(private settings: AutoVoiceSettings) {
  }

  /**
   * 检查 API 健康状态（调用 /health 端点）
   */
  async checkHealth(): Promise<APIHealthResult> {
    const apiUrl = `${this.settings.apiBaseUrl.replace(/\/$/, '')}/health`;
    try {
      const response = await requestUrl({
        url: apiUrl,
        method: "GET",
        headers: {"Content-Type": "application/json"},
      });

      if (response.status === 200) {
        const data = response.json;
        return {
          healthy: true,
          version: data.version || data.name,
          config: data.config || {},
        };
      } else {
        return {
          healthy: false,
          error: `服务返回状态码: ${response.status}`,
        };
      }
    } catch (error) {
      console.error("API 健康检查失败:", error);
      return {
        healthy: false,
        error: error?.message || "无法连接到 API 服务",
      };
    }
  }

  /**
   * 提交 Bilibili 处理任务
   * 使用 text_only=true 时，后端仅返回纯文本结果（result.polished_text）及处理元数据，不生成 PDF/ZIP
   * summarize 参数必须配合 text_only=true 使用，会生成学术风格的总结
   */
  async processBilibili(videoUrl: string, options?: ProcessOptions): Promise<any> {
    const textOnly = options?.textOnly ?? this.settings.textOnly;
    const summarize = options?.summarize ?? this.settings.summarize;
    const temperature = options?.temperature ?? (summarize ? 0.7 : this.settings.llmTemperature);
    const maxTokens = options?.maxTokens ?? (summarize ? 4000 : this.settings.llmMaxTokens);

    const apiUrl = `${this.settings.apiBaseUrl.replace(/\/$/, '')}/api/v1/process/bilibili`;
    try {
      const response = await requestUrl({
        url: apiUrl,
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          video_url: videoUrl,
          llm_api: "deepseek-chat",
          temperature,
          max_tokens: maxTokens,
          text_only: textOnly,
          summarize: textOnly && summarize, // summarize 必须配合 text_only=true
        }),
      });
      return response.json;
    } catch (error) {
      console.error(error);
      throw new Error("API 请求失败，请检查服务是否运行。" + (error?.message ? ` ${error.message}` : ""));
    }
  }

  /**
   * 直接对文本进行总结（调用 /api/v1/summarize 端点）
   */
  async summarizeText(text: string, title?: string): Promise<any> {
    const apiUrl = `${this.settings.apiBaseUrl.replace(/\/$/, '')}/api/v1/summarize`;
    try {
      const response = await requestUrl({
        url: apiUrl,
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          text,
          title: title || "",
          llm_api: "deepseek-chat",
          temperature: 0.7,
          max_tokens: 4000,
        }),
      });
      return response.json;
    } catch (error) {
      console.error(error);
      throw new Error("总结 API 请求失败：" + (error?.message ? ` ${error.message}` : ""));
    }
  }

  /**
   * 查询单个任务状态
   */
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

  /**
   * 轮询直到完成/失败
   */
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

  /**
   * 处理音频文件（注意：Obsidian 的 requestUrl 不直接支持 FormData，需特殊处理）
   */
  async processAudio(fileData: ArrayBuffer, fileName: string, options?: ProcessOptions): Promise<any> {
    const textOnly = options?.textOnly ?? this.settings.textOnly;
    const summarize = options?.summarize ?? this.settings.summarize;
    const temperature = options?.temperature ?? (summarize ? 0.7 : this.settings.llmTemperature);
    const maxTokens = options?.maxTokens ?? (summarize ? 4000 : this.settings.llmMaxTokens);

    const apiUrl = `${this.settings.apiBaseUrl.replace(/\/$/, '')}/api/v1/process/audio`;

    // 构造 multipart/form-data
    const boundary = '----ObsidianFormBoundary' + Date.now();
    const parts: Uint8Array[] = [];
    const encoder = new TextEncoder();

    // 添加表单字段
    const fields = {
      llm_api: 'deepseek-chat',
      temperature: temperature.toString(),
      max_tokens: maxTokens.toString(),
      text_only: textOnly.toString(),
      summarize: (textOnly && summarize).toString(),
    };

    for (const [key, value] of Object.entries(fields)) {
      parts.push(encoder.encode(`--${boundary}\r\n`));
      parts.push(encoder.encode(`Content-Disposition: form-data; name="${key}"\r\n\r\n`));
      parts.push(encoder.encode(`${value}\r\n`));
    }

    // 添加文件
    parts.push(encoder.encode(`--${boundary}\r\n`));
    parts.push(encoder.encode(`Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`));
    parts.push(encoder.encode(`Content-Type: application/octet-stream\r\n\r\n`));
    parts.push(new Uint8Array(fileData));
    parts.push(encoder.encode(`\r\n--${boundary}--\r\n`));

    // 合并所有部分
    const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
    const body = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
      body.set(part, offset);
      offset += part.length;
    }

    try {
      const response = await requestUrl({
        url: apiUrl,
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
        body: body.buffer,
      });
      return response.json;
    } catch (error) {
      console.error(error);
      throw new Error("音频处理 API 请求失败：" + (error?.message ? ` ${error.message}` : ""));
    }
  }

  /**
   * 批量处理视频
   */
  async processBatch(urls: string[], options?: ProcessOptions): Promise<any> {
    const textOnly = options?.textOnly ?? this.settings.textOnly;
    const summarize = options?.summarize ?? this.settings.summarize;
    const temperature = options?.temperature ?? (summarize ? 0.7 : this.settings.llmTemperature);
    const maxTokens = options?.maxTokens ?? (summarize ? 4000 : this.settings.llmMaxTokens);

    const apiUrl = `${this.settings.apiBaseUrl.replace(/\/$/, '')}/api/v1/process/batch`;
    try {
      const response = await requestUrl({
        url: apiUrl,
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          urls,
          llm_api: "deepseek-chat",
          temperature,
          max_tokens: maxTokens,
          text_only: textOnly,
          summarize: textOnly && summarize,
        }),
      });
      return response.json;
    } catch (error) {
      console.error(error);
      throw new Error("批量处理 API 请求失败：" + (error?.message ? ` ${error.message}` : ""));
    }
  }

  /**
   * 生成视频字幕
   */
  async processSubtitle(fileData: ArrayBuffer, fileName: string): Promise<any> {
    const apiUrl = `${this.settings.apiBaseUrl.replace(/\/$/, '')}/api/v1/process/subtitle`;

    // 构造 multipart/form-data
    const boundary = '----ObsidianFormBoundary' + Date.now();
    const parts: Uint8Array[] = [];
    const encoder = new TextEncoder();

    // 添加文件
    parts.push(encoder.encode(`--${boundary}\r\n`));
    parts.push(encoder.encode(`Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`));
    parts.push(encoder.encode(`Content-Type: application/octet-stream\r\n\r\n`));
    parts.push(new Uint8Array(fileData));
    parts.push(encoder.encode(`\r\n--${boundary}--\r\n`));

    // 合并所有部分
    const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
    const body = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
      body.set(part, offset);
      offset += part.length;
    }

    try {
      const response = await requestUrl({
        url: apiUrl,
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
        body: body.buffer,
      });
      return response.json;
    } catch (error) {
      console.error(error);
      throw new Error("字幕生成 API 请求失败：" + (error?.message ? ` ${error.message}` : ""));
    }
  }
}
