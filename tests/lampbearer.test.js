// Avner, the Lampbearer: Rising Moon, Lunar Halo, Tide, the Moonlit Rite and the two supers, played in the real game.
// The numbers these tests name are the ones the owner's spec fixes (frames, distances, costs); the rest is tuning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGame, step } from '../src/core/game.js';
import { px } from '../src/core/fixed.js';
import { runSyncTest } from '../src/net/sync-test.js';
import { compileCharacter } from '../src/core/character.js';
import { loadWorld, loadChar, loadJSON, script, lcg, SYSTEM } from './helpers.js';

const FILE = 'data/characters/avner/avner.toska.json';
const RAW = loadJSON(FILE);
const A = loadChar(FILE);
const W = loadWorld(A, A);

function setup(gap) {
  const g = createGame(W);
  g.players[0].x = -px(gap / 2);
  g.players[1].x = px(gap / 2);
  return g;
}
/** Run inputs; returns every cue with the frame of the run and P1's state and frame at that moment. */
function run(g, s, p2 = '') {
  const a = script(s), b = p2 ? script(p2) : [];
  const out = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    step(g, [a[i] ?? 0, b[i] ?? 0], W);
    for (const c of g.cues) out.push({ ...c, i, state: g.players[0].state, at: g.players[0].frame });
  }
  return out;
}
const hitOf = (cues, move) => cues.find((c) => (c.type === 'hit' || c.type === 'counter' || c.type === 'witness') && c.move === move);

test('the old kit is gone from the live Avner, and kept whole in the archive', () => {
  const ids = RAW.moves.map((m) => m.id);
  for (const old of ['hookL', 'hookM', 'hookH', 'reel', 'lightstep', 'vigil', 'vigilSnap', 'vigilM', 'vigilAnchor', 'vigilFlare']) assert.ok(!ids.includes(old), `${old} is gone`);
  assert.ok(!('brand' in RAW.mechanic.vars), 'no Brand');
  assert.equal(RAW.meter.archetype, 'balanced');
  const kept = loadJSON('data/characters/_archive/avner_chain/avner.toska.json');
  for (const old of ['hookL', 'reel', 'lightstep', 'vigil', 'vigilFlare']) assert.ok(kept.moves.some((m) => m.id === old), `${old} is in the archive`);
  assert.ok(kept.mechanic.vars.brand, 'the Brand is in the archive');
  assert.ok(fs.existsSync('data/characters/_archive/avner_chain/sheets/idle.png'));
});

test('normals: startup, active and recovery are the spec\'s, and the drawings fill each move exactly', () => {
  const want = { '5L': [5, 2, 9], '5M': [8, 3, 14], '5H': [14, 4, 22], backHeavy: [14, 5, 22], '5S': [11, 5, 22], '2L': [5, 2, 9], '2M': [9, 3, 15], '2H': [12, 4, 24], 'j.L': [5, 3, 10], 'j.M': [8, 5, 14], 'j.H': [12, 5, 18] };
  for (const [id, [s, a, r]] of Object.entries(want)) {
    const m = RAW.moves.find((x) => x.id === id);
    assert.deepEqual([m.startup, m.active, m.recovery], [s, a, r], id);
    const st = A.states[id];
    assert.equal(st.frames.length, s - 1 + a + r, `${id} length`);
    assert.equal(m.sprite.holds.reduce((x, y) => x + y, 0), st.frames.length, `${id}: drawings fill the move`);
    const first = st.frames.findIndex((f) => f.hit.length);
    assert.equal(first, s - 1, `${id}: first active frame`);
    assert.equal(st.frames.filter((f) => f.hit.length).length, a, `${id}: active frames`);
  }
  assert.equal(RAW.moves.find((m) => m.id === 'j.S').startup, 14);
  for (const [id, guard] of [['2L', 'low'], ['2M', 'low'], ['2H', 'low'], ['j.L', 'high'], ['5H', 'mid']]) assert.equal(A.states[id].move.guard, guard, id);
  assert.equal(A.states['5S'].move.launchType, 'hard');
  assert.ok(A.states['2H'].move.knockdown);
  // The Crescent Kick: he steps back in its startup. (Its reach is the owner's to tune in the box editor: not checked.)
  const g = setup(900);
  const x0 = g.players[0].x;
  run(g, '4+H 5*12');
  assert.ok(g.players[0].x < x0, 'stepped back');
});

