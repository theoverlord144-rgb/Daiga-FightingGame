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
  const want = { '5L': [5, 2, 9], '5M': [8, 3, 14], '5H': [12, 4, 20], backHeavy: [12, 4, 20], '5S': [10, 4, 22], '2L': [5, 2, 9], '2M': [8, 3, 15], '2H': [12, 3, 24], lanternDrag: [16, 6, 24], waningHop: [22, 3, 16], 'j.L': [5, 3, 10], 'j.M': [7, 4, 14], 'j.H': [10, 4, 18] };
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
  // j.S (owner, Nov 24): 12 / 4, then he rides it down; once per jump; its own 14-frame landing; a hit drops him straight down.
  const crash = A.states['j.S'];
  assert.deepEqual([crash.move.startup, crash.move.active], [12, 4]);
  assert.equal(crash.frames.findIndex((f) => f.hit.length), 11);
  assert.equal(crash.move.perJump, 'crash');
  assert.equal(crash.landTo, 'crashLand');
  assert.equal(crash.move.onHitState, 'crashFall');
  assert.equal(A.states.crashFall.landTo, 'crashLand');
  assert.equal(A.states.crashLand.duration, 14);
  assert.equal(crash.move.airReaction, 'hardKD');
  for (const [id, guard] of [['2L', 'low'], ['2M', 'low'], ['2H', 'low'], ['j.L', 'high'], ['5H', 'mid']]) assert.equal(A.states[id].move.guard, guard, id);
  assert.equal(A.states['5S'].move.launchType, 'hard');
  assert.ok(A.states['2H'].move.knockdown);
  // Crescent Withdraw (4H, owner Nov 24): a short hop back. Off the floor from frame 4 until he lands, a light pop-up on
  // hit, a spin on counter hit, -8 on block.
  const cw = A.states.backHeavy;
  const low = (i) => Math.min(...cw.frames[i].hurt.map((b) => b[1]));
  assert.ok(low(2) < 1000, 'on the floor for the first three frames');
  for (let i = 3; i < 25; i++) assert.ok(low(i) >= 2000 && cw.frames[i].invThrow, `frame ${i + 1}: off the floor, cannot be thrown`);
  assert.ok(low(25) < 1000 && !cw.frames[25].invThrow, 'landed');
  assert.equal(cw.move.launchType, 'soft');
  assert.equal(cw.move.counterReaction, 'spin');
  assert.equal(cw.move.blockstun - (cw.move.active - 1) - cw.move.recovery, -8, '-8 on block');
  const g = setup(600);
  const x0 = g.players[0].x;
  run(g, '4+H 5*40');
  const back = (x0 - g.players[0].x) / 100;
  assert.ok(back >= 15 && back <= 30, `he moved back about a quarter of his width (${back} px)`);
});

test('Rising Moon: released on frame 14 from the lantern (drawing 4); the orb flies near, mid or far by button', () => {
  assert.deepEqual(RAW.moves.find((m) => m.id === 'risingMoonL').sprite.holds, [5, 4, 4, 4, 5, 8, 7, 6]);
  const reach = (b) => { const p = A.projectiles['moonOrb' + b]; return (p.speed * p.lifetime) / 100; };
  assert.ok(reach('L') < reach('M') && reach('M') < reach('H'), 'near, mid, far');
  for (const b of ['L', 'M', 'H']) {
    const g = setup(900);
    const x0 = g.players[0].x;
    const cues = run(g, `2 3 6+${b} 5*60`);
    const spawn = cues.find((c) => c.type === 'spawn');
    assert.equal(spawn.name, 'moonOrb' + b);
    assert.equal(spawn.at + 1, 14, `${b}: released on frame 14`);
    const st = A.states['risingMoon' + b];
    assert.deepEqual([st.move.startup, st.move.active, st.move.recovery, st.duration], [14, 0, 30, 43]);
    assert.equal(st.frames[13].sprite.index, 3, 'the release drawing comes up on frame 14');
    assert.equal(st.frames[12].sprite.index, 2);
    // It leaves the lantern: its place on that drawing.
    assert.deepEqual(RAW.projectiles['moonOrb' + b].spawn, RAW.art.lantern.at['sheets/rising-moon.png'][3]);
    assert.equal(g.players[0].x, x0, 'he does not move');
  }
  // Who reaches what: L only close, M to mid range, H far.
  const lands = (b, gap) => !!hitOf(run(setup(gap), `2 3 6+${b} 5*90`), 'moonOrb' + b);
  assert.deepEqual([lands('L', 150), lands('L', 300)], [true, false]);
  assert.deepEqual([lands('M', 300), lands('M', 500)], [true, false]);
  assert.ok(lands('H', 500));
});

