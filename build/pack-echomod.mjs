#!/usr/bin/env node
// Packs mod/ into dist/<id>-<version>.echomod (a plain ZIP, which is exactly the
// format ShinawaseLoader imports). Uses the loader's own archive writer logic so
// the produced archive matches what the loader expects.
import { createDeflateRaw, crc32 as zlibCrc32 } from 'node:zlib';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const buildRoot = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(buildRoot, '..');
const modRoot = join(projectRoot, 'mod');
const distRoot = join(projectRoot, 'dist');

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < table.length; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[i] = value >>> 0;
  }
  return table;
})();

const crc32 = (input) => {
  let value = 0xffffffff;
  for (const byte of input) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
};

const collectFiles = (directory, prefix = '') => {
  const entries = [];
  for (const name of readdirSync(directory)) {
    const full = join(directory, name);
    const relativePath = prefix ? `${prefix}/${name}` : name;
    if (statSync(full).isDirectory()) {
      entries.push(...collectFiles(full, relativePath));
    } else {
      entries.push({ path: relativePath, data: readFileSync(full) });
    }
  }
  return entries;
};

const dosDate = () => {
  const now = new Date();
  return {
    date: ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate(),
    time: (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2),
  };
};

const createZip = (entries) => {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.path.replaceAll('\\', '/'), 'utf8');
    const source = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const compressed = deflateRawSync(source, { level: 6 });
    const { date, time } = dosDate();
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc32(source), 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(source.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    locals.push(local, compressed);

    const record = Buffer.alloc(46 + name.length);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0x800, 8);
    record.writeUInt16LE(8, 10);
    record.writeUInt16LE(time, 12);
    record.writeUInt16LE(date, 14);
    record.writeUInt32LE(crc32(source), 16);
    record.writeUInt32LE(compressed.length, 20);
    record.writeUInt32LE(source.length, 24);
    record.writeUInt16LE(name.length, 28);
    name.copy(record, 46);
    record.writeUInt32LE(offset, 42);
    central.push(record);
    offset += local.length + compressed.length;
  }
  const centralData = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralData.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralData, end]);
};

const manifest = JSON.parse(readFileSync(join(modRoot, 'echo.mod.json'), 'utf8'));
const required = ['echo.mod.json', 'mod.js', 'icon.svg'];
const files = collectFiles(modRoot);
const present = new Set(files.map((file) => file.path));
const missing = required.filter((name) => !present.has(name));
if (missing.length) {
  throw new Error(`mod package is missing required files: ${missing.join(', ')}`);
}
if (manifest.main && !present.has(manifest.main)) {
  throw new Error(`manifest.main "${manifest.main}" is missing from the package`);
}
if (!present.has('bridge/provider-bridge.cjs')) {
  throw new Error('bridge/provider-bridge.cjs is missing — run the build first (`npm run build` in build/)');
}

const archive = createZip(files);
mkdirSync(distRoot, { recursive: true });
const outfile = join(distRoot, `${manifest.id}-${manifest.version}.echomod`);
writeFileSync(outfile, archive);

const sha = createHash('sha256').update(archive).digest('hex');
console.log(`packed ${files.length} files -> ${outfile}`);
console.log(`  size: ${(archive.length / 1024 / 1024).toFixed(2)} MB`);
console.log(`  sha256: ${sha}`);