test('Rising Moon: the moon rises 140 / 320 / 520 in front, first active on frame 16 / 20 / 24, after a warning', () => {
  for (const [b, dist, frame] of [['L', 140, 16], ['M', 320, 20], ['H', 520, 24]]) {
    const g = setup(dist);
    const x0 = g.players[0].x;
    const cues = run(g, `2 3 6+${b} 5*70`);
    const spawn = cues.find((c) => c.type === 'spawn');
    assert.equal(spawn.name, 'risingMoon');
    const hit = hitOf(cues, 'risingMoon');
    assert.ok(hit, `${b}: the moon hits a fighter standing ${dist} px away`);
    assert.equal(hit.at + 1, frame, `${b}: first active frame of the move`);
    assert.ok(hit.at - spawn.at >= 3, `${b}: the warning shows for at least 3 frames (${hit.at - spawn.at})`);
    assert.equal(hit.state, `risingMoon${b}`);
    // It is an object in the game state, where the data says.
    const g2 = setup(900);
    run(g2, `2 3 6+${b} 5*${frame - 1}`);
    assert.equal(g2.projectiles.length, 1);
    assert.equal(g2.projectiles[0].x - g2.players[0].x, px(dist), `${b}: distance`);
    assert.equal(g2.projectiles[0].y, 0, 'on the ground');
    assert.equal(g.players[0].x, x0, 'he does not move');
  }
});

test('Rising Moon: a soft launch; it hits crouching and airborne fighters; it can be blocked; one moon at a time', () => {
  assert.equal(A.projectiles.risingMoon.move.launchType, 'soft');
  let g = setup(140);
  let cues = run(g, '2 3 6+L 5*40', '2*45');
  assert.ok(hitOf(cues, 'risingMoon'), 'hits a crouching fighter');
  g = setup(140);
  cues = run(g, '5*12 2 3 6+L 5*40', '8 5*60'); // the opponent jumps straight up over the spot
  assert.ok(hitOf(cues, 'risingMoon'), 'hits a fighter in the air above it');
  g = setup(140);
  cues = run(g, '2 3 6+L 5*40', '6*45'); // P2 holds away from Avner
  assert.ok(cues.some((c) => c.type === 'block'), 'blocked by holding back');
  assert.ok(!hitOf(cues, 'risingMoon'));
  // The far moon is still out when he has recovered: a second one is refused until it is gone.
  g = setup(900);
  cues = run(g, '2 3 6+H 5*34 2 3 6+L 5*6');
  assert.equal(cues.filter((c) => c.type === 'spawn').length, 1);
  assert.equal(g.projectiles.length, 1, 'the far moon is still there after he recovered');
  assert.notEqual(g.players[0].state, 'risingMoonL', 'no second moon while one is out');
  // The surge (the moon's last active drawing) is a bigger box.
  const ph = A.projectiles.risingMoon.phases;
  assert.equal(ph.length, 2);
  assert.ok(ph[1].box[0][2] > ph[0].box[0][2] && ph[1].box[0][3] > ph[0].box[0][3]);
  assert.equal(ph[0].from, 6);
  assert.equal(ph[1].to, 15, 'live on the moon\'s drawings 3 to 6');
});

test('Rising Moon EX: one bar, under the opponent wherever they stand, the warning 4 frames longer', () => {
  for (const gap of [200, 700, 1000]) {
    const g = setup(gap);
    g.players[0].meter = 20000;
    const cues = run(g, '2 3 6+LS 5*60');
    assert.equal(g.players[0].meter < 20000, true);
    const spawn = cues.find((c) => c.type === 'spawn');
    assert.equal(spawn.name, 'risingMoonEx');
    const hit = hitOf(cues, 'risingMoonEx');
    assert.ok(hit, `hits from ${gap} px`);
    assert.equal(hit.at - spawn.at, 10, 'warning 6 + 4 frames');
  }
  const g = setup(700);
  g.players[0].meter = 20000;
  run(g, '2 3 6+LS 5*10');
  assert.equal(g.projectiles[0].x, g.players[1].x, 'directly under the opponent');
});

