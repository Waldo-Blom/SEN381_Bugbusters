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

const emptyCoverage = () => ({ lf: 0, lh: 0, fnf: 0, fnh: 0, brf: 0, brh: 0 });

function addCoverage(total, current) {
  for (const key of Object.keys(total)) {
    total[key] += current[key];
  }
}

function parse(file) {
  const records = [];
  let record;

  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (line.startsWith('SF:')) {
      record = { source: line.slice(3), coverage: emptyCoverage() };
      records.push(record);
      continue;
    }

    if (!record) continue;

    const [key, value] = line.split(':');
    const n = Number(value);
    if (key === 'LF') record.coverage.lf += n;
    else if (key === 'LH') record.coverage.lh += n;
    else if (key === 'FNF') record.coverage.fnf += n;
    else if (key === 'FNH') record.coverage.fnh += n;
    else if (key === 'BRF') record.coverage.brf += n;
    else if (key === 'BRH') record.coverage.brh += n;
    else if (key === 'end_of_record') record = undefined;
  }

  return records;
}

function unitName(source) {
  const normalized = source.replace(/\\/g, '/');
  const srcIndex = normalized.lastIndexOf('/src/');
  const relative =
    srcIndex === -1 ? normalized.replace(/^src\//, '') : normalized.slice(srcIndex + 5);
  const [area, unit] = relative.split('/');

  if (area === 'modules' && unit === 'index.js') return 'module registry';
  if (area === 'modules' && unit) return unit;
  if (area) return area === 'app.js' ? 'application' : area;
  return 'application';
}

const pct = (hit, found) => (found === 0 ? 'n/a' : `${((hit / found) * 100).toFixed(1)}%`);

const root = process.argv[2] || 'coverage-artifacts';
const files = findLcov(root);

console.log('## Unit test coverage\n');
if (files.length === 0) {
  console.error(`No unit coverage report found under ${root}.`);
  process.exit(1);
}

const total = emptyCoverage();
const units = new Map();

for (const file of files) {
  for (const record of parse(file)) {
    addCoverage(total, record.coverage);
    const unit = unitName(record.source);
    if (!units.has(unit)) units.set(unit, emptyCoverage());
    addCoverage(units.get(unit), record.coverage);
  }
}

console.log('| Unit | Lines | Functions | Branches |');
console.log('| --- | --- | --- | --- |');
console.log(
  `| **Total** | ${pct(total.lh, total.lf)} | ${pct(total.fnh, total.fnf)} | ${pct(total.brh, total.brf)} |`
);
for (const [unit, coverage] of [...units.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(
    `| ${unit} | ${pct(coverage.lh, coverage.lf)} | ${pct(coverage.fnh, coverage.fnf)} | ${pct(coverage.brh, coverage.brf)} |`
  );
}
