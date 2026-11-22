import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RAW, BTN, createInputState, pushInput, resolveDirection, motionAt, readMotion, motionsAt, pressedWithin,
  dirOf, frameAt,
} from '../src/core/input.js';
import { loadJSON, script } from './helpers.js';

const RULES = loadJSON('data/system/input.json');

function fed(str, rules = RULES) {
  const inp = createInputState(rules.bufferFrames);
  for (const r of script(str)) pushInput(inp, r, rules);
  return inp;
}
const strict = { leniency: false };
const lenient = { leniency: true };

// ---------- SOCD ----------

test('SOCD: left + right = neutral, up + down = up (the data defaults)', () => {
  const inp = createInputState(8);
  assert.equal(resolveDirection(RAW.LEFT | RAW.RIGHT, inp, RULES.socd), 5);
  assert.equal(resolveDirection(RAW.UP | RAW.DOWN, inp, RULES.socd), 8);
  assert.equal(resolveDirection(RAW.LEFT | RAW.RIGHT | RAW.DOWN, inp, RULES.socd), 2);
  assert.equal(resolveDirection(RAW.LEFT | RAW.UP | RAW.DOWN, inp, RULES.socd), 7);
  assert.equal(resolveDirection(RAW.LEFT | RAW.RIGHT | RAW.UP | RAW.DOWN, inp, RULES.socd), 8);
});

test('SOCD rules come from data: last-input-wins and vertical neutral', () => {
  const rules = { ...RULES, socd: { horizontal: 'last', vertical: 'neutral' } };
  const inp = createInputState(8);
  pushInput(inp, RAW.LEFT, rules);
  pushInput(inp, RAW.LEFT | RAW.RIGHT, rules); // right is newer: right wins
  assert.equal(dirOf(frameAt(inp, 0)), 6);
  pushInput(inp, RAW.RIGHT, rules);
  pushInput(inp, RAW.RIGHT | RAW.LEFT, rules); // left is newer: left wins
  assert.equal(dirOf(frameAt(inp, 0)), 4);
  pushInput(inp, RAW.UP | RAW.DOWN, rules);
  assert.equal(dirOf(frameAt(inp, 0)), 5);
});

// ---------- Motions ----------

test('236 reads cleanly, strict and lenient', () => {
  const inp = fed('5*5 2 3 6+L');
  assert.ok(motionAt(inp, RULES, '236', 1, 0, strict));
  assert.ok(motionAt(inp, RULES, '236', 1, 0, lenient));
});

test('236 without the diagonal: rejected strict, accepted with leniency', () => {
  const inp = fed('5*5 2 6+L');
  assert.equal(motionAt(inp, RULES, '236', 1, 0, strict), false);
  assert.ok(motionAt(inp, RULES, '236', 1, 0, lenient));
});

test('motions are read relative to facing', () => {
  const inp = fed('5*5 2 1 4+L'); // on screen: down, down-left, left
  assert.ok(motionAt(inp, RULES, '236', -1, 0, strict), 'facing left, 214 on screen is a forward fireball');
  assert.equal(motionAt(inp, RULES, '236', 1, 0, strict), false);
  assert.ok(motionAt(inp, RULES, '214', 1, 0, strict));
});

test('motion window: too slow fails strict, the lenient window is longer', () => {
  // 2, then 11 frames of 3, then 6 + L: spans 13 frames from the 2 to the press.
  const inp = fed('5*5 2 3*11 6+L');
  assert.equal(motionAt(inp, RULES, '236', 1, 0, strict), false, 'strict window is 10');
  assert.ok(motionAt(inp, RULES, '236', 1, 0, lenient), 'lenient window is 14');
  const slower = fed('5*5 2 3*20 6+L');
  assert.equal(motionAt(slower, RULES, '236', 1, 0, lenient), false);
});

test('the window is tunable in data', () => {
  const rules = structuredClone(RULES);
  rules.motions['236'].window = 30;
  const inp = fed('5*5 2 3*20 6+L', rules);
  assert.ok(motionAt(inp, rules, '236', 1, 0, strict));
});

