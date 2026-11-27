// Hit states (data/system/combo.json "hitStates"): what a hit does to the fighter it lands on beyond plain hitstun.
// normal, slide, spin, tumble, crumple, soft and hard knockdown, and OTG hits on a fighter lying in a hard knockdown.
// The numbers here are the test's own (a copy of the rules with fixed values), so tuning combo.json can't break it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileCharacter } from '../src/core/character.js';
import { createGame, createWorld, step, COMBO_STATES } from '../src/core/game.js';
import { enterState } from '../src/core/fighter.js';
import { RAW } from '../src/core/input.js';
import { px, pct } from '../src/core/fixed.js';
import { HIT_REACTIONS } from '../src/core/systems.js';
import { loadJSON, SYSTEM } from './helpers.js';

const BIG = [[0, -400, 200, 900]]; // reaches the defender anywhere nearby, any height
const base = { startup: 3, active: 2, recovery: 5, damage: 1000, hitstun: 20, untech: 30, blockstun: 10, hitstop: 0,
  pushbackHit: 0, pushbackBlock: 0, hitboxes: BIG, starterProration: 10000, comboProration: 10000 };
const file = (moves, more = {}) => ({ engine: 'Toska', version: 2, character: { id: 'h', stats: {} }, ...more, moves });
const CHAR = compileCharacter(file([
  { ...base, id: 'jab', input: '5L' },
  { ...base, id: 'pop', input: '5M', launch: 'soft' },
  { ...base, id: 'hardKD', input: '2H', hitReaction: 'hardKD' },
  { ...base, id: 'oldKD', input: '3H', knockdown: true },
  { ...base, id: 'softKD', input: '2M', hitReaction: 'softKD' },
  { ...base, id: 'slam', input: '6H', airReaction: 'hardKD', airHit: { x: 0, y: -20 } },
  { ...base, id: 'otg', input: '2L', otg: true },
  { ...base, id: 'mSlide', input: '4H', hitReaction: 'slide' },
  { ...base, id: 'mSpin', input: '6M', hitReaction: 'spin' },
  { ...base, id: 'mTumble', input: '4M', hitReaction: 'tumble' },
  { ...base, id: 'mCrumple', input: '5H', hitReaction: 'crumple' },
  { ...base, id: 'chCrumple', input: '3M', counterReaction: 'crumple' },
  { ...base, id: 'slow', input: '5S', startup: 30 },
  { id: 'grab', input: '6S', startup: 2, active: 2, recovery: 20, damage: 500, guard: 'unblockable', counterHit: 'none', throwboxes: [[0, 0, 200, 200]] },
]), SYSTEM);
const RULES = { landing: 'softKD',
  reactions: { spin: { launch: { x: 5, y: 15 }, untech: 40, gravityPct: 5000 }, tumble: { launch: { x: 2, y: 19 }, untech: 55, gravityPct: 9000 },
    slide: { speed: 12, frames: 30, frictionPct: 9000, slam: { x: 6, y: -16 }, juggleCost: 2, perCombo: 1, endsIn: 'softKD' }, crumple: { perCombo: 1 } },
  softKD: { techFrom: 6 },
  otg: { damagePct: 5000, lift: { x: 1, y: 10 }, untech: 26, juggleCost: 3, perCombo: 1, afterThrow: false } };
const world = (hitStates = RULES, more = {}) => createWorld({ match: null, input: loadJSON('data/system/input.json'), battle: loadJSON('data/system/battle.json'),
  combo: { ...loadJSON('data/system/combo.json'), hitStates, ...more }, meter: SYSTEM.meter, systems: SYSTEM.systems, burst: SYSTEM.burst, chars: [CHAR, CHAR] });
const W = world();

function setup(w = W) {
  const g = createGame(w);
  g.players[0].x = px(-50);
  g.players[1].x = px(50);
  return g;
}
/** P1 does `move` with its first active frame on the next step. */
function hit(g, move, raw = [0, 0], w = W) {
  const p = g.players[0];
  enterState(p, w.chars[0], move);
  p.frame = w.chars[0].states[move].move.startup - 2;
  step(g, raw, w);
  return g.cues.find((c) => c.p === 0 && ['hit', 'counter', 'witness'].includes(c.type)) ?? null;
}
const go = (g, n, raw = [0, 0], w = W) => { for (let i = 0; i < n; i++) step(g, raw, w); };
const until = (g, done, max = 200, raw = [0, 0], w = W) => { let n = 0; while (!done() && n < max) { step(g, raw, w); n++; } return n; };

test('a move names its reaction in data; the older knockdown and crumple flags still work; a wrong name fails at load', () => {
  const m = (id) => CHAR.states[id].move;
  assert.equal(m('jab').hitReaction, 'normal');
  assert.equal(m('oldKD').hitReaction, 'hardKD');
  assert.equal(CHAR.states.vow_strike.move.hitReaction, 'crumple', "Vow's strike, written with the older flag");
  assert.equal(m('mSpin').launchType, 'soft', 'an air state on a move with no launch is a soft launch');
  assert.deepEqual(HIT_REACTIONS, ['normal', 'slide', 'spin', 'tumble', 'crumple', 'softKD', 'hardKD']);
  assert.throws(() => compileCharacter(file([{ ...base, id: 'x', input: '5L', hitReaction: 'stagger' }]), SYSTEM), /hitReaction must be one of/);
  assert.throws(() => compileCharacter(file([{ ...base, id: 'x', input: '5L', airReaction: 'floaty' }]), SYSTEM), /hitReaction must be one of/);
  for (const s of ['hitSpin', 'hitTumble', 'slide', 'knockdownSoft']) {
    assert.ok(CHAR.states[s], `every character has the ${s} state`);
    assert.ok(COMBO_STATES.has(s), `${s} keeps the combo alive`);
  }
  for (const s of ['hitSpin', 'hitTumble', 'slide']) assert.ok(loadJSON('data/system/burst.json').states.includes(s), `Absolve works in ${s}`);
  assert.ok(!loadJSON('data/system/burst.json').states.includes('knockdown'), 'no Absolve while lying on the floor');
});

