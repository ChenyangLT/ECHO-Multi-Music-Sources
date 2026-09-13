#!/usr/bin/env node
// Installs a packed .echomod into the real ECHO + ShinawaseLoader install.
//
// ShinawaseLoader stores every enabled package *extracted* in
//   <ECHO>/Mods/installed/<mod id>/
// and that folder is what ECHO actually loads — dropping the archive into Mods/
// only works while the Loader UI is watching. This script mirrors the Loader's own
// `importPackage` step (wipe the folder, write the manifest, write every file) so
// the install is correct even when the Loader is not running, and then also drops
// the archive into Mods/ so a running Loader registers the same version (it moves
// it to Mods/.processed/ by itself).
//
// Usage:
//   node deploy-echomod.mjs [path/to/file.echomod] [--no-drop]
//
// The ECHO install is resolved from, in order:
//   1. $ECHO_MMS_ECHO_ROOT
//   2. %LOCALAPPDATA%\ShinawaseLoader\selection.json  (the Loader's own choice)
//   3. the usual Steam library locations
import { createHash } from 'node:crypto';
import {
  copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const buildRoot = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(buildRoot, '..');

// ---- zip reader (same semantics as the Loader's echomod-archive.mjs) --------

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
  const directoryOffset = bytes.readUInt32LE(end + 16);
  const files = [];
  let cursor = directoryOffset;
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
    cursor += 46 + nameLength + extraLength + commentLength;
    if (bytes.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`bad local header for ${name}`);
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
    const data = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed);
    if (data.length !== size) throw new Error(`${name}: size mismatch`);
    if (crc32(data) !== expectedCrc) throw new Error(`${name}: CRC mismatch`);
    files.push({ path: name.replaceAll('\\', '/'), data });
  }
  return files;
};

// ---- locating the game ------------------------------------------------------

const echoRootCandidates = () => {
  const candidates = [];
  if (process.env.ECHO_MMS_ECHO_ROOT) candidates.push(process.env.ECHO_MMS_ECHO_ROOT);

  // The Loader remembers which ECHO the user picked; that beats guessing.
  try {
    const selectionFile = join(process.env.LOCALAPPDATA || '', 'ShinawaseLoader', 'selection.json');
    if (existsSync(selectionFile)) {
      const selection = JSON.parse(readFileSync(selectionFile, 'utf8'));
      if (selection?.echoExe) candidates.push(dirname(String(selection.echoExe)));
    }
  } catch {
    /* the selection file is a hint, not a requirement */
  }

  for (const drive of ['C', 'D', 'E', 'F', 'G']) {
    for (const library of [`${drive}:\\SteamLibrary`, `${drive}:\\Program Files (x86)\\Steam`, `${drive}:\\Program Files\\Steam`, `${drive}:\\Steam`]) {
      candidates.push(join(library, 'steamapps', 'common', 'ECHO'));
    }
  }
  return candidates;
};

const resolveEchoRoot = () => {
  for (const candidate of echoRootCandidates()) {
    if (!candidate) continue;
    try {
      if (existsSync(join(candidate, 'ECHO.exe')) || existsSync(join(candidate, 'Mods'))) return resolve(candidate);
    } catch {
      /* keep looking */
    }
  }
  return null;
};

