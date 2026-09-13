#!/usr/bin/env node
// Reachability audit: walks the import graph from the provider bridge entry and
// reports which external (bare) specifiers are actually reachable, with the
// shortest import chain to each. Used to keep the mod bundle free of ECHO's
// native daemon modules.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { echoShimPlugin } from './shim-plugin.mjs';

const buildRoot = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(buildRoot, '..');
const echoRoot = resolve(process.argv[2] || join(projectRoot, 'ECHO-main'));
const entry = join(buildRoot, 'provider-bridge.ts');
const markerRoot = echoRoot.replaceAll('\\', '/');
// The entry uses ECHO_MAIN_ROOT as a bare path placeholder; strip the marker so
// the walker sees normal absolute-relative paths, then resolve them.
const readSource = (file) => readFileSync(file, 'utf8').replaceAll('ECHO_MAIN_ROOT/', `${markerRoot}/`);

const extensions = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'];
const resolveFile = (base) => {
  for (const ext of extensions) {
    const candidate = `${base}${ext}`;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  for (const ext of extensions) {
    const candidate = join(base, `index${ext}`);
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
};

const importRe = /(?:^|\n)\s*(?:import|export)\s[^;\n]*?from\s*['"]([^'"]+)['"]/g;
const placeholderPrefix = 'ECHO_MAIN_ROOT/';
const resolvedEchoRoot = `${markerRoot}/`;

// Reuse the build's own replacement table so the audit reflects the shipped
// bundle rather than the raw ECHO graph.
const shimResolutions = new Map();
{
  const fakeBuild = {
    onResolve(_options, handler) {
      shimResolutions.set('handler', handler);
    },
    // The plugin also registers an onLoad hook (source patches); the audit only
    // needs the resolver, so the hook is accepted and ignored.
    onLoad() {},
  };
  echoShimPlugin.setup(fakeBuild);
}
const handler = shimResolutions.get('handler');
const resolveViaShimPlugin = (spec, importer) => {
  if (!handler) return null;
  const result = handler({ path: spec, importer, kind: 'import-statement', namespace: 'file', resolveDir: dirname(importer), pluginData: {} });
  return result?.path ?? null;
};

const graph = new Map();
const externalSources = new Map();
const queue = [[entry, []]];
const visited = new Set();

while (queue.length) {
  const [file, chain] = queue.shift();
  if (!file || visited.has(file)) continue;
  visited.add(file);
  let text;
  try {
    text = readSource(file);
  } catch {
    continue;
  }
  graph.set(file, chain);
  for (const match of text.matchAll(importRe)) {
    const spec = match[1];
    if (spec.startsWith('node:') || spec.startsWith('data:')) continue;
    // Route every specifier through the build's own resolver so shimmed modules
    // are followed as their shim rather than as the daemon implementation.
    const shimmed = resolveViaShimPlugin(spec, file);
    if (shimmed) {
      queue.push([shimmed, [...chain, file]]);
      continue;
    }
    const isPathSpec = spec.startsWith('.') || /^[A-Za-z]:\//.test(spec) || spec.startsWith('/');
    if (isPathSpec) {
      const next = resolveFile(resolve(dirname(file), spec));
      if (next) queue.push([next, [...chain, file]]);
      continue;
    }
    if (!externalSources.has(spec)) {
      externalSources.set(spec, [...chain, file]);
    }
  }
  // Dynamic imports matter too (lazy require paths).
  for (const match of text.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const spec = match[1];
    if (spec.startsWith('node:') || spec.startsWith('.')) continue;
    if (!externalSources.has(spec)) externalSources.set(spec, [...chain, file]);
  }
  for (const match of text.matchAll(/(?:^|[^.\w])require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const spec = match[1];
    if (spec.startsWith('node:') || spec.startsWith('.')) continue;
    if (!externalSources.has(spec)) externalSources.set(spec, [...chain, file]);
  }
}

const rel = (file) => relative(projectRoot, file).replace(/\\/g, '/');

// Optional: print the import chain to every reachable module whose basename
// matches a pattern, e.g. `node audit-reachability.mjs ECHO-main PlaybackSessionStore`.
const findPattern = process.argv[3];
if (findPattern) {
  const matches = [...visited].filter((file) => new RegExp(findPattern, 'u').test(basename(file)));
  if (!matches.length) {
    console.log(`no reachable module basename matches /${findPattern}/`);
  }
  for (const file of matches) {
    console.log(`\n${rel(file)}`);
    for (const step of graph.get(file) ?? []) console.log(`    ${rel(step)}`);
  }
  process.exit(0);
}

console.log(`reachable modules: ${visited.size}`);
console.log('\nreachable external packages:');
for (const [spec, chain] of [...externalSources.entries()].sort()) {
  console.log(`\n${spec}`);
  for (const step of chain) console.log(`    ${rel(step)}`);
}
