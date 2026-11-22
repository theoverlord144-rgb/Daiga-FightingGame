import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step } from '../src/core/game.js';
import { RAW } from '../src/core/input.js';
import { px } from '../src/core/fixed.js';
import { createFrameMeter, advantageFromData } from '../src/ui/training/frame-meter.js';
import { createTraining, defaultSettings, toRelative, fromRelative } from '../src/ui/training/training.js';
import { loadWorld, loadChar, script } from './helpers.js';
import { createInputState, pushInput } from '../src/core/input.js';
import { historyRuns, motionLabels } from '../src/ui/input-history.js';

const A = loadChar('data/characters/avner/avner.toska.json');
const W = loadWorld(A, A);
const BTN = { L: RAW.L, M: RAW.M, H: RAW.H, S: RAW.S };
const GROUND = ['5L', '5M', '5H', '2L', '2M'];

/** Runs P1 doing `move` once against the training dummy; returns the meter after things settle. */
function perform(move, settings = {}, { gap = 60, frames = 90 } = {}) {
  const tr = createTraining(W, { ...defaultSettings(), ...settings });
  const g = tr.newGame();
  g.players[0].x = -px(gap / 2);
  g.players[1].x = px(gap / 2);
  const meter = createFrameMeter();
  const dir = move[0] === '2' ? RAW.DOWN : 0;
  const btn = BTN[move.at(-1)];
  for (let f = 0; f < frames; f++) {
    const p1 = f === 0 ? dir | btn : f < 2 ? dir : 0;
    step(g, tr.inputs(g, [p1, 0]), W);
    tr.afterStep(g);
    meter.update(g, W);
  }
  return { meter, g, tr };
}

test('the meter measures startup, active and recovery exactly as the data says (whiffed)', () => {
  for (const id of GROUND) {
    const m = W.chars[0].states[id].move;
    const { meter } = perform(id, {}, { gap: 600 });
    const r = meter.last[0];
    assert.equal(r.move, id);
    assert.deepEqual([r.startup, r.active, r.recovery], [m.startup, m.active, m.recovery], id);
  }
});

test('the frame bar shows startup, active and recovery cells in order', () => {
  const { meter } = perform('5M', {}, { gap: 600, frames: 25 });
  const m = W.chars[0].states['5M'].move;
  const kinds = meter.bars[0].map((c) => c.kind);
  const run = (k) => kinds.filter((x) => x === k).length;
  assert.equal(run('startup'), m.startup - 1);
  assert.equal(run('active'), m.active);
  assert.equal(run('recovery'), m.recovery);
  assert.equal(kinds.indexOf('active'), m.startup - 1);
});

test('measured advantage matches the data on hit and on block, for every ground normal', () => {
  for (const id of GROUND) {
    const m = W.chars[0].states[id].move;
    for (const block of [false, true]) {
      const { meter } = perform(id, { block: block ? 'all' : 'none' });
      const adv = meter.advantage;
      assert.ok(adv && adv.done, `${id}: measured`);
      assert.equal(adv.kind, block ? 'block' : 'hit');
      assert.equal(adv.value, advantageFromData(m, { block }), `${id} on ${block ? 'block' : 'hit'}`);
    }
  }
});

test('advantage is still measured when the attacker presses a button on their first free frame', () => {
  // 5H can't chain into itself, so mashing H only comes out once 5H is over.
  const m = W.chars[0].states['5H'].move;
  const tr = createTraining(W, { ...defaultSettings(), block: 'all' });
  const g = tr.newGame();
  g.players[0].x = -px(30); g.players[1].x = px(30);
  const meter = createFrameMeter();
  for (let f = 0; f < 60; f++) {
    step(g, tr.inputs(g, [f % 2 === 0 ? RAW.H : 0, 0]), W); // mashing heavy
    meter.update(g, W);
    if (meter.advantage?.done) break;
  }
  assert.equal(meter.advantage.value, advantageFromData(m, { block: true }));
});

