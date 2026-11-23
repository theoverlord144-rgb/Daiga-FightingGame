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
  assert.deepEqual(c.commands.map((x) => x.move).sort(), ['2H', '2L', '2M', '5H', '5L', '5M', '5S', 'backHeavy', 'install', 'j.H', 'j.L', 'j.M', 'j.S', 'pillarH', 'pillarL', 'pillarM', 'spiritOrb', 'spiritOrbH', 'spiritOrbM', 'vow_start']); // vow_start: the universal Vow (M+H), every character has it
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
  for (const i of active) assert.equal(st.frames[i].sprite.index, 2, 'hits on drawing 3');
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

test('Malik: Standing Medium hits twice, on drawings 4 and 5; Standing Heavy hits on drawing 4 and skips drawn frames 5 and 6', () => {
  const c = loadChar('data/characters/malik/malik.toska.json');
  const m = c.states['5M'];
  const hits = m.frames.map((f, i) => (f.hit.length ? [i, f.hitId, f.sprite.index] : null)).filter(Boolean);
  assert.deepEqual([...new Set(hits.map((h) => h[1]))].length, 2, 'two separate hits');
  assert.deepEqual([...new Set(hits.filter((h) => h[1] === hits[0][1]).map((h) => h[2]))], [3], 'first hit on drawing 4');
  assert.deepEqual([...new Set(hits.filter((h) => h[1] !== hits[0][1]).map((h) => h[2]))], [4], 'second hit on drawing 5');
  const h = c.states['5H'];
  assert.equal(c.sheets['5H'].count, 6, 'eight drawn, two left out');
  assert.deepEqual([...new Set(h.frames.filter((f) => f.hit.length).map((f) => f.sprite.index))], [3], 'hits on drawing 4');
  assert.deepEqual(h.frames.map((f, i) => (f.hit.length ? i : -1)).filter((i) => i >= 0), [8, 9, 10]);

  // In a match: both hits of 5M connect as one two-hit combo; 5L chains into 5M into 5H.
  const world = loadWorld('data/characters/malik/malik.toska.json', AVNER);
  let game = createGame(world);
  game.players[0].x = -px(30); game.players[1].x = px(30);
  let most = 0;
  for (const raw of script('5+M 5*40')) { step(game, [raw, 0], world); most = Math.max(most, game.players[1].combo?.hits ?? 0); }
  assert.equal(most, 2);
  game = createGame(world);
  game.players[0].x = -px(30); game.players[1].x = px(30);
  most = 0;
  for (const raw of script('5+L 5*10 5+M 5*24 5+H 5*40')) { step(game, [raw, 0], world); most = Math.max(most, game.players[1].combo?.hits ?? 0); }
  assert.equal(most, 4, 'light, medium twice, heavy');
});

test('Malik: every new attack hits on the drawing Yahushua named, and every sheet exists', () => {
  const c = loadChar('data/characters/malik/malik.toska.json');
  // move -> the drawing (counted from 1) its hit lands on
  const want = { '2L': 2, '2M': 4, '2H': 4, 'j.L': 3, 'j.M': 3, 'j.H': 3, backHeavy: 4, spiritOrb: 4 };
  for (const [move, drawing] of Object.entries(want)) {
    const st = c.states[move];
    const hits = st.frames.filter((fr) => fr.hit.length);
    assert.ok(hits.length > 0, move);
    assert.deepEqual([...new Set(hits.map((fr) => fr.sprite.index + 1))], [drawing], move);
    assert.equal(st.frames[st.move.startup - 1].hit.length > 0, true, move + ': first active frame');
  }
  for (const sheet of Object.values(c.sheets)) assert.ok(fs.existsSync('data/characters/malik/' + sheet.image), sheet.image);
  for (const name of ['crouch', 'jumpSquat', 'jump', 'fall', 'land']) assert.ok(c.states[name].frames.every((fr) => fr.sprite), name + ' has art');
  // Air Heavy: the spirit hand's drawing 4 (of 7) is on screen on the frame the hit comes out.
  const jh = c.states['j.H'];
  assert.deepEqual(jh.layers, [{ effect: 'spiritHand' }]);
  const first = jh.move.startup - 1;
  assert.equal(Math.floor((first * c.effects.spiritHand.sprite.count) / jh.duration) + 1, 4);
});

