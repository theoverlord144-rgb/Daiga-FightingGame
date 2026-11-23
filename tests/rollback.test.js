import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../src/core/game.js';
import { hashState } from '../src/core/state.js';
import { createSession } from '../src/net/rollback.js';
import { createSimNetwork } from '../src/net/sim-network.js';
import { runSyncTest } from '../src/net/sync-test.js';
import { loadWorld, loadChar, loadJSON, fightInputs } from './helpers.js';

const A = loadChar('tests/fixtures/fighter.toska.json');
const W = loadWorld(A, A);

// ---------- Sync test ----------

test('sync test: 6000 frames of real fighting, rewinding 8 frames every frame, never differs', () => {
  const inputs = fightInputs(11);
  let hits = 0;
  const r = runSyncTest(W, (g) => {
    // Every kind of contact counts: since the universal systems, a hit can also be reported as a counter, a Witness
    // counter, or a hit absorbed by Vow's guard (random button presses hold M+H often).
    hits += g.cues.filter((c) => ['hit', 'counter', 'witness', 'block', 'absorb'].includes(c.type)).length;
    return inputs(g);
  }, { frames: 6000, distance: 8 });
  assert.ok(r.ok, `desync at frame ${r.failFrame}: ${r.diff}`);
  assert.equal(r.checks, 6000 - 8);
  assert.ok(hits > 50, `it was a real fight (${hits} hits/blocks)`);
});

test('sync test: every rewind distance from 1 to 12 holds', () => {
  for (let d = 1; d <= 12; d++) {
    const r = runSyncTest(W, fightInputs(100 + d), { frames: 800, distance: d });
    assert.ok(r.ok, `distance ${d}: desync at ${r.failFrame}: ${r.diff}`);
  }
});

test('sync test catches a step that keeps hidden state outside the game (so it is not a rubber stamp)', () => {
  let hidden = 0; // lives outside the saved state: replays see a different value
  const leaky = (g, raw, w) => {
    step(g, raw, w);
    hidden++;
    if (hidden % 97 === 0) g.players[0].health -= 1;
  };
  const r = runSyncTest(W, fightInputs(3), { frames: 2000, distance: 8, stepFn: leaky });
  assert.equal(r.ok, false);
  assert.match(String(r.diff), /health/);
});

// ---------- Two players over a network ----------

/** Plays a match between two sessions over a simulated network. Each side's "player" reacts to what it sees. */
function netMatch({ world = W, frames = 1500, latency = 3, jitter = 0, loss = 0, delay = 2, seed = 5, cutAt = null, cutFor = 0, tamper = null } = {}) {
  const net = createSimNetwork({ latency, jitter, loss, seed });
  const s = [0, 1].map((i) => createSession(world, { local: i, delay, keepInputs: true }));
  const brains = [fightInputs(seed * 2 + 1), fightInputs(seed * 2 + 2)];
  let ticks = 0;
  const pump = (i) => { for (const m of s[i].outbox.splice(0)) net.send(i, m); };
  while (Math.min(s[0].frame, s[1].frame) < frames && ticks < frames * 4) {
    ticks++;
    if (cutAt !== null) net.setCut(ticks >= cutAt && ticks < cutAt + cutFor);
    for (const i of [0, 1]) {
      for (const m of net.receive(i)) s[i].receive(m);
      if (s[i].frame < frames && !s[i].shouldWait()) {
        s[i].addLocalInput(brains[i](s[i].game)[i]);
        s[i].advance();
        if (tamper && tamper.side === i && s[i].frame === tamper.frame) s[i].game.players[1].health -= 1;
      }
      pump(i);
    }
    net.tick();
  }
  // Let the last packets land so both sides confirm everything.
  for (let k = 0; k < 60; k++) {
    for (const i of [0, 1]) {
      for (const m of net.receive(i)) s[i].receive(m);
      s[i].advance();
      pump(i);
    }
    net.tick();
  }
  return { s, net, ticks };
}

/** The ground truth: inputs replayed offline with no network at all. */
function replay(inputs, upTo) {
  const g = createGame(W);
  for (let f = 0; f < upTo; f++) step(g, inputs[f], W);
  return g;
}

function assertConverged(s, label) {
  const upTo = Math.min(s[0].remoteConfirmed, s[1].remoteConfirmed) - 1;
  const in0 = s[0].confirmedInputs(upTo);
  assert.deepEqual(in0, s[1].confirmedInputs(upTo), `${label}: both sides agree on every input`);
  assert.ok(upTo > 300, `${label}: a real match (${upTo} frames confirmed)`);
  return upTo;
}

