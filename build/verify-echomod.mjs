// Verifies a packed .echomod by reading it back with the loader's own archive
// reader semantics (local + central directory, CRC checked) and confirming the
// required manifest files are present and parseable.
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < table.length; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[i] = value >>> 0;
  }
  return table;
})();

const crc32 = (bytes) => {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
};

const readZip = (bytes) => {
  let end = -1;
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65557); index -= 1) {
    if (bytes.readUInt32LE(index) === 0x06054b50) {
      end = index;
      break;
    }
  }
  if (end < 0) throw new Error('zip end-of-central-directory not found');
  const count = bytes.readUInt16LE(end + 10);
  const directorySize = bytes.readUInt32LE(end + 12);
  const directoryOffset = bytes.readUInt32LE(end + 16);
  if (directoryOffset + directorySize > bytes.length) throw new Error('central directory out of range');
  const files = [];
  let cursor = directoryOffset;
  if (process.env.ECHO_MMS_VERIFY_DEBUG === '1') console.log(`[debug] count=${count} dirOffset=${directoryOffset} dirSize=${directorySize}`);
  for (let index = 0; index < count; index += 1) {
    if (bytes.readUInt32LE(cursor) !== 0x02014b50) throw new Error(`bad central header at ${cursor}`);
    const method = bytes.readUInt16LE(cursor + 10);
    const expectedCrc = bytes.readUInt32LE(cursor + 16);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const size = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    if (process.env.ECHO_MMS_VERIFY_DEBUG === '1') console.log(`[debug] entry ${index}: nameLen=${nameLength} name=${JSON.stringify(name)}`);
    cursor += 46 + nameLength + extraLength + commentLength;
    if (bytes.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`bad local header for ${name}`);
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
    const data = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed);
    if (data.length !== size) throw new Error(`${name}: size mismatch`);
    if (crc32(data) !== expectedCrc) throw new Error(`${name}: CRC mismatch`);
    files.push({ path: name, data });
  }
  return files;
};

const archivePath = process.argv[2];
if (!archivePath) {
  console.error('usage: node verify-echomod.mjs <file.echomod>');
  process.exit(2);
}

const bytes = readFileSync(archivePath);
const files = readZip(bytes);
const byPath = new Map(files.map((file) => [file.path, file]));

console.log(`archive: ${archivePath}`);
console.log(`  size: ${(bytes.length / 1024 / 1024).toFixed(2)} MB, entries: ${files.length}`);

const manifestFile = byPath.get('echo.mod.json');
if (!manifestFile) throw new Error('echo.mod.json missing from archive');
const manifest = JSON.parse(manifestFile.data.toString('utf8'));
console.log(`  manifest: ${manifest.id}@${manifest.version}`);

for (const key of ['entry', 'main', 'config', 'configSchema', 'configUi', 'icon']) {
  const value = manifest[key];
  if (value && !byPath.has(value)) throw new Error(`manifest.${key} "${value}" is missing from the archive`);
  if (value) console.log(`  ${key}: ${value} (${byPath.get(value).data.length} bytes)`);
}

const config = JSON.parse(byPath.get(manifest.config).data.toString('utf8'));
JSON.parse(byPath.get(manifest.configSchema).data.toString('utf8'));
console.log(`  config keys: ${Object.keys(config).length}`);

const bridge = byPath.get('bridge/provider-bridge.cjs');
if (!bridge) throw new Error('bridge/provider-bridge.cjs missing from archive');
console.log(`  bridge: ${(bridge.data.length / 1024 / 1024).toFixed(2)} MB`);

const topLevel = files.map((file) => file.path).sort();
console.log('  entries:');
for (const path of topLevel) console.log(`    ${path}`);
console.log('archive verified');