test('Rising Moon: a soft launch; it hits a crouching fighter; it can be blocked; one moon at a time', () => {
  for (const b of ['L', 'M', 'H']) assert.equal(A.projectiles['moonOrb' + b].move.launchType, 'soft');
  let g = setup(200);
  let cues = run(g, '2 3 6+M 5*60', '2*70');
  assert.ok(hitOf(cues, 'moonOrbM'), 'hits a crouching fighter');
  g = setup(150);
  cues = run(g, '2 3 6+L 5*60', '6*70'); // P2 holds away from Avner
  assert.ok(cues.some((c) => c.type === 'block'), 'blocked by holding back');
  assert.ok(!hitOf(cues, 'moonOrbL'));
  // The far moon is still out when he has recovered: a second one is refused until it is gone.
  g = setup(900);
  cues = run(g, '2 3 6+H 5*42 2 3 6+L 5*6');
  assert.equal(cues.filter((c) => c.type === 'spawn').length, 1);
  assert.equal(g.projectiles.length, 1, 'the far moon is still there after he recovered');
  assert.notEqual(g.players[0].state, 'risingMoonL', 'no second moon while one is out');
});

test('Rising Moon EX: one bar, two moons; the second spins them and always leaves a Moonmark; about 1,300 damage', () => {
  for (const gap of [120, 250]) {
    const g = setup(gap);
    g.players[0].meter = 20000;
    const hp = g.players[1].health;
    const cues = run(g, '2 3 6+LS 5*120');
    assert.ok(g.players[0].meter < 20000 && g.players[0].meter >= 10000, 'one bar spent (the hits give some back)');
    assert.deepEqual(cues.filter((c) => c.type === 'spawn').map((c) => c.name), ['risingMoonEx', 'risingMoonEx2']);
    assert.ok(hitOf(cues, 'risingMoonEx'), `the first moon hits from ${gap} px`);
    const second = hitOf(cues, 'risingMoonEx2');
    assert.ok(second, 'the second moon combos');
    assert.equal(second.react, 'spin');
    assert.equal(second.hits, 2);
    assert.equal(g.players[0].vars.moonmark, 1, 'a Moonmark, with no moonlight anywhere');
    const dmg = hp - g.players[1].health;
    assert.ok(dmg >= 1250 && dmg <= 1350, `about 1,300 (${dmg})`);
    // The mark makes R the Snap, zone or no zone.
    run(g, '5+R 5*2');
    assert.equal(g.players[0].state, 'moonSnap');
  }
  // Drawn 1.3 times the size.
  assert.equal(RAW.projectiles.risingMoonEx.sprite.scale / RAW.projectiles.moonOrbL.sprite.scale, 1.3);
});