test('Malik: Spirit Orb (236L) hits with the spin, then the orb leaves his hand and hits from range', () => {
  const world = loadWorld('data/characters/malik/malik.toska.json', AVNER);
  // Up close: the spin connects, then the orb: a two-hit combo.
  let game = createGame(world);
  game.players[0].x = -px(30); game.players[1].x = px(30);
  let most = 0, spawned = -1;
  for (const raw of script('2 3 6+L 5*60')) {
    step(game, [raw, 0], world);
    most = Math.max(most, game.players[1].combo?.hits ?? 0);
    // Point blank the orb hits on the frame it appears, so look for it or for its ending.
    if (spawned < 0 && (game.projectiles.length || game.cues.some((cue) => cue.type === 'projectileEnd'))) spawned = game.players[0].frame;
  }
  assert.equal(spawned, 14, 'the orb appears on drawing 5, right after the hit drawing');
  assert.equal(most, 2);
  // From range: only the orb reaches.
  game = createGame(world);
  game.players[0].x = -px(150); game.players[1].x = px(150);
  const hp = game.players[1].health;
  for (const raw of script('2 3 6+L 5*80')) step(game, [raw, 0], world);
  assert.equal(game.players[1].health, hp - 500);
  assert.equal(game.projectiles.length, 0);
});

test('Malik: Standing Heavy chains into Back Heavy on hit', () => {
  const world = loadWorld('data/characters/malik/malik.toska.json', AVNER);
  const game = createGame(world);
  game.players[0].x = -px(30); game.players[1].x = px(30);
  const seen = new Set(); let most = 0;
  for (const raw of script('5+H 5*22 4+H 5*50')) { step(game, [raw, 0], world); seen.add(game.players[0].state); most = Math.max(most, game.players[1].combo?.hits ?? 0); }
  assert.ok(seen.has('backHeavy'), 'Back Heavy came out of Standing Heavy');
  assert.equal(most, 2, 'and it combos');
});

test('Malik: every dash has its own art, covering the whole state', () => {
  const c = loadChar('data/characters/malik/malik.toska.json');
  const drawings = { dashF: 4, dashStop: 2, backdash: 3, backdashStop: 2, airdashF: 4, airdashB: 4, airdashEnd: 2 };
  for (const [name, count] of Object.entries(drawings)) {
    const st = c.states[name];
    assert.ok(st.frames.every((fr) => fr.sprite), name + ' has art on every frame');
    assert.equal(new Set(st.frames.map((fr) => fr.sprite.index)).size, count, name + ' shows all its drawings');
  }
});

test('Malik: blocks, hit reactions, knockdown and get-up have their own art', () => {
  const c = loadChar('data/characters/malik/malik.toska.json');
  // state -> how many different drawings it shows
  const drawings = { blockStand: 2, blockCrouch: 2, blockAir: 2, hitStand: 1, hitCrouch: 1, hitAir: 2, tumble: 2, knockdown: 2, koDown: 1, wakeup: 3, thrown: 1 };
  for (const [name, count] of Object.entries(drawings)) {
    const st = c.states[name];
    assert.ok(st.frames.every((fr) => fr.sprite), name + ' has art on every frame');
    assert.equal(new Set(st.frames.map((fr) => fr.sprite.index)).size, count, name);
  }
  assert.equal(c.sheets[c.states.hitCrouch.frames[0].sprite.sheet].count, 1, 'crouching hit: one drawing only');
  for (const sheet of Object.values(c.sheets)) assert.ok(fs.existsSync('data/characters/malik/' + sheet.image), sheet.image);
});

test('Avner: Air Spike (j.S) has its art, and the hit lands on drawing 4', () => {
  const c = loadChar(AVNER);
  const st = c.states['j.S'];
  assert.ok(st.frames.every((fr) => fr.sprite), 'art on every frame');
  assert.equal(new Set(st.frames.map((fr) => fr.sprite.index)).size, 7, 'all seven drawings show');
  const hits = st.frames.filter((fr) => fr.hit.length);
  assert.equal(hits.length, st.move.active);
  assert.deepEqual([...new Set(hits.map((fr) => fr.sprite.index + 1))], [4]);
  assert.ok(st.frames[st.move.startup - 1].hit.length > 0, 'first active frame');
  assert.ok(fs.existsSync('data/characters/avner/sheets/jS.png'));
});