test('hard knockdown: lying still, no getting up early, and only an OTG move can touch the fighter', () => {
  const g = setup();
  const d = g.players[1];
  hit(g, 'hardKD');
  assert.equal(d.state, 'knockdown');
  go(g, 10, [0, RAW.L | RAW.M | RAW.H]);
  assert.equal(d.state, 'knockdown', 'buttons do nothing');
  const hp = d.health;
  assert.equal(hit(g, 'jab'), null, 'a plain move passes through');
  assert.equal(d.health, hp);
  assert.equal(d.state, 'knockdown');
  const lies = W.chars[1].states.knockdown.duration;
  const n = until(g, () => d.state !== 'knockdown');
  assert.equal(d.state, 'wakeup');
  assert.ok(n > 0 && n <= lies);
});

test('OTG: half damage, a small lift into air hitstun, once per combo; after it every knockdown is the soft one', () => {
  const g = setup();
  const d = g.players[1];
  hit(g, 'hardKD');
  const hp = d.health;
  const c = hit(g, 'otg');
  assert.ok(c && c.otg, 'the OTG move connects');
  assert.equal(hp - d.health, pct(1000, RULES.otg.damagePct), 'half of its damage (no scaling in this test)');
  assert.equal(d.state, 'hitAir');
  assert.ok(d.vy > 0 && d.y > 0, 'lifted off the floor');
  assert.equal(d.stun, RULES.otg.untech, 'its own untechable time');
  assert.equal(d.combo.otg, 1);
  assert.equal(d.combo.hits, 2, 'the same combo goes on');
  assert.equal(d.combo.juggle, RULES.otg.juggleCost, 'the lift counts against the juggle limit');
  // A second hard knockdown in the same combo is the soft one, so there is nothing to pick up again.
  hit(g, 'slam');
  until(g, () => d.state.startsWith('knockdown'));
  assert.equal(d.state, 'knockdownSoft');
  const before = d.health;
  assert.equal(hit(g, 'otg'), null, 'nothing on the floor can be hit now');
  assert.equal(d.health, before);
});

test('an OTG move is an ordinary move against a standing fighter, and cannot pick up a thrown one', () => {
  const g = setup();
  const d = g.players[1];
  const c = hit(g, 'otg');
  assert.ok(c && !c.otg);
  assert.equal(d.state, 'hitStand');
  assert.equal(10000 - d.health, 1000, 'full damage');
  // A throw ends in the hard knockdown, but no combo is running: the rule says no OTG there.
  const g2 = setup();
  const d2 = g2.players[1];
  hit(g2, 'grab');
  assert.equal(d2.state, 'thrown');
  until(g2, () => d2.state !== 'thrown');
  assert.equal(d2.state, 'knockdown', 'a throw knocks down hard');
  const hp = d2.health;
  assert.equal(hit(g2, 'otg'), null);
  assert.equal(d2.health, hp);
  // With afterThrow on, the same OTG starts a combo.
  const W2 = world({ ...RULES, otg: { ...RULES.otg, afterThrow: true } });
  const g3 = setup(W2);
  const d3 = g3.players[1];
  hit(g3, 'grab', [0, 0], W2);
  until(g3, () => d3.state !== 'thrown', 200, [0, 0], W2);
  assert.ok(hit(g3, 'otg', [0, 0], W2));
  assert.equal(d3.state, 'hitAir');
  assert.equal(d3.combo.otg, 1);
});

test('soft knockdown: nothing can touch the fighter, and after a moment any button gets them up', () => {
  const g = setup();
  const d = g.players[1];
  hit(g, 'softKD');
  assert.equal(d.state, 'knockdownSoft');
  assert.equal(hit(g, 'otg'), null, 'not even an OTG move');
  // Buttons held from the start: up on the first frame the rule allows.
  const g2 = setup();
  const d2 = g2.players[1];
  hit(g2, 'softKD');
  let n = 0;
  while (d2.state === 'knockdownSoft' && n < 60) { step(g2, [0, n % 2 ? RAW.L : 0], W); n++; }
  assert.equal(d2.state, 'groundTech');
  assert.ok(n >= RULES.softKD.techFrom && n <= RULES.softKD.techFrom + 3, `up after ${n} frames`);
  // No buttons: the full knockdown, then getting up.
  const lies = until(g, () => d.state !== 'knockdownSoft');
  assert.equal(d.state, 'wakeup');
  assert.ok(lies > RULES.softKD.techFrom);
});

test('a fall ends in the knockdown the last hit asked for: the system rule, or a slam into the hard one', () => {
  const g = setup();
  const d = g.players[1];
  hit(g, 'pop');
  go(g, 6);
  hit(g, 'jab');
  until(g, () => d.state.startsWith('knockdown'));
  assert.equal(d.state, 'knockdownSoft', 'the rule in combo.json (landing: softKD)');
  const g2 = setup();
  const d2 = g2.players[1];
  hit(g2, 'pop');
  go(g2, 6);
  hit(g2, 'slam');
  assert.equal(d2.state, 'hitAir', 'still air hitstun on the way down');
  until(g2, () => d2.state.startsWith('knockdown'));
  assert.equal(d2.state, 'knockdown', 'airReaction: hardKD');
  // The same move on a standing fighter is plain hitstun: airReaction is only for a fighter already in the air.
  const g3 = setup();
  hit(g3, 'slam');
  assert.equal(g3.players[1].state, 'hitStand');
  // And with landing: hardKD every fall ends in the hard one (the rule before hit states).
  const WH = world({ ...RULES, landing: 'hardKD' });
  const g4 = setup(WH);
  hit(g4, 'pop', [0, 0], WH);
  until(g4, () => g4.players[1].state.startsWith('knockdown'), 200, [0, 0], WH);
  assert.equal(g4.players[1].state, 'knockdown');
});

test('slide: the fighter skids away along the ground, slowing, still airborne for combos, then a knockdown', () => {
  const g = setup();
  const d = g.players[1];
  const x0 = d.x;
  hit(g, 'mSlide');
  assert.equal(d.state, 'slide');
  assert.equal(d.y, 0);
  assert.equal(d.stun, RULES.reactions.slide.frames);
  assert.equal(d.combo.slide, 1);
  assert.equal(d.combo.juggle, RULES.reactions.slide.juggleCost);
  const v1 = d.vx;
  go(g, 5);
  assert.ok(d.x > x0 + px(30), 'moving away');
  assert.ok(d.vx > 0 && d.vx < v1, 'slowing down');
  assert.equal(d.y, 0, 'along the floor');
  assert.equal(W.chars[1].states.slide.stance, 'air', 'counts as airborne');
  // A follow-up is an ordinary air hit: full (scaled) damage, not an OTG.
  const hp = d.health;
  const c = hit(g, 'jab');
  assert.ok(c && !c.otg);
  assert.equal(hp - d.health, 1000);
  assert.equal(d.state, 'hitAir');
  assert.equal(d.combo.otg, 0);
  // Left alone, the skid ends in the knockdown the rule names.
  const g2 = setup();
  const d2 = g2.players[1];
  hit(g2, 'mSlide');
  const n = until(g2, () => d2.state !== 'slide');
  assert.equal(n, RULES.reactions.slide.frames + 1);
  assert.equal(d2.state, 'knockdownSoft');
  assert.equal(d2.vx, 0);
});

