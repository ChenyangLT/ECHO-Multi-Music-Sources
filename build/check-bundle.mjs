// Diagnostic: confirms every daemon-coupled ECHO module was replaced by its shim
// and reports the reachable bare imports of the produced bundle.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const buildRoot = dirname(fileURLToPath(import.meta.url));
const bundlePath = resolve(process.argv[2] || join(buildRoot, '..', 'mod', 'bridge', 'provider-bridge.cjs'));
const bundle = readFileSync(bundlePath, 'utf8');

const mustBeShimmed = [
  ['appSettings shim', 'setShimSettings'],
  ['dataProtection shim', 'shims/dataProtection.ts'],
];
const mustNotContain = [
  'kuroshiro-analyzer-kuromoji',
  'LibraryScanWorker',
  'ArtistImageCacheService',
];

console.log(`bundle: ${bundlePath} (${(bundle.length / 1024 / 1024).toFixed(2)} MB)`);
console.log('\nshim markers:');
for (const [label, marker] of mustBeShimmed) {
  console.log(`  ${bundle.includes(marker) ? 'OK  ' : 'MISS'} ${label} (${marker})`);
}
console.log('\nbare imports reachable in the bundle:');
const specs = new Map();
for (const match of bundle.matchAll(/require\(["']([^"']+)["']\)|^import\s[^;\n]*?from\s*["']([^"']+)["']/gm)) {
  const spec = match[1] || match[2];
  if (!spec || spec.startsWith('.') || spec.startsWith('node:') || spec.startsWith('/') || /^[A-Za-z]:/.test(spec)) continue;
  specs.set(spec, (specs.get(spec) || 0) + 1);
}
for (const [spec, count] of [...specs.entries()].sort()) {
  console.log(`  ${spec.padEnd(36)} x${count}`);
}
if (!specs.size) console.log('  (none — the bundle only needs the host runtime)');

const offenders = mustNotContain.filter((needle) => bundle.includes(needle));
console.log(`\ndaemon modules that should be gone: ${offenders.length ? offenders.join(', ') : 'none'}`);
