// Universal systems, section 8 (docs/specs/universal-systems.md): the Rite button. Avner's Vigil on R; Malik's
// Guardian Palm and its gauge of three charges.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileCharacter } from '../src/core/character.js';
import { createGame, step } from '../src/core/game.js';
import { enterState } from '../src/core/fighter.js';
import { RAW } from '../src/core/input.js';
import { px } from '../src/core/fixed.js';
import { runSyncTest } from '../src/net/sync-test.js';
import { loadWorld, loadChar, loadJSON, script, lcg, SYSTEM } from './helpers.js';

const AVNER = loadChar('data/characters/avner/avner.toska.json');
const MALIK = loadChar('data/characters/malik/malik.toska.json');
const MALIK_FILE = loadJSON('data/characters/malik/malik.toska.json');
const WA = loadWorld(AVNER, AVNER);
const WM = loadWorld(MALIK, MALIK);

function setup(world, gap = 300) {
  const g = createGame(world);
  g.players[0].x = -px(gap / 2);
  g.players[1].x = px(gap / 2);
  return g;
}
const run = (g, world, s, p2 = '') => {
  const a = script(s);
  const b = p2 ? script(p2) : [];
  const cues = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) { step(g, [a[i] ?? 0, b[i] ?? 0], world); cues.push(...g.cues); }
  return cues;
};

// ---------- Avner ----------

test('Avner: R enters Vigil; the old input (down, down, S) no longer does', () => {
  assert.deepEqual(AVNER.rite, { moves: ['vigil'], gauge: null });
  const g = setup(WA, 800);
  const a = g.players[0];
  run(g, WA, '5+R');
  assert.equal(a.state, 'vigil');
  run(g, WA, '5*24');
  assert.equal(a.state, 'vigilStance');
  // No gauge: it never runs out.
  assert.equal(a.rite, 0);
  for (let i = 0; i < 4; i++) {
    run(g, WA, '4 5*20'); // back out of the stance
    assert.notEqual(a.state, 'vigilStance');
    run(g, WA, '5*20 5+R 5*2');
    assert.equal(a.state, 'vigil', `use ${i + 2}`);
    run(g, WA, '5*24');
  }
  const old = setup(WA, 800);
  const seen = new Set();
  for (const r of script('2 5 2+S 5*30')) { step(old, [r, 0], WA); seen.add(old.players[0].state); }
  assert.ok(!seen.has('vigil') && !seen.has('vigilStance'), `22S gave: ${[...seen].join(', ')}`);
});

test('Avner: the Vigil follow-ups still come out of the stance entered with R', () => {
  for (const [button, move] of [['L', 'vigilSnap'], ['M', 'vigilM'], ['H', 'vigilAnchor'], ['S', 'vigilFlare']]) {
    const g = setup(WA, 800);
    run(g, WA, '5+R 5*24');
    run(g, WA, `5+${button}`);
    assert.equal(g.players[0].state, move);
  }
});

// ---------- Malik: Guardian Palm ----------

test('Malik: the Rite data: a gauge of 3 charges, 240 frames each, unlimited during his install; four Rite moves', () => {
  assert.deepEqual(MALIK_FILE.rite, { gauge: { charges: 3, rechargeFrames: 240, unlimitedWhile: 'install' }, moves: ['rite_5', 'rite_2', 'rite_6', 'rite_j'] });
  const inputs = Object.fromEntries(MALIK_FILE.moves.filter((m) => m.id.startsWith('rite_')).map((m) => [m.id, m.input]));
  assert.deepEqual(inputs, { rite_5: '5R', rite_2: '2R', rite_6: '6R', rite_j: 'j.R' });
  assert.equal(createGame(WM).players[0].rite, 3, 'a round starts with all three');
});

/** Malik does `input` and the spirit hand comes out. Returns its path: [{ x, y }] per frame, and what it did. */
function palm(input, { gap = 300, p2 = '5', before = '' } = {}) {
  const g = setup(WM, gap);
  const a = g.players[0];
  if (before) run(g, WM, before);
  run(g, WM, input, p2);
  const state = a.state;
  const path = [];
  let kind = null;
  let end = null;
  const hold = script(p2)[0];
  for (let i = 0; i < 70 && !end; i++) {
    step(g, [0, hold], WM);
    const pr = g.projectiles.find((q) => q.owner === 0);
    if (pr) { kind = pr.kind; path.push({ x: pr.x, y: pr.y }); }
    end = g.cues.find((c) => ['hit', 'counter', 'witness', 'block'].includes(c.type))?.type ?? (path.length && !pr ? 'gone' : null);
  }
  return { g, state, kind, path, end };
}

