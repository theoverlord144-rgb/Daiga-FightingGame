import fs from 'node:fs';
// Avner's Back Heavy, two-hit Air Heavy and movement/block art, and the engine pieces they needed: a throw command
// that only comes out in range (the input falls through to the next move otherwise), a later hit's own frame data
// converted like the move's, and block/hit states whose table is as long as their art.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../src/core/game.js';
import { compileCharacter } from '../src/core/character.js';
import { px } from '../src/core/fixed.js';
import { loadWorld, loadChar, loadJSON, script, SYSTEM } from './helpers.js';

const AVNER = 'data/characters/avner/avner.toska.json';

function placed(w, gap) {
  const g = createGame(w);
  g.players[0].x = -px(gap / 2);
  g.players[1].x = px(gap / 2);
  return g;
}
const run = (g, w, s1, s2 = '') => {
  const a = script(s1);
  const b = s2 ? script(s2) : [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) step(g, [a[i] ?? 0, b[i] ?? 0], w);
};
const compile = (moves, extra = {}) => compileCharacter({ engine: 'Toska', version: 2, character: { id: 't', stats: {} }, moves, ...extra }, SYSTEM);
const tiny = (moves) => { const c = compile(moves); return loadWorld(c, c); };

const THROW = { startup: 2, active: 2, recovery: 20, damage: 1000, guard: 'unblockable', throwboxes: [[10, 20, 55, 120]], throwDistance: 70 };
const STRIKE = { startup: 5, active: 2, recovery: 10, damage: 100, hitstun: 20, hitboxes: [[0, 50, 120, 50]] };

// ---------- Engine: throws only come out in range ----------

test('one input, two moves: the throw up close, the strike from farther away', () => {
  const w = tiny([{ ...THROW, id: 'grab', input: '4H', throwSwap: true }, { ...STRIKE, id: 'back', input: '4H' }]);
  const near = placed(w, 50);
  run(near, w, '4+H 5*2');
  assert.equal(near.players[0].state, 'throwHold', 'in range: the throw');
  assert.equal(near.players[1].state, 'thrown');
  const far = placed(w, 200);
  run(far, w, '4+H 5');
  assert.equal(far.players[0].state, 'back', 'out of range: the strike');
});

test('a throw with no strike on its own input falls through to the plain button out of range', () => {
  const w = tiny([{ ...THROW, id: '6H', input: '6H' }, { ...STRIKE, id: '5H', input: '5H' }]);
  const far = placed(w, 200);
  run(far, w, '6+H 5');
  assert.equal(far.players[0].state, '5H');
  const near = placed(w, 50);
  run(near, w, '6+H 5*2');
  assert.equal(near.players[0].state, 'throwHold');
});

test('an opponent who cannot be thrown (in the air) gets the strike, even up close', () => {
  const w = tiny([{ ...THROW, id: 'grab', input: '4H' }, { ...STRIKE, id: 'back', input: '4H' }]);
  const g = placed(w, 50);
  run(g, w, '5*8 4+H 5', '8*10');
  assert.equal(w.chars[1].states[g.players[1].state].stance, 'air', 'the opponent is airborne');
  assert.equal(g.players[0].state, 'back');
});

test('the range check is the same from the other side of the screen', () => {
  const w = tiny([{ ...THROW, id: 'grab', input: '4H' }, { ...STRIKE, id: 'back', input: '4H' }]);
  const g = placed(w, 50);
  run(g, w, '', '6+H 5*2'); // player 2 faces left: back is screen-right
  assert.equal(g.players[1].state, 'throwHold');
  const far = placed(w, 200);
  run(far, w, '', '6+H 5');
  assert.equal(far.players[1].state, 'back');
});

// ---------- Engine: a later hit's own frame data, and stun-state art ----------