test('Lunar Halo: startup 6 / 8 / 11, EX 5; a circle around him that hits behind too; launches; very unsafe on block', () => {
  for (const [input, id, startup] of [['L', 'haloL', 6], ['M', 'haloM', 8], ['H', 'haloH', 11], ['LS', 'haloL_ex', 5]]) {
    const g = setup(70);
    g.players[0].meter = 20000;
    const cues = run(g, `6 2 3+${input} 5*60`);
    const hit = hitOf(cues, id);
    assert.ok(hit, `${id} hits`);
    assert.equal(hit.at + 1, startup, `${id}: startup`);
    assert.ok(g.players[1].combo || g.players[1].lastCombo, 'a combo started');
    assert.equal(A.states[id].frames.filter((f) => f.hit.length).length, 10, `${id}: live on burst drawings 2 to 5`);
    // The box reaches as far behind him as in front.
    const boxes = A.states[id].frames[startup - 1].hit;
    const left = Math.min(...boxes.map((b) => b[0])), right = Math.max(...boxes.map((b) => b[0] + b[2]));
    assert.equal(left, -right, `${id}: the same both sides`);
  }
  // Bigger by version.
  const reach = (id) => Math.max(...A.states[id].frames.find((f) => f.hit.length).hit.map((b) => b[0] + b[2]));
  assert.ok(reach('haloL') < reach('haloM') && reach('haloM') < reach('haloH'));
  assert.equal(reach('haloH'), reach('haloL_ex'));
  assert.deepEqual([RAW.effects.haloBurstL.sprite.scale, RAW.effects.haloBurstM.sprite.scale, RAW.effects.haloBurstH.sprite.scale].map((s) => s / RAW.effects.haloBurstM.sprite.scale), [0.7, 1, 1.3]);
  // A cross-up: the opponent is behind him when it comes out, and is still hit.
  const g = setup(70);
  const cues = run(g, '6 2 3+M');
  g.players[1].x = g.players[0].x - px(70); // they cross over him as it starts
  cues.push(...run(g, '5*30'));
  assert.ok(hitOf(cues, 'haloM'), 'hits a fighter behind him');
  // H: only his lower body can be hit while it starts. EX: nothing can hit him for 10 frames.
  assert.ok(A.states.haloH.frames[3].hurt.every((b) => b[1] + b[3] <= 7000), 'H: upper body invincible in startup');
  for (let f = 0; f < 10; f++) assert.ok(A.states.haloL_ex.frames[f].invStrike && A.states.haloL_ex.frames[f].invThrow, `EX frame ${f + 1}`);
  assert.ok(!A.states.haloL_ex.frames[10].invStrike);
  // Blocked: the attacker is stuck about 25 frames longer than the defender.
  const b = setup(70);
  let freeA = -1, freeD = -1;
  const a = script('6 2 3+M 5*90'), d = script('6*8 6*90');
  for (let i = 0; i < 90; i++) {
    step(b, [a[i] ?? 0, d[i] ?? 0], W);
    if (i > 12 && freeA < 0 && b.players[0].state === 'idle') freeA = i;
    if (i > 12 && freeD < 0 && !['blockStand', 'blockCrouch'].includes(b.players[1].state)) freeD = i;
  }
  assert.ok(freeA > 0 && freeD > 0);
  assert.ok(freeD - freeA <= -22 && freeD - freeA >= -28, `on block: ${freeD - freeA}`);
});

test('Tide: a wave runs along the ground, farther by button; a touch drags the opponent in close, still in hitstun', () => {
  const reach = (b) => { const p = A.projectiles[`tide${b}`]; return (p.spawn[0] + p.speed * p.lifetime) / 100; };
  assert.ok(reach('L') < reach('M') && reach('M') < reach('H'));
  for (const [b, gap] of [['L', 200], ['M', 300], ['H', 420]]) {
    const g = setup(gap);
    const cues = run(g, '2 1 4+' + b);
    for (let i = 0; i < 60 && !hitOf(cues, `tide${b}`); i++) cues.push(...run(g, '5'));
    const spawn = cues.find((c) => c.type === 'spawn');
    assert.equal(spawn.at, 6, 'the wave leaves his hand on body drawing 3');
    assert.ok(hitOf(cues, `tide${b}`), `${b} reaches ${gap} px`);
    run(g, '5*24');
    assert.equal(g.players[0].state, 'idle', 'he has recovered');
    assert.ok(g.players[1].x - g.players[0].x <= px(90), `${b}: dragged in close`);
    assert.ok(g.players[1].stun > 0 && g.players[1].combo, `${b}: still in hitstun for a follow-up`);
  }
  // Out of reach: nothing happens. L does not reach where H does.
  const far = setup(420);
  assert.ok(!hitOf(run(far, '2 1 4+L 5*60'), 'tideL'));
  // Whether a wave catches a jumping opponent is one switch in its data (`hitsAirborne`; the owner's to set per wave).
  for (const on of [false, true]) {
    const raw = loadJSON(FILE);
    raw.projectiles.tideM.hitsAirborne = on;
    raw.projectiles.tideM.hitbox = [-40, 0, 80, 220];
    const def = compileCharacter(raw, SYSTEM);
    const w = loadWorld(def, def);
    const g = createGame(w);
    g.players[0].x = -px(150);
    g.players[1].x = px(150);
    const p1 = script('2 1 4+M 5*60'), p2 = script('8 5*90');
    let caught = false, landed = false;
    for (let i = 0; i < p1.length; i++) {
      step(g, [p1[i], p2[i] ?? 0], w);
      if (!landed && g.cues.some((c) => c.type === 'hit')) { caught = g.players[1].y > 0; landed = true; }
    }
    assert.equal(caught, on, on ? 'switch on: caught in the air' : 'switch off: the wave passes under a jump');
  }
  assert.equal(A.projectiles.tideEx.move.hitsAirborne, true, 'EX always catches airborne opponents');
});

