// Proves build/main.js behaves identically to main.js.
//
//   python3 dev/build.py && node dev/verify.mjs
//
// The build only strips whitespace and comments, but the rules that do it are
// regexes running over real code, and a regex that is a shade too greedy can
// change a number or swallow a token without breaking the parse. node --check
// would still pass. This loads both files and compares the data they build.
import fs from 'fs';
import vm from 'vm';

function load(file) {
  const src = fs.readFileSync(file, 'utf8');
  const at = src.search(/window\.plethoraBit\s*=\s*\{/);
  if (at < 0) throw new Error('entry marker not found in ' + file);
  const inject = 'window.__V={EX:EX,WEEK:WEEK,RIG:RIG,B:B,C:C,REST:REST,CODES:CODES};';
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(src.slice(0, at) + inject + src.slice(at), sandbox, { filename: file });
  return sandbox.window.__V;
}

const a = load('main.js');
const b = load('build/main.js');
// Round, so a whitespace change that somehow perturbed a float is caught but
// ordinary float printing is not.
const norm = (o) => JSON.stringify(o, (k, v) => (typeof v === 'number' ? +v.toFixed(9) : v));

const bad = [];
for (const key of ['WEEK', 'RIG', 'B', 'C', 'REST', 'CODES']) {
  if (norm(a[key]) !== norm(b[key])) bad.push(key);
}
const ids = Object.keys(a.EX);
if (ids.join() !== Object.keys(b.EX).join()) bad.push('EX (different exercises)');
for (const id of ids) if (norm(a.EX[id]) !== norm(b.EX[id])) bad.push('EX.' + id);

if (bad.length) {
  console.error('the build changed the Bit:');
  for (const k of bad) console.error('  ' + k);
  process.exit(1);
}
console.log('ok - build matches source: ' + ids.length + ' exercises, ' +
  Object.keys(a.RIG).length + ' rigs, the whole week, every pose and caption');
