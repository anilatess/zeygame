// Run: node scripts/verify-online-entry-ui.mjs. Create/Join form and mascot sizing regression.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('..', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');
const screen = read('src/components/OnlineScreen.tsx');
const styles = read('src/styles.css');

assert.match(screen, /className="online-icon online-entry-mascot"/);
assert.match(screen, /tab === 'create' \? 'Kendi odanı kur' : 'Arkadaşına katıl'/);
assert.match(screen, /id="display-name"/);
assert.match(screen, /id="room-code"/);
assert.match(screen, /inputMode="numeric"/);
assert.match(screen, /ODAYA KATIL/);
assert.match(screen, /ODA OLUŞTUR/);

assert.match(styles, /\.online-entry-mascot\s*\{[\s\S]*?width: clamp\(64px, 6vw, 80px\)/);
assert.match(styles, /\.online-entry-mascot\s*\{[\s\S]*?max-width: 80px/);
assert.match(styles, /\.online-entry-mascot\s*\{[\s\S]*?max-height: 80px/);
assert.match(
  styles,
  /\.online-entry-mascot > \.zg-mascot\s*\{[\s\S]*?width: 100%[\s\S]*?max-width: 100%[\s\S]*?height: 100%[\s\S]*?max-height: 100%/,
);
assert.match(styles, /\.online-panel\s*\{\s*min-width: 0/);
assert.match(styles, /\.online-content\s*\{\s*min-width: 0/);
assert.match(styles, /@media \(max-width: 600px\)[\s\S]*?\.online-entry-mascot\s*\{/);
assert.match(
  styles,
  /@media \(orientation: landscape\) and \(max-height: 560px\)[\s\S]*?\.online-entry-mascot\s*\{\s*display: none/,
);

assert.match(styles, /\.zg-hero-mascot\s*\{[\s\S]*?width: min\(100%, 320px\)/);
assert.match(styles, /\.lobby-mascot\s*\{[\s\S]*?width: 145px/);
assert.match(styles, /\.winner-mascot\s*\{[\s\S]*?width: 165px/);
assert.doesNotMatch(
  styles,
  /(^|\})\s*svg\s*\{/m,
  'no global SVG sizing rule may affect every mascot',
);

console.log(
  'PASS online entry UI: Create/Join form present, mascot bounded by context, responsive guards retained',
);
