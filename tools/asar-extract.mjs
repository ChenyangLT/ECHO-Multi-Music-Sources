// Minimal app.asar lister/extractor (same header layout as ShinawaseLoader's echo-asar.mjs).
// Usage:
//   node tools/asar-extract.mjs list  <asar> [regex]
//   node tools/asar-extract.mjs extract <asar> <outDir> [regex]
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const readArchive = (file) => {
  const bytes = readFileSync(file);
  if (bytes.length < 12) throw new Error('asar_header_missing');
  const headerSize = bytes.readUInt32LE(4);
  const header = bytes.subarray(8, 8 + headerSize);
  const jsonSize = header.readInt32LE(4);
  const value = JSON.parse(header.subarray(8, 8 + jsonSize).toString('utf8'));
  return { bytes, dataStart: 8 + headerSize, value };
};

const filesIn = (node, prefix = '') => {
  const result = [];
  for (const [name, info] of Object.entries(node.files || {})) {
    const relativePath = prefix ? `${prefix}/${name}` : name;
    if (info.files) result.push(...filesIn(info, relativePath));
    else result.push({ relativePath, info });
  }
  return result;
};

const [action, archivePath, arg3, arg4] = process.argv.slice(2);
if (!action || !archivePath) {
  console.error('usage: node asar-extract.mjs list|extract <asar> [outDir|regex] [regex]');
  process.exit(2);
}

const parsed = readArchive(archivePath);
const all = filesIn(parsed.value);

if (action === 'list') {
  const re = arg3 ? new RegExp(arg3, 'u') : null;
  for (const e of all) {
    if (re && !re.test(e.relativePath)) continue;
    console.log(`${e.info.unpacked ? 'U' : ' '} ${String(e.info.size).padStart(9)} ${e.relativePath}`);
  }
  console.log(`# total ${all.length}`);
} else if (action === 'extract') {
  const outDir = resolve(arg3);
  const re = arg4 ? new RegExp(arg4, 'u') : null;
  let n = 0;
  for (const e of all) {
    if (re && !re.test(e.relativePath)) continue;
    if (e.info.unpacked || e.info.link) continue;
    const dest = join(outDir, e.relativePath);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, parsed.bytes.subarray(parsed.dataStart + Number(e.info.offset), parsed.dataStart + Number(e.info.offset) + Number(e.info.size)));
    n += 1;
  }
  console.log(`extracted ${n} files -> ${outDir}`);
} else {
  console.error(`unknown action ${action}`);
  process.exit(2);
}