// The cost follows the owner's universal systems spec: a level 1 super costs one bar (it was two for a while).
test('Malik: Spirit Install (down, down, S+H) costs one bar, runs 10 seconds, and carries its aura and art', () => {
  const world = loadWorld('data/characters/malik/malik.toska.json', AVNER);
  const run = (meter, text) => {
    const game = createGame(world);
    game.players[0].meter = meter;
    const seen = new Set(); let flashed = false, top = 0;
    for (const raw of script(text)) { step(game, [raw, 0], world); seen.add(game.players[0].state); flashed ||= game.flash > 0; top = Math.max(top, game.players[0].vars.install); }
    return { game, seen, flashed, top };
  };
  // With a bar: the super comes out, the screen flashes, the bar is spent, the timer starts at 10 seconds and runs down.
  const a = run(10000, '2 5 2+HS 5*100');
  assert.ok(a.seen.has('install'));
  assert.ok(a.flashed, 'super flash');
  assert.equal(a.top, 600);
  assert.equal(a.game.players[0].meter, 0, 'the bar is spent');
  assert.ok(a.game.players[0].vars.install > 0 && a.game.players[0].vars.install < 600, 'counting down');
  // It runs out by itself.
  const b = run(10000, '2 5 2+HS 5*720');
  assert.equal(b.game.players[0].vars.install, 0);
  // Without a full bar: no install.
  const c = run(0, '2 5 2+HS 5*60');
  assert.ok(!c.seen.has('install'));
  const c1 = run(9999, '2 5 2+HS 5*60');
  assert.ok(!c1.seen.has('install'), 'just short of a bar is not enough');
  // Already installed: it can't be done again (no bar wasted).
  const d = run(40000, '2 5 2+HS 5*60 2 5 2+HS 5*30');
  assert.equal(d.game.players[0].meter, 30000, 'the other three bars are kept');
  // Drawing data: the guardian and half of the lights behind him, flames and the other lights in front; idle art swapped.
  const v = world.chars[0].mechanic.vars.install;
  assert.deepEqual(v.aura.map((l) => [l.effect, !!l.behind]), [['guardian', true], ['installMotesBack', true], ['installFlames', false], ['installMotesFront', false]]);
  for (const l of v.aura) assert.ok(fs.existsSync('data/characters/malik/' + world.chars[0].effects[l.effect].sprite.image), l.effect);
  assert.deepEqual(v.art, { idle: 'installIdle' });
  assert.equal(world.chars[0].states.installIdle.frames.length, world.chars[0].states.idle.frames.length);
});

test('Malik: Resilience Pillar (623 + L / M / H): heavier is slower and hits harder; only Medium is upper-body invincible', () => {
  const world = loadWorld('data/characters/malik/malik.toska.json', AVNER);
  const c = world.chars[0];
  const first = (id) => c.states[id].frames.findIndex((fr) => fr.hit.length);
  assert.ok(first('pillarL') < first('pillarM') && first('pillarM') < first('pillarH'), 'L is fastest, H slowest');
  const dmg = ['pillarL', 'pillarM', 'pillarH'].map((id) => c.states[id].move.damage);
  assert.ok(dmg[0] < dmg[1] && dmg[1] < dmg[2], 'L hits lightest, H hardest');
  // The pillar stands in front of him, from the floor up, and its effect plays from the slam.
  for (const id of ['pillarL', 'pillarM', 'pillarH']) {
    const st = c.states[id];
    const box = st.frames[first(id)].hit[0];
    assert.ok(box[0] > 0 && box[1] === 0 && box[3] > 20000, id + ': a tall box in front, on the floor');
  }
  assert.ok(fs.existsSync('data/characters/malik/' + c.effects.pillar.sprite.image));
  // Upper body: Medium only has his lower half hittable until the pillar is gone; L and H keep the whole body.
  const top = (id, f) => Math.max(...c.states[id].frames[f].hurt.map((b) => b[1] + b[3]));
  assert.ok(top('pillarM', 0) < top('pillarL', 0) / 2 + 100);
  assert.equal(top('pillarM', first('pillarM')), top('pillarM', 0));
  assert.equal(top('pillarM', c.states.pillarM.frames.length - 1), top('pillarL', 0), 'full body again in recovery (his standing hurtbox)');
  assert.equal(top('pillarH', 0), top('pillarL', 0));
  // In a match: the shoryuken motion + M launches an opponent standing in front.
  const game = createGame(world);
  game.players[0].x = -px(48); game.players[1].x = px(48);
  const hp = game.players[1].health; let air = false;
  for (const raw of script('6 2 3+M 5*60')) { step(game, [raw, 0], world); air ||= game.players[1].y > 0; }
  assert.equal(hp - game.players[1].health, 1000);
  assert.ok(air, 'launched');
});

test('Malik: Spirit Orb M and H start slower and throw a slower orb; H slides back first', () => {
  const world = loadWorld('data/characters/malik/malik.toska.json', AVNER);
  const c = world.chars[0];
  const run = (text) => {
    const game = createGame(world);
    game.players[0].x = -px(200); game.players[1].x = px(200);
    const x0 = game.players[0].x; let spawn = -1, back = 0, speed = 0, last = null;
    for (const raw of script(text)) {
      step(game, [raw, 0], world);
      if (spawn < 0 && game.projectiles.length) spawn = game.players[0].frame;
      // Speed = how far the orb moved this step (once it is out and flying).
      const orb = game.projectiles[0];
      if (orb && last !== null) speed = Math.max(speed, Math.abs(orb.x - last));
      last = orb ? orb.x : null;
      back = Math.max(back, x0 - game.players[0].x);
    }
    return { spawn, back, speed };
  };
  const L = run('2 3 6+L 5*50'), M = run('2 3 6+M 5*50'), H = run('2 3 6+H 5*50');
  assert.ok(L.spawn < M.spawn && M.spawn < H.spawn, 'L throws first, H last');
  assert.ok(L.speed > M.speed && M.speed > H.speed && H.speed > 0, 'L orb fastest, H slowest');
  assert.equal(L.back, 0); assert.equal(M.back, 0);
  assert.ok(H.back >= px(20) && H.back <= px(45), 'H slides back a little');
  // Every version still swipes on drawing 4, then throws on drawing 5.
  for (const id of ['spiritOrb', 'spiritOrbM', 'spiritOrbH']) {
    const hits = c.states[id].frames.filter((fr) => fr.hit.length);
    assert.deepEqual([...new Set(hits.map((fr) => fr.sprite.index + 1))], [4], id);
  }
});