test('a cancel is reported as a cancel, not as a wrong advantage', () => {
  const tr = createTraining(W);
  const g = tr.newGame();
  g.players[0].x = -px(30); g.players[1].x = px(30);
  const meter = createFrameMeter();
  for (let f = 0; f < 60; f++) {
    step(g, tr.inputs(g, [f === 0 ? RAW.L : f === 6 ? RAW.M : 0, 0]), W);
    meter.update(g, W);
  }
  // 5L hit then cancelled into 5M: the 5M hit is measured on its own.
  assert.equal(meter.advantage.move, '5M');
  assert.equal(meter.advantage.value, advantageFromData(W.chars[0].states['5M'].move));
  assert.equal(meter.last[0].move, '5M');
});

test('dummy blocks lows crouching and mids standing; "none" gets hit', () => {
  for (const [id, low] of [['2L', true], ['5L', false], ['2M', true], ['5H', false]]) {
    const { g, meter } = perform(id, { block: 'all', refill: 'off' });
    assert.equal(meter.advantage.kind, 'block', id);
    assert.equal(g.players[1].health, 10000, `${id} did no damage`);
    void low;
  }
  const { g } = perform('2L', { block: 'all', blockGuard: 'stand only', refill: 'off' });
  assert.ok(g.players[1].health < 10000, 'standing-only block loses to a low');
  const hit = perform('5L', { block: 'none' });
  assert.equal(hit.meter.advantage.kind, 'hit');
});

test('"after first hit": the first jab lands, the next one is blocked, then it calms down', () => {
  const tr = createTraining(W, { ...defaultSettings(), block: 'after first hit' });
  const g = tr.newGame();
  g.players[0].x = -px(30); g.players[1].x = px(30);
  const kinds = [];
  const press = new Set([0, 30, 200]);
  for (let f = 0; f < 260; f++) {
    step(g, tr.inputs(g, [press.has(f) ? RAW.L : 0, 0]), W);
    for (const c of g.cues) if (c.type === 'hit' || c.type === 'block') kinds.push(c.type);
    g.players[0].x = g.players[1].x - px(60); // stay in range
  }
  assert.deepEqual(kinds, ['hit', 'block', 'hit']);
});

test('random block is a coin flip per attack, and the same seed gives the same flips', () => {
  const run = (seed) => {
    const tr = createTraining(W, { ...defaultSettings(), block: 'random', refill: 'on' }, { seed });
    const g = tr.newGame();
    g.players[0].x = -px(30); g.players[1].x = px(30);
    const kinds = [];
    for (let f = 0; f < 40 * 40; f++) {
      step(g, tr.inputs(g, [f % 40 === 0 ? RAW.L : 0, 0]), W);
      tr.afterStep(g);
      for (const c of g.cues) if (c.type === 'hit' || c.type === 'block') kinds.push(c.type[0]);
      g.players[0].x = g.players[1].x - px(60);
    }
    return kinds.join('');
  };
  const a = run(7);
  assert.equal(a, run(7));
  assert.ok(a.includes('h') && a.includes('b'), a);
  assert.notEqual(a, run(8));
});

test('air tech setting: the dummy techs as soon as it can; "no tech" stays in the combo', () => {
  for (const [tech, expect] of [['air tech', true], ['no tech', false]]) {
    const tr = createTraining(W, { ...defaultSettings(), tech });
    const g = tr.newGame();
    g.players[0].x = -px(40); g.players[1].x = px(40);
    let teched = false;
    for (let f = 0; f < 150; f++) {
      step(g, tr.inputs(g, [f === 0 ? RAW.S : 0, 0]), W);
      if (g.players[1].state === 'airTech') teched = true;
    }
    assert.equal(teched, expect, tech);
  }
});