// The Loader writes native-host.json into the game's ShinawaseLoader folder;
// a pid that is still alive means the native host (and therefore the Loader) is
// up and watching Mods/ for drops.
const loaderIsRunning = (echoRoot) => {
  try {
    const hostFile = join(echoRoot, 'ShinawaseLoader', 'native-host.json');
    if (!existsSync(hostFile)) return false;
    const pid = Number(JSON.parse(readFileSync(hostFile, 'utf8'))?.pid);
    if (!Number.isFinite(pid) || pid <= 0) return false;
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const newestArchive = () => {
  const distRoot = join(projectRoot, 'dist');
  if (!existsSync(distRoot)) throw new Error('dist/ does not exist — run `npm run pack` first');
  const archives = readdirSync(distRoot)
    .filter((name) => name.toLowerCase().endsWith('.echomod'))
    .map((name) => ({ name, path: join(distRoot, name), at: statSync(join(distRoot, name)).mtimeMs }))
    .sort((left, right) => right.at - left.at);
  if (!archives.length) throw new Error('no .echomod in dist/ — run `npm run pack` first');
  return archives[0].path;
};

// ---- main -------------------------------------------------------------------

const argv = process.argv.slice(2);
const noDrop = argv.includes('--no-drop');
const archivePath = resolve(argv.find((arg) => !arg.startsWith('--')) || newestArchive());

if (!existsSync(archivePath)) throw new Error(`archive not found: ${archivePath}`);
const archiveBytes = readFileSync(archivePath);
const files = readZip(archiveBytes);

const manifestFile = files.find((file) => file.path === 'echo.mod.json');
if (!manifestFile) throw new Error('echo.mod.json missing from the archive');
const manifest = JSON.parse(manifestFile.data.toString('utf8'));
if (!manifest.id) throw new Error('the manifest has no id');
// The Loader normalises `entry` on import; the same shape is written here.
const normalized = {
  ...manifest,
  entry: manifest.entry || manifest.main || 'mod.js',
};

const echoRoot = resolveEchoRoot();
if (!echoRoot) {
  throw new Error('ECHO was not found. Set ECHO_MMS_ECHO_ROOT to the folder that holds ECHO.exe.');
}

const modsRoot = join(echoRoot, 'Mods');
const target = join(modsRoot, 'installed', manifest.id);
const installedManifestFile = join(target, 'echo.mod.json');

let installedVersion = null;
try {
  if (existsSync(installedManifestFile)) {
    installedVersion = JSON.parse(readFileSync(installedManifestFile, 'utf8'))?.version ?? null;
  }
} catch {
  installedVersion = null;
}

console.log(`archive:   ${archivePath}`);
console.log(`  ${manifest.id}@${manifest.version} — ${files.length} files, ${(archiveBytes.length / 1024 / 1024).toFixed(2)} MB`);
console.log(`  sha256:  ${createHash('sha256').update(archiveBytes).digest('hex')}`);
console.log(`ECHO:      ${echoRoot}`);
console.log(`installed: ${installedVersion ? `${manifest.id}@${installedVersion}` : '(nothing yet)'}`);
console.log(`Loader:    ${loaderIsRunning(echoRoot) ? 'running — it will pick the archive up too' : 'not running'}`);

// Back up a *different* installed version, so a bad build is one copy away from
// being undone. Re-deploying the same version does not pile up backups — the
// previous archive is still in dist/.
if (existsSync(target) && installedVersion && installedVersion !== manifest.version) {
  const stamp = new Date().toISOString().replace(/[:.]/gu, '-');
  const backup = join(projectRoot, 'work', `installed-backup-${installedVersion || 'unknown'}-${stamp}`);
  mkdirSync(backup, { recursive: true });
  const copyTree = (from, to) => {
    for (const entry of readdirSync(from, { withFileTypes: true })) {
      const source = join(from, entry.name);
      const destination = join(to, entry.name);
      if (entry.isDirectory()) {
        mkdirSync(destination, { recursive: true });
        copyTree(source, destination);
      } else {
        copyFileSync(source, destination);
      }
    }
  };
  copyTree(target, backup);
  console.log(`\nbackup:    ${backup}`);
}

// Exactly what ShinawaseLoader's importPackage() does.
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
writeFileSync(join(target, 'echo.mod.json'), `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');

const written = [];
for (const file of files) {
  if (file.path === 'echo.mod.json') continue;
  const destination = join(target, file.path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, file.data);
  written.push(`${file.path} (${(file.data.length / 1024).toFixed(1)} KB)`);
}
console.log('\ndeployed files:');
for (const line of written) console.log(`  ${line}`);

// Read everything back: a truncated or locked write must not look like a success.
const mismatched = [];
for (const file of files) {
  const destination = join(target, file.path);
  let installed = null;
  try {
    installed = readFileSync(destination);
  } catch {
    mismatched.push(`${file.path} (unreadable)`);
    continue;
  }
  // The manifest is rewritten in the Loader's own pretty shape, so it is
  // compared by identity rather than byte for byte.
  const same = file.path === 'echo.mod.json'
    ? JSON.parse(installed.toString('utf8')).version === manifest.version
    : installed.equals(file.data);
  if (!same) mismatched.push(`${file.path} (${installed.length} vs ${file.data.length} bytes)`);
}
if (mismatched.length) {
  throw new Error(`deployed files do not match the archive: ${mismatched.join(', ')}`);
}
console.log(`verified:  all ${files.length} files match the archive`);

// Also drop the archive so a running Loader imports the very same version (it
// moves the drop into Mods/.processed/ and notifies the native host).
if (!noDrop) {
  const dropped = join(modsRoot, basename(archivePath));
  // The Loader auto-imports EVERY archive sitting in Mods/, concurrently and in
  // directory order — a stale older .echomod of the same mod would be extracted
  // as well and could win the race, leaving the old version installed. Only the
  // archive being deployed is left behind.
  for (const name of existsSync(modsRoot) ? readdirSync(modsRoot) : []) {
    if (name === basename(archivePath)) continue;
    if (!name.toLowerCase().endsWith('.echomod')) continue;
    if (!name.startsWith(`${manifest.id}-`)) continue;
    rmSync(join(modsRoot, name), { force: true });
    console.log(`removed stale drop: ${name}`);
  }
  copyFileSync(archivePath, dropped);
  console.log(`\ndropped:   ${dropped}`);
}

console.log(`\n${manifest.id} ${installedVersion || '(none)'} -> ${manifest.version} is in place.`);
console.log('Restart ECHO (ECHO.modded.exe / the Loader start script) to load it.');
