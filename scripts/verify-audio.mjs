// Run: node scripts/verify-audio.mjs. Uses the real service with a fake AudioContext.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function createAudioEnvironment(initialState = 'running', rejectResume = false) {
  const state = { initialState, rejectResume, contexts: [] };
  class FakeAudioParam {
    value = 0;
    events = [];
    setValueAtTime(value, time) {
      this.value = value;
      this.events.push(['set', value, time]);
    }
    exponentialRampToValueAtTime(value, time) {
      this.value = value;
      this.events.push(['ramp', value, time]);
    }
  }
  class FakeNode {
    connections = [];
    disconnects = 0;
    connect(node) {
      this.connections.push(node);
      return node;
    }
    disconnect() {
      this.disconnects++;
    }
  }
  class FakeOscillator extends FakeNode {
    frequency = new FakeAudioParam();
    type = 'sine';
    onended = null;
    started = 0;
    stoppedAt = [];
    start() {
      this.started++;
    }
    stop(time) {
      this.stoppedAt.push(time);
    }
    end() {
      this.onended?.();
    }
  }
  class FakeGain extends FakeNode {
    gain = new FakeAudioParam();
  }
  class FakeAudioContext {
    state = state.initialState;
    currentTime = 10;
    destination = {};
    oscillators = [];
    gains = [];
    resumeCalls = 0;
    constructor() {
      state.contexts.push(this);
    }
    createOscillator() {
      const oscillator = new FakeOscillator();
      this.oscillators.push(oscillator);
      return oscillator;
    }
    createGain() {
      const gain = new FakeGain();
      this.gains.push(gain);
      return gain;
    }
    resume() {
      this.resumeCalls++;
      if (state.rejectResume) return Promise.reject(new Error('resume failed'));
      this.state = 'running';
      return Promise.resolve();
    }
  }
  return { state, AudioContext: FakeAudioContext };
}

function runtime(globals = {}, overrides = new Map()) {
  const cache = new Map();
  function load(relative) {
    const url = new URL(relative, import.meta.url);
    if (overrides.has(url.href)) return overrides.get(url.href);
    if (cache.has(url.href)) return cache.get(url.href);
    if (url.pathname.endsWith('.css')) return {};
    const exports = {};
    cache.set(url.href, exports);
    const source = fs
      .readFileSync(url, 'utf8')
      .replaceAll('import.meta.env.PROD', 'false')
      .replaceAll('import.meta.env.BASE_URL', "'/zeygame/'");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    vm.runInNewContext(
      outputText,
      {
        exports,
        performance,
        require: (specifier) =>
          load(new URL(specifier + (specifier.endsWith('.css') ? '' : '.ts'), url).href),
        ...globals,
      },
      { filename: url.pathname },
    );
    return exports;
  }
  return load;
}

const environment = createAudioEnvironment();
const load = runtime({ AudioContext: environment.AudioContext });
const { audio } = load('../src/audio.ts');

audio.tone(440, 0.1);
assert.equal(environment.state.contexts.length, 0, 'tone never creates a context');

audio.unlock();
assert.equal(environment.state.contexts.length, 1, 'first user unlock creates one context');
const context = environment.state.contexts[0];
audio.tone(520, 0.07, 0.03, { fadeOut: false });
assert.equal(context.oscillators[0].frequency.value, 520);
assert.equal(context.oscillators[0].type, 'sine');
assert.equal(context.oscillators[0].stoppedAt[0], 10.07);
assert.deepEqual(context.gains[0].gain.events, [['set', 0.03, 10]]);

audio.unlock();
audio.tone(720, 0.09, 0.035, { fadeOut: false });
assert.equal(environment.state.contexts.length, 1, 'repeated game unlocks reuse the context');
context.oscillators[0].end();
assert.equal(context.oscillators[0].disconnects, 1);
assert.equal(context.gains[0].disconnects, 1);

const suspended = createAudioEnvironment('suspended');
const suspendedAudio = runtime({ AudioContext: suspended.AudioContext })('../src/audio.ts').audio;
suspendedAudio.unlock();
assert.equal(suspended.state.contexts.length, 1);
assert.equal(suspended.state.contexts[0].resumeCalls, 1);
assert.doesNotThrow(() => suspendedAudio.tone(600, 0.08));

