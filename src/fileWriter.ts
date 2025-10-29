import {App, Notice} from "obsidian";
import type {AutoVoiceSettings} from "./settings";
import {DEFAULT_SETTINGS} from "./settings";

/**
 * 文件写入器类，负责将结果保存到 Vault 和仓库
 */
export class FileWriter {
  constructor(
    private app: App,
    private settings: AutoVoiceSettings
  ) {
  }

  /**
   * 将结果写入 Obsidian Vault
   */
  async writeToMarkdown(filename: string, content: string): Promise<void> {
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

  /**
   * 将结果写入仓库（通过 Node.js fs 模块）
   */
  async writeToRepo(filename: string, content: string): Promise<void> {
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