test('slide: one per combo, and an airborne fighter is slammed down first and skids on landing', () => {
  const g = setup();
  const d = g.players[1];
  hit(g, 'mSlide');
  go(g, 4);
  hit(g, 'mSlide');
  assert.equal(d.state, 'hitAir', 'the second one is a plain air hit');
  assert.equal(d.combo.slide, 1);
  assert.equal(d.slideV, 0);
  // From the air.
  const g2 = setup();
  const d2 = g2.players[1];
  hit(g2, 'pop');
  go(g2, 8);
  assert.ok(d2.y > 0);
  hit(g2, 'mSlide');
  assert.equal(d2.state, 'hitAir');
  assert.ok(d2.vy < 0, 'thrown down');
  assert.ok(d2.slideV > 0 && d2.slideT > 0, 'the skid is waiting for the ground');
  let cue = 0;
  until(g2, () => { cue += g2.cues.filter((c) => c.type === 'slide').length; return d2.state === 'slide'; });
  assert.equal(d2.state, 'slide');
  assert.equal(cue, 1);
  assert.equal(d2.y, 0);
  assert.ok(d2.vx > 0);
  assert.equal(d2.slideV, 0);
});

test('spin and tumble: air states with their own arc, untechable time and gravity; they pop a grounded fighter up', () => {
  const fall = (move, state) => {
    const g = setup();
    const d = g.players[1];
    hit(g, move === 'spin' ? 'mSpin' : 'mTumble');
    assert.equal(d.state, state);
    const R = RULES.reactions[move];
    assert.equal(d.vy, px(R.launch.y) - 0, `${move}: its launch`);
    assert.equal(d.stun, base.untech, 'the move\'s own untechable time wins over the table');
    const vy = d.vy;
    step(g, [0, 0], W);
    return vy - d.vy; // gravity for one frame (a 2-hit combo's juggle gravity included, the same for both)
  };
  const gSpin = fall('spin', 'hitSpin');
  const gTumble = fall('tumble', 'hitTumble');
  assert.ok(gSpin < gTumble, `spin falls at half gravity here (${gSpin} < ${gTumble})`);
  // The table's untechable time is used when the move has none of its own.
  const C2 = compileCharacter(file([{ ...base, id: 'mSpin', input: '5L', hitReaction: 'spin', untech: undefined }]), SYSTEM);
  const W2 = createWorld({ match: null, input: loadJSON('data/system/input.json'), battle: loadJSON('data/system/battle.json'),
    combo: { ...loadJSON('data/system/combo.json'), hitStates: RULES }, meter: SYSTEM.meter, systems: SYSTEM.systems, burst: SYSTEM.burst, chars: [C2, C2] });
  const g = setup(W2);
  hit(g, 'mSpin', [0, 0], W2);
  assert.equal(g.players[1].stun, RULES.reactions.spin.untech);
  // When the untechable time is over the fighter can air tech, as from any air hit.
  go(g, RULES.reactions.spin.untech + 1, [0, 0], W2);
  assert.equal(g.players[1].state, 'tumble', 'the techable fall');
});

test('crumple on an ordinary move: once per combo; a counter-hit reaction only on a counter hit', () => {
  const g = setup();
  const d = g.players[1];
  hit(g, 'mCrumple');
  assert.equal(d.state, 'crumple');
  assert.equal(d.combo.crumple, 1);
  go(g, 5);
  hit(g, 'mCrumple');
  assert.equal(d.state, 'hitStand', 'the second one is plain hitstun');
  assert.equal(d.combo.crumple, 1);
  // counterReaction.
  const g2 = setup();
  hit(g2, 'chCrumple');
  assert.equal(g2.players[1].state, 'hitStand', 'a plain hit');
  const g3 = setup();
  const d3 = g3.players[1];
  enterState(d3, W.chars[1], 'slow'); // the defender is in the startup of a move: a counter hit
  const c = hit(g3, 'chCrumple');
  assert.equal(c.type, 'counter');
  assert.equal(c.react, 'crumple');
  assert.equal(d3.state, 'crumple');
});

test('past the juggle limit every reaction is plain: no slide, no hard knockdown to pick up', () => {
  const g = setup();
  const d = g.players[1];
  hit(g, 'pop');
  d.combo.juggle = W.combo.juggleLimit; // the next air hit goes past it
  hit(g, 'mSlide');
  assert.equal(d.slideV, 0, 'no slide');
  assert.equal(d.stun, 0, 'falls out');
  const g2 = setup();
  const d2 = g2.players[1];
  hit(g2, 'pop');
  d2.combo.juggle = W.combo.juggleLimit;
  hit(g2, 'slam');
  until(g2, () => d2.state.startsWith('knockdown') || d2.state === 'idle');
  assert.equal(d2.state, 'knockdownSoft', 'the hard knockdown is gone too');
});

test('no loop: slams, OTG pickups, slides and pops, always the best follow-up, and the combo still ends by itself', () => {
  const g = setup();
  const d = g.players[1];
  hit(g, 'mSlide'); // the skid first, then slams into the floor, the pickup, and whatever still connects
  let rounds = 0, free = false;
  while (rounds < 80 && !free) {
    rounds++;
    // The attacker always picks the strongest thing that can connect; the defender presses a button whenever they can.
    const move = d.state === 'knockdown' ? 'otg' : d.state === 'slide' || d.y > 0 ? (rounds % 3 === 0 ? 'mSlide' : 'slam') : 'mSlide';
    hit(g, move, [0, RAW.L]);
    for (let i = 0; i < 12 && !free; i++) {
      step(g, [0, i % 2 ? RAW.L : 0], W);
      free = !d.combo;
    }
  }
  assert.ok(free, `the defender got out after ${rounds} rounds`);
  const last = d.lastCombo;
  assert.equal(last.otg, 1, 'one OTG in the whole combo');
  assert.equal(last.slide, 1, 'one slide');
  assert.ok(last.time <= W.combo.techOutAt, 'before the 8 second tech-out even');
});

