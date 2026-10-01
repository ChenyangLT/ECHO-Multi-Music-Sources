// Checks the CSS template literal in mod/mod.js for the two mistakes that keep
// breaking the module: a stray backtick or an unescaped `${` inside it.
import fs from 'node:fs';

const source = fs.readFileSync('mod/mod.js', 'utf8');
const start = source.indexOf('const CSS = `');
if (start < 0) {
  console.log('FAIL: CSS template literal not found');
  process.exit(1);
}
const bodyStart = start + 'const CSS = `'.length;
const end = source.indexOf('`;', bodyStart);
if (end < 0) {
  console.log('FAIL: CSS template literal is not terminated');
  process.exit(1);
}
const body = source.slice(bodyStart, end);
const problems = [];
const ticks = (body.match(/`/gu) || []).length;
if (ticks > 0) problems.push(`${ticks} backtick(s) inside the CSS`);
const interpolations = (body.match(/\$\{/gu) || []).length;
if (interpolations > 0) problems.push(`${interpolations} \${ inside the CSS`);
// A CSS block comment that contains a backtick is the usual culprit.
for (const line of body.split('\n')) {
  if (/\/\*.*`.*\*\//u.test(line)) problems.push(`backtick in a CSS comment: ${line.trim().slice(0, 70)}`);
}

console.log(`CSS length: ${body.length} chars`);
if (problems.length) {
  console.log('FAIL:');
  for (const problem of problems) console.log(`  - ${problem}`);
  process.exit(1);
}
console.log('CSS template literal is clean');
