// Environment report for the deployed mod: what the host must provide at run
// time, and whether this machine can satisfy it. Mirrors the lookups the bundled
// bridge performs (NODE_PATH + createRequire against the loader directory).
import { createRequire } from 'node:module';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const buildRoot = dirname(fileURLToPath(import.meta.url));

const candidates = [
  process.env.ECHO_INSTALL_ROOT,
  'D:/program files (x86)/steam/steamapps/common/ECHO',
  'D:/SteamLibrary/steamapps/common/ECHO',
  'C:/Program Files (x86)/Steam/steamapps/common/ECHO',
  'C:/SteamLibrary/steamapps/common/ECHO',
].filter(Boolean);

const echoRoot = candidates.find((root) => existsSync(join(root, 'ECHO.exe')) || existsSync(join(root, 'resources', 'app.asar')));

console.log('ECHO install:', echoRoot || 'NOT FOUND');
if (!echoRoot) {
  console.log('\nSet ECHO_INSTALL_ROOT to the folder containing ECHO.exe and re-run.');
  process.exit(1);
}

const report = (label, ok, detail) => console.log(`${ok ? 'OK  ' : 'MISS'} ${label.padEnd(46)} ${detail}`);

const loaderRoot = join(echoRoot, 'ShinawaseLoader');
report('ShinawaseLoader installed', existsSync(join(loaderRoot, 'loader-version.json')), loaderRoot);
report('loader streaming bridge present', existsSync(join(loaderRoot, 'streaming-bridge.cjs')), 'streaming-bridge.cjs');

const bridgeBytes = existsSync(join(loaderRoot, 'streaming-bridge.cjs')) ? statSync(join(loaderRoot, 'streaming-bridge.cjs')).size : 0;
report('loader bridge size', bridgeBytes > 1_000_000, `${(bridgeBytes / 1024 / 1024).toFixed(2)} MB`);

// The bridge lazily requires the NCM enhanced client from the loader's own
// node_modules (see ShinawaseLoader/package.json).
const ncmCandidates = [
  join(loaderRoot, 'node_modules', '@neteasecloudmusicapienhanced', 'api'),
  join(echoRoot, 'resources', 'app.asar', 'node_modules', '@neteasecloudmusicapienhanced', 'api'),
];
const ncm = ncmCandidates.find((path) => existsSync(join(path, 'package.json')));
report('@neteasecloudmusicapienhanced/api', Boolean(ncm), ncm || `not found (checked ${ncmCandidates.length} locations)`);

let ncmResolvable = false;
try {
  const loaderRequire = createRequire(join(loaderRoot, 'index.cjs'));
  ncmResolvable = Boolean(loaderRequire.resolve('@neteasecloudmusicapienhanced/api'));
} catch {
  ncmResolvable = false;
}
report('NCM client resolvable from loader dir', ncmResolvable, ncmResolvable ? 'resolves' : 'resolve() failed');

// Where the mod's own package would land.
const modsDirs = [
  join(echoRoot, 'Mods', 'installed', 'echo.multi-music-sources'),
  join(echoRoot, 'ShinawaseLoader', 'Mods', 'installed', 'echo.multi-music-sources'),
];
const installed = modsDirs.find((path) => existsSync(join(path, 'echo.mod.json')));
report('mod already installed', Boolean(installed), installed || 'not installed yet');

// Report the mod-side requirements that are bundled (so nothing else is needed).
const bundled = ['music-metadata', 'opencc-js', 'pinyin-pro', 'iconv-lite', 'fflate'];
const bridgePath = resolve(buildRoot, '..', 'mod', 'bridge', 'provider-bridge.cjs');
report('built bridge present', existsSync(bridgePath), existsSync(bridgePath) ? `${(statSync(bridgePath).size / 1024 / 1024).toFixed(2)} MB` : 'run npm run build');

console.log('\nBundled into the mod (no host install needed):', bundled.join(', '));
console.log('Provided by the host at run time: electron, @neteasecloudmusicapienhanced/api (lazy, NetEase only)');
console.log('Resolved from app.asar.unpacked only if ever reached (lazy paths): better-sqlite3, sharp, taglib-wasm');

if (existsSync(loaderRoot)) {
  const logs = join(loaderRoot, 'Logs');
  if (existsSync(logs)) {
    const entries = readdirSync(logs).map((name) => `${name} (${statSync(join(logs, name)).size} bytes)`);
    console.log('\nloader logs:', entries.join(', ') || '(empty)');
  }
}
