// Validates the mod package without depending on the host shell's encoding:
// parses every JSON file, syntax-checks the scripts, and asserts that the
// manifest points at files that exist.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const buildRoot = dirname(fileURLToPath(import.meta.url));
const modRoot = resolve(buildRoot, '..', 'mod');
const failures = [];

const readJson = (name) => {
  const raw = readFileSync(join(modRoot, name), 'utf8');
  try {
    return JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  } catch (error) {
    failures.push(`${name}: invalid JSON — ${error.message}`);
    return null;
  }
};

const manifest = readJson('echo.mod.json');
const config = readJson('config.json');
const schema = readJson('config.schema.json');

for (const [label, name] of [
  ['manifest', 'echo.mod.json'],
  ['config', 'config.json'],
  ['configSchema', 'config.schema.json'],
]) {
  if (manifest && manifest[label] && manifest[label] !== name) {
    failures.push(`manifest.${label} is "${manifest[label]}" but "${name}" exists`);
  }
  if (!existsSync(join(modRoot, name))) failures.push(`${name} is missing`);
}

for (const key of ['id', 'name', 'version', 'entry', 'icon']) {
  if (!manifest?.[key]) failures.push(`manifest.${key} is required`);
}

for (const key of ['entry', 'main', 'icon', 'config', 'configSchema', 'configUi']) {
  const value = manifest?.[key];
  if (value && !existsSync(join(modRoot, value))) failures.push(`manifest.${key} -> ${value} does not exist`);
}

// Syntax-check the scripts the way the loader will load them.
const checkScript = (name, { bare = false } = {}) => {
  const file = join(modRoot, name);
  if (!existsSync(file)) return;
  const source = readFileSync(file, 'utf8');
  try {
    if (bare) {
      // mod.js is evaluated as the body of an async function and may `return`.
      new vm.Script(`(async () => {\n${source}\n})`, { filename: name });
    } else {
      new vm.Script(source, { filename: name });
    }
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
  }
};

checkScript('main.cjs');
checkScript('mod.js', { bare: true });
checkScript('config-ui.js', { bare: true });

// config.json should only carry keys the schema knows about (plus tolerated ones).
if (schema?.properties && config) {
  const known = new Set(Object.keys(schema.properties));
  for (const key of Object.keys(config)) {
    if (!known.has(key)) failures.push(`config.json key "${key}" is not declared in config.schema.json`);
  }
  for (const key of known) {
    if (!(key in config)) failures.push(`config.schema.json declares "${key}" but config.json has no default`);
  }
}

if (!existsSync(join(modRoot, 'bridge', 'provider-bridge.cjs'))) {
  failures.push('bridge/provider-bridge.cjs is missing — run the build first');
}

if (failures.length) {
  console.error('mod validation failed:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`mod package valid: ${manifest.id}@${manifest.version}`);
  console.log(`  entry=${manifest.entry} main=${manifest.main} configUi=${manifest.configUi}`);
  console.log(`  schema properties: ${Object.keys(schema.properties).length}`);
  console.log(`  manifest description length: ${String(manifest.description || '').length}`);
}