test('623, 421, 22 read; lookalikes do not', () => {
  assert.ok(motionAt(fed('5 6 2 3+H'), RULES, '623', 1, 0, strict));
  assert.ok(motionAt(fed('5 3 2 3+H'), RULES, '623', 1, 0, lenient), 'lenient shortcut 323');
  assert.equal(motionAt(fed('5 3 2 3+H'), RULES, '623', 1, 0, strict), false);
  assert.ok(motionAt(fed('5 4 2 1+M'), RULES, '421', 1, 0, strict));
  assert.ok(motionAt(fed('5 2 5 2+S'), RULES, '22', 1, 0, strict));
  assert.equal(motionAt(fed('5 2*6+S'), RULES, '22', 1, 0, lenient), false, 'holding down is not 22');
  assert.ok(motionAt(fed('5 3 6 3+S'), RULES, '22', 1, 0, lenient), 'down-diagonals count leniently');
});

test('half circles: 41236 and 63214, priority over the quarter circle inside them', () => {
  const inp = fed('5 4 1 2 3 6+H');
  assert.ok(motionAt(inp, RULES, '41236', 1, 0, strict));
  const all = motionsAt(inp, RULES, 1, 0, strict);
  assert.deepEqual(all, ['41236', '236'], 'both read; the half circle is first in priority');
  assert.ok(motionAt(fed('5 6 3 2 1 4+H'), RULES, '63214', 1, 0, strict));
  assert.equal(motionAt(fed('5 2 3 6+H'), RULES, '41236', 1, 0, strict), false);
});

test('charge [4]6 needs the full charge time', () => {
  assert.ok(motionAt(fed('4*30 6+L'), RULES, '[4]6', 1, 0, strict));
  assert.equal(motionAt(fed('4*29 6+L'), RULES, '[4]6', 1, 0, strict), false, '29 frames is one short');
  assert.ok(motionAt(fed('1*20 4*10 6+L'), RULES, '[4]6', 1, 0, strict), 'down-back keeps the charge');
  assert.ok(motionAt(fed('2*30 8+M'), RULES, '[2]8', 1, 0, strict));
  assert.equal(motionAt(fed('4*30 5*10 6+L'), RULES, '[4]6', 1, 0, strict), false, 'release too late');
  assert.equal(motionAt(fed('4*30 9+L'), RULES, '[4]6', 1, 0, strict), false, 'up-forward is not 6 strictly');
  assert.ok(motionAt(fed('4*30 9+L'), RULES, '[4]6', 1, 0, lenient));
});

// ---------- Buffer timing ----------

test('a button press stays readable for the press buffer, then expires', () => {
  const inp = fed('5 5+L');
  assert.equal(pressedWithin(inp, BTN.L, RULES.pressBuffer), 0);
  for (let i = 1; i < RULES.pressBuffer; i++) {
    pushInput(inp, 0, RULES);
    assert.equal(pressedWithin(inp, BTN.L, RULES.pressBuffer), i, `still buffered after ${i} frames`);
  }
  pushInput(inp, 0, RULES);
  assert.equal(pressedWithin(inp, BTN.L, RULES.pressBuffer), -1, 'expired');
});

test('holding a button is one press, not a press every frame', () => {
  const inp = fed('5+L*10');
  assert.equal(pressedWithin(inp, BTN.L, RULES.pressBuffer), -1);
});

test('a special input done during recovery comes out from the buffer', () => {
  const inp = fed('5*5 2 3 6+L 6 5');
  assert.equal(readMotion(inp, RULES, '236', BTN.L, 1, strict), 2, 'press was 2 frames ago');
  pushInput(inp, 0, RULES);
  pushInput(inp, 0, RULES);
  assert.equal(readMotion(inp, RULES, '236', BTN.L, 1, strict), -1, 'gone after the press buffer');
});

test('negative edge: releasing the button finishes the motion only when asked', () => {
  const inp = fed('5+L*5 2+L 3+L 6');
  assert.equal(readMotion(inp, RULES, '236', BTN.L, 1, strict), -1);
  assert.equal(readMotion(inp, RULES, '236', BTN.L, 1, { ...strict, negativeEdge: true }), 0);
});

test('the buffer is a fixed-size ring: old frames read as neutral', () => {
  const rules = { ...RULES, bufferFrames: 8 };
  const inp = createInputState(8);
  for (const r of script('2*20')) pushInput(inp, r, rules);
  assert.equal(inp.buf.length, 8);
  assert.equal(dirOf(frameAt(inp, 7)), 2);
  assert.equal(dirOf(frameAt(inp, 8)), 5, 'beyond the buffer');
});