test('the editor offers the reaction, the air and counter reactions and OTG, and writes them where the game reads them', async () => {
  const { settingsTarget, readSetting, writeSetting, fieldOf } = await import('../src/editor/move-model.js');
  const rules = { combo: loadJSON('data/system/combo.json'), battle: loadJSON('data/system/battle.json') };
  const raw = file([{ ...base, id: '5L', input: '5L' }]);
  const t = settingsTarget(raw, SYSTEM, '5L');
  for (const key of ['hitReaction', 'airReaction', 'counterReaction', 'otg']) assert.ok(fieldOf(key), key);
  assert.equal(readSetting(raw, t, 'hitReaction', rules).value, 'normal');
  assert.equal(readSetting(raw, t, 'airReaction', rules).value, 'same');
  writeSetting(raw, t, 'hitReaction', 'slide', rules);
  writeSetting(raw, t, 'airReaction', 'hardKD', rules);
  writeSetting(raw, t, 'counterReaction', 'crumple', rules);
  writeSetting(raw, t, 'otg', true, rules);
  const m = compileCharacter(raw, SYSTEM).states['5L'].move;
  assert.deepEqual([m.hitReaction, m.airReaction, m.counterReaction, m.otg], ['slide', 'hardKD', 'crumple', true]);
  // Back to the usual values: nothing is left written in the file.
  writeSetting(raw, t, 'hitReaction', 'normal', rules);
  writeSetting(raw, t, 'airReaction', 'same', rules);
  writeSetting(raw, t, 'counterReaction', 'same', rules);
  writeSetting(raw, t, 'otg', false, rules);
  for (const key of ['hitReaction', 'airReaction', 'counterReaction', 'otg']) assert.ok(!(key in raw.moves[0]), key);
  assert.throws(() => writeSetting(raw, t, 'hitReaction', 'stagger', rules), /must be one of/);
});

test('the cast: launchers tumble, the jumping S slams into a hard knockdown, 2L picks up off the floor, a counter-hit heavy crumples (Malik)', () => {
  for (const id of ['avner', 'malik']) {
    const c = compileCharacter(loadJSON(`data/characters/${id}/${id}.toska.json`), SYSTEM);
    assert.equal(c.states['5S'].move.hitReaction, 'tumble', `${id} 5S`);
    assert.equal(c.states['5S'].move.launchType, 'hard', `${id} 5S is still the hard launcher`);
    assert.equal(c.states['j.S'].move.airReaction, 'hardKD', `${id} j.S`);
    assert.equal(c.states['j.S'].move.hitReaction, 'normal', `${id} j.S on a standing fighter is plain hitstun`);
    assert.equal(c.states['2L'].move.otg, true, `${id} 2L`);
    // (Avner's redrawn 5H of Nov 25 is set to an ordinary reaction on counter hit in his file: the owner's setting.)
    assert.equal(c.states['5H'].move.counterReaction, id === 'malik' ? 'crumple' : 'normal', `${id} 5H`);
    for (const s of ['hitSpin', 'hitTumble', 'slide', 'knockdownSoft']) assert.ok(c.sheets[s], `${id} has drawings for ${s}`);
  }
});

test('Avner: Lantern Drag (3H) slides him in low and sends the opponent into a slide; it chains from 5M and 5H', async () => {
  const { loadWorld } = await import('./helpers.js');
  const f = (id) => `data/characters/${id}/${id}.toska.json`;
  const w = loadWorld(f('avner'), f('malik'));
  const m = w.chars[0].states.lanternDrag.move;
  assert.equal(m.hitReaction, 'slide');
  assert.equal(m.guard, 'low');
  assert.equal(w.chars[0].states.lanternDrag.stance, 'crouch');
  assert.ok(w.chars[0].sheets.lanternDrag, 'it has its drawings');
  for (const e of ['dragSparks', 'dragDust']) assert.ok(w.chars[0].effects[e], `effect ${e}`);
  const raw = loadJSON(f('avner'));
  for (const k of ['5M', '5H']) assert.ok(raw.gatlings[k].includes('lanternDrag'), `chains from ${k}`);
  // Down-forward + H from a little way off: he travels, the kick lands, the opponent skids away.
  const g = createGame(w);
  g.players[0].x = px(-160);
  g.players[1].x = px(160);
  const x0 = g.players[0].x;
  let cue = null, fx = new Set();
  for (let i = 0; i < 60 && !cue; i++) {
    step(g, [i === 0 ? RAW.DOWN | RAW.RIGHT | RAW.H : 0, 0], w);
    for (const c of g.cues) if (c.type === 'fx') fx.add(c.name);
    cue = g.cues.find((c) => c.type === 'hit' && c.move === 'lanternDrag') ?? null;
  }
  assert.ok(cue, 'it reaches from 320 px away');
  assert.equal(g.players[0].state, 'lanternDrag');
  assert.ok(g.players[0].x > x0 + px(60), 'he slid forward');
  assert.equal(g.players[1].state, 'slide');
  assert.ok(fx.has('dragDust'), 'the dust was called for');
  assert.deepEqual(m.pinFx, { effect: 'dragSparks', fromSprite: 3 }, 'the sparks ride the lantern from the first hit drawing');
  // The owner's numbers (Nov 24): 16 / 6 / 24, -12 on block, about a third of the screen travelled in the active frames.
  assert.deepEqual([m.startup, m.active, m.recovery], [16, 6, 24]);
  assert.equal(m.blockstun - (m.active - 1) - m.recovery, -12);
  const solo = createGame(w);
  solo.players[0].x = px(-380);
  solo.players[1].x = px(380);
  const at = [];
  for (let i = 0; i < 50; i++) { step(solo, [i === 0 ? RAW.DOWN | RAW.RIGHT | RAW.H : 0, 0], w); at.push(solo.players[0].x); }
  assert.equal(at[14], at[0], 'he does not travel before the active frames');
  assert.equal((at[49] - at[0]) / 100, 210, '210 px in all');
  // A standing guard does not stop it.
  const g2 = createGame(w);
  g2.players[0].x = px(-100);
  g2.players[1].x = px(100);
  let hit = false;
  for (let i = 0; i < 60 && !hit; i++) {
    step(g2, [i === 0 ? RAW.DOWN | RAW.RIGHT | RAW.H : 0, RAW.RIGHT], w);
    hit = g2.cues.some((c) => c.type === 'hit' && c.move === 'lanternDrag');
  }
  assert.ok(hit, 'low: standing block loses');
});

