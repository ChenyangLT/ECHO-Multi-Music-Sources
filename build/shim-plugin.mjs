// Build helper: redirect ECHO-main modules that depend on ECHO's desktop daemon
// (SQLite library database, protected-data gate, Electron auth windows) to the
// shims in this directory, so the pure music-platform algorithms can run inside
// a ShinawaseLoader mod.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourcePatches } from './source-patches.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const moduleReplacements = [
  ['src/main/app/appSettings.ts', 'shims/appSettings.ts'],
  ['src/main/app/dataProtection.ts', 'shims/dataProtection.ts'],
  ['src/main/database/createDatabase.ts', 'shims/createDatabase.ts'],
  ['src/main/database/LibraryDatabaseManager.ts', 'shims/LibraryDatabaseManager.ts'],
  ['src/main/library/PlaylistBackup.ts', 'shims/PlaylistBackup.ts'],
  ['src/main/library/audioAnalysis/BpmAnalyzer.ts', 'shims/BpmAnalyzer.ts'],
  ['src/main/diagnostics/SoftMemoryJanitor.ts', 'shims/SoftMemoryJanitor.ts'],
  ['src/main/plugins/privateEntitlements.ts', 'shims/privateEntitlements.ts'],
  ['src/main/accounts/SpotifyAuthService.ts', 'shims/SpotifyAuthService.ts'],
  ['src/main/accounts/TidalAuthService.ts', 'shims/TidalAuthService.ts'],
  ['src/main/streaming/StreamingCacheStore.ts', 'shims/StreamingCacheStore.ts'],
  // PluginStreamingProvider -> privateEntitlements -> PluginService ->
  // LibraryService -> AudioSession pulls in every native daemon module, so the
  // provider itself is replaced instead of chasing the whole graph.
  ['src/main/streaming/providers/PluginStreamingProvider.ts', 'shims/PluginStreamingProvider.ts'],
  // Both open a real better-sqlite3 handle in the daemon; the mod never owns a
  // database, so these keep the same surface without the native dependency.
  ['src/main/audio/PlaybackSessionStore.ts', 'shims/PlaybackSessionStore.ts'],
  ['src/main/database/health.ts', 'shims/databaseHealth.ts'],
  // Pure sharp consumers pulled in from the library graph.
  ['src/main/library/artistImages/ArtistImageCacheService.ts', 'shims/ArtistImageCacheService.ts'],
  ['src/main/library/workers/TsCoverExtractor.ts', 'shims/TsCoverExtractor.ts'],
  // Keeps the @clamber_l/crypto wasm module out of the bundle entirely.
  ['src/main/library/KgmConverter.ts', 'shims/KgmConverter.ts'],
  // The community MV engine (MvService) persists videos/offsets through these
  // two daemon surfaces: the protected library database and the library itself.
  // Both are replaced with small in-process equivalents (build/shims), so the
  // MV code runs unmodified inside a mod.
  ['src/main/library/LibraryService.ts', 'shims/LibraryService.ts'],
];

const echoSrcPrefix = (process.env.ECHO_MAIN_ROOT || join(here, '..', 'ECHO-main')).replaceAll('\\', '/').replace(/\/+$/u, '');
const slash = (value) => value.replace(/\\/g, '/');
// Shims outside the ECHO source tree refer to it through this placeholder.
const ECHO_ROOT_MARKER = 'ECHO_MAIN_ROOT/';
// Extension-less resolved specifiers are matched by stripping the extension from
// each replacement source as well.
const replacements = moduleReplacements.flatMap(([source, shim]) => {
  const normalized = slash(normalize(source));
  const withoutExtension = normalized.replace(/\.(tsx?|mts|cts|jsx?|mjs|cjs)$/u, '');
  return [
    { source: normalized, shim: join(here, shim) },
    { source: withoutExtension, shim: join(here, shim) },
  ];
});

