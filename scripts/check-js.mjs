import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const targets = [
  ['js', (name) => name.endsWith('.js')],
  ['tests', (name) => name.endsWith('.js') || name.endsWith('.mjs')],
  ['scripts', (name) => name.endsWith('.mjs')],
];

const files = [];

const collect = (directory, accepts) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collect(path, accepts);
    else if (entry.isFile() && accepts(entry.name)) files.push(path);
  }
};

for (const [directory, accepts] of targets) collect(directory, accepts);
files.push('playwright.config.js');
files.sort();

let failures = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.error) {
    console.error(`${file}: ${result.error.message}`);
    failures += 1;
  } else if (result.status !== 0) {
    failures += 1;
  }
}

if (failures) {
  console.error(`JavaScript syntax check failed for ${failures} file(s).`);
  process.exitCode = 1;
} else {
  console.log(`JavaScript syntax check passed for ${files.length} file(s).`);
}