test('Avner: Waning Hop (6M) is an overhead that hops over low attacks, slams an airborne fighter into a hard knockdown, and chains from 5M and 5H', async () => {
  const { loadWorld } = await import('./helpers.js');
  const f = (id) => `data/characters/${id}/${id}.toska.json`;
  const w = loadWorld(f('avner'), f('malik'));
  const st = w.chars[0].states.waningHop;
  assert.equal(st.move.guard, 'high');
  assert.equal(st.move.airReaction, 'hardKD');
  assert.equal(st.move.hitReaction, 'normal');
  assert.equal(st.stance, 'stand', 'a grounded move: the hop is a raised hurtbox, not a jump');
  assert.ok(w.chars[0].sheets.waningHop && w.chars[0].effects.hopCrescent);
  const raw = loadJSON(f('avner'));
  for (const k of ['5M', '5H']) assert.ok(raw.gatlings[k].includes('waningHop'), `chains from ${k}`);
  // During the hop nothing of him is below knee height; before and after he stands on the floor.
  const lowest = (i) => Math.min(...st.frames[i].hurt.map((b) => b[1]));
  assert.ok(lowest(0) < px(10) && lowest(st.move.startup - 1 + st.move.active) < px(10)); // down again on the frame after the hit drawing
  for (let i = 7; i < 24; i++) assert.ok(lowest(i) >= px(40), `frame ${i} is off the floor`);
  assert.deepEqual([st.move.startup, st.move.active, st.move.recovery], [22, 3, 16]);
  assert.equal(st.move.counterReaction, 'spin');
  const play = (p2, gap = 180) => {
    const g = createGame(w);
    g.players[0].x = px(-gap / 2);
    g.players[1].x = px(gap / 2);
    const x0 = g.players[0].x;
    let cue = null, fx = false;
    for (let i = 0; i < 60 && !cue; i++) {
      step(g, [i === 0 ? RAW.RIGHT | RAW.M : 0, p2], w);
      fx ||= g.cues.some((c) => c.type === 'fx' && c.name === 'hopCrescent');
      cue = g.cues.find((c) => c.p === 0 && (c.type === 'hit' || c.type === 'block') && c.move === 'waningHop') ?? null;
    }
    return { g, cue, fx, moved: g.players[0].x - x0 };
  };
  const open = play(0);
  assert.equal(open.cue?.type, 'hit', 'it reaches from 180 px away');
  assert.ok(open.moved >= px(60), 'he hopped forward');
  assert.ok(open.fx, 'the crescent was called for');
  assert.equal(open.g.players[1].state, 'hitStand', 'plain hitstun on a standing fighter');
  assert.equal(play(RAW.RIGHT | RAW.DOWN).cue?.type, 'hit', 'a crouching guard loses to it');
  // (Closer in: a fighter holding back also walks away, and from 180 px he would simply walk out of reach.)
  assert.equal(play(RAW.RIGHT, 80).cue?.type, 'block', 'a standing guard stops it');
});

