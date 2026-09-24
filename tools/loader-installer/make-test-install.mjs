#!/usr/bin/env node
// 造一个最小可用的假 ECHO 安装，用来端到端验证安装器而不碰真实游戏。
//
// 生成内容：
//   <target>/ECHO.exe            真实 ECHO.exe 的副本（安装器要抽图标）
//   <target>/version             Electron 版本号
//   <target>/resources/app.asar  按 ShinawaseLoader 的 echo-asar.mjs / runtime-sync.mjs
//                                读取约定打包的最小 asar（桩 package.json + main/preload 入口）
//
// 用法：
//   node tools/loader-installer/make-test-install.mjs work/installer-test/ECHO "D:\...\common\ECHO"
//   dist/ShinawaseLoader-Installer.exe --install --echo-root work/installer-test/ECHO --force
//
// 注意：安装会覆盖 %LOCALAPPDATA%\ShinawaseLoader\selection.json（官方脚本据此定位游戏），
// 验证完记得把它改回真实游戏路径。
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [targetArg, realEchoArg] = process.argv.slice(2);
if (!targetArg || !realEchoArg) {
  console.error('usage: node make-test-install.mjs <targetDir> <realEchoDir>');
  process.exit(2);
}

const target = resolve(targetArg);
const realEcho = resolve(realEchoArg);
const must = (path, what) => {
  if (!existsSync(path)) {
    console.error(`missing ${what}: ${path}`);
    process.exit(1);
  }
  return path;
};

// ---- 极简 asar 打包（布局见上方注释，自检不过就直接失败） ----
const pad4 = (buffer) => (buffer.length % 4 === 0 ? buffer : Buffer.concat([buffer, Buffer.alloc(4 - (buffer.length % 4))]));
const buildAsar = (files) => {
  const header = { files: {} };
  const blobs = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text, 'utf8');
    const parts = name.split('/');
    let cursor = header.files;
    for (let i = 0; i < parts.length - 1; i += 1) {
      cursor[parts[i]] = cursor[parts[i]] || { files: {} };
      cursor = cursor[parts[i]].files;
    }
    cursor[parts[parts.length - 1]] = { size: data.length, offset: String(offset) };
    blobs.push(data);
    offset += data.length;
  }
  const json = Buffer.from(JSON.stringify(header), 'utf8');
  const jsonPadded = pad4(json);
  const headerSize = 8 + jsonPadded.length;          // 解析器视角：header 从 8 开始，其 [4]=jsonSize、[8..]=JSON
  const prefix = Buffer.alloc(16);
  prefix.writeUInt32LE(4, 0);
  prefix.writeUInt32LE(headerSize, 4);
  prefix.writeUInt32LE(json.length, 12);
  return { bytes: Buffer.concat([prefix, jsonPadded, ...blobs]), headerSize, jsonPadded };
};

const manifest = JSON.stringify({
  name: 'echo',
  version: '0.0.0-test',
  main: 'out/main/index.js',
  description: 'fake ECHO for installer tests',
});
const mainEntry = 'const { app } = require("electron");\napp.whenReady().then(() => {});\n';
const preloadEntry = 'const { contextBridge } = require("electron");\ncontextBridge.exposeInMainWorld("echo", {});\n';

const built = buildAsar({
  'package.json': manifest,
  'out/main/index.js': mainEntry,
  'out/preload/index.mjs': preloadEntry,
});
// 用解析器的算法读回来自检，避免生成一个骗自己的 asar
const headerSize = built.bytes.readUInt32LE(4);
const header = built.bytes.subarray(8, 8 + headerSize);
const jsonSize = header.readInt32LE(4);
const tree = JSON.parse(header.subarray(8, 8 + jsonSize).toString('utf8'));
const dataStart = 8 + headerSize;
const entry = tree.files.out.files.main.files['index.js'];
const text = built.bytes.subarray(dataStart + Number(entry.offset), dataStart + Number(entry.offset) + Number(entry.size)).toString('utf8');
if (text !== mainEntry) {
  console.error('asar self-check failed');
  process.exit(1);
}

mkdirSync(join(target, 'resources'), { recursive: true });
writeFileSync(join(target, 'resources', 'app.asar'), built.bytes);
copyFileSync(must(join(realEcho, 'version'), 'version file'), join(target, 'version'));

if (existsSync(join(realEcho, 'ECHO.exe'))) {
  copyFileSync(join(realEcho, 'ECHO.exe'), join(target, 'ECHO.exe'));
  console.log('copied ECHO.exe (the installer extracts its icon)');
} else {
  console.log('no ECHO.exe in the source; the installer will stop before compiling the host');
}
console.log(`test install ready at ${target} (asar dataStart=${dataStart}, self-check ok)`);