test('Malik: S is a launcher: the hit is on the smear (drawing 3), it sends them up, and every ground normal chains into it', () => {
  const world = loadWorld('data/characters/malik/malik.toska.json', AVNER);
  const c = world.chars[0];
  const st = c.states['5S'];
  const hits = st.frames.filter((fr) => fr.hit.length);
  assert.deepEqual([...new Set(hits.map((fr) => fr.sprite.index + 1))], [3]);
  assert.equal(st.frames.at(-1).sprite.index + 1, 7, 'all seven drawings are used');
  assert.ok(fs.existsSync('data/characters/malik/sheets/5S.png'));
  const game = createGame(world);
  game.players[0].x = -px(35); game.players[1].x = px(35);
  const hp = game.players[1].health; let top = 0; const seen = [];
  for (const raw of script('5+H 5*22 5+S 5*40')) { step(game, [raw, 0], world); top = Math.max(top, game.players[1].y); if (seen.at(-1) !== game.players[0].state) seen.push(game.players[0].state); }
  assert.deepEqual(seen.slice(0, 2), ['5H', '5S'], 'Standing Heavy chains into S');
  assert.ok(top > px(100), 'launched high');
  assert.ok(hp - game.players[1].health > 700);
});

test('Malik: Air S hits on drawing 4 (the big smear), Standing S on drawing 3, and the air normals chain into Air S', () => {
  const world = loadWorld('data/characters/malik/malik.toska.json', AVNER);
  const c = world.chars[0];
  const hitDrawings = (id) => [...new Set(c.states[id].frames.filter((fr) => fr.hit.length).map((fr) => fr.sprite.index + 1))];
  assert.deepEqual(hitDrawings('j.S'), [4]);
  assert.deepEqual(hitDrawings('5S'), [3]);
  assert.equal(c.states['j.S'].frames.at(-1).sprite.index + 1, 7);
  assert.ok(fs.existsSync('data/characters/malik/sheets/jS.png'));
  const file = JSON.parse(fs.readFileSync('data/characters/malik/malik.toska.json', 'utf8'));
  for (const from of ['j.L', 'j.M', 'j.H']) assert.ok(file.gatlings[from].includes('j.S'), from + ' chains into j.S');
  // In a match: jump, press S in the air.
  const game = createGame(world); const seen = [];
  for (const raw of script('8*3 5*14 5+S 5*40')) { step(game, [raw, 0], world); if (seen.at(-1) !== game.players[0].state) seen.push(game.players[0].state); }
  assert.ok(seen.includes('j.S'), seen.join('>'));
});

// Costs follow the owner's universal systems spec (section 2): a bar is 100 Devotion, the meter holds 400, an EX
// costs 100, a super 100 (level 1) or 300 (level 3). (For a while every super cost two bars.)
test('Devotion meter: four bars of 100, supers cost one or three, and every piece of the meter art is there with a slot per bar', () => {
  const world = loadWorld('data/characters/malik/malik.toska.json', AVNER);
  const meter = JSON.parse(fs.readFileSync('data/system/systems.json', 'utf8')).devotion;
  assert.deepEqual([meter.barSize, meter.exCost, meter.superCost[1], meter.superCost[3]], [100, 100, 100, 300]);
  for (const c of world.chars) assert.equal(c.meterMax, 4 * meter.barSize * meter.unit, c.id);
  const D = JSON.parse(fs.readFileSync('data/system/effects.json', 'utf8')).devotion;
  assert.equal(D.windows.length, 4, 'a slot per bar');
  for (const name of [D.frame.image, D.fill, D.fillFull, D.glow, D.glowFull, D.digits.image, D.plate.image]) assert.ok(fs.existsSync('data/effects/' + name), name);
  // The slots sit inside the frame, left to right, without overlapping.
  D.windows.forEach(([x, y, w, h], i) => {
    assert.ok(x >= 0 && y >= 0 && x + w <= D.frame.w && y + h <= D.frame.h);
    if (i) assert.ok(x >= D.windows[i - 1][0] + D.windows[i - 1][2]);
  });
});
