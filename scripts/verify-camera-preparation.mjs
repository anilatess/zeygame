// Run: node scripts/verify-camera-preparation.mjs. Camera failure and dev-bypass regression checks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const root = new URL('..', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');
function evaluate(path, additions = {}) {
  const { outputText } = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  vm.runInNewContext(
    outputText,
    { exports, DOMException, window: { setTimeout, clearTimeout }, ...additions },
    { filename: path },
  );
  return exports;
}

const policy = evaluate('src/online/camera-bypass-policy.ts');
assert.equal(policy.cameraBypassAvailable(false, 'false'), false);
assert.equal(
  policy.cameraBypassAvailable(false, 'true'),
  false,
  'production must ignore true flag',
);
assert.equal(policy.cameraBypassAvailable(true, 'false'), false);
assert.equal(policy.cameraBypassAvailable(true, undefined), false);
assert.equal(policy.cameraBypassAvailable(true, 'true'), true);

const preparation = evaluate('src/online/camera-preparation.ts');
assert.equal(
  preparation.cameraPreparationErrorMessage({
    status: 'missing',
    message: 'Bu cihazda kullanılabilir bir kamera bulunamadı.',
  }),
  'Bu cihazda kullanılabilir bir kamera bulunamadı.',
);
assert.match(
  preparation.cameraPreparationErrorMessage(new DOMException('', 'NotAllowedError')),
  /Kamera izni verilmedi/,
);
assert.match(
  preparation.cameraPreparationErrorMessage(new DOMException('', 'NotReadableError')),
  /başka bir uygulama/,
);
let timedOut = false;
await assert.rejects(
  preparation.withCameraPreparationTimeout(new Promise(() => {}), () => (timedOut = true), 5),
  /timed out/,
);
assert.equal(timedOut, true);

const camera = read('src/camera.ts');
assert.match(camera, /navigator\.mediaDevices\?\.getUserMedia/);
assert.match(camera, /enumerateDevices/);
assert.match(camera, /device\.kind === 'videoinput'/);
for (const errorName of [
  'NotFoundError',
  'NotAllowedError',
  'NotReadableError',
  'AbortError',
  'OverconstrainedError',
])
  assert.ok(camera.includes(errorName), `Missing camera mapping: ${errorName}`);
assert.match(camera, /ACQUISITION_TIMEOUT_MS = 20_000/);
assert.match(camera, /METADATA_TIMEOUT_MS = 12_000/);

const guard = read('src/online/camera-bypass.ts');
assert.match(guard, /import\.meta\.env\.DEV/);
assert.match(guard, /import\.meta\.env\.VITE_ENABLE_CAMERA_BYPASS/);
const screen = read('src/components/OnlineScreen.tsx');
assert.match(screen, /withCameraPreparationTimeout/);
assert.match(screen, /finally\s*\{[\s\S]*setCameraBusy\(false\)/);
assert.match(screen, /CAMERA_BYPASS_ENABLED &&/);
assert.match(screen, /BYPASSED \(DEV ONLY\)/);
assert.doesNotMatch(screen, /new MediaStream|MediaStreamTrack|fake.*landmark/i);
const bypassHandler = screen.match(/const bypassCamera = \(\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
assert.ok(bypassHandler, 'Dev bypass handler must be present');
assert.doesNotMatch(bypassHandler, /startAt|roundId|Date\.now|crypto\.randomUUID|supabase/i);

console.log(
  'PASS camera preparation: bounded waits, friendly errors, production-safe dev bypass and no fake media',
);
