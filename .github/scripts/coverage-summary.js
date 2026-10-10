#!/usr/bin/env node
// Prints a Markdown coverage table from lcov.info files found under a directory.
// Usage: node coverage-summary.js <dir>
const fs = require('fs');
const path = require('path');

function findLcov(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return findLcov(full);
    return entry.name === 'lcov.info' ? [full] : [];
  });
}

function parse(file) {
  const t = { lf: 0, lh: 0, fnf: 0, fnh: 0, brf: 0, brh: 0 };
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const [key, value] = line.split(':');
    const n = Number(value);
    if (key === 'LF') t.lf += n;
    else if (key === 'LH') t.lh += n;
    else if (key === 'FNF') t.fnf += n;
    else if (key === 'FNH') t.fnh += n;
    else if (key === 'BRF') t.brf += n;
    else if (key === 'BRH') t.brh += n;
  }
  return t;
}

const pct = (hit, found) => (found === 0 ? 'n/a' : `${((hit / found) * 100).toFixed(1)}%`);

const root = process.argv[2] || 'coverage-artifacts';
const files = findLcov(root);

console.log('## Test coverage\n');
if (files.length === 0) {
  console.log('No coverage reports were produced (an earlier job may have failed).');
  process.exit(0);
}

console.log('| Suite | Lines | Functions | Branches |');
console.log('| --- | --- | --- | --- |');
for (const file of files.sort()) {
  const suite = path.basename(path.dirname(file)).replace(/-coverage$/, '');
  const t = parse(file);
  console.log(`| ${suite} | ${pct(t.lh, t.lf)} | ${pct(t.fnh, t.fnf)} | ${pct(t.brh, t.brf)} |`);
}