test('Moonlit: R places the crescent in front, 6R far, 2R over himself, j.R from the air; one at a time', () => {
  for (const [input, id, dist] of [['5+R', 'moonlit5', 150], ['6+R', 'moonlit6', 420], ['2+R', 'moonlit2', 0]]) {
    const g = setup(900);
    const cues = run(g, `${input} 5*12`);
    assert.equal(cues.find((c) => c.type === 'spawn')?.name, 'crescent', id);
    assert.equal(g.projectiles.length, 1);
    assert.equal(g.projectiles[0].x - g.players[0].x, px(dist), id);
    assert.equal(g.projectiles[0].y, 0);
  }
  const air = setup(900);
  const cues = run(air, '8 5*12 5+R 5*14');
  assert.equal(cues.find((c) => c.type === 'spawn')?.name, 'crescent', 'j.R');
  assert.equal(air.projectiles[0].y, 0, 'the light is on the ground wherever he was');
  assert.deepEqual(A.rite.moves, ['moonlit5', 'moonlit6', 'moonlit2', 'moonlitJ', 'moonSnap', 'moonRecall']);
  assert.equal(A.rite.gauge, null);
});

test('Moonlit: a hit on an opponent in the light marks them; only there; and they fall slower there', () => {
  // In the light.
  let g = setup(150);
  run(g, '5+R 5*40 5+L 5*12');
  assert.equal(g.players[0].vars.moonmark, 1, 'marked');
  // Outside it (the crescent is placed far away).
  g = setup(100);
  run(g, '6+R 5*40 5+L 5*12');
  assert.ok(g.players[1].lastCombo || g.players[1].combo, 'the jab landed');
  assert.equal(g.players[0].vars.moonmark, 0, 'no mark outside the light');
  // A blocked hit does not mark.
  g = setup(150);
  run(g, '5+R 5*40 5+L 5*12', '6*70');
  assert.equal(g.players[0].vars.moonmark, 0, 'blocked: no mark');
  // Gravity: the same jump, in and out of the light.
  const peakAndTime = (lit) => {
    const s = setup(150);
    if (lit) run(s, '5+R 5*40'); else run(s, '5*41');
    let peak = 0, t = 0;
    const p2 = script('8 5*120');
    for (let i = 0; i < p2.length; i++) { step(s, [0, p2[i]], W); peak = Math.max(peak, s.players[1].y); if (s.players[1].y > 0) t++; }
    return [peak, t];
  };
  const [peak0, t0] = peakAndTime(false), [peak1, t1] = peakAndTime(true);
  assert.ok(peak1 > peak0 && t1 > t0, `floats: ${t0} -> ${t1} frames in the air`);
  assert.equal(RAW.projectiles.crescent.zone.gravityPct, 7000);
  // His own gravity is untouched.
  const self = (lit) => { const s = setup(900); if (lit) run(s, '2+R 5*40'); else run(s, '5*41'); let t = 0; for (const r of script('8 5*100')) { step(s, [r, 0], W); if (s.players[0].y > 0) t++; } return t; };
  assert.equal(self(true), self(false));
});

