// Run: node scripts/verify-online-phase4.mjs. WebRTC privacy/lifecycle checks.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('..', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');
const peer = read('src/online/use-room-peer.ts');
const config = read('src/online/webrtc-config.ts');
const events = read('src/online/online-events.ts');
const screen = read('src/components/OnlineScreen.tsx');
const migration = read('supabase/migrations/202610040004_online_scores_events_and_round_seed.sql');

assert.match(peer, /new RTCPeerConnection/);
assert.match(peer, /addTrack\(track, localStream\)/);
assert.match(peer, /peer\.ontrack/);
assert.match(peer, /peer\.onicecandidate/);
assert.match(peer, /createOffer\(\)/);
assert.match(peer, /createAnswer\(\)/);
assert.match(peer, /addIceCandidate/);
assert.match(peer, /peer\?\.close\(\)/);
assert.match(peer, /restartIce\(\)/);
assert.match(config, /echoCancellation: true/);
assert.match(config, /noiseSuppression: true/);
assert.match(events, /kind: 'webrtc-signal'/);
assert.match(screen, /RemotePeerVideo/);
assert.match(screen, /stopPeerAudioRef\.current\(\)/);
assert.match(migration, /Camera and audio[\s\S]*peer-to-peer WebRTC media/);

const mediaSources = `${peer}\n${config}`;
assert.doesNotMatch(mediaSources, /\.from\(|storage\.|upload\(|insert\(/i);
assert.doesNotMatch(events, /MediaStream|Blob|ArrayBuffer|landmark/i);

console.log(
  'PASS online phase 4: P2P camera/audio, private signaling, cleanup and no media upload',
);
