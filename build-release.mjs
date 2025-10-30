import {copyFileSync, createWriteStream, existsSync, mkdirSync} from "fs";
import {join} from "path";
import archiver from "archiver";

const buildDir = "build";
const filesToCopy = ["main.js", "manifest.json", "styles.css"];

// 创建 build 目录
if (!existsSync(buildDir)) {
  mkdirSync(buildDir, {recursive: true});
  console.log(`✓ 创建目录: ${buildDir}`);
}

// 复制文件到 build 目录
filesToCopy.forEach((file) => {
  const source = file;
  const destination = join(buildDir, file);

  if (!existsSync(source)) {
    console.error(`✗ 文件不存在: ${source}`);
    process.exit(1);
  }

  copyFileSync(source, destination);
  console.log(`✓ 复制文件: ${file} -> ${destination}`);
});

console.log("\n打包完成！所有文件已复制到 build 目录。");

// 创建 zip 文件
const zipFileName = "mx-avc-plugin.zip";
const output = createWriteStream(join(buildDir, zipFileName));
const archive = archiver("zip", {
  zlib: {level: 9}, // 设置压缩级别
});

output.on("close", function () {
  console.log(`\n✓ 已创建 zip 文件: ${buildDir}/${zipFileName}`);
  console.log(`  总大小: ${(archive.pointer() / 1024).toFixed(2)} KB`);
  console.log("\n发布准备完成！");
});

archive.on("error", function (err) {
  console.error("✗ 创建 zip 文件时出错:", err);
  process.exit(1);
});

console.log(`\n正在创建 zip 文件...`);
archive.pipe(output);

// 将文件添加到 zip
filesToCopy.forEach((file) => {
  const filePath = join(buildDir, file);
  archive.file(filePath, {name: file});
  console.log(`  添加文件: ${file}`);
});

archive.finalize();