test('Avner: the rebound move (j.2H, his air down sheet) is a diving overhead; on hit he rebounds and can act, on block he rebounds and cannot until he lands, a miss lands with a long recovery; once per jump. Moonfall (j.214M) and the j.2M kick are cut', async () => {
  const { loadWorld } = await import('./helpers.js');
  const f = (id) => `data/characters/${id}/${id}.toska.json`;
  const w = loadWorld(f('avner'), f('malik'));
  const A = w.chars[0];
  const raw = loadJSON(f('avner'));
  // The cut: no Moonfall move, state, drawing or effect is left (the EX finisher "Moonfall Smash" is a different move).
  for (const k of Object.keys(A.states)) assert.ok(!/^moonfall/i.test(k), `${k} is gone`);
  assert.ok(!raw.moves.some((m) => /^j\.214/.test(m.input ?? '')), 'nothing is on j.214');
  assert.ok(!JSON.stringify(raw).includes('sheets/moonfall'), 'no Moonfall drawings are named');
  const m = A.states['j.2H'].move;
  assert.equal(m.guard, 'high', 'an overhead');
  assert.equal(m.startup, 12);
  assert.equal(m.damage, 600);
  assert.equal(m.onHitState, 'j2HRebound');
  assert.equal(m.onBlockState, 'j2HGuarded');
  assert.equal(A.states['j.2H'].landTo, 'j2HLand');
  assert.equal(A.states.j2HLand.duration, 18, 'a miss: 12 + 6 frames on the floor');
  assert.equal(A.states.j2HRebound.duration, 12, 'the rebound takes 12 frames');
  assert.equal(A.states.j2HRebound.next, 'fall', 'then he is free in the air');
  assert.equal(A.states.j2HGuarded.landTo, 'j2HLandGuard', 'blocked: held until he lands');
  const kick = raw.moves.find((x) => x.id === 'j.2H');
  assert.deepEqual(kick.timeline.filter((e) => e.sprite !== undefined).slice(0, 5).map((e) => [e.at, e.sprite]), [[0, 0], [6, 1], [11, 2], [14, 3], [17, 2]], 'holds 6, 5, then drawings 3 and 4 loop at 3 each: the dive drawing is up on frame 12');
  for (const sh of ['j.2H', 'j2HRebound', 'j2HLand']) assert.ok(A.sheets[sh], `${sh} has its drawings`);
  assert.ok(A.effects.j2HTrail);
  for (const k of ['j.L', 'j.M', 'j.H']) assert.ok(raw.gatlings[k].includes('j.2H'), `chains from ${k}`);
  /** Jump forward, press `press` on frame 22 (a list = one entry per frame from 20), then `later(game)` picks P1's input; P2 holds `p2` from frame 20. */
  const play = (gap, press, p2 = 0, later = () => 0) => {
    const g = createGame(w);
    g.players[0].x = px(-gap / 2);
    g.players[1].x = px(gap / 2);
    const seen = [], cues = [];
    for (let i = 0; i < 130; i++) {
      const roll = Array.isArray(press) ? press[i - 20] : i === 22 ? press : undefined;
      const r = i < 6 ? RAW.UP | RAW.RIGHT : roll !== undefined ? roll : i > 22 ? later(g) : 0;
      step(g, [r, i >= 20 ? p2 : 0], w);
      const a = g.players[0];
      if (seen[seen.length - 1] !== a.state) seen.push(a.state);
      for (const c of g.cues) if (c.p === 0 && ['hit', 'block', 'fx'].includes(c.type)) cues.push(`${c.type}:${c.move ?? c.name}`);
    }
    return { g, seen, cues };
  };
  const from = (r, st, n) => r.seen.slice(r.seen.indexOf(st), r.seen.indexOf(st) + n);
  // Down + H in the air is the rebound move; M alone is still the air medium; the old quarter circle back + M is just the air medium.
  assert.ok(play(260, RAW.M).seen.includes('j.M'));
  assert.ok(play(260, RAW.H).seen.includes('j.H'), 'H alone is still the air heavy');
  const downM = play(260, RAW.DOWN | RAW.M);
  assert.ok(downM.seen.includes('j.M') && !A.states['j.2M'], 'the j.2M kick is gone: down + M is the air medium');
  assert.ok(!/j2M|j.2M/.test(JSON.stringify(raw)), 'nothing of the kick is left');
  const old = play(260, [RAW.DOWN, RAW.DOWN | RAW.LEFT, RAW.LEFT | RAW.M]);
  assert.ok(old.seen.includes('j.M') && !old.seen.includes('j.2H'), 'j.214M does nothing special');
  // A hit: the rebound, then free in the air.
  // (270, not 260: the owner's Nov 26 hurtbox for Malik has a chest box that reaches 4 px further forward, and from 260 the kick now
  // lands on its very first active frame, one frame before the first trail is called.)
  const hit = play(270, RAW.DOWN | RAW.H);
  assert.ok(hit.cues.includes('hit:j.2H'));
  assert.ok(hit.cues.includes('fx:j2HTrail'), 'the trail was called for');
  assert.deepEqual(from(hit, 'j.2H', 3), ['j.2H', 'j2HRebound', 'fall']);
  // The rebound goes up and back.
  {
    const g = createGame(w);
    g.players[0].x = px(-130); g.players[1].x = px(130);
    let at = null, top = null;
    for (let i = 0; i < 80; i++) {
      step(g, [i < 6 ? RAW.UP | RAW.RIGHT : i === 22 ? RAW.DOWN | RAW.H : 0, 0], w);
      const p = g.players[0];
      if (p.state === 'j2HRebound' && !at && !p.hitstop) at = { x: p.x, y: p.y };
      if (p.state === 'fall' && at && !top) top = { x: p.x, y: p.y };
    }
    assert.ok(at && top, 'he rebounded and came free');
    assert.ok(top.y > at.y + px(25) && top.y < at.y + px(80), 'up about a short hop');
    assert.ok(top.x < at.x - px(12) && top.x > at.x - px(45), 'and back about a third of his width');
  }
  // He can act out of the rebound: an air normal comes out; a second kick in the same jump does not (once per jump).
  const follow = play(260, RAW.DOWN | RAW.H, 0, (g) => (g.players[0].state === 'fall' ? RAW.H : 0));
  assert.ok(follow.seen.includes('j.H'), 'an air normal after the rebound');
  const again = play(260, RAW.DOWN | RAW.H, 0, (g) => (g.players[0].state === 'fall' ? RAW.DOWN | RAW.H : 0));
  assert.equal(again.seen.filter((x) => x === 'j.2H').length, 1, 'once per jump');
  assert.ok(again.seen.includes('j.H'), 'down + H is the plain air heavy once it is used');
  // It is an overhead: a crouching guard is hit. A standing guard blocks it: the same rebound, but no acting until he lands.
  assert.ok(play(260, RAW.DOWN | RAW.H, RAW.RIGHT | RAW.DOWN).cues.includes('hit:j.2H'), 'crouch guard loses');
  const blocked = play(260, RAW.DOWN | RAW.H, RAW.RIGHT, (g) => (g.players[0].state === 'j2HGuarded' && g.frame % 3 === 0 ? RAW.H : 0));
  assert.ok(blocked.cues.includes('block:j.2H'));
  assert.deepEqual(from(blocked, 'j.2H', 4), ['j.2H', 'j2HGuarded', 'j2HLandGuard', 'idle']);
  assert.ok(!blocked.seen.includes('j.H'), 'no air action after a blocked kick');
  // A miss: he dives to the floor and takes the long landing.
  const miss = play(700, RAW.DOWN | RAW.H);
  assert.ok(!miss.cues.includes('hit:j.2H'));
  assert.deepEqual(from(miss, 'j.2H', 3), ['j.2H', 'j2HLand', 'idle']);
});

