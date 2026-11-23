// Brand of Light (Avner's mechanic) and the three engine pieces it is built on: pull-in on hit, sliding to the
// opponent, and a once-per-combo limit. The engine pieces are tested on small made-up characters; Avner's rules are
// tested against his own compiled data (reach, timings), so retuning his numbers doesn't break them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../src/core/game.js';
import { compileCharacter } from '../src/core/character.js';
import { px } from '../src/core/fixed.js';
import { runSyncTest } from '../src/net/sync-test.js';
import { loadWorld, loadChar, script, SYSTEM } from './helpers.js';

const dist = (g) => Math.abs(g.players[1].x - g.players[0].x);

function placed(w, gap, { swap = false } = {}) {
  const g = createGame(w);
  g.players[0].x = (swap ? 1 : -1) * px(gap / 2);
  g.players[1].x = (swap ? -1 : 1) * px(gap / 2);
  g.players[0].facing = swap ? -1 : 1;
  g.players[1].facing = swap ? 1 : -1;
  return g;
}
const run = (g, w, s1, s2 = '') => {
  const a = script(s1);
  const b = s2 ? script(s2) : [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) step(g, [a[i] ?? 0, b[i] ?? 0], w);
};
/** Step with no input until cond(g) holds (or give up after n frames). */
function until(g, w, cond, n = 120) {
  for (let i = 0; i < n; i++) {
    if (cond(g)) return true;
    step(g, [0, 0], w);
  }
  return cond(g);
}

function tiny(moves, extra = {}) {
  const c = compileCharacter({ engine: 'Toska', version: 2, character: { id: 't', stats: {} }, moves, ...extra }, SYSTEM);
  return loadWorld(c, c);
}

// ---------- Engine pieces ----------

test('pull-in: on hit the defender slides to exactly `to` px in front of the attacker, from any range', () => {
  const w = tiny([{ id: '5L', input: '5L', startup: 3, active: 2, recovery: 10, damage: 100, hitstun: 40, hitstop: 0,
    pull: { to: 70, frames: 8 }, hitboxes: [[0, 50, 400, 100]] }]);
  for (const gap of [150, 250, 380]) {
    const g = placed(w, gap);
    run(g, w, '5+L 5*20');
    assert.equal(g.players[1].state, 'hitStand', `gap ${gap}: hit`);
    assert.equal(dist(g), px(70), `gap ${gap}: pulled in to 70 px`);
    assert.equal(g.players[0].x, -px(gap / 2), 'the attacker stays put');
  }
  // Without pull: ordinary pushback, the defender goes away.
  const w2 = tiny([{ id: '5L', input: '5L', startup: 3, active: 2, recovery: 10, damage: 100, hitstun: 40, pushbackHit: 20, hitboxes: [[0, 50, 400, 100]] }]);
  const g = placed(w2, 150);
  run(g, w2, '5+L 5*20');
  assert.ok(dist(g) > px(150));
});

test('pull-in works on an airborne defender too, and not on block', () => {
  const w = tiny([{ id: '5L', input: '5L', startup: 3, active: 2, recovery: 10, damage: 100, hitstun: 40, hitstop: 0,
    pull: { to: 70, frames: 8 }, blockstun: 15, pushbackBlock: 20, hitboxes: [[0, 0, 400, 300]] }]);
  let g = placed(w, 300);
  run(g, w, '5*6', '8*1 5*5'); // the defender jumps
  run(g, w, '5+L 5*12');
  assert.equal(g.players[1].state, 'hitAir');
  assert.equal(dist(g), px(70));
  g = placed(w, 300);
  const a = script('5+L 5*20'), b = script('6*22'); // the defender blocks (holding away)
  let blocked = false, closest = dist(g);
  for (let i = 0; i < a.length; i++) {
    step(g, [a[i], b[i]], w);
    blocked ||= g.players[1].state.startsWith('block');
    closest = Math.min(closest, dist(g));
  }
  assert.ok(blocked, 'blocked');
  assert.ok(closest >= px(300), 'blocked: never pulled in');
});

test('toOpponent: the fighter slides to `to` px in front of the opponent, either side, and never past them', () => {
  const w = tiny([{ id: '5S', input: '5S', startup: 1, active: 0, recovery: 20, timeline: [{ at: 1, toOpponent: { to: 80, frames: 6 } }] }]);
  for (const swap of [false, true]) {
    const g = placed(w, 400, { swap });
    run(g, w, '5+S 5*12');
    assert.equal(dist(g), px(80), `swap ${swap}`);
    assert.equal(Math.abs(g.players[1].x), px(200), 'the opponent did not move');
  }
  const g = placed(w, 70);
  run(g, w, '5+S 5*12');
  assert.equal(dist(g), px(70), 'already closer: stays where it is');
});

test('perCombo: a move limited to once per combo cannot hit twice in one combo, and is fine again after', () => {
  const moves = (perCombo) => [{ id: '5L', input: '5L', startup: 3, active: 2, recovery: 14, damage: 100, hitstun: 30, hitstop: 0, pushbackHit: 0,
    perCombo, hitboxes: [[0, 50, 120, 100]] }];
  // This test repeats one normal many times to exercise another rule, so the once-per-string limit
  // (reverse beat, tests/reverse-beat.test.js) is switched off for it.
  const most = (world) => {
    const w = { ...world, combo: { ...world.combo, chainUses: null } };
    const g = placed(w, 60);
    let max = 0;
    for (const r of script('5+L 5*6 5+L 5*6 5+L 5*6 5+L 5*40')) {
      step(g, [r, 0], w);
      max = Math.max(max, g.players[1].combo?.hits ?? 0);
    }
    return { max, g };
  };
  const gat = { gatlings: { '5L': ['5L'] } };
  assert.ok(most(tiny(moves(0), gat)).max >= 3, 'no limit: it chains into itself');
  assert.equal(most(tiny(moves(1), gat)).max, 1, 'limit 1: one hit per combo');
  // After the combo ends, it works again.
  const w = tiny(moves(1), gat);
  const { g } = most(w);
  assert.equal(g.players[1].combo, null);
  run(g, w, '5+L 5*10');
  assert.equal(g.players[1].combo?.hits, 1);
});