test("a second hit's own frame data is converted like the move's (distances in units), and only what it names", () => {
  const c = compile([{ id: '5L', input: '5L', startup: 3, active: 2, recovery: 20, damage: 100, hitstun: 10, pushbackHit: 5,
    hitboxes: [[0, 50, 60, 50]],
    timeline: [{ at: 8, hit: [[0, 50, 60, 50]], hitProps: { damage: 300, pushbackHit: 40, airHit: { x: 3, y: 6 } } }, { at: 10, hit: [] }] }]);
  const st = c.states['5L'];
  assert.equal(st.frames[2].hitProps, null, 'the first hit uses the move');
  assert.deepEqual(st.frames[8].hitProps, { damage: 300, pushbackHit: px(40), airHit: { x: px(3), y: px(6) } });
  assert.notEqual(st.frames[8].hitId, st.frames[2].hitId, 'a separate hit');
});

test('a block or hit state is as long as its art: the first drawing plays, then the last one holds', () => {
  const sprite = { image: 'x.png', columns: 2, rows: 1, count: 2, holds: [8, 1] };
  const c = compile([{ id: '5L', input: '5L', startup: 3, active: 2, recovery: 5 }, { id: 'blockStand', sprite }]);
  const st = c.states.blockStand;
  assert.equal(st.frames.length, 9);
  assert.equal(st.frames[0].sprite.index, 0);
  assert.equal(st.frames[7].sprite.index, 0);
  assert.equal(st.frames[8].sprite.index, 1);
  assert.equal(c.states.hitStand.frames.length, 1, 'no art: one frame, as before');
});

// ---------- Avner's data ----------

test("Avner: every drawn attack's drawings fill the move exactly", () => {
  const file = JSON.parse(JSON.stringify(loadChar(AVNER))); // compiled (plain data)
  for (const st of Object.values(file.states)) {
    const sheet = file.sheets[st.name];
    if (!st.move || !sheet?.holds) continue;
    const total = sheet.holds.slice(0, sheet.count).reduce((a, b) => a + b, 0);
    assert.equal(total, st.duration, `${st.name}: holds add up to ${total}, the move lasts ${st.duration}`);
  }
});

test('Avner: 4H is the back throw in range and the Back Heavy out of it; its lash is on screen while it hits', () => {
  const c = loadChar(AVNER);
  const w = loadWorld(c, c);
  const near = placed(w, 50);
  run(near, w, '4+H 5*2');
  assert.equal(near.players[0].state, 'throwHold');
  assert.equal(near.players[1].throwMove, '4H');
  const far = placed(w, 110); // past the throw's range (about 87 px), inside the lash's (130 px)
  run(far, w, '4+H 5');
  assert.equal(far.players[0].state, 'backHeavy');
  const st = c.states.backHeavy;
  const active = st.frames.map((f, i) => (f.hit.length ? i : -1)).filter((i) => i >= 0);
  assert.equal(active.length, st.move.active);
  const drawn = new Set(active.map((i) => st.frames[i].sprite.index));
  assert.equal(drawn.size, 1, 'one drawing (the lash) for all the active frames, so hitstop freezes on it');
  run(far, w, '5*14');
  assert.equal(far.players[1].state, 'hitStand', 'it reaches at 110 px');
});

test('Avner: Air Heavy is two hits, one on each swipe drawing', () => {
  const c = loadChar(AVNER);
  const st = c.states['j.H'];
  const ids = [...new Set(st.frames.map((f) => f.hitId).filter(Boolean))];
  assert.equal(ids.length, 2);
  const first = st.frames.findIndex((f) => f.hitId === ids[0]);
  const second = st.frames.findIndex((f) => f.hitId === ids[1]);
  assert.equal(first, st.move.startup - 1);
  assert.equal(st.frames[first].sprite.index, 3, 'hit 1 on the up-swipe');
  assert.equal(st.frames[second].sprite.index, 6, 'hit 2 on the down-swipe');
  assert.ok(st.frames.slice(first, second).some((f) => !f.hit.length), 'a gap between the hits');
  assert.equal(st.frames[second].hitProps.pushbackHit, px(14));
  assert.equal(st.frames.at(-1).hit.length, 0, 'recovery has no hitbox');
});