test('Avner: Moon Phase Assault (j.236 + L, M or H) is a three-part air rekka: he hangs during each part, the next part only comes out in the window on hit or block, once per jump; the EX plays all three and the Moonfall Smash from one input', async () => {
  const { loadWorld } = await import('./helpers.js');
  const f = (id) => `data/characters/${id}/${id}.toska.json`;
  const w = loadWorld(f('avner'), f('malik'));
  const A = w.chars[0];
  const raw = loadJSON(f('avner'));
  const hitFrames = (id) => A.states[id].frames.map((fr, i) => (fr.hit.length ? i + 1 : 0)).filter(Boolean);
  const holds = (id) => raw.moves.find((x) => x.id === id).sprite.holds;
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  for (const b of ['L', 'M', 'H']) {
    // Part 1: 8 startup, hits on 8, 13 and 18 (3 active each), 14 recovery; the drawings' holds add up to the move.
    assert.deepEqual(hitFrames(`waxing${b}`), [8, 9, 10, 13, 14, 15, 18, 19, 20]);
    assert.deepEqual(holds(`waxing${b}`), [7, 3, 2, 3, 2, 3, 6, 8]);
    assert.equal(A.states[`waxing${b}`].frames.length, 34);
    assert.equal(sum(holds(`waxing${b}`)), 34);
    // Part 2: hits on 8, 10, 12 (2 active each) and 17 (3 active), 17 recovery. It is two entries, so the editor can
    // change the last hit by itself: the three quick strikes (13 frames) run straight into the finish (23 frames).
    assert.deepEqual(hitFrames(`halfMoon${b}`), [8, 9, 10, 11, 12, 13]);
    assert.equal(A.states[`halfMoon${b}`].next, `halfMoonEnd${b}`);
    assert.deepEqual(hitFrames(`halfMoonEnd${b}`).map((x) => x + 13), [17, 18, 19]);
    assert.equal(A.states[`halfMoon${b}`].frames.length + A.states[`halfMoonEnd${b}`].frames.length, 36);
    assert.equal(A.states[`halfMoonEnd${b}`].move.recovery, 17);
    // The drawings change on the frames the holds 7, 2, 2, 2, 3, 3, 5, 6, 6 give.
    const drawn = (id, plus) => raw.moves.find((x) => x.id === id).timeline.filter((e) => e.sprite !== undefined).map((e) => e.at + plus);
    assert.deepEqual([...drawn(`halfMoon${b}`, 0), ...drawn(`halfMoonEnd${b}`, 13)], [0, 7, 9, 11, 13, 16, 19, 24, 30]);
    assert.equal(A.states[`halfMoonEnd${b}`].move.damage, 450);
    // Part 3: 10 startup, 6 active (drawings 3 and 4), then he falls until he lands.
    assert.deepEqual(hitFrames(`fullPhase${b}`), [10, 11, 12, 13, 14, 15]);
    assert.deepEqual(holds(`fullPhase${b}`).slice(0, 6), [4, 5, 3, 3, 4, 6]);
    assert.equal(A.states[`fullPhase${b}`].landTo, 'fullPhaseLand');
    assert.equal(A.states[`waxing${b}`].move.damage, 220);
    assert.equal(A.states[`halfMoon${b}`].move.damage, 160);
    assert.equal(A.states[`fullPhase${b}`].move.damage, 850);
    assert.equal(A.states[`waxing${b}_ex`].move.damage, 308, 'EX: about 1.4 times');
  }
  assert.equal(A.states.fullPhaseLand.duration, 10);
  assert.equal(A.states.fullPhaseEx.move.damage, 1190);
  assert.equal(A.states.moonSmash.move.damage, 800);
  assert.deepEqual(hitFrames('moonSmash'), [12, 13, 14], 'the smash hits on its fourth drawing (holds 4, 3, 4, then 3)');
  assert.equal(A.states.moonSmashLand.duration, 18, 'landing 10 + 8');
  for (const e of ['threeCrescents', 'halfMoonArc', 'moonCrash', 'fullMoonBurst', 'threeCrescentsEx', 'halfMoonArcEx', 'moonCrashEx', 'fullMoonBurstEx']) assert.ok(A.effects[e], `effect ${e}`);
  assert.deepEqual(raw.effects.fullMoonBurst.holds, [2, 2, 2, 3, 3, 3, 1, 2, 3, 4]);
  assert.equal(raw.effects.fullMoonBurst.sprite.count, 10);
  for (const b of ['L', 'M', 'H']) assert.ok(raw.moves.find((x) => x.id === `fullPhase${b}`).timeline.some((e) => e.at === 9 && e.fx === 'fullMoonBurst'), 'the full moon starts on Part 3\'s third drawing (frame 10)');
  // The moon crash plays where the fighter hit by the smash lands (drawing only: art.groundFx).
  assert.deepEqual(raw.art.groundFx, { moonSmash: { play: 'moonCrashEx', ring: { frame: 2, set: 'big' } } });
  for (const [mv, g] of Object.entries(raw.art.groundFx)) { assert.ok(A.states[mv], mv); assert.ok(A.effects[g.play], g.play); }
  assert.deepEqual(raw.effects.threeCrescents.holds, [2, 3, 2, 3, 2, 3, 4, 4]);
  assert.deepEqual(raw.effects.halfMoonArc.holds, [4, 3, 2, 3, 3, 4, 4]);
  assert.deepEqual(raw.effects.moonCrash.holds, [2, 1, 2, 3, 3, 4, 4]);
  for (const e of ['threeCrescentsEx', 'halfMoonArcEx', 'moonCrashEx', 'fullMoonBurstEx']) {
    assert.ok(raw.effects[e].sprite.tint, `${e} is tinted`);
    assert.ok(Math.abs(raw.effects[e].sprite.scale / raw.effects[e.slice(0, -2)].sprite.scale - 1.3) < 0.001, `${e} is 1.3 times the size`);
  }
  const QCF = (b) => [RAW.DOWN, RAW.DOWN | RAW.RIGHT, RAW.RIGHT | b];
  /**
   * Jump straight up, do the motion + `first` from frame `T`; `again(move, landed, frame)` says when to start the motion
   * again (move = the rekka part he is in, landed = how many of its hits have hit or been blocked, frame = his frame in it).
   */
  const play = ({ gap = 120, T = 28, first = RAW.L, again = () => false, p2 = () => 0, meter = 0, setup = null }) => {
    const g = createGame(w);
    g.players[0].x = px(-gap / 2);
    g.players[1].x = px(gap / 2);
    g.players[0].meter = meter;
    if (setup) setup(g);
    const seen = [], cues = [], ys = {}, landed = {}, air = [];
    const queue = new Map();
    QCF(first).forEach((r, k) => queue.set(T + k, r));
    const asked = new Set();
    for (let i = 0; i < 260; i++) {
      const a = g.players[0];
      if (!asked.has(a.state) && again(a.state, landed[a.state] ?? 0, a.frame)) { asked.add(a.state); QCF(RAW.L).forEach((r, k) => queue.set(i + k, r)); }
      step(g, [i < 6 ? RAW.UP : queue.get(i) ?? 0, p2(i, g)], w);
      if (seen[seen.length - 1] !== a.state) seen.push(a.state);
      (ys[a.state] ||= []).push(a.y);
      for (const c of g.cues) if (c.p === 0 && (c.type === 'hit' || c.type === 'block')) { cues.push(`${c.type}:${c.move}`); landed[c.move] = (landed[c.move] ?? 0) + 1; if (c.type === 'hit') air.push(g.players[1].y > 0); }
    }
    return { g, seen, cues, ys, air };
  };
  const count = (r, what) => r.cues.filter((c) => c === what).length;
  const late = (st, n, fr) => (st.startsWith('waxing') && n >= 3) || (st.startsWith('halfMoonEnd') && n >= 1);

  // Part 1 alone on a standing fighter: all three hits; he hangs through it and falls afterwards.
  const one = play({});
  assert.equal(count(one, 'hit:waxingL'), 3, 'all three hits on a standing fighter');
  assert.deepEqual(one.seen.slice(one.seen.indexOf('waxingL')), ['waxingL', 'fall', 'land', 'idle'], 'stopping after Part 1 just falls');
  const hang = one.ys.waxingL;
  assert.ok(hang[0] > px(100), 'done well off the floor');
  assert.ok(hang.slice(0, 30).every((y) => y === hang[0]), 'he hangs: no rise, no fall, through the hits');
  assert.ok(hang[hang.length - 1] < hang[0], 'and falls once the hits are done');
  // On a fighter in the air: all three hits too.
  const up = play({ p2: (i) => (i >= 12 && i < 18 ? RAW.UP : 0) });
  assert.equal(count(up, 'hit:waxingL'), 3, 'all three hits on an airborne fighter');
  assert.ok(up.air.slice(0, 3).every(Boolean), 'who was off the floor for each');
  // The whole rekka: 3 + 4 + 1 hits, hanging in each part, then down to the landing.
  const full = play({ again: late });
  assert.deepEqual(full.seen.slice(full.seen.indexOf('waxingL')), ['waxingL', 'halfMoonL', 'halfMoonEndL', 'fullPhaseL', 'fullPhaseLand', 'idle']);
  assert.deepEqual([count(full, 'hit:waxingL'), count(full, 'hit:halfMoonL'), count(full, 'hit:halfMoonEndL'), count(full, 'hit:fullPhaseL')], [3, 3, 1, 1]);
  assert.ok([...full.ys.halfMoonL, ...full.ys.halfMoonEndL.slice(0, 6)].every((y) => y === full.ys.halfMoonL[0]), 'hangs in Part 2');
  assert.ok(full.ys.fullPhaseL.slice(0, 15).every((y) => y === full.ys.fullPhaseL[0]), 'hangs in Part 3 until the swing is done');
  // The window opens on Part 1's first hit: the motion right after it goes straight to Part 2.
  const early = play({ again: (st, n) => st.startsWith('waxing') && n >= 1 });
  assert.ok(early.seen.includes('halfMoonL'));
  assert.equal(count(early, 'hit:waxingL'), 1, 'cancelled after the first hit');
  // On block the parts chain as well; only Part 1's own three hits if he stops.
  const guard = (i) => (i > 32 ? RAW.RIGHT : 0);
  // (gap 90, not the default 120, for the two blocked runs: Malik's standing hurtbox was moved back by the owner on Nov 26, and
  // from 120 the pushback of the first blocked hits now carries him out of reach of the rest.)
  const blocked = play({ again: late, p2: guard, gap: 90 });
  assert.deepEqual([count(blocked, 'block:waxingL'), count(blocked, 'block:halfMoonL'), count(blocked, 'block:halfMoonEndL'), count(blocked, 'block:fullPhaseL')], [3, 3, 1, 1], 'the whole thing on block');
  // Not on whiff; not after the window (Part 1's active frames) has closed; and only once per jump.
  const whiff = play({ gap: 600, again: (st, n, fr) => st.startsWith('waxing') && fr >= 9 });
  assert.ok(whiff.seen.includes('waxingL') && !whiff.seen.includes('halfMoonL'), 'no Part 2 on whiff');
  const tooLate = play({ again: (st, n, fr) => st.startsWith('waxing') && fr >= 23 });
  assert.equal(count(tooLate, 'hit:waxingL'), 3);
  assert.ok(!tooLate.seen.includes('halfMoonL'), 'no Part 2 once the active frames are over');
  const twice = play({ T: 10, again: (st) => st === 'fall' });
  assert.equal(twice.seen.filter((x) => x === 'waxingL').length, 1, 'once per jump');
  // Parts 2 and 3 never come out on their own.
  for (const c of A.commands.filter((x) => /^(halfMoon|fullPhase)[LMH]$/.test(x.move))) assert.equal(c.neutral, false, `${c.move} is a follow-up only`);
  for (const id of ['halfMoonEndL', 'halfMoonEndM', 'halfMoonEndH', 'halfMoonEx', 'halfMoonEndEx', 'fullPhaseEx', 'moonSmash']) assert.ok(!A.commands.some((x) => x.move === id), `${id} has no input of its own`);

  // EX (j.236 + attack + S, one bar): one input plays all three parts on hit, then the Moonfall Smash.
  const bar = 40000;
  const ex = play({ first: RAW.L | RAW.S, meter: bar });
  assert.deepEqual(ex.seen.slice(ex.seen.indexOf('waxingL_ex')), ['waxingL_ex', 'halfMoonEx', 'halfMoonEndEx', 'fullPhaseEx', 'moonSmash', 'moonSmashLand', 'idle']);
  assert.deepEqual(['waxingL_ex', 'halfMoonEx', 'halfMoonEndEx', 'fullPhaseEx', 'moonSmash'].map((id) => count(ex, `hit:${id}`)), [3, 3, 1, 1, 1]);
  // A second EX in the same round that is blocked still stops after Part 1 (the hidden counter is cleared each time).
  assert.equal(raw.moves.find((x) => x.id === 'fullPhaseEx').timeline.find((e) => e.setVar)?.at, 1);
  assert.ok(ex.g.players[0].meter < bar, 'it cost meter');
  assert.ok(ex.ys.moonSmash, 'the smash came out');
  // Blocked, it stops after Part 1; whiffed too; and with no meter the plain version comes out.
  const exBlocked = play({ first: RAW.L | RAW.S, meter: bar, p2: guard, gap: 90 });
  assert.equal(count(exBlocked, 'block:waxingL_ex'), 3);
  assert.deepEqual(exBlocked.seen.slice(exBlocked.seen.indexOf('waxingL_ex'), exBlocked.seen.indexOf('waxingL_ex') + 2), ['waxingL_ex', 'fall']);
  const exWhiff = play({ gap: 600, first: RAW.L | RAW.S, meter: bar });
  assert.ok(exWhiff.seen.includes('waxingL_ex') && !exWhiff.seen.includes('halfMoonEx'));
  // Part 3 that connects but is not followed (the plain one) never starts the smash.
  assert.ok(!full.seen.includes('moonSmash'));
});