test('Lunar Halo: 5 startup, 6 active, invincible frames 1-8; he rises with it and lands into his own landing; very unsafe on block', () => {
  for (const [input, id] of [['L', 'haloL'], ['M', 'haloM'], ['H', 'haloH'], ['LS', 'haloL_ex']]) {
    const g = setup(70);
    g.players[0].meter = 20000;
    const cues = run(g, `6 2 3+${input} 5*60`);
    const hit = hitOf(cues, id);
    assert.ok(hit, `${id} hits`);
    assert.equal(hit.at + 1, 5, `${id}: startup`);
    assert.ok(g.players[1].combo || g.players[1].lastCombo, 'a combo started');
    const st = A.states[id];
    assert.equal(st.frames.filter((f) => f.hit.length).length, 6, `${id}: 6 active frames`);
    assert.deepEqual([st.frames[3].sprite.index, st.frames[4].sprite.index, st.frames[7].sprite.index, st.frames[10].sprite.index], [1, 2, 3, 4], 'the two hit drawings cover the active frames');
    for (let f = 0; f < 8; f++) assert.ok(st.frames[f].invStrike && st.frames[f].invThrow, `${id}: invincible on frame ${f + 1}`);
    assert.ok(!st.frames[8].invStrike, `${id}: not on frame 9`);
    // The box reaches as far behind him as in front.
    const boxes = st.frames[4].hit;
    const left = Math.min(...boxes.map((b) => b[0])), right = Math.max(...boxes.map((b) => b[0] + b[2]));
    assert.equal(left, -right, `${id}: the same both sides`);
  }
  assert.deepEqual(RAW.moves.find((m) => m.id === 'haloL').sprite.holds.slice(0, 5), [2, 2, 3, 3, 6]);
  // He leaves the ground on drawing 2, is lifted over drawings 2-4, falls on drawing 6 and lands into drawings 7-8.
  const w = setup(900);
  const p = w.players[0];
  let top = 0, firstUp = -1, landed = -1, len = 0;
  for (const raw of script('6 2 3+L 5*70')) {
    step(w, [raw, 0], W);
    if (p.state === 'haloL') { if (p.y > 0 && firstUp < 0) firstUp = p.frame; top = Math.max(top, p.y); }
    if (p.state === 'haloLand' && landed < 0) landed = len;
    if (p.state === 'haloL' || p.state === 'haloLand') len++;
  }
  assert.equal(firstUp, 2, 'off the ground on drawing 2');
  assert.equal(top, px(88));
  assert.equal(A.states.haloL.frames[10].sprite.index, 4, 'at the top on drawing 5');
  assert.ok(landed > 16, 'he lands during drawing 6');
  assert.deepEqual(RAW.states.haloLand.sprite.holds, [8, 6]);
  assert.equal(len, 38, 'the whole move on a miss');
  assert.equal(p.state, 'idle');
  // Bigger by version.
  const reach = (id) => Math.max(...A.states[id].frames.find((f) => f.hit.length).hit.map((b) => b[0] + b[2]));
  assert.ok(reach('haloL') < reach('haloM') && reach('haloM') < reach('haloH'));
  assert.equal(reach('haloH'), reach('haloL_ex'));
  assert.deepEqual([RAW.effects.haloBurstL.sprite.scale, RAW.effects.haloBurstM.sprite.scale, RAW.effects.haloBurstH.sprite.scale].map((s) => s / RAW.effects.haloBurstM.sprite.scale), [0.7, 1, 1.3]);
  assert.deepEqual(RAW.effects.haloBurstM.holds, [2, 2, 3, 3, 3, 4, 4, 4]);
  // A cross-up: the opponent is behind him when it comes out, and is still hit.
  const g = setup(70);
  const cues = run(g, '6 2 3+M');
  g.players[1].x = g.players[0].x - px(70); // they cross over him as it starts
  cues.push(...run(g, '5*30'));
  assert.ok(hitOf(cues, 'haloM'), 'hits a fighter behind him');
  // Blocked (crouching): the attacker is stuck about 19 frames longer than the defender.
  const b = setup(70);
  let lastA = -1, lastD = -1;
  const a = script('6 2 3+M 5*90'), d = script('3*100');
  for (let i = 0; i < 100; i++) {
    step(b, [a[i] ?? 0, d[i] ?? 0], W);
    if (b.players[0].state === 'haloM' || b.players[0].state === 'haloLand') lastA = i;
    if (b.players[1].state === 'blockCrouch') lastD = i;
  }
  assert.ok(lastA > 0 && lastD > 0, 'it was blocked');
  assert.ok(lastD - lastA <= -15 && lastD - lastA >= -24, `on block: ${lastD - lastA}`);
});

