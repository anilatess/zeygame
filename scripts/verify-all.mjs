import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const directory = new URL('./', import.meta.url);
const tests = readdirSync(directory)
  .filter(
    (name) => name.startsWith('verify-') && name.endsWith('.mjs') && name !== 'verify-all.mjs',
  )
  .sort();
for (const test of tests) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(test, directory))], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    console.error(`FAIL ${test}\n${result.stdout}\n${result.stderr}`);
    if (result.error) console.error(result.error);
    process.exit(1);
  }
  console.log(`PASS ${test}`);
}
console.log(`All ${tests.length} verification scripts passed.`);
