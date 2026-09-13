// Prints the bundled-module banner comment preceding each import of a given
// bare specifier, so leftover daemon dependencies can be traced to their source
// module without rebuilding.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const buildRoot = dirname(fileURLToPath(import.meta.url));
const bundlePath = resolve(process.argv[2] || join(buildRoot, '..', 'mod', 'bridge', 'provider-bridge.cjs'));
const lines = readFileSync(bundlePath, 'utf8').split('\n');
const targets = process.argv.slice(3);
const wanted = targets.length ? targets : ['better-sqlite3', 'sharp', 'fflate', 'iconv-lite', 'pinyin-pro', '@clamber_l/crypto'];

for (const target of wanted) {
  console.log(`\n=== ${target} ===`);
  const needle = `from "${target}"`;
  lines.forEach((line, index) => {
    if (!line.startsWith('import ') || !line.includes(needle)) {
      return;
    }
    let origin = '(entry)';
    for (let back = index - 1; back >= 0 && back > index - 40; back -= 1) {
      if (/^\/\/\s/.test(lines[back])) {
        origin = lines[back].trim();
        break;
      }
    }
    console.log(`  line ${index + 1}: ${line.trim()}`);
    console.log(`      origin: ${origin}`);
  });
}