test('Tide: the wave is released on frame 16 and hauled back on frame 25; a hooked opponent is pulled in close on the haul, still in hitstun', () => {
  assert.deepEqual(RAW.moves.find((m) => m.id === 'tideL').sprite.holds, [5, 5, 5, 4, 5, 6, 7, 6]);
  const reach = (b) => { const p = A.projectiles[`tideWave${b}`]; return (p.spawn[0] + p.speed * p.lifetime) / 100; };
  assert.ok(reach('L') < reach('M') && reach('M') < reach('H'));
  for (const [b, gap] of [['L', 200], ['M', 300], ['H', 420]]) {
    const st = A.states['tide' + b];
    assert.deepEqual([st.frames[15].sprite.index, st.frames[14].sprite.index, st.frames[24].sprite.index, st.frames[23].sprite.index], [3, 2, 5, 4], 'drawing 4 on frame 16, drawing 6 on frame 25');
    assert.equal(st.duration, 43);
    const g = setup(gap);
    const cues = run(g, '2 1 4+' + b + ' 5*30');
    const spawn = cues.find((c) => c.type === 'spawn');
    assert.equal(spawn.name, 'tideWave' + b);
    assert.equal(spawn.at + 1, 16, 'the wave leaves on drawing 4');
    const touch = hitOf(cues, 'tideWave' + b);
    assert.ok(touch, `${b} reaches ${gap} px`);
    const gapAtTouch = g.players[1].x - g.players[0].x;
    const haul = hitOf(cues, 'tide' + b);
    assert.ok(haul, `${b}: the haul lands on the hooked opponent`);
    assert.equal(haul.at + 1, 25, 'the pull starts on drawing 6');
    assert.ok(haul.i > touch.i, 'the wave first, then the haul');
    const end = cues.find((c) => c.type === 'projectileEnd');
    assert.equal(end.i, haul.i, 'the wave is drawn back on the same frame');
    assert.ok(gapAtTouch <= px(gap) + px(1), 'nobody was pushed away by the wave');
    run(g, '5*24');
    assert.equal(g.players[0].state, 'idle', 'he has recovered');
    assert.ok(g.players[1].x - g.players[0].x <= px(90), `${b}: dragged in close`);
    assert.ok(g.players[1].stun > 0 && g.players[1].combo, `${b}: still in hitstun for a follow-up`);
    assert.equal(g.players[1].combo.hits, 2);
  }
  // Out of reach: nothing happens. L does not reach where H does.
  const far = setup(420);
  const none = run(far, '2 1 4+L 5*60');
  assert.ok(!hitOf(none, 'tideWaveL') && !hitOf(none, 'tideL'));
  // Blocked: no hook, so the haul touches nothing.
  const blocked = run(setup(200), '2 1 4+M 5*60', '6*70');
  assert.ok(blocked.some((c) => c.type === 'block'));
  assert.ok(!hitOf(blocked, 'tideM'), 'a blocked wave pulls nobody');
  // Whether a wave catches a jumping opponent is one switch in its data (`hitsAirborne`; the owner's to set per wave).
  for (const on of [false, true]) {
    const raw = loadJSON(FILE);
    raw.projectiles.tideWaveM.hitsAirborne = on;
    raw.projectiles.tideWaveM.hitbox = [-40, 0, 80, 220];
    const def = compileCharacter(raw, SYSTEM);
    const w = loadWorld(def, def);
    const g = createGame(w);
    g.players[0].x = -px(150);
    g.players[1].x = px(150);
    const p1 = script('2 1 4+M 5*60'), p2 = script('5*8 8 5*90');
    let caught = false, landed = false;
    for (let i = 0; i < p1.length; i++) {
      step(g, [p1[i], p2[i] ?? 0], w);
      if (!landed && g.cues.some((c) => c.type === 'hit')) { caught = g.players[1].y > 0; landed = true; }
    }
    assert.equal(caught, on, on ? 'switch on: caught in the air' : 'switch off: the wave passes under a jump');
  }
  assert.equal(A.projectiles.tideWaveEx.move.hitsAirborne, true, 'EX always catches airborne opponents');
});