// ---------- Avner: Brand of Light ----------

const A = loadChar('data/characters/avner/avner.toska.json');
const W = loadWorld(A, A);
const MAX = A.mechanic.vars.brand.max;
const reach = (id) => A.states[id].move.reach / 100; // px

test('Lumen Hook brands on hit, not on whiff or block', () => {
  for (const [id, input] of [['hookL', 'L'], ['hookM', 'M'], ['hookH', 'H']]) {
    let g = placed(W, reach(id) - 20);
    run(g, W, `2 3 6+${input} 5*40`);
    assert.ok(g.players[1].combo || g.players[1].lastCombo, `${id} hit`);
    assert.ok(g.players[0].vars.brand > MAX - 60, `${id}: branded (${g.players[0].vars.brand})`);
    g = placed(W, reach(id) + 120);
    run(g, W, `2 3 6+${input} 5*40`);
    assert.equal(g.players[0].vars.brand, 0, `${id}: whiff, no brand`);
    g = placed(W, reach(id) - 20);
    run(g, W, `2 3 6+${input} 5*40`, '6*45');
    assert.equal(g.players[0].vars.brand, 0, `${id}: blocked, no brand`);
  }
});

test('the brand fades: one frame at a time, gone after 5 seconds', () => {
  const g = placed(W, 600);
  g.players[0].vars.brand = MAX;
  step(g, [0, 0], W);
  assert.equal(g.players[0].vars.brand, MAX - 1);
  run(g, W, `5*${MAX - 2}`);
  assert.equal(g.players[0].vars.brand, 1);
  step(g, [0, 0], W);
  assert.equal(g.players[0].vars.brand, 0);
  run(g, W, '5*10');
  assert.equal(g.players[0].vars.brand, 0, 'and stays at 0');
});

test('Reel and Lightstep only come out while the opponent is branded, and both use the brand up', () => {
  for (const [id, input] of [['reel', '2 1 4+H'], ['lightstep', '2 1 4+L']]) {
    let g = placed(W, 300);
    const seen = [];
    for (const r of script(`${input} 5*10`)) { step(g, [r, 0], W); seen.push(g.players[0].state); }
    assert.ok(!seen.includes(id), `${id}: no brand, no ${id} (${[...new Set(seen)].join(' ')})`);
    g = placed(W, 300);
    g.players[0].vars.brand = 200;
    seen.length = 0;
    for (const r of script(`${input} 5*10`)) { step(g, [r, 0], W); seen.push(g.players[0].state); }
    assert.ok(seen.includes(id), `${id}: branded, it comes out`);
    assert.equal(g.players[0].vars.brand, 0, `${id}: the brand is used up`);
  }
});

test('Lightstep: Avner arrives in front of the branded opponent from across the screen', () => {
  const g = placed(W, 500);
  g.players[0].vars.brand = 200;
  run(g, W, '2 1 4+L 5*16');
  assert.ok(dist(g) <= px(80), `arrived (${dist(g) / 100} px)`);
});

test('Hook into Reel: the brand pulls the opponent back in, and the combo continues', () => {
  const g = placed(W, reach('hookH') - 20);
  run(g, W, '2 3 6+H');
  assert.ok(until(g, W, (s) => s.players[1].combo), 'Hook hit');
  run(g, W, '2 1 4+H');
  assert.ok(until(g, W, (s) => s.players[0].state === 'reel' && s.players[1].combo?.hits === 2), 'Reel hit in the same combo');
  until(g, W, (s) => s.players[1].slideLeft === 0, 30);
  assert.equal(dist(g), px(A.states.reel.move.pull.to / 100), 'pulled in front of Avner');
  assert.equal(g.players[0].vars.brand, 0);
});

test('Reel works once per combo: re-branding mid-combo does not allow a second Reel', () => {
  const g = placed(W, 200);
  g.players[0].vars.brand = MAX;
  run(g, W, '2 1 4+H');
  assert.ok(until(g, W, (s) => s.players[1].combo?.hits === 1), 'first Reel hit');
  until(g, W, (s) => s.players[0].state === 'idle');
  assert.ok(g.players[1].combo, 'still in the combo (Reel leaves Avner ahead)');
  g.players[0].vars.brand = MAX; // as if branded again somehow
  const seen = [];
  for (const r of script('2 1 4+H 5*6')) { step(g, [r, 0], W); seen.push(g.players[0].state); }
  assert.ok(!seen.includes('reel'), 'no second Reel in this combo');
  assert.equal(g.players[0].vars.brand, MAX - 9, 'and the brand was not spent on it');
});

test('sync test: Hook, Reel, Lightstep and the brand timer, rewinding 8 frames every frame, never differ', () => {
  const seq = script(`2 3 6+H 5*30 2 1 4+H 5*60 2 3 6+L 5*30 2 1 4+L 5*30 5+L 5*8 5+M 5*40 6*20 2 3 6+M 5*400`);
  const r = runSyncTest(W, (g) => [seq[g.frame % seq.length] ?? 0, g.frame % 97 < 20 ? script('6')[0] : 0], { frames: 1500, distance: 8 });
  assert.ok(r.ok, `desync at ${r.failFrame}: ${r.diff}`);
});
