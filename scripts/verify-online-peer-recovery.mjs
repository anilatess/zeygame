import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../src/online/use-room-peer.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
let effect;
let listener;
let now = 10000;
const timers = new Map();
const events = new Map();
const sent = [];
const peers = [];
class Peer {
  connectionState = 'new';
  remoteDescription = null;
  offers = 0;
  restarts = 0;
  closed = false;
  constructor() {
    peers.push(this);
  }
  addTrack() {}
  async createOffer() {
    this.offers++;
    return { type: 'offer', sdp: 'test' };
  }
  async setLocalDescription() {}
  async setRemoteDescription(description) {
    this.remoteDescription = description;
  }
  async createAnswer() {
    return { type: 'answer', sdp: 'test' };
  }
  async addIceCandidate() {}
  restartIce() {
    this.restarts++;
  }
  close() {
    this.closed = true;
  }
}
const exports = {};
vm.runInNewContext(outputText, {
  exports,
  Date: { now: () => now },
  RTCPeerConnection: Peer,
  window: {
    setInterval: (callback) => {
      timers.set(1, callback);
      return 1;
    },
    clearInterval: (key) => timers.delete(key),
    addEventListener: (name, callback) => events.set(name, callback),
    removeEventListener: (name) => events.delete(name),
  },
  require: (specifier) =>
    specifier === 'react'
      ? {
          useState: (value) => [value, () => {}],
          useEffect: (callback) => {
            effect = callback;
          },
        }
      : { WEBRTC_ICE_SERVERS: [] },
});
const config = {
  enabled: true,
  signalingConnected: true,
  localStream: { getTracks: () => [] },
  localPlayerSlot: 1,
  currentUserId: 'host',
  sendEvent: async (event) => {
    sent.push(event);
  },
  subscribeEvent: (callback) => {
    listener = callback;
    return () => {
      listener = null;
    };
  },
};
const settle = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
exports.useRoomPeer(config);
const cleanup = effect();
assert.equal(sent[0].kind, 'media-ready');
timers.get(1)();
assert.equal(sent.length, 2, 'lost initial ready message is retried');
listener({ kind: 'media-ready', senderUserId: 'guest', playerSlot: 2 });
await settle();
assert.equal(peers[0].offers, 1);
const count = sent.length;
listener({ kind: 'media-ready', senderUserId: 'guest', playerSlot: 2, reply: true });
await settle();
assert.equal(sent.length, count, 'acknowledgements do not create a reply loop');
peers[0].connectionState = 'connected';
listener({ kind: 'media-ready', senderUserId: 'guest', playerSlot: 2 });
await settle();
assert.equal(peers[0].offers, 2, 'a reloaded guest receives a new offer');
peers[0].connectionState = 'failed';
now += 7000;
timers.get(1)();
await settle();
assert.equal(peers[0].offers, 3, 'failed transport retries ICE negotiation');
cleanup();
assert.equal(peers[0].closed, true);
assert.equal(timers.size, 0);
assert.equal(events.size, 0);
assert.equal(listener, null);
const before = sent.length;
exports.useRoomPeer({ ...config, signalingConnected: false });
effect();
assert.equal(sent.length, before, 'no signaling before Realtime reconnects');
console.log(
  'PASS peer recovery: lost handshake, reply-loop guard, guest reload, ICE retry, disconnected signaling and cleanup (fake RTC transport)',
);
