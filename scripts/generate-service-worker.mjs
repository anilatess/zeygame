import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const viteConfig = await fs.readFile(path.join(root, 'vite.config.ts'), 'utf8');
const baseMatch = viteConfig.match(/base\s*:\s*(['"])(.*?)\1/);
if (!baseMatch) throw new Error('Could not read the Vite base path.');

const base = baseMatch[2];
if (!base.startsWith('/') || !base.endsWith('/')) {
  throw new Error(`Expected an absolute base path ending in slash, received: ${base}`);
}

async function listFiles(directory, prefix = '') {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.posix.join(prefix, entry.name);
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(absolute, relative)));
    else if (relative !== 'sw.js') files.push(relative);
  }
  return files;
}

const files = (await listFiles(dist)).sort();
if (!files.includes('index.html')) throw new Error('Build output has no index.html.');

const source = await fs.readFile(path.join(root, 'public', 'sw.js'), 'utf8');
const digest = crypto.createHash('sha256');
const hashes = {};
digest.update(source);
for (const relative of files) {
  const content = await fs.readFile(path.join(dist, relative));
  digest.update(relative);
  digest.update(content);
  hashes[`${base}${relative}`] = crypto.createHash('sha256').update(content).digest('hex');
}
hashes[base] = hashes[`${base}index.html`];
const cacheName = `zeygame-shell-${digest.digest('hex').slice(0, 16)}`;
const urls = [base, ...files.map((file) => `${base}${file}`)];
const generated = source
  .replace('__ZEYGAME_CACHE_NAME__', cacheName)
  .replace('__ZEYGAME_PRECACHE_URLS__', JSON.stringify(urls))
  .replace('__ZEYGAME_PRECACHE_HASHES__', JSON.stringify(hashes))
  .replace('__ZEYGAME_BASE_URL__', base);

if (generated.includes('__ZEYGAME_'))
  throw new Error('Service worker template has an unresolved token.');
await fs.writeFile(path.join(dist, 'sw.js'), generated);
console.log(
  `Generated ${path.relative(root, path.join(dist, 'sw.js'))} for ${base} (${urls.length} resources).`,
);