test('Avner: dashes, air dash and blocks have their art', () => {
  const c = loadChar(AVNER);
  for (const name of ['walkF', 'walkB', 'dashF', 'dashStop', 'backdash', 'backdashStop', 'airdashF', 'airdashB', 'airdashEnd', 'blockStand', 'blockCrouch', 'blockAir']) {
    assert.ok(c.sheets[name], `${name} has a sheet`);
    assert.ok(c.states[name].frames.every((f) => f.sprite && f.sprite.sheet === name), `${name}: every frame is drawn`);
  }
  assert.equal(c.states.blockStand.frames.at(-1).sprite.index, 1, 'the guard drawing holds');
  assert.deepEqual([...new Set(c.states.airdashB.frames.map((f) => f.sprite.index))], [1, 2], "back air dash: the back dash's two airborne drawings, never its standing one");
  assert.equal(c.states.airdashEnd.frames[c.states.airdashEnd.loopFrom].sprite.index, 2, 'falling loops on the last drawing');
});

test('Avner: the walk cycles loop cleanly (six drawings, eight frames each)', () => {
  const c = loadChar(AVNER);
  for (const name of ['walkF', 'walkB']) {
    const st = c.states[name];
    assert.equal(st.duration, 48);
    assert.deepEqual(st.frames.map((f) => f.sprite.index).filter((v, i, a) => v !== a[i - 1]), [0, 1, 2, 3, 4, 5]);
  }
});

test('Avner: hit reactions have their art (standing, crouching, air, tumble, knockdown, KO, getting up, thrown)', () => {
  const c = loadChar(AVNER);
  for (const name of ['hitStand', 'hitCrouch', 'hitAir', 'tumble', 'knockdown', 'koDown', 'wakeup', 'thrown']) {
    assert.ok(c.sheets[name], `${name} has a sheet`);
    assert.ok(c.states[name].frames.every((f) => f.sprite && f.sprite.sheet === name), `${name}: every frame is drawn`);
  }
  // The recoil plays first, then the last drawing holds for however long the stun lasts.
  for (const name of ['hitStand', 'hitCrouch']) {
    assert.deepEqual(c.states[name].frames.map((f) => f.sprite.index).filter((v, i, a) => v !== a[i - 1]), [0, 1, 2, 3]);
  }
  assert.equal(c.states.hitAir.frames.at(-1).sprite.index, 1);
  assert.deepEqual([...new Set(c.states.tumble.frames.map((f) => f.sprite.index))], [0, 1, 2, 3], 'the tumble spins through its four drawings');
  assert.equal(c.states.knockdown.frames.at(-1).sprite.index, 1, 'lying flat');
  assert.ok(c.states.koDown.frames.every((f) => f.sprite.index === 1), 'a KO stays flat (no bounce replay)');
  assert.equal(c.states.wakeup.frames.at(-1).sprite.index, 2, 'back on his feet');
  // Art only: the rules of these states are the system's.
  assert.equal(c.states.knockdown.duration, 40);
  assert.equal(c.states.wakeup.duration, 12);
  assert.ok(c.states.tumble.techable && c.states.tumble.loop);
});

test('universal hit and block effects: three hit sizes by damage and a block row, all inside the sheet', () => {
  const fx = loadJSON('data/system/effects.json');
  assert.deepEqual(fx.hit.map((h) => h.name), ['light', 'medium', 'heavy']);
  const limits = fx.hit.map((h) => h.below ?? Infinity);
  assert.ok(limits.every((v, i) => i === 0 || v > limits[i - 1]), 'thresholds rise, the last one is open-ended');
  for (const row of [...fx.hit.map((h) => h.row), fx.block.row]) assert.ok(row >= 0 && row < fx.sheet.rows);
  assert.equal(fx.frames, fx.sheet.columns);
  assert.equal(fx.sheet.columns * fx.sheet.rows, fx.sheet.count);
});

