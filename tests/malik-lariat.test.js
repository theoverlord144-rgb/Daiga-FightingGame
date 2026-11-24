// Malik's Running Lariat (214 + L / M / H; owner, Nov 23): he runs forward, farther by button, and swings.
// The EX version has one hit of armor. Numbers are first guesses in his file; these tests check the shape, and
// read the numbers that are the owner's to tune from the data instead of pinning them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../src/core/game.js';
import { px } from '../src/core/fixed.js';
import { runSyncTest } from '../src/net/sync-test.js';
import { loadWorld, loadChar, script, lcg } from './helpers.js';

const M = loadChar('data/characters/malik/malik.toska.json');
const W = loadWorld(M, M);
const IDS = ['lariatL', 'lariatM', 'lariatH'];

function setup(gap) {
  const g = createGame(W);
  g.players[0].x = -px(gap / 2);
  g.players[1].x = px(gap / 2);
  return g;
}
function run(g, s, p2 = '') {
  const a = script(s), b = script(p2), cues = [];
  for (let i = 0; i < a.length; i++) { step(g, [a[i], b[i] ?? 0], W); cues.push(...g.cues); }
  return cues;
}

test('Running Lariat: 214 + L / M / H; he runs forward, farther and later by button, and stops for the swing', () => {
  const far = [];
  for (const [i, b] of ['L', 'M', 'H'].entries()) {
    const g = setup(1300);
    const p = g.players[0];
    const x0 = p.x;
    run(g, `2 1 4+${b} 5*2`);
    assert.equal(p.state, IDS[i], `214${b}`);
    run(g, '5*80');
    assert.equal(p.state, 'idle');
    far.push((p.x - x0) / 100);
    const st = M.states[IDS[i]];
    const first = st.frames.findIndex((f) => f.hit.length);
    assert.equal(first, st.move.startup - 1, 'the swing comes out when the run ends');
    assert.equal(st.frames[first].sprite.index, 5, 'the swing drawing is on the hitting frames');
    assert.ok(st.frames.slice(0, 4).every((f) => f.sprite.index === 0), 'the power-up drawing first');
    assert.equal(st.kind, 'special');
  }
  assert.ok(far[0] >= 100 && far[0] < far[1] && far[1] < far[2], `L ${far[0]}, M ${far[1]}, H ${far[2]} px`);
  const s = IDS.map((id) => M.states[id].move.startup);
  assert.ok(s[0] < s[1] && s[1] < s[2], 'a longer run is a later swing');
});

test('Running Lariat: it reaches an opponent the run brings him to, and can be blocked standing', () => {
  const g = setup(300);
  const d = g.players[1];
  const cues = run(g, '2 1 4+M 5*30');
  assert.ok(cues.some((c) => c.type === 'hit' && c.move === 'lariatM'), 'M reaches from 300 px');
  assert.ok(d.health < M.stats.health);
  assert.equal(M.states.lariatM.move.guard, 'mid');
  // Blocked standing. (Knockdown and how far behind he is on block are the owner's to tune: not checked.)
  const b = setup(300);
  let hitAt = -1, freeA = -1, freeD = -1;
  const a = script('2 1 4+M 5*90'), hold = script('6*100'); // player 2 holds away from player 1
  for (let i = 0; i < a.length; i++) {
    step(b, [a[i], hold[i]], W);
    if (hitAt < 0 && b.cues.some((c) => c.type === 'block')) hitAt = i;
    if (hitAt >= 0 && freeA < 0 && b.players[0].state === 'idle') freeA = i;
    if (hitAt >= 0 && freeD < 0 && !b.players[1].state.startsWith('block')) freeD = i;
  }
  assert.ok(hitAt >= 0, 'it was blocked');
  assert.ok(freeA > hitAt && freeD > hitAt, 'both recover afterwards');
});

test('Running Lariat EX: one bar, and one hit of armor from the power-up until the swing ends', () => {
  const ex = M.states.lariatL_ex;
  const lastActive = ex.frames.findLastIndex((f) => f.hit.length);
  assert.ok(ex.frames.slice(0, lastActive + 1).every((f) => f.armor === 1), 'armor through the run and the swing');
  assert.ok(ex.frames.slice(lastActive + 1).every((f) => !f.armor), 'none in recovery');
  for (const id of IDS) assert.ok(M.states[id].frames.every((f) => !f.armor), `${id}: no armor without the bar`);
  // He runs through a jab and still lands the swing; without the bar the jab stops him.
  for (const [input, wins] of [['LS', true], ['L', false]]) {
    const g = setup(150);
    g.players[0].meter = 10000;
    const cues = run(g, `2 1 4+${input} 5*40`, '5*4 5+L 5*40');
    assert.equal(cues.some((c) => ['hit', 'counter', 'witness'].includes(c.type) && c.move.startsWith('lariat')), wins, wins ? 'EX goes through the jab' : 'the plain version is stopped');
    if (wins) {
      assert.ok(cues.some((c) => c.type === 'armor'), 'the jab was absorbed');
      assert.equal(M.commands.find((c) => c.move === 'lariatL_ex').cost.meter, 10000, 'the EX costs one bar');
      assert.ok(g.players[0].meter < 10000, 'and it was spent (he earns some back from the hit)');
      assert.ok(g.players[0].health < M.stats.health, 'armor still takes the damage');
    }
  }
});

test('Running Lariat survives rollback: Malik against Malik at random, rewinding 8 frames every frame', () => {
  const rnd = lcg(77);
  const motions = [script('2 1 4+L'), script('2 1 4+M'), script('2 1 4+H'), script('2 1 4+LS'), script('5+L'), script('6*6'), script('4*6'), script('8 5*4')];
  const feed = [[], []];
  for (let k = 0; k < 2; k++) while (feed[k].length < 2500) feed[k].push(...motions[rnd() % motions.length], ...script(`5*${rnd() % 12}`));
  const r = runSyncTest(W, (g) => [feed[0][g.frame] ?? 0, feed[1][g.frame] ?? 0], { frames: 2500, distance: 8 });
  assert.ok(r.ok, `desync at ${r.failFrame}: ${r.diff}`);
});