export const echoShimPlugin = {
  name: 'echo-mms-shims',
  setup(build) {
    const debug = process.env.ECHO_MMS_SHIM_DEBUG === '1';
    build.onResolve({ filter: /.*/ }, (args) => {
      if (!args.importer || args.path.startsWith('node:') || args.path.startsWith('\0')) {
        return null;
      }
      // Rewrite the ECHO_MAIN_ROOT placeholder used by shims and the entry so
      // both can address ECHO's source tree from outside it. Resolve extension
      // probing here because the rewritten path is absolute, which esbuild
      // would otherwise hand to fs unchanged.
      if (args.path.startsWith(ECHO_ROOT_MARKER) || args.path === ECHO_ROOT_MARKER.slice(0, -1)) {
        const suffix = args.path.slice(ECHO_ROOT_MARKER.length - 1);
        const base = resolve(echoSrcPrefix, suffix.replace(/^[/\\]+/u, ''));
        const candidates = [
          base,
          `${base}.ts`,
          `${base}.tsx`,
          `${base}.mts`,
          `${base}.cts`,
          `${base}.js`,
          `${base}.mjs`,
          join(base, 'index.ts'),
          join(base, 'index.tsx'),
          join(base, 'index.js'),
        ];
        const found = candidates.find((candidate) => existsSync(candidate));
        if (!found) {
          throw new Error(`echo-mms-shims: cannot resolve "${args.path}" (tried ${candidates.join(', ')})`);
        }
        return { path: found };
      }
      if (!/^\.{1,2}\//.test(args.path)) {
        return null;
      }
      let importerDir;
      try {
        importerDir = slash(dirname(args.importer));
      } catch {
        return null;
      }
      // The staged entry rewrites the placeholder to the real absolute ECHO-main
      // path, so match on the source tree itself rather than a fixed folder name.
      if (!`${importerDir}/`.startsWith(`${echoSrcPrefix}/`)) {
        if (debug && args.path.includes('Entitlement')) console.log('[shim-skip]', args.path, args.importer);
        return null;
      }
      if (debug && /LibraryService|PlaybackSessionStore|AudioSession/u.test(args.path)) {
        console.log('[chain]', args.path, '<-', slash(args.importer));
      }
      const resolved = slash(normalize(resolve(dirname(args.importer), args.path)));
      const match = replacements.find((item) => resolved.endsWith(`/${item.source}`) || resolved.endsWith(item.source));
      if (!match) {
        if (debug && args.path.includes('Entitlement')) console.log('[shim-nomatch]', args.path, '->', resolved);
        return null;
      }
      if (debug) console.log('[shim]', args.path, '->', match.shim);
      return { path: match.shim };
    });

    // Apply the source patches to the vendored ECHO files as they are read. The
    // files on disk stay pristine; a patch whose anchor is missing fails loudly.
    // Several patches may target the same file, so every match is applied in
    // order rather than just the first.
    build.onLoad({ filter: /\.tsx?$/ }, (args) => {
      const normalized = slash(args.path);
      const patches = sourcePatches.filter((item) => normalized.endsWith(`/${item.file}`));
      if (!patches.length) {
        return null;
      }
      const source = readFileSync(args.path, 'utf8');
      let next = source;
      const applied = [];
      for (const patch of patches) {
        const steps = patch.steps ?? [patch];
        for (const step of steps) {
          if (next.includes(step.replacement)) {
            continue; // already applied
          }
          if (!next.includes(step.anchor)) {
            throw new Error(
              `source patch "${patch.id}" no longer applies to ${patch.file}: anchor not found. ` +
                'Upstream changed this code; update build/source-patches.mjs.',
            );
          }
          next = next.replace(step.anchor, step.replacement);
        }
        applied.push(patch.id);
      }
      if (next === source) {
        return { contents: source, loader: 'ts' };
      }
      console.log(`[patch] ${applied.join(', ')} -> ${patches[0].file}`);
      return { contents: next, loader: 'ts' };
    });
  },
};

export const readEchoPackageVersion = (echoRoot) => {
  try {
    return JSON.parse(readFileSync(join(echoRoot, 'package.json'), 'utf8')).version ?? 'unknown';
  } catch {
    return 'unknown';
  }
};
