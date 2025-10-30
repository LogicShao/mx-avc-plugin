# Max Auto Voice Collation

一个为 Obsidian 开发的语音自动整理插件，可以将 Bilibili 视频自动转换为文字笔记，并支持学术总结功能。

## 功能特性

### 核心功能

- **Bilibili 视频转文字**：输入 Bilibili 视频链接，自动提取音频、转录文字并进行智能润色
- **学术总结**：对转录的文字或现有笔记生成学术风格的内容总结
- **API 健康检查**：实时检测后端服务状态和配置信息
- **多种处理模式**：
  - 纯文本模式：仅返回转录和润色后的文字
  - 文件模式：生成 PDF/ZIP 文件包
  - 总结模式：生成学术风格的内容总结

### 智能保存

- 自动保存到 Obsidian Vault
- 可选保存到本地代码仓库
- 文件名支持包含时间戳和视频标题
- 自动创建目录结构

### 可配置参数

- API 服务地址
- 输出文件夹路径
- LLM 温度参数（0.0-1.0）
- LLM 最大 Token 数
- 处理模式默认设置

## 安装方法

### 用户安装

1. 在 [GitHub Releases](https://github.com/LogicShao/mx-avc-plugin/releases) 下载最新版本的 ZIP 文件
2. 解压到你的 Vault 插件目录：
   ```
   VaultFolder/.obsidian/plugins/mx-avc-plugin/
   ```
3. 在 Obsidian 中启用插件：
  - 打开 Obsidian 设置
  - 进入「第三方插件」
  - 关闭「安全模式」
  - 在「已安装插件」中找到「Max Auto Voice Collation」
  - 点击启用

### 前置要求

- Obsidian v0.15.0 或更高版本
- Node.js v16 或更高版本（仅开发需要）
- 后端 API 服务（AutoVoiceCollation）

### 开发安装

1. 克隆或下载本项目到 Obsidian 插件目录：

```bash
cd /path/to/your/vault/.obsidian/plugins/
git clone https://github.com/LogicShao/mx-avc-plugin.git mx-avc-plugin
cd mx-avc-plugin
```

2. 安装依赖：

```bash
npm install
```

**注意**：项目使用 `package-lock.json` 确保依赖版本一致性，推荐使用 `npm ci` 进行更快速的安装：

```bash
npm ci
```

3. 编译插件：

```bash
npm run build
```

4. 在 Obsidian 中启用插件：
  - 打开 Obsidian 设置
  - 进入「第三方插件」
  - 关闭「安全模式」
  - 在「已安装插件」中找到「Max Auto Voice Collation」
  - 点击启用

**开发建议**：

- 项目使用 `package-lock.json` 锁定依赖版本，已提交到仓库
- 建议使用 `npm ci` 而非 `npm install`，以确保依赖版本完全一致
- 这与 GitHub Actions 的构建流程保持一致

## 使用方法

### 启动后端服务

在使用插件前，需要先启动 AutoVoiceCollation 后端服务：

```bash
# 启动 API 服务
python api.py

# 或启动 WebUI 服务
python webui.py
```

默认服务地址：`http://localhost:8000`

### 命令列表

插件提供以下命令（可通过命令面板 `Ctrl/Cmd + P` 调用）：

1. **提交 AutoVoiceCollation 任务**
  - 打开输入框，输入 Bilibili 视频链接
  - 选择处理模式：
    - 仅返回文本：不生成 PDF/ZIP 文件
    - 生成学术总结：对转录内容生成学术风格总结
  - 提交后自动轮询任务状态，完成后保存结果

2. **对文本进行学术总结**
  - 可选择当前笔记或手动输入文本
  - 输入标题（可选）
  - 生成学术风格的内容总结

3. **检查 API 服务状态**
  - 快速检测后端服务是否正常运行
  - 显示服务版本和 ASR 模型信息

### 插件设置

在 Obsidian 设置 → 插件选项 → Max Auto Voice Collation 中可配置：

#### API 连接

- **API 地址**：后端服务地址（默认：`http://localhost:8000`）
- **结果保存目录**：Vault 中保存结果的文件夹（默认：`AutoVoiceResults`）

#### 处理模式

- **默认仅返回文本**：提交任务时默认只返回纯文本
- **默认生成学术总结**：提交任务时默认生成学术总结
- **LLM 温度参数**：控制生成文本的随机性（0.0-1.0，默认 0.1）
- **LLM 最大 Token 数**：生成文本时的最大 token 数（默认 6000）

#### 文件保存

- **同时保存到仓库**：在代码仓库中保存一份结果
- **仓库保存路径**：自定义仓库保存路径（留空使用 `process.cwd()`）
- **文件名包含时间戳**：为文件名添加时间戳（建议开启）
- **文件名包含视频标题**：如果后端返回标题，将其加入文件名

## 工作流程

### Bilibili 视频处理流程

1. 用户输入 Bilibili 视频链接
2. 插件调用后端 API 提交处理任务
3. 后端执行以下步骤：
  - 下载视频音频
  - 使用 ASR 模型转录文字
  - 使用 LLM 润色文本
  - （可选）生成学术总结
4. 插件轮询任务状态，完成后：
  - 获取处理结果
  - 生成 Markdown 格式文件
  - 保存到 Vault 和/或仓库
  - 显示完成通知

### 文本总结流程

1. 用户选择文本来源（当前笔记或手动输入）
2. 可选输入标题提供上下文
3. 插件调用后端 `/api/v1/summarize` 端点
4. 后端使用 LLM 生成学术总结
5. 插件保存总结结果（包含原文折叠展示）

## 开发说明

### 项目结构

```
mx-avc-plugin/
├── .github/
│   └── workflows/
│       └── release.yml      # GitHub Actions 自动发布配置
├── src/
│   ├── api.ts               # API 调用相关代码
│   └── modals/              # 模态框组件
│       ├── AudioProcessModal.ts
│       ├── BatchProcessModal.ts
│       └── SubtitleModal.ts
├── main.ts                  # 主插件代码
├── main.js                  # 编译后的插件
├── manifest.json            # 插件元数据
├── package.json             # 项目依赖配置
├── package-lock.json        # 依赖版本锁定文件
├── tsconfig.json            # TypeScript 配置
├── esbuild.config.mjs       # 构建配置
├── build-release.mjs        # 打包发布脚本
├── styles.css               # 样式文件
├── versions.json            # 版本兼容性记录
└── README.md                # 本文档
```

### 开发脚本

```bash
# 开发模式（监听文件变化自动编译）
npm run dev

# 生产构建
npm run build

# 打包文件到 build 目录并创建 ZIP 文件
npm run package

# 构建并打包（推荐用于发布）
npm run release

# 版本升级
npm run version

# 构建并复制到 Vault（需配置路径）
npm run build-and-copy
```

**注意**：`npm run package` 会：

- 复制 `main.js`、`manifest.json`、`styles.css` 到 `build/` 目录
- 自动将这些文件打包成 `mx-avc-plugin.zip`

### 发布流程

本项目已配置 GitHub Actions 自动发布流程：

1. **更新版本号**：
   ```bash
   npm version patch  # 更新补丁版本 (1.0.0 -> 1.0.1)
   npm version minor  # 更新次版本 (1.0.0 -> 1.1.0)
   npm version major  # 更新主版本 (1.0.0 -> 2.0.0)
   ```

2. **推送标签到 GitHub**：
   ```bash
   git push && git push --tags
   ```

3. **自动发布**：
  - GitHub Actions 自动触发（`.github/workflows/release.yml`）
  - 执行以下步骤：
    - 安装依赖（使用 `npm ci` 确保版本一致）
    - 构建插件（`npm run build`）
    - 打包文件（`npm run package`）
    - 创建带版本号的 ZIP 文件
    - 创建 GitHub Release
    - 上传以下文件：
      - `main.js`
      - `manifest.json`
      - `styles.css`
      - `mx-avc-plugin-{版本号}.zip`（包含上述三个文件）

4. **手动打包**（可选）：
   ```bash
   npm run release  # 构建并打包到 build 目录
   ```

**依赖说明**：

- 打包脚本使用 `archiver` 库创建 ZIP 文件
- 已在 `devDependencies` 中配置，无需手动安装

### API 端点

插件使用以下后端 API 端点：

- `GET /health` - 健康检查
- `POST /api/v1/process/bilibili` - 处理 Bilibili 视频
- `POST /api/v1/summarize` - 文本总结
- `GET /api/v1/task/{task_id}` - 查询任务状态
- `GET /api/v1/download/{task_id}` - 下载任务结果

## 故障排除

### API 连接失败

- 确保后端服务已启动（`python api.py` 或 `python webui.py`）
- 检查 API 地址设置是否正确
- 使用「检查 API 服务状态」命令测试连接

### 任务提交失败

- 检查 Bilibili 视频链接格式是否正确
- 确认后端服务有足够的资源（磁盘空间、内存等）
- 查看 Obsidian 开发者控制台（`Ctrl/Cmd + Shift + I`）获取详细错误信息

### 文件保存失败

- 确认输出文件夹有写入权限
- 检查文件名是否包含非法字符
- 如果保存到仓库失败，检查仓库路径是否正确

## 技术栈

- **核心**：TypeScript, Obsidian Plugin API
- **构建工具**：esbuild
- **打包工具**：archiver (ZIP 文件创建)
- **文件系统**：Node.js fs/path
- **CI/CD**：GitHub Actions

## 许可证

MIT License

## 作者

LogicShao

- GitHub: https://github.com/LogicShao

## 贡献

欢迎提交 Issue 和 Pull Request！

## 更新日志

### v1.0.0 (2024-10)

- 实现 Bilibili 视频自动转录功能
- 支持学术总结生成
- 添加 API 健康检查
- 支持多种处理模式
- 完善的设置界面
- 文件名自定义选项
- 添加自动打包脚本和 GitHub Actions 工作流
- 支持自动创建发布 ZIP 文件

## 相关项目

- [AutoVoiceCollation](https://github.com/LogicShao/AutoVoiceCollation) - 后端服务
- [Obsidian](https://obsidian.md) - 笔记软件

## 反馈与支持

如果你遇到问题或有功能建议，请在 [GitHub Issues](https://github.com/LogicShao/mx-avc-plugin/issues) 中提交。
