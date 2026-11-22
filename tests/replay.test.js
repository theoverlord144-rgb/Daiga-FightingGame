import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../src/core/game.js';
import { hashState } from '../src/core/state.js';
import { createReplayRecorder, playReplay, decodeReplay, encodeReplay } from '../src/net/replay.js';
import { createSession } from '../src/net/rollback.js';
import { createSimNetwork } from '../src/net/sim-network.js';
import { loadWorld, loadChar, fightInputs } from './helpers.js';

const A = loadChar('data/characters/avner/avner.toska.json');
const W = loadWorld(A, A);

function recordFight(frames, seed) {
  const g = createGame(W);
  const rec = createReplayRecorder({ chars: ['avner', 'avner'], checkEvery: 300 });
  const inputs = fightInputs(seed);
  const hashes = [];
  for (let f = 0; f < frames; f++) {
    const raws = inputs(g);
    step(g, raws, W);
    rec.record(raws, g);
    hashes.push(hashState(g));
  }
  return { g, file: rec.finish(g), hashes };
}

test('a replay reproduces a 5000-frame match exactly, every single frame, after a trip through JSON', () => {
  const { g, file, hashes } = recordFight(5000, 77);
  const loaded = JSON.parse(JSON.stringify(file));
  let same = 0;
  const r = playReplay(W, loaded, { onFrame: (game, f) => { if (hashState(game) === hashes[f]) same++; } });
  assert.equal(r.ok, true);
  assert.equal(same, 5000, 'identical on every frame');
  assert.equal(hashState(r.game), hashState(g));
  assert.ok(g.players.some((p) => p.health < 10000), 'damage was dealt: a real match');
});

test('replays are small: held inputs are stored once', () => {
  const { file } = recordFight(3000, 5);
  assert.ok(file.inputs.length < 3000 / 2, `${file.inputs.length} entries for 3000 frames`);
  assert.equal(decodeReplay(file).length, 3000);
});

test('a tampered replay is caught at the first checkpoint after the change', () => {
  const { file } = recordFight(3000, 9);
  // From frame 1500, Player 1's inputs are replaced by a second of walking backwards: that always changes the game.
  const frames = decodeReplay(file);
  for (let f = 1500; f < 1560; f++) frames[f] = [1, frames[f][1]];
  const bad = encodeReplay({ chars: file.chars, frames, checks: file.checks, finalHash: file.finalHash });
  const r = playReplay(W, bad);
  assert.equal(r.ok, false);
  assert.ok(r.failedAt > 1500 && r.failedAt <= 1800, `caught at ${r.failedAt}, changed at 1500`);
});

test('files that are not replays are refused with a clear message', () => {
  assert.throws(() => decodeReplay({ hello: 1 }), /not a Toska replay/);
  const { file } = recordFight(100, 1);
  assert.throws(() => decodeReplay({ ...file, version: 99 }), /version 99/);
  assert.throws(() => decodeReplay({ ...file, frames: 101 }), /damaged/);
});

test('a netplay match recorded from the confirmed inputs replays to the same game both players saw', () => {
  const net = createSimNetwork({ latency: 4, jitter: 2, loss: 500, seed: 3 });
  const recs = [0, 1].map(() => createReplayRecorder({ chars: ['avner', 'avner'], checkEvery: 120 }));
  const s = [0, 1].map((i) => createSession(W, { local: i, onFinal: (f, raws, g) => recs[i].record(raws, g) }));
  const brains = [fightInputs(1), fightInputs(2)];
  for (let t = 0; t < 1400; t++) {
    for (const i of [0, 1]) {
      for (const m of net.receive(i)) s[i].receive(m);
      if (s[i].frame < 1200 && !s[i].shouldWait()) { s[i].addLocalInput(brains[i](s[i].game)[i]); s[i].advance(); }
      for (const m of s[i].outbox.splice(0)) net.send(i, m);
    }
    net.tick();
  }
  const files = recs.map((r) => r.finish());
  assert.ok(files[0].frames > 1000, `recorded ${files[0].frames} frames`);
  assert.deepEqual(decodeReplay(files[0]).slice(0, 1000), decodeReplay(files[1]).slice(0, 1000), 'both players saved the same match');
  for (const f of files) assert.equal(playReplay(W, f).ok, true, 'every checkpoint matches what was played live');
});