test('3 frames of lag each way: rollbacks happen, never more than 8 frames, and both sides end identical', () => {
  const { s } = netMatch({ frames: 2000, latency: 3 });
  for (const i of [0, 1]) {
    assert.ok(s[i].stats.rollbacks > 20, `side ${i} rolled back (${s[i].stats.rollbacks} times)`);
    assert.ok(s[i].stats.maxRollback <= 8);
    assert.equal(s[i].stats.desync, null);
  }
  assertConverged(s, 'lag 3');
  assert.equal(s[0].frame, s[1].frame);
  assert.equal(hashState(s[0].game), hashState(s[1].game), 'the same game on both screens');
});

test('the game each player ends on is exactly the offline replay of the agreed inputs', () => {
  const { s } = netMatch({ frames: 900, latency: 5, jitter: 2, seed: 21 });
  const f = s[0].frame;
  assert.equal(s[1].frame, f);
  const truth = replay(s[0].confirmedInputs(f - 1), f);
  for (const i of [0, 1]) assert.equal(hashState(s[i].game), hashState(truth), `side ${i}`);
});

test('a bad connection (jitter and 15% packet loss) still converges with no desync', () => {
  const { s, net } = netMatch({ frames: 2000, latency: 4, jitter: 4, loss: 1500, seed: 9 });
  assert.ok(net.stats.lost > 100, `packets really were lost (${net.stats.lost})`);
  for (const i of [0, 1]) assert.equal(s[i].stats.desync, null);
  assertConverged(s, 'lossy');
  assert.equal(hashState(s[0].game), hashState(s[1].game));
});

test('with low lag and enough input delay, there is nothing to roll back', () => {
  const { s } = netMatch({ frames: 600, latency: 1, delay: 2 });
  for (const i of [0, 1]) assert.equal(s[i].stats.rollbacks, 0);
  assertConverged(s, 'lan');
});

test('if the other side goes silent, the game waits after 8 frames instead of guessing forever, then catches up', () => {
  const { s } = netMatch({ frames: 1200, latency: 2, cutAt: 300, cutFor: 90 });
  for (const i of [0, 1]) {
    assert.ok(s[i].stats.stalls > 30, `side ${i} waited (${s[i].stats.stalls} stalls)`);
    assert.ok(s[i].stats.maxRollback <= 8);
    assert.equal(s[i].stats.desync, null);
  }
  assertConverged(s, 'cut');
  assert.equal(hashState(s[0].game), hashState(s[1].game));
});

test('a desync is detected and reported with its frame', () => {
  const { s } = netMatch({ frames: 600, latency: 2, tamper: { side: 0, frame: 200 } });
  const at = [s[0].stats.desync, s[1].stats.desync].find((x) => x !== null);
  assert.ok(at !== undefined, 'someone noticed');
  assert.ok(at >= 190 && at < 230, `reported near the tampered frame (${at})`);
});

test('the same match over the same network plays out the same every time', () => {
  const a = netMatch({ frames: 500, latency: 4, jitter: 3, loss: 800, seed: 33 });
  const b = netMatch({ frames: 500, latency: 4, jitter: 3, loss: 800, seed: 33 });
  assert.equal(hashState(a.s[0].game), hashState(b.s[0].game));
  assert.deepEqual(a.s[0].stats, b.s[0].stats);
});

test('a very laggy link (20 frames each way) still converges, it just waits more', () => {
  const { s } = netMatch({ frames: 800, latency: 20, jitter: 3, loss: 500, seed: 4 });
  for (const i of [0, 1]) {
    assert.equal(s[i].stats.desync, null);
    assert.ok(s[i].stats.maxRollback <= 8);
  }
  assertConverged(s, 'laggy');
  assert.equal(hashState(s[0].game), hashState(s[1].game));
});

test('netplay with rounds: KOs, time-ups and new rounds over a lossy link, both sides identical', () => {
  const rules = { ...loadJSON('data/system/match.json'), timerSeconds: 6, introFrames: 30, koFrames: 40, timeupFrames: 30, roundsToWin: 9 };
  const world = loadWorld(A, A, { match: rules });
  const { s, net } = netMatch({ world, frames: 3000, latency: 4, jitter: 3, loss: 1000, seed: 13 });
  assert.ok(net.stats.lost > 50);
  for (const i of [0, 1]) assert.equal(s[i].stats.desync, null);
  assertConverged(s, 'rounds');
  assert.equal(hashState(s[0].game), hashState(s[1].game));
  assert.ok(s[0].game.match.round >= 4, `several rounds (${s[0].game.match.round})`);
  assert.deepEqual(s[0].game.match.wins, s[1].game.match.wins);
});
