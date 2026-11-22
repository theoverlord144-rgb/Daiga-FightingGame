import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../src/core/game.js';
import { cloneState, serializeState, deserializeState, statesEqual, diffState, hashState } from '../src/core/state.js';
import { loadWorld } from './helpers.js';

const WORLD = loadWorld();

/** A tiny deterministic generator for test inputs (tests may use any maths; the core may not). */
export function lcg(seed) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0);
}

function play(frames, seed) {
  const g = createGame(WORLD);
  const rnd = lcg(seed);
  for (let i = 0; i < frames; i++) step(g, [rnd() & 255, rnd() & 255], WORLD);
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
  step(c, [0, 0], WORLD);
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
  const a = play(3000, 42);
  const b = play(3000, 42);
  assert.ok(statesEqual(a, b));
  assert.equal(hashState(a), hashState(b));
  assert.notEqual(hashState(a), hashState(play(3000, 43)));
});

test('stepping from a restored clone matches stepping the original (rollback groundwork)', () => {
  const g = createGame(WORLD);
  const rnd = lcg(7);
  const inputs = Array.from({ length: 600 }, () => [rnd() & 255, rnd() & 255]);
  let saved = null;
  for (let i = 0; i < 600; i++) {
    if (i === 300) saved = cloneState(g);
    step(g, inputs[i], WORLD);
  }
  for (let i = 300; i < 600; i++) step(saved, inputs[i], WORLD);
  assert.ok(statesEqual(saved, g));
});

test('every position, velocity and timer in the state is an integer', () => {
  const g = play(3000, 9);
  const walk = (v, path) => {
    if (typeof v === 'number') assert.ok(Number.isInteger(v), `${path} = ${v} is not an integer`);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  walk(g, '$');
});