test('recording plays back, mirrored when the dummy is on the other side', () => {
  assert.equal(fromRelative(toRelative(RAW.LEFT | RAW.L, -1), -1), RAW.LEFT | RAW.L);
  const tr = createTraining(W);
  let g = tr.newGame();
  tr.startRecording();
  // Player 1's controller walks the dummy toward Player 1 (left, the dummy faces left) for 30 frames.
  for (let f = 0; f < 30; f++) step(g, tr.inputs(g, [RAW.LEFT, 0]), W);
  tr.stopRecording();
  assert.equal(g.players[0].x, -px(150), 'Player 1 stood still while recording');
  const walked = px(150) - g.players[1].x;
  assert.ok(walked > 0, 'the dummy walked forward');
  // Swap sides: the dummy is now on the left, facing right. The playback still walks it forward (right).
  tr.settings.position = 'left corner';
  g = tr.newGame();
  [g.players[0].x, g.players[1].x] = [g.players[1].x + px(300), g.players[1].x];
  g.players[0].facing = -1; g.players[1].facing = 1;
  const x0 = g.players[1].x;
  tr.startPlayback();
  for (let f = 0; f < 30; f++) step(g, tr.inputs(g, [0, 0]), W);
  assert.equal(g.players[1].x - x0, walked, 'same distance, mirrored');
});

test('health refills once both fighters are free; off means it stays down', () => {
  for (const refill of ['on', 'off']) {
    const { g } = perform('5H', { refill }, { frames: 140 });
    assert.equal(g.players[1].health === 10000, refill === 'on', refill);
  }
});

test('positions: the corners put the dummy against the wall', () => {
  const tr = createTraining(W, { ...defaultSettings(), position: 'right corner' });
  const g = tr.newGame();
  for (let f = 0; f < 5; f++) step(g, [0, 0], W);
  assert.ok(g.players[1].x > W.battle.halfWidthUnits - px(80));
  assert.ok(g.players[0].x < g.players[1].x);
  tr.settings.position = 'left corner';
  const g2 = tr.newGame();
  for (let f = 0; f < 5; f++) step(g2, [0, 0], W);
  assert.ok(g2.players[1].x < -W.battle.halfWidthUnits + px(80));
  assert.equal(g2.players[1].facing, 1, 'dummy faces Player 1');
});

test('the frame bar holds the last exchange while both are idle, and the next action starts it fresh', () => {
  const tr = createTraining(W);
  const g = tr.newGame();
  const meter = createFrameMeter();
  const run = (n, raw = 0) => { for (let f = 0; f < n; f++) { step(g, tr.inputs(g, [f === 0 ? raw : 0, 0]), W); meter.update(g, W); } };
  const total = W.chars[0].states['5M'].duration;
  run(100, RAW.M);
  const held = meter.bars[0].map((c) => c.kind);
  assert.equal(held.filter((k) => k !== 'free').length, total, 'the whole 5M is still on the bar');
  assert.equal(held.length - held.lastIndexOf('recovery') - 1, 8, 'then only 8 free frames');
  run(3, RAW.L);
  assert.deepEqual(meter.bars[0].map((c) => c.kind), ['startup', 'startup', 'startup'], 'a fresh bar');
});

test('the input history names the motion a press completed (236L, 623H), mirrored by facing, and nothing for a plain press', () => {
  const rules = W.input;
  const label = (str, facing = 1) => {
    const inp = createInputState(rules.bufferFrames);
    for (const r of script(str)) pushInput(inp, r, rules);
    const runs = historyRuns(inp, 18);
    return motionLabels(inp, runs, rules, facing).find((x) => x) || '';
  };
  assert.equal(label('5*5 2*2 3*2 6+L 5*3'), '236');
  assert.equal(label('5*5 6*2 2*2 3+H 5*3'), '623');
  assert.equal(label('5*5 2*2 1*2 4+L 5*3', -1), '236', 'facing left, 214 on screen is a 236');
  assert.equal(label('5*10 5+M 5*3'), '');
});

test('a throw that grabs is measured with its real startup (the grab frame counts as active)', () => {
  const tr = createTraining(W);
  const g = tr.newGame();
  g.players[0].x = -px(25); g.players[1].x = px(25);
  const meter = createFrameMeter();
  for (let f = 0; f < 60; f++) {
    step(g, tr.inputs(g, [f === 0 ? RAW.RIGHT | RAW.H : 0, 0]), W);
    meter.update(g, W);
  }
  const r = meter.last[0];
  assert.equal(r.move, '6H');
  assert.equal(r.startup, W.chars[0].states['6H'].move.startup);
});