const rejected = createAudioEnvironment('suspended', true);
const rejectedAudio = runtime({ AudioContext: rejected.AudioContext })('../src/audio.ts').audio;
assert.doesNotThrow(() => rejectedAudio.unlock());
await Promise.resolve();
assert.doesNotThrow(() => rejectedAudio.tone(600, 0.08));

audio.tone(330, 0.2);
const active = context.oscillators.at(-1);
audio.stopAll();
assert.equal(active.stoppedAt.length, 2, 'session stop terminates an active tone');
active.end();
assert.equal(active.disconnects, 1);

// Exercise the application's actual start, replay and home button handlers.
const appEnvironment = createAudioEnvironment();
const appElements = new Map();
function element() {
  return {
    hidden: false,
    disabled: false,
    textContent: '',
    dataset: {},
    handlers: {},
    querySelectorAll() {
      return [];
    },
    focus() {
      this.focused = true;
    },
    addEventListener(event, handler) {
      this.handlers[event] = handler;
    },
  };
}
const buttons = Object.fromEntries(
  ['start', 'select', 'games', 'howto', 'retry', 'home', 'replay', 'choose-another'].map(
    (action) => {
      const button = element();
      button.dataset.action = action;
      return [action, button];
    },
  ),
);
function query(selector) {
  const action = selector.match(/data-action="(.*?)"/);
  if (action) return buttons[action[1]];
  if (!appElements.has(selector)) appElements.set(selector, element());
  return appElements.get(selector);
}
const app = { innerHTML: '', querySelector: query, querySelectorAll: () => Object.values(buttons) };
const frames = new Map();
let nextFrame = 0;
const overrides = new Map();
const appLoad = runtime(
  {
    AudioContext: appEnvironment.AudioContext,
    document: { querySelector: () => app },
    window: { addEventListener() {} },
    navigator: {},
    performance: { now: () => 1 },
    requestAnimationFrame: (callback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
  },
  overrides,
);
const override = (file, exports) =>
  overrides.set(new URL(`../src/${file}.ts`, import.meta.url).href, exports);
override('camera', {
  CameraController: class {
    async start() {}
    resize() {}
    stop() {}
    draw() {
      return null;
    }
  },
});
for (const [file, name] of [
  ['hand', 'HandTracker'],
  ['pose', 'PoseTracker'],
  ['face', 'FaceTracker'],
]) {
  override(`${file}-tracker`, {
    [name]: class {
      state = 'idle';
      errorMessage = '';
      load() {
        this.state = 'loading';
        return Promise.resolve();
      }
      retry() {
        return this.load();
      }
      close() {
        this.state = 'idle';
      }
      clearDetections() {}
      detect() {
        return [];
      }
      draw() {}
    },
  });
}
override('player-tracker', {
  PlayerTracker: class {
    classify() {
      return [];
    }
    drawRegions() {}
    drawLandmarks() {}
  },
});
appLoad('../src/main.ts');
const click = async (action) => buttons[action].handlers.click();
await click('start');
assert.equal(appEnvironment.state.contexts.length, 1, 'start click unlocks shared service');
await click('replay');
assert.equal(query('.game').focused, true, 'Replay moves focus away from hidden final buttons');
assert.equal(appEnvironment.state.contexts.length, 1, 'replay reuses the original context');
await click('home');
assert.equal(appEnvironment.state.contexts.length, 1, 'home does not create another context');
assert.equal(frames.size, 0, 'home cancels the render loop');

const audioOwners = [
  '../src/games/mouth-open-race.ts',
  '../src/games/dance-mimic.ts',
  '../src/games/mouth-catch.ts',
  '../src/games/fruit-slice.ts',
  '../src/games/jump-race.ts',
  '../src/games/face-mimic.ts',
  '../src/game-manager.ts',
  '../src/games/ice-breaker.ts',
];
for (const source of audioOwners) {
  assert.doesNotMatch(
    fs.readFileSync(new URL(source, import.meta.url), 'utf8'),
    /new AudioContext\s*\(/,
  );
}

console.log(
  'PASS shared audio: one context, gesture unlock, safe resume, tone parameters, cleanup, session handlers',
);