test('Tide EX: one bar, a bigger wave; it pulls them in and spins them; about 1,200 damage', () => {
  const g = setup(250);
  g.players[0].meter = 20000;
  const hp = g.players[1].health;
  const cues = run(g, '2 1 4+MS 5*120');
  assert.ok(g.players[0].meter < 20000 && g.players[0].meter >= 10000, 'one bar spent (the hits give some back)');
  assert.ok(hitOf(cues, 'tideWaveEx'));
  const haul = hitOf(cues, 'tideM_ex');
  assert.ok(haul, 'the haul');
  assert.equal(haul.react, 'spin');
  const dmg = hp - g.players[1].health;
  assert.ok(dmg >= 1150 && dmg <= 1250, `about 1,200 (${dmg})`);
  assert.equal(RAW.projectiles.tideWaveEx.sprite.scale / RAW.projectiles.tideWaveL.sprite.scale, 1.3);
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
  assert.deepEqual(A.rite.moves, ['moonlit5', 'moonlit6', 'moonlit2', 'moonlitJ', 'moonSnap']);
  // Cast on frame 9 on the ground (4, 4, then the cast drawing), on frame 5 in the air.
  for (const id of ['moonlit5', 'moonlit6', 'moonlit2']) assert.deepEqual([A.states[id].move.startup, A.states[id].duration, RAW.moves.find((m) => m.id === id).timeline[0].at, A.states[id].frames[8].sprite.index], [9, 30, 8, 2], id);
  assert.deepEqual([A.states.moonlitJ.move.startup, A.states.moonlitJ.duration, RAW.moves.find((m) => m.id === 'moonlitJ').timeline[0].at, A.states.moonlitJ.frames[4].sprite.index], [5, 16, 4, 1]);
  assert.equal(A.rite.gauge, null);
});