test('Moonlit: R with a mark is the moonbeam (small damage, combo-able, uses the mark); R without one sends the crescent home', () => {
  const g = setup(150);
  run(g, '5+R 5*40 5+L 5*4');
  const hp = g.players[1].health;
  const cues = run(g, '5*8 5+R 5*14');
  const hit = hitOf(cues, 'moonSnap');
  assert.ok(hit, 'the beam hits');
  assert.equal(g.players[0].vars.moonmark, 0, 'the mark is used up');
  assert.ok(hp - g.players[1].health > 0 && hp - g.players[1].health <= 300, 'small damage');
  assert.equal(g.players[1].combo.hits, 2, 'it combos from the jab');
  assert.ok(cues.some((c) => c.type === 'spawn' && c.name === 'moonbeam'));
  assert.ok(g.projectiles.some((p) => p.kind === 'crescent'), 'the crescent stays');
  // It strikes wherever they are.
  const far = setup(150);
  run(far, '5+R 5*40 5+L 5*30');
  far.players[1].x = far.players[0].x + px(800);
  assert.ok(hitOf(run(far, '5+R 5*14'), 'moonSnap'), 'from across the screen');
  // No mark: R recalls the crescent, and the cooldown starts.
  run(g, '5*40 5+R 5*8');
  assert.equal(g.projectiles.filter((p) => p.kind === 'crescent').length, 0, 'the crescent is gone');
  assert.ok(g.players[0].vars.moonCooldown > 220, 'cooldown started');
  // During the cooldown R does nothing; after 240 frames it works again.
  const c2 = run(g, '5*20 5+R 5*30');
  assert.ok(!c2.some((c) => c.type === 'spawn'), 'still cooling down');
  const c3 = run(g, '5*200 5+R 5*12');
  assert.ok(c3.some((c) => c.type === 'spawn' && c.name === 'crescent'), 'ready again after 240 frames');
});

test('Moonlit: the crescent fades by itself, starts the cooldown and clears the mark', () => {
  const g = setup(150);
  run(g, '5+R 5*40 5+L 5*12');
  assert.equal(g.players[0].vars.moonmark, 1);
  const life = RAW.projectiles.crescent.lifetime;
  run(g, `5*${life}`);
  assert.equal(g.projectiles.length, 0);
  assert.equal(g.players[0].vars.moonmark, 0);
  assert.ok(g.players[0].vars.moonCooldown > 0);
  assert.equal(RAW.projectiles.crescent.onEnd.setVar.moonCooldown, 240);
});

test('supers: New Moon costs one bar; Full Moon needs all four and spends three', () => {
  let g = setup(200);
  g.players[0].meter = 10000;
  let cues = run(g, '2 3 6 2 3 6+S 5*60');
  assert.ok(cues.some((c) => c.type === 'superflash'));
  assert.ok(hitOf(cues, 'newMoon'), 'New Moon hits');
  assert.equal(A.commands.find((c) => c.move === 'newMoon').cost.meter, 10000);
  g = setup(200);
  g.players[0].meter = 9000;
  run(g, '2 3 6 2 3 6+S 5*3');
  assert.notEqual(g.players[0].state, 'newMoon', 'not without a bar');

  const full = A.commands.find((c) => c.move === 'fullMoon');
  assert.equal(full.cost.meter, 30000);
  assert.equal(full.requires.meter, 40000);
  g = setup(500);
  g.players[0].meter = 39900;
  run(g, '2 1 4 2 1 4+S 5*3');
  assert.notEqual(g.players[0].state, 'fullMoon', 'not at less than four bars');
  g = setup(500);
  g.players[0].meter = 40000;
  cues = run(g, '2 1 4 2 1 4+S 5*3');
  assert.equal(g.players[0].state, 'fullMoon');
  assert.equal(g.players[0].meter, 10000, 'three bars spent');
  cues = run(g, '5*120');
  assert.ok(hitOf(cues, 'moonColumn'), 'the column lands on the opponent wherever they are');
});

test('every sheet the file names is there; placeholders say so in their name', () => {
  const names = new Set();
  const walk = (v) => { if (v && typeof v === 'object') { if (typeof v.image === 'string') names.add(v.image); for (const x of Object.values(v)) walk(x); } };
  walk(RAW);
  assert.ok(names.size > 50);
  for (const n of names) assert.ok(fs.existsSync(`data/characters/avner/${n}`), n);
  const waiting = [...names].filter((n) => n.includes('placeholder'));
  for (const slot of ['2L', '2H', 'throw-forward', 'throw-back', 'drawn', 'full-moon', 'lantern-phase']) assert.ok(waiting.some((n) => n.includes(`/${slot}-placeholder`)), `${slot} is marked as a placeholder`);
  for (const real of ['hit-stand', 'hit-crouch', 'hit-air', 'tumble', 'knockdown', 'wakeup', 'idle', 'crouch', '5L', '5H', 'rising-moon', 'moon', 'lunar-halo', 'halo-burst', 'tide', 'tide-wave', 'crescent', 'moonbeam', 'new-moon']) assert.ok(names.has(`sheets/${real}.png`), `${real} uses the owner's art`);
});

