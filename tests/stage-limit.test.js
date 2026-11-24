// The fighters can't get farther apart than `stage.maxGap` (battle.json), so both always fit on the screen
// (owner, Nov 23). Only movement away from the opponent is refused; nobody is pulled in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../src/core/game.js';
import { px } from '../src/core/fixed.js';
import { runSyncTest } from '../src/net/sync-test.js';
import { loadWorld, loadJSON, script, lcg } from './helpers.js';

const W = loadWorld();
const MAX = px(loadJSON('data/system/battle.json').stage.maxGap);
const gap = (g) => Math.abs(g.players[0].x - g.players[1].x);
function setup(a, b) {
  const g = createGame(W);
  g.players[0].x = px(a);
  g.players[1].x = px(b);
  return g;
}
const run = (g, s1, s2 = '') => { const a = script(s1), b = script(s2); for (let i = 0; i < a.length; i++) step(g, [a[i], b[i] ?? 0], W); };

test('the limit is a rule in the data, and both fighters fit on a 960 px screen at it', () => {
  assert.equal(W.battle.maxGapUnits, MAX);
  assert.ok(MAX > 0 && MAX <= px(960 - 100), 'room for both bodies on screen');
  assert.ok(MAX < 2 * W.battle.halfWidthUnits, 'smaller than the stage, or it would do nothing');
});

test('walking, dashing and jumping away all stop at the limit; the other fighter is not moved', () => {
  for (const away of ['4*200', '4 5 4 5*30 4 5 4 5*30 4 5 4 5*30 4 5 4 5*30', '7 5*50 7 5*50 7 5*50 7 5*50']) {
    const g = setup(-100, 100);
    run(g, away);
    assert.ok(gap(g) <= MAX, `${away.slice(0, 12)}: ${gap(g) / 100} px apart`);
    assert.equal(g.players[1].x, px(100), 'the one standing still stays put');
  }
  const g = setup(-100, 100);
  run(g, '4*200');
  assert.equal(gap(g), MAX, 'walking back ends exactly at the limit');
  run(g, '6*10');
  assert.ok(gap(g) < MAX, 'and he can walk back in');
});

test('both backing off share the limit; neither is pulled in when already too far', () => {
  const g = setup(-100, 100);
  run(g, '4*200', '6*200'); // player 2 faces left: 6 on the raw stick is away for them
  assert.equal(gap(g), MAX);
  assert.ok(g.players[0].x < px(-100) && g.players[1].x > px(100), 'each got some of the room');
  // Set too far apart by hand: standing still changes nothing, moving away is refused, moving in is free.
  const far = setup(-500, 500);
  run(far, '5*10');
  assert.equal(gap(far), px(1000), 'nobody is dragged in');
  run(far, '4*10');
  assert.equal(gap(far), px(1000), 'moving away is refused');
  run(far, '6*10');
  assert.ok(gap(far) < px(1000));
});

test('the wall still wins near the edge, and a jump keeps its height at the limit', () => {
  const g = setup(-700, -600);
  run(g, '4*120');
  assert.ok(g.players[0].x > -W.battle.halfWidthUnits, 'inside the stage');
  const j = setup(-400, 420);
  let top = 0;
  for (const raw of script('7 5*40')) { step(j, [raw, 0], W); top = Math.max(top, j.players[0].y); }
  assert.ok(top > px(100), 'the back jump still goes up');
  assert.equal(gap(j), MAX);
});

test('the limit survives rollback: random movement, rewinding 8 frames every frame', () => {
  const rnd = lcg(5);
  const moves = [script('4*30'), script('6*20'), script('7 5*30'), script('9 5*30'), script('4 5 4 5*20'), script('5+L'), script('5+H')];
  const feed = [[], []];
  for (let k = 0; k < 2; k++) while (feed[k].length < 2000) feed[k].push(...moves[rnd() % moves.length]);
  const r = runSyncTest(W, (g) => [feed[0][g.frame] ?? 0, feed[1][g.frame] ?? 0], { frames: 2000, distance: 8 });
  assert.ok(r.ok, `desync at ${r.failFrame}: ${r.diff}`);
});
