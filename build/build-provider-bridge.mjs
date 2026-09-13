#!/usr/bin/env node
// Bundles build/provider-bridge.ts (the ECHO Community streaming algorithms)
// into the mod package as a single self-contained ESM file.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { echoShimPlugin, readEchoPackageVersion } from './shim-plugin.mjs';

const buildRoot = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(buildRoot, '..');
const echoRoot = resolve(process.env.ECHO_MAIN_ROOT || join(projectRoot, 'ECHO-main'));
const modRoot = join(projectRoot, 'mod');
const outDir = join(modRoot, 'bridge');

const MARKER = 'ECHO_MAIN_ROOT';
const sourceEntry = join(buildRoot, 'provider-bridge.ts');

if (!existsSync(join(echoRoot, 'src', 'main', 'streaming', 'StreamingService.ts'))) {
  throw new Error(`ECHO Community source not found at ${echoRoot}. Set ECHO_MAIN_ROOT or keep ECHO-main/ in the project root.`);
}

mkdirSync(outDir, { recursive: true });

// esbuild cannot resolve the ECHO_MAIN_ROOT placeholder as a bare specifier, so
// the entry is staged with the marker replaced by a real absolute path. The
// staged file must not start with a dot: esbuild silently ignores dot-prefixed
// entry names, which yields an empty bundle instead of an error.
const staged = join(buildRoot, 'provider-bridge.staged.ts');
writeFileSync(staged, readFileSync(sourceEntry, 'utf8').replaceAll(MARKER, echoRoot.replaceAll('\\', '/')), 'utf8');

const outfile = join(outDir, 'provider-bridge.cjs');

console.log(`Bundling community providers from ${echoRoot} (echo-next ${readEchoPackageVersion(echoRoot)})`);

// The bundle is CommonJS on purpose: the loader's main.cjs is CommonJS, and
// several bundled dependencies (music-metadata -> debug) use dynamic require(),
// which esbuild cannot express in an ESM output.
const banner = [
  "'use strict';",
  "const __echoMmsCreateRequire = require('node:module').createRequire;",
  "const __echoMmsPath = require('node:path');",
  "const __echoMmsFs = require('node:fs');",
  "const __echoMmsDirname = __dirname;",
  // ECHO's Netease provider does createRequire(import.meta.url) to lazily load
  // the NCM client; CommonJS output has no import.meta, so it is defined below.
  "const __echoMmsBridgeUrl = require('node:url').pathToFileURL(__echoMmsPath.join(__dirname, 'provider-bridge.cjs')).href;",
  // Resolve ECHO's own runtime packages (music-metadata, ...) and the loader's
  // optional NCM client exactly the way the loader's streaming bridge does.
  "const __echoMmsResourceRoot = process.resourcesPath || '';",
  "const __echoMmsSearchPaths = [",
  "  __echoMmsPath.join(__echoMmsResourceRoot, 'app.asar', 'node_modules'),",
  "  __echoMmsPath.join(__echoMmsResourceRoot, 'app.asar.unpacked', 'node_modules'),",
  "  __echoMmsPath.join(__echoMmsDirname, '..', 'node_modules'),",
  "  __echoMmsPath.join(__echoMmsDirname, '..', '..'),",
  '].filter(Boolean);',
  "process.env.NODE_PATH = [process.env.NODE_PATH, ...__echoMmsSearchPaths].filter(Boolean).join(__echoMmsPath.delimiter);",
  "try { require('node:module').Module._initPaths(); } catch {}",
].join('\n');

await build({
  entryPoints: [staged],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  plugins: [echoShimPlugin],
  // ECHO-main has no node_modules of its own, so bare imports from its sources
  // resolve against the build directory's dependency tree.
  nodePaths: [join(buildRoot, 'node_modules')],
  // Only what the host must own stays external:
  //  - electron: provided by ECHO's main process.
  //  - the native/prebuilt modules, which ECHO resolves from app.asar.unpacked.
  //  - the NCM client, which the loader installs next to its own bridge.
  // Everything else pure-JS is bundled so the mod is self-contained.
  external: [
    'electron',
    '@neteasecloudmusicapienhanced/api',
    'better-sqlite3',
    'sharp',
    'taglib-wasm',
    '@clamber_l/crypto',
    // Japanese romanization is an optional lazy feature in the community build;
    // keeping it external lets it degrade gracefully when the host lacks it.
    'kuroshiro',
    'kuroshiro-analyzer-kuromoji',
  ],
  banner: { js: banner },
  define: {
    'import.meta.url': '__echoMmsBridgeUrl',
    'import.meta.dirname': '__echoMmsDirname',
  },
  logLevel: 'info',
  legalComments: 'none',
  metafile: true,
});

const stats = statSync(outfile);
const bundle = readFileSync(outfile, 'utf8');
const requiredAnchors = [
  'createMultiMusicSourcesBridge',
  'createStreamingProviderRegistry',
  'netease',
  'qqmusic',
  'kugou',
  'bilibili',
  'soundcloud',
  'tidal',
  'qobuz',
  'spotify',
];
const missing = requiredAnchors.filter((anchor) => !bundle.includes(anchor));
if (missing.length) {
  throw new Error(`bundle verification failed: missing ${missing.join(', ')}`);
}
console.log(`provider-bridge.cjs ready: ${(stats.size / 1024 / 1024).toFixed(2)} MB -> ${outfile.split(sep).slice(-3).join('/')}`);