test('sync test: the whole kit, rewinding 8 frames every frame, never differs', () => {
  const seq = script('2 3 6+L 5*30 5+R 5*30 5+L 5*6 5+M 5*20 5+R 5*30 6 2 3+M 5*50 2 1 4+H 5*50 2 3 6+H 5*10 5+R 5*30 2+R 5*40 8 5*8 5+R 5*40 2 3 6 2 3 6+S 5*80 2 1 4 2 1 4+S 5*120 6*30');
  const rnd = lcg(7);
  let hold = 0, cur = 0;
  const p2 = () => { if (hold-- <= 0) { const r = rnd() % 100; cur = r < 30 ? 1 : r < 45 ? 2 : r < 55 ? 4 : r < 65 ? 8 : r < 80 ? 16 << (rnd() % 4) : 0; hold = 3 + (rnd() % 12); } return cur; };
  const r = runSyncTest(W, (g) => { if (g.frame % 600 === 0) g.players[0].meter = g.players[0].meter; return [seq[g.frame % seq.length] ?? 0, p2()]; }, { frames: 2400, distance: 8 });
  assert.ok(r.ok, `desync at ${r.failFrame}: ${r.diff}`);
});

test('two Avners fighting at random stay in sync too (moons, light, marks and beams from both sides)', () => {
  const rnd = lcg(99);
  const moves = ['2 3 6+L', '2 3 6+M', '6 2 3+L', '2 1 4+M', '5+R', '6+R', '2+R', '5+L', '5+M', '2+M', '5+H', '5+S', '8', '6*6', '4*6', '5*4'].map((m) => script(m));
  const q = [[], []];
  const next = (i) => { if (!q[i].length) q[i].push(...moves[rnd() % moves.length], 0, 0); return q[i].shift(); };
  const r = runSyncTest(W, () => [next(0), next(1)], { frames: 3000, distance: 8 });
  assert.ok(r.ok, `desync at ${r.failFrame}: ${r.diff}`);
});

test('Tide and Rising Moon cancel into Moonlit once the wave or moon is out, not before', () => {
  for (const [motion, id, kind] of [['2 3 6+L', 'risingMoonL', 'risingMoon'], ['2 1 4+L', 'tideL', 'tideL']]) {
    const spawnAt = RAW.moves.find((m) => m.id === id).timeline.find((e) => e.spawn).at;
    // Too early: R is ignored and the wave / moon still comes out.
    let g = setup(900);
    run(g, `${motion} 5*${spawnAt - 3} 5+R 5`);
    assert.equal(g.players[0].state, id, `${id}: R before the release does nothing`);
    // After the release: R is Moonlit, and the wave / moon stays.
    g = setup(900);
    const cues = run(g, `${motion} 5*${spawnAt + 1} 5+R 5*10`);
    assert.ok(cues.some((c) => c.type === 'spawn' && c.name === kind), `${id}: released first`);
    assert.ok(cues.some((c) => c.type === 'spawn' && c.name === 'crescent'), `${id}: cancelled into Moonlit`);
    assert.ok(cues.findIndex((c) => c.name === 'crescent') > cues.findIndex((c) => c.name === kind));
    // 6R and 2R too.
    for (const [dir, dist] of [['6', 420], ['2', 0]]) {
      const h = setup(900);
      run(h, `${motion} 5*${spawnAt + 1} ${dir}+R 5*10`);
      const c = h.projectiles.find((p) => p.kind === 'crescent');
      assert.ok(c, `${id}: ${dir}R`);
      assert.equal(c.x - h.players[0].x, px(dist));
    }
  }
  // With a crescent out and a mark, the cancel is the Snap.
  const g = setup(150);
  run(g, '5+R 5*40 5+L 5*20');
  assert.equal(g.players[0].vars.moonmark, 1);
  run(g, '2 3 6+L 5*10 5+R 5*2');
  assert.equal(g.players[0].state, 'moonSnap');
});