test('Malik R: the spirit hand strikes straight ahead, as its own object with its own hitbox', () => {
  const r = palm('5+R');
  assert.equal(r.state, 'rite_5');
  assert.equal(r.kind, 'palm5');
  assert.ok(r.path.length >= 2);
  assert.ok(r.path.every((p) => p.y === r.path[0].y), 'straight ahead');
  assert.ok(r.path.at(-1).x > r.path[0].x, 'forward');
  assert.equal(r.end, 'hit');
  const d = r.g.players[1];
  assert.equal(d.health, MALIK.stats.health - 700);
  assert.equal(r.g.players[0].hitstop, 0, 'the hand hits, not Malik: he is not frozen');
  assert.ok(MALIK.projectiles.palm5.hitbox[0][2] > 0);
  assert.equal(MALIK.states.rite_5.frames.every((f) => f.hit.length === 0), true, 'Malik himself has no hitbox in it');
  // It has a short reach: from far away it runs out.
  assert.equal(palm('5+R', { gap: 900 }).end, 'gone');
});

test('Malik 2R: low along the ground; it must be blocked crouching', () => {
  const r = palm('2+R');
  assert.equal(r.state, 'rite_2');
  assert.equal(r.kind, 'palm2');
  assert.ok(r.path[0].y < px(40), 'along the ground');
  assert.ok(r.path.every((p) => p.y === r.path[0].y));
  assert.equal(r.end, 'hit');
  assert.equal(MALIK.projectiles.palm2.move.guard, 'low');
  assert.equal(palm('2+R', { p2: '3' }).end, 'block', 'crouch block stops it');
  // Standing block does not.
  const s = setup(WM, 300);
  enterState(s.players[1], MALIK, 'idle');
  let got = null;
  run(s, WM, '2+R');
  for (let i = 0; i < 60 && !got; i++) {
    // P2 starts holding back only as the hand arrives, so they don't walk out of range.
    const near = s.projectiles.some((q) => Math.abs(q.x - s.players[1].x) < px(140));
    step(s, [0, near ? RAW.RIGHT : 0], WM);
    got = s.cues.find((c) => ['hit', 'counter', 'witness', 'block'].includes(c.type))?.type ?? null;
  }
  assert.equal(got, 'hit', 'it is a low');
});

test('Malik 6R: rising anti-air; it catches a jumping opponent and misses nobody on the ground far away', () => {
  const r = palm('6+R', { gap: 900 });
  assert.equal(r.state, 'rite_6');
  assert.equal(r.kind, 'palm6');
  assert.ok(r.path.at(-1).y > r.path[0].y + px(100), 'it rises');
  assert.ok(r.path.at(-1).x > r.path[0].x, 'and moves forward a little');
  // Against a jump-in.
  const g = setup(WM, 260);
  const d = g.players[1];
  let got = null;
  for (let i = 0; i < 70 && !got; i++) {
    step(g, [i === 14 ? RAW.RIGHT | RAW.R : 0, i === 0 ? RAW.UP | RAW.LEFT : 0], WM);
    got = g.cues.find((c) => ['hit', 'counter', 'witness'].includes(c.type)) ?? null;
  }
  assert.ok(got, 'the rising hand caught the jump');
  assert.ok(d.y > 0, 'in the air');
  assert.ok(d.vy > 0 || d.state === 'hitAir', 'and they are sent up');
});

test('Malik j.R: from the air the hand goes downward, and it is an overhead', () => {
  const r = palm('5+R', { before: '8 5*12', gap: 240 });
  assert.equal(r.state, 'rite_j');
  assert.equal(r.kind, 'palmJ');
  assert.ok(r.path.at(-1).y < r.path[0].y, 'downward');
  assert.ok(r.path.at(-1).x > r.path[0].x, 'and forward');
  assert.equal(MALIK.projectiles.palmJ.move.guard, 'high');
  assert.equal(r.end, 'hit');
});

test('the gauge: each Rite move spends a charge; with none left R does nothing', () => {
  const g = setup(WM, 900);
  const a = g.players[0];
  for (const [left, input, move] of [[2, '5+R', 'rite_5'], [1, '2+R', 'rite_2'], [0, '6+R', 'rite_6']]) {
    run(g, WM, input);
    assert.equal(a.state, move);
    assert.equal(a.rite, left);
    a.riteTimer = 0; // (hold the refill back so the count is easy to follow)
    while (a.state !== 'idle' && a.state !== 'crouch') { step(g, [0, 0], WM); a.riteTimer = 0; }
  }
  run(g, WM, '5+R');
  a.riteTimer = 0;
  assert.equal(a.state, 'idle', 'empty: nothing comes out');
  assert.equal(a.rite, 0);
  run(g, WM, '5 2+R 5 6+R');
  assert.ok(!a.state.startsWith('rite_'));
});

