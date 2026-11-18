'use strict';
// Syntax-checks every JavaScript file of the client (main, preload and renderer modules).
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'src');
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js')) files.push(p);
  }
})(root);

let failed = 0;
for (const f of files) {
  const isModule = f.includes(`${path.sep}renderer${path.sep}`) || /^\s*(import|export)\s/m.test(fs.readFileSync(f, 'utf8'));
  try {
    execFileSync(process.execPath, ['--input-type=' + (isModule ? 'module' : 'commonjs'), '--check'], { input: fs.readFileSync(f), stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (err) {
    failed++;
    process.stderr.write(`\n✗ ${path.relative(root, f)}\n${String(err.stderr || err.message)}\n`);
  }
}
console.log(`${files.length - failed}/${files.length} files passed the syntax check`);
process.exit(failed ? 1 : 0);
