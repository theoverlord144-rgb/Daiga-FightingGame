import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../src/core/game.js';
import { cloneState, serializeState, deserializeState, statesEqual, diffState, hashState } from '../src/core/state.js';
import { loadJSON } from './helpers.js';

const RULES = loadJSON('data/system/input.json');

/** A tiny deterministic generator for test inputs (tests may use any maths; the core may not). */
function lcg(seed) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0);
}

function play(frames, seed) {
  const g = createGame(RULES);
  const rnd = lcg(seed);
  for (let i = 0; i < frames; i++) step(g, [rnd() & 255, rnd() & 255], RULES);
  return g;
}

test('the state is plain data: it survives a JSON round trip unchanged', () => {
  const g = play(300, 1);
  assert.ok(statesEqual(deserializeState(serializeState(g)), g));
});

test('a clone is equal but independent', () => {
  const g = play(100, 2);
  const c = cloneState(g);
  assert.ok(statesEqual(c, g));
  step(c, [0, 0], RULES);
  assert.equal(statesEqual(c, g), false, 'stepping the clone does not touch the original');
  assert.notEqual(diffState(c, g), true);
});

test('diffState names the first difference', () => {
  const g = play(10, 3);
  const c = cloneState(g);
  c.players[1].input.head += 1;
  assert.equal(diffState(g, c), '$.players.1.input.head');
});

test('same inputs, same game: two runs are identical, hashes match', () => {
  const a = play(2000, 42);
  const b = play(2000, 42);
  assert.ok(statesEqual(a, b));
  assert.equal(hashState(a), hashState(b));
  assert.notEqual(hashState(a), hashState(play(2000, 43)));
});

test('stepping from a restored clone matches stepping the original (rollback groundwork)', () => {
  const g = createGame(RULES);
  const rnd = lcg(7);
  const inputs = Array.from({ length: 600 }, () => [rnd() & 255, rnd() & 255]);
  let saved = null;
  for (let i = 0; i < 600; i++) {
    if (i === 300) saved = cloneState(g);
    step(g, inputs[i], RULES);
  }
  for (let i = 300; i < 600; i++) step(saved, inputs[i], RULES);
  assert.ok(statesEqual(saved, g));
});