test('the gauge: charges refill one at a time, 240 frames each, up to three', () => {
  const g = setup(WM, 900);
  const a = g.players[0];
  a.rite = 0;
  a.riteTimer = 0;
  run(g, WM, '5*239');
  assert.equal(a.rite, 0);
  run(g, WM, '5');
  assert.equal(a.rite, 1, 'the first after 240 frames');
  run(g, WM, '5*240');
  assert.equal(a.rite, 2);
  run(g, WM, '5*240');
  assert.equal(a.rite, 3);
  run(g, WM, '5*300');
  assert.equal(a.rite, 3, 'never more than three');
  assert.equal(a.riteTimer, 0);
  // Spending one starts the clock from zero.
  run(g, WM, '5+R');
  assert.equal(a.rite, 2);
  run(g, WM, '5*238');
  assert.equal(a.rite, 2);
  run(g, WM, '5*2');
  assert.equal(a.rite, 3);
});

test('during his install the charges are unlimited: nothing is spent, and an empty gauge still works', () => {
  const g = setup(WM, 900);
  const a = g.players[0];
  a.vars.install = 600;
  for (let i = 0; i < 5; i++) {
    run(g, WM, '5+R');
    assert.equal(a.state, 'rite_5', `use ${i + 1}`);
    assert.equal(a.rite, 3, 'no charge spent');
    while (a.state !== 'idle') step(g, [0, 0], WM);
  }
  a.rite = 0;
  run(g, WM, '5+R');
  assert.equal(a.state, 'rite_5', 'even with none left');
  // When the install ends, the gauge counts again.
  a.vars.install = 0;
  while (a.state !== 'idle') step(g, [0, 0], WM);
  a.rite = 0; a.riteTimer = 0;
  run(g, WM, '5+R');
  assert.equal(a.state, 'idle');
});

test('a new round gives the charges back', () => {
  const w = loadWorld(MALIK, MALIK, { match: loadJSON('data/system/match.json') });
  const g = createGame(w);
  assert.equal(g.players[0].rite, 3);
});

test('the Rite data is checked when the character loads', () => {
  const file = (rite) => ({ engine: 'Toska', version: 2, character: { id: 'r', stats: {} }, rite,
    moves: [{ id: 'a', input: '5R', startup: 5, active: 2, recovery: 5 }, { id: 'b', input: '5L', startup: 5, active: 2, recovery: 5 }] });
  assert.throws(() => compileCharacter(file({ gauge: null, moves: ['nope'] }), SYSTEM), /unknown move nope/);
  assert.throws(() => compileCharacter(file({ gauge: null, moves: ['b'] }), SYSTEM), /must use the R button/);
  assert.throws(() => compileCharacter(file({ gauge: { charges: 2, rechargeFrames: 60, unlimitedWhile: 'ghost' }, moves: ['a'] }), SYSTEM), /unknown var ghost/);
  const ok = compileCharacter(file({ gauge: { charges: 2, rechargeFrames: 60 }, moves: ['a'] }), SYSTEM);
  assert.deepEqual(ok.rite, { moves: ['a'], gauge: { charges: 2, rechargeFrames: 60, unlimitedWhile: null } });
  assert.equal(compileCharacter(file(undefined), SYSTEM).rite, null, 'a character with no Rite moves');
});

test('Rite moves and the gauge survive rollback: 4000 frames of Malik against Malik, rewinding 8 frames every frame', () => {
  const rnd = lcg(909);
  const plans = ['5+R', '2+R', '6+R', '9 5*10 5+R', '5+L', '5+M', '6*8', '4*5', '5*6', '2 5 2+HS', '2 3 6+L'];
  const queues = [[], []];
  let palms = 0;
  const r = runSyncTest(WM, (g) => {
    palms += g.cues.filter((c) => c.type === 'hit' || c.type === 'block').length;
    for (const i of [0, 1]) {
      if (g.frame === 0) g.players[i].meter = 20000;
      if (!queues[i].length) {
        let raws = script(plans[rnd() % plans.length]);
        if (g.players[i].facing < 0) raws = raws.map((x) => (x & ~3) | ((x & 1) << 1) | ((x & 2) >> 1));
        queues[i] = raws;
      }
    }
    return [queues[0].shift(), queues[1].shift()];
  }, { frames: 4000, distance: 8 });
  assert.ok(r.ok, `desync at frame ${r.failFrame}: ${r.diff}`);
  assert.ok(palms > 10, `contact happened (${palms})`);
});