test('Moonlit: a hit on an opponent in the light marks them; only there; and they fall slower there', () => {
  // In the light.
  let g = setup(110); // close enough for the jab, and still inside the light placed 150 px ahead
  run(g, '5+R 5*40 5+L 5*12');
  assert.equal(g.players[0].vars.moonmark, 1, 'marked');
  // Outside it (the crescent is placed far away).
  g = setup(100);
  run(g, '6+R 5*40 5+L 5*12');
  assert.ok(g.players[1].lastCombo || g.players[1].combo, 'the jab landed');
  assert.equal(g.players[0].vars.moonmark, 0, 'no mark outside the light');
  // A blocked hit does not mark.
  g = setup(110); // close enough for the jab, and still inside the light placed 150 px ahead
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

test('Moonlit Snap: R with a mark is the moonbeam (snap drawing on 9, the hit on 14 = the beam\'s third frame; small damage; uses the mark; once per combo)', () => {
  const g = setup(110); // close enough for the jab, and still inside the light placed 150 px ahead
  run(g, '5+R 5*40 5+H 5*13');
  const hp = g.players[1].health;
  const cues = run(g, '5+R 5*36'); // pressed in 5H's hitstop: it comes out when the freeze ends
  const hit = hitOf(cues, 'moonSnap');
  assert.ok(hit, 'the beam hits');
  assert.equal(g.players[0].vars.moonmark, 0, 'the mark is used up');
  assert.ok(hp - g.players[1].health > 0 && hp - g.players[1].health <= 300, 'small damage');
  assert.equal(g.players[1].combo.hits, 2, 'it combos from 5H');
  assert.equal(hit.at + 1, 14, 'the hit lands on frame 14');
  const beam = cues.find((c) => c.type === 'spawn' && c.name === 'moonbeam');
  assert.equal(beam.at + 1, 9, 'the beam starts on the snap drawing');
  assert.equal(A.states.moonSnap.frames[8].sprite.index, 2);
  assert.deepEqual(RAW.projectiles.moonbeam.anim.release.slice(0, 2), [3, 2], 'two beam frames (5 game frames) before the hit');
  assert.equal(A.states.moonSnap.move.perCombo, 1, 'once per combo');
  assert.ok(cues.some((c) => c.type === 'spawn' && c.name === 'moonbeam'));
  assert.ok(g.projectiles.some((p) => p.kind === 'crescent'), 'the crescent stays');
  // It strikes wherever they are.
  const far = setup(110); // close enough for the jab, and still inside the light placed 150 px ahead
  run(far, '5+R 5*40 5+L 5*30');
  far.players[1].x = far.players[0].x + px(800);
  assert.ok(hitOf(run(far, '5+R 5*18'), 'moonSnap'), 'from across the screen');
});

test('Moonlit: the crescent fades by itself, starts the cooldown and clears the mark', () => {
  const g = setup(110); // close enough for the jab, and still inside the light placed 150 px ahead
  run(g, '5+R 5*40 5+L 5*12');
  assert.equal(g.players[0].vars.moonmark, 1);
  const life = RAW.projectiles.crescent.lifetime;
  run(g, `5*${life}`);
  assert.equal(g.projectiles.length, 0);
  assert.equal(g.players[0].vars.moonmark, 0);
  assert.ok(g.players[0].vars.moonCooldown > 0);
  assert.equal(RAW.projectiles.crescent.onEnd.setVar.moonCooldown, 240);
  // During the cooldown R does nothing; after 240 frames it works again.
  const c2 = run(g, '5*20 5+R 5*30');
  assert.ok(!c2.some((c) => c.type === 'spawn'), 'still cooling down');
  const c3 = run(g, '5*200 5+R 5*12');
  assert.ok(c3.some((c) => c.type === 'spawn' && c.name === 'crescent'), 'ready again after 240 frames');
  // The light: 3 drawings in, 4 looping while it lasts, 3 out.
  assert.deepEqual(RAW.projectiles.crescent.anim, { release: [4, 4, 4], loop: [6, 6, 6, 6], impact: [4, 4, 4] });
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
  for (const slot of ['drawn', 'full-moon', 'lantern-phase']) assert.ok(waiting.some((n) => n.includes(`/${slot}-placeholder`)), `${slot} is marked as a placeholder`);
  for (const real of ['throw-forward', 'throw-back', 'throw-tech', '2L', '2H', 'lunar-halo-land', 'moonlit-5', 'moonlit-2', 'moonlit-j', 'moon-snap', 'moonmark', 'hit-stand', 'hit-crouch', 'hit-air', 'tumble', 'knockdown', 'wakeup', 'idle', 'crouch', '5L', '5H', 'rising-moon', 'moon', 'lunar-halo', 'halo-burst', 'tide', 'tide-wave', 'crescent', 'moonbeam', 'new-moon']) assert.ok(names.has(`sheets/${real}.png`), `${real} uses the owner's art`);
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
  for (const [motion, id, kind] of [['2 3 6+L', 'risingMoonL', 'moonOrbL'], ['2 1 4+L', 'tideL', 'tideWaveL']]) {
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
  const g = setup(110); // close enough for the jab, and still inside the light placed 150 px ahead
  run(g, '5+R 5*40 5+L 5*20');
  assert.equal(g.players[0].vars.moonmark, 1);
  run(g, '2 3 6+L 5*15 5+R 5*2');
  assert.equal(g.players[0].state, 'moonSnap');
});

// (Redrawn Nov 25 as ten drawings, an overhead swing: the hit drawing is now the fifth, and its arc is a layer effect.)
test('5H: the hit drawing (the fifth) comes up on the frame the hit lands, so it is the one held through hitstop', () => {
  const st = A.states['5H'];
  const first = st.frames.findIndex((f) => f.hit.length);
  assert.equal(A.sheets['5H'].count, 10, 'ten drawings');
  assert.equal(st.frames[first].sprite.index, 4, 'the fifth drawing on the first hitting frame');
  assert.equal(st.frames[first - 1].sprite.index, 3, 'the fourth just before it');
  assert.equal(st.frames.filter((f) => f.sprite.index === 4).length, st.move.active, 'it stays for the active frames');
  assert.equal(st.frames.length, 35, 'the move is as long as it was');
  assert.deepEqual(st.layers.map((l) => l.effect), ['pendulumArc'], 'its arc plays in step with the move, so it freezes in hitstop with him');
  assert.equal(A.effects.pendulumArc.sprite.count, 12, 'seven drawings of arc between empty cells: three before, two after');
  const g = setup(120);
  const p = g.players[0];
  let held = 0, hit = false;
  for (const raw of script('5+H 5*50')) {
    step(g, [raw, 0], W);
    if (g.cues.some((c) => c.type === 'hit')) hit = true;
    if (hit && p.state === '5H' && st.frames[p.frame].sprite.index === 4) held++;
  }
  assert.ok(hit);
  assert.ok(held >= st.move.hitstop, `held through the freeze (${held} frames, hitstop ${st.move.hitstop})`);
});

test('cut (owner, Nov 25): Air Crescent and Crescent Recall are gone, with everything only they used', () => {
  const text = fs.readFileSync(FILE, 'utf8');
  for (const gone of ['airCrescent', 'moonRecall', 'air-crescent', 'moon-recall', 'tidePull', 'Eclipse Drop', 'eclipseDrop', '"moonfall"', 'moonfallTrail', 'moonfallLand', 'moonfallRebound', 'sheets/moonfall']) assert.ok(!text.includes(gone), `${gone} is not in his file`);
  // j.236 is no special any more: no projectile comes out.
  let g = setup(700);
  assert.equal(run(g, '8 5*12 2 3 6+M 5*40').filter((c) => c.type === 'spawn').length, 0);
  // R with the light out and no mark does nothing: the light stays, no cooldown starts.
  g = setup(900);
  run(g, '5+R 5*40');
  const cues = run(g, '5+R 5*20');
  assert.equal(g.players[0].state, 'idle');
  assert.equal(cues.filter((c) => c.type === 'spawn' || c.type === 'projectileEnd').length, 0);
  assert.equal(g.projectiles.filter((p) => p.kind === 'crescent').length, 1, 'the light stays');
  assert.equal(g.players[0].vars.moonCooldown, 0);
});

// (Owner, Nov 25: 2H is no longer a slide. It was one from Nov 23 to Nov 25.)
test('2H sweeps in place: he does not travel forward, during the sweep or after it', () => {
  const g = setup(900);
  const p = g.players[0];
  const x0 = p.x;
  run(g, '2+H 2*20');
  assert.equal(p.x, x0, 'no travel during the sweep');
  const x1 = p.x;
  run(g, '2*30');
  assert.equal(p.x, x1, 'no drift after the sweep');
});

test('moonlight changes what a hit does (move field inZone): Rising Moon spins there at a heavy juggle cost; j.H spins an airborne fighter there', () => {
  const hits = (gap, s1, s2 = '') => { const g = setup(gap); return [run(g, s1, s2).filter((c) => c.type === 'hit' || c.type === 'counter'), g]; };
  // Rising Moon: a soft launch outside the light, spin inside it.
  let [h, g] = hits(200, '2 3 6+M 5*60');
  assert.equal(h[0].move, 'moonOrbM');
  assert.equal(h[0].react, 'normal');
  assert.equal(g.players[1].combo?.juggle ?? g.players[1].lastCombo.juggle, W.combo?.softLaunchCost ?? 3, 'the usual soft launch cost');
  [h, g] = hits(200, '5+R 5*40 2 3 6+M 5*30');
  assert.equal(h[0].react, 'spin', 'in the light it spins');
  assert.equal(g.players[1].combo.juggle, 4, 'and costs 4 of the juggle limit');
  assert.equal(g.players[0].vars.moonmark, 1, 'the light still marks them');
  for (const b of ['L', 'M', 'H']) assert.deepEqual(A.projectiles['moonOrb' + b].move.zoneHit, { hitReaction: 'spin', airReaction: null, juggleCost: 4 });
  // j.H: only an airborne fighter in the light is spun.
  [h] = hits(110, '5*14 8 5*14 5+H 5*40', '8 5*60');
  assert.equal(h[0].react, 'normal', 'airborne, no light');
  [h] = hits(110, '5+R 5*40 8 5*14 5+H 5*40', '5*27 8 5*60');
  assert.equal(h[0].react, 'spin', 'airborne in the light');
  [h] = hits(110, '5+R 5*40 8 5*22 5+H 5*40');
  assert.equal(h[0].react, 'normal', 'standing in the light');
  // The opponent's own light does nothing for them: only the attacker's zone counts.
  const mirror = setup(110);
  run(mirror, '5*60', '5+R 5*40'); // Player 2 places the light; it covers Player 1's side too
  const own = run(mirror, '8 5*14 5+H 5*40', '8 5*60').filter((c) => c.type === 'hit' && c.p === 0);
  assert.ok(own.length && own.every((c) => c.react === 'normal'), 'Player 1 hitting inside Player 2\'s light gets nothing from it');
  // A wrong reaction name is refused when the file loads.
  const bad = loadJSON(FILE);
  bad.moves.find((m) => m.id === 'j.H').inZone = { airReaction: 'twirl' };
  assert.throws(() => compileCharacter(bad, SYSTEM), /inZone/);
});

test('drawing-only settings for the specials: the Halo burst follows him and sits behind him; EX effects are 1.3x and gold', () => {
  for (const k of ['haloBurstL', 'haloBurstM', 'haloBurstH', 'haloBurstEx']) assert.deepEqual([RAW.effects[k].follow, RAW.effects[k].behind], [true, true], k);
  for (const s of [RAW.effects.haloBurstEx.sprite, RAW.projectiles.risingMoonEx.sprite, RAW.projectiles.risingMoonEx2.sprite, RAW.projectiles.tideWaveEx.sprite]) assert.match(s.tint, /^#[0-9a-f]{6}$/);
  for (const s of [RAW.projectiles.moonOrbL.sprite, RAW.projectiles.tideWaveL.sprite, RAW.effects.haloBurstH.sprite]) assert.equal(s.tint, undefined);
  assert.equal(+(RAW.effects.haloBurstEx.sprite.scale / RAW.effects.haloBurstH.sprite.scale).toFixed(2), 1.31);
});

test('none of his projectiles shares a name with a move (a hit is sized, shaken and given its effect by the name it carries)', () => {
  // (Malik's Spirit Orb does share one, on purpose so far: its punch and its orb count as one move in a combo.)
  const ids = new Set(RAW.moves.map((m) => m.id));
  for (const name of Object.keys(RAW.projectiles)) assert.ok(!ids.has(name), `projectile "${name}" is also a move`);
});

// Owner, Nov 25: 5H is a step forward, and its arc reaches past the lantern, so 5M into 5H connects from as far as 5M touches.
test('5H steps forward: 5M into 5H connects from the farthest range 5M reaches, on hit and on block', () => {
  const run = (gap, chain, block) => {
    const g = setup(gap);
    const seen = [];
    for (let f = 0; f < 90; f++) {
      const mine = f === 0 ? 32 : chain && f > 8 && f % 2 === 0 && g.players[0].state === '5M' ? 64 : 0;
      step(g, [mine, block && f >= 7 ? 2 : 0], W);
      for (const c of g.cues) if (c.type === 'hit' || c.type === 'counter' || c.type === 'block') seen.push(`${c.type} ${c.move}`);
    }
    return { seen, moved: g.players[0].x + px(gap) / 2 };
  };
  let far = 0;
  for (let gap = 60; gap < 400; gap += 2) if (run(gap, false, false).seen.length) far = gap;
  assert.ok(far > 100, `5M reaches (${far})`);
  const hit = run(far, true, false);
  assert.deepEqual(hit.seen, ['hit 5M', 'hit 5H']);
  assert.equal(hit.moved, px(66), 'he steps 66 px forward and stays there: 42 into the swing, 24 as the back foot comes up');
  const blocked = run(far - 10, true, true);
  assert.deepEqual(blocked.seen, ['block 5M', 'block 5H']);
});