test('movement effects: every rule names a real state and a real sheet, and every sheet file exists', () => {
  const m = loadJSON('data/system/effects.json').motion;
  const c = loadChar(AVNER);
  const rules = [...Object.entries(m.enter), ...Object.entries(m.leave)];
  for (const [state, rule] of rules) {
    assert.ok(c.states[state], state + ' is a state');
    const names = [rule.play, rule.trail, ...(rule.byDrift ?? [])].filter(Boolean);
    assert.ok(names.length > 0, state + ' plays something');
    for (const n of names) assert.ok(m.sheets[n], n + ' is a sheet');
    assert.ok(['feet', 'body'].includes(rule.at));
  }
  for (const s of ['dashF', 'backdash', 'airdashF', 'airdashB', 'land']) assert.ok(m.enter[s], s + ' has an effect');
  assert.equal(m.enter.land.byDrift.length, 3, 'forward, still, backward');
  for (const [name, s] of Object.entries(m.sheets)) {
    assert.ok(fs.existsSync('data/effects/' + s.sprite.image), name + ': ' + s.sprite.image);
    assert.equal(s.sprite.columns * s.sprite.rows, s.sprite.count);
    assert.ok(s.hold > 0);
  }
});

test('Malik: loads, stands and walks with his own art, and can be put in a match', () => {
  const c = loadChar('data/characters/malik/malik.toska.json');
  assert.equal(c.id, 'malik');
  assert.equal(c.name, 'Malik');
  for (const [name, n] of [['idle', 60], ['walkF', 48], ['walkB', 48]]) {
    assert.equal(c.states[name].duration, n, name);
    assert.ok(c.states[name].frames.every((f) => f.sprite && f.sprite.sheet === name), `${name}: every frame is drawn`);
    assert.deepEqual([...new Set(c.states[name].frames.map((f) => f.sprite.index))], [0, 1, 2, 3, 4, 5], `${name}: all six drawings`);
    assert.ok(fs.existsSync('data/characters/malik/' + c.sheets[name].image));
  }
  assert.deepEqual(c.commands.map((x) => x.move), ['5L'], 'one attack so far');
  // Twenty frames holding forward against Avner: he walks, nothing breaks.
  const world = loadWorld('data/characters/malik/malik.toska.json', AVNER);
  const game = createGame(world);
  const x0 = game.players[0].x;
  for (let i = 0; i < 20; i++) step(game, [script('6')[0], 0], world);
  assert.equal(game.players[0].state, 'walkF');
  assert.ok(game.players[0].x > x0);
});

test('Malik: Standing Light comes out on frame 4, is drawn with the arm out while it can hit, and hits Avner up close', () => {
  const c = loadChar('data/characters/malik/malik.toska.json');
  const st = c.states['5L'];
  assert.deepEqual([st.move.startup, st.move.active, st.move.recovery, st.duration], [4, 2, 7, 12]);
  assert.ok(st.frames.every((f) => f.sprite && f.sprite.sheet === '5L'));
  const active = st.frames.map((f, i) => (f.hit.length ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(active, [3, 4]);
  for (const i of active) assert.equal(st.frames[i].sprite.index, 3, 'the full-extension drawing');
  assert.equal(st.frames.at(-1).sprite.index, 5, 'ends back in his stance');
  const world = loadWorld('data/characters/malik/malik.toska.json', AVNER);
  const game = createGame(world);
  game.players[0].x = -px(35);
  game.players[1].x = px(35);
  const hp = game.players[1].health;
  for (const raw of script('5+L 5*8')) step(game, [raw, 0], world);
  assert.equal(game.players[1].health, hp - 400);
  assert.equal(game.players[1].state, 'hitStand');
});
