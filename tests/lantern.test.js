// Avner, the Lantern-Bearer (owner's brief, Nov 27): the lantern as its own object (src/core/relic.js), his two
// movesets, the Rite moves that set and command it, the specials that read it, and the limiters. Played in the real
// game. Numbers the brief fixes (frames, flames, timers) are checked exactly; the rest is tuning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../src/core/game.js';
import { px } from '../src/core/fixed.js';
import { enterState } from '../src/core/fighter.js';
import { runSyncTest } from '../src/net/sync-test.js';
import { loadWorld, loadChar, loadJSON, script, lcg } from './helpers.js';

const FILE = 'data/characters/avner/avner.toska.json';
const RAW = loadJSON(FILE);
const A = loadChar(FILE);
const W = loadWorld(A, 'data/characters/malik/malik.toska.json');
W.battle.maxGapUnits = 0;

function setup(gap = 200) {
  const g = createGame(W);
  g.players[0].x = -px(gap / 2);
  g.players[1].x = px(gap / 2);
  return g;
}
/** Run inputs (P1, P2); returns every cue with the frame of the run. */
function run(g, s, p2 = '') {
  const a = script(s), b = p2 ? script(p2) : [];
  const out = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    step(g, [a[i] ?? 0, b[i] ?? 0], W);
    for (const c of g.cues) out.push({ ...c, i });
  }
  return out;
}
const idle = (n) => `5*${n}`;
const L = (g) => g.players[0].relic;
const V = (g, k) => g.players[0].vars[k];
const sum = (a) => a.reduce((x, y) => x + y, 0);

test('the lantern starts in his hand with 3 flames; the old Moonlit Rite and Tide are gone, kept in the archive', () => {
  const g = setup();
  assert.equal(L(g).mode, 'hand');
  assert.equal(V(g, 'flames'), 3);
  assert.equal(V(g, 'lantern'), 0);
  const ids = RAW.moves.map((m) => m.id);
  for (const old of ['moonlit5', 'moonlit6', 'moonlit2', 'moonlitJ', 'moonSnap', 'tideL', 'tideM', 'tideH']) assert.ok(!ids.includes(old), `${old} is gone`);
  for (const k of ['moonmark', 'tideHook', 'moonCooldown']) assert.ok(!(k in RAW.mechanic.vars), `${k} is gone`);
  const arch = loadJSON('data/characters/_archive/avner_moonlit/avner.toska.json');
  for (const old of ['moonlit5', 'moonSnap', 'tideL']) assert.ok(arch.moves.some((m) => m.id === old), `${old} is archived`);
  assert.ok(!('relic' in createGame(loadWorld()).players[0]), 'a character without a relic has no relic state');
});

test('Rite frame data: every move is free on the brief\'s frame and releases or commands on its bracketed drawing', () => {
  const want = { riteHang: [20, 10], riteLob: [26, 8], riteSlide: [30, 10], riteLeave: [18, 8], riteRecall: [18, 8], ritePendulum: [16, 6], riteBeckon: [16, 6], pulseL: [24, 10] };
  for (const [id, [free, at]] of Object.entries(want)) {
    const st = A.states[id];
    assert.equal(st.frames.length, free, `${id} is free on ${free}`);
    assert.equal(sum(RAW.moves.find((m) => m.id === id).sprite.holds), free, `${id}: the drawings fill it`);
    const fires = st.onEnter.findIndex((ev) => ev.some((e) => e.type === 'relic' && A.relic.actions[e.value].type !== 'fx')); // (a pulse's glow starts 2 frames before it)
    assert.equal(fires + 1, at, `${id} acts on frame ${at}`);
  }
  // Moonstruck 12 / 4 / 20, hit on drawing 7.
  const ms = A.states.moonstruckL;
  assert.deepEqual([ms.move.startup, ms.move.active, ms.move.recovery], [12, 4, 20]);
  assert.equal(sum(RAW.moves.find((m) => m.id === 'moonstruckL').sprite.holds.slice(0, 6)), 11);
});

test('5R Hang: on frame 10 the lantern leaves his hand where the drawing had it, his rear foot stays put, it hangs in place by 12; he is free on 20 and his moveset is the empty-hand one', () => {
  const g = setup(400);
  const x0 = g.players[0].x;
  run(g, '5+R');
  run(g, idle(8)); // frames 2-9
  assert.equal(L(g).mode, 'hand');
  run(g, idle(1)); // frame 10
  assert.equal(L(g).mode, 'fly');
  const R = A.relic, shift = R.catch.shift;
  assert.equal(L(g).x, x0 + px(112), 'from where his hand had it in drawing 5');
  assert.equal(L(g).y, px(146));
  assert.equal(g.players[0].x, x0 + shift, 'his position moves to the empty-hand stance over the same rear foot');
  run(g, idle(2));
  assert.equal(L(g).mode, 'rest', 'in place on 12');
  assert.equal(L(g).height, 'mid');
  assert.equal(V(g, 'lantern'), 1);
  run(g, idle(8));
  assert.equal(g.players[0].state, 'riteHang', 'busy through frame 20');
  run(g, idle(1));
  assert.equal(g.players[0].state, 'idle', 'free after 20');
  run(g, '5+L');
  assert.equal(g.players[0].state, 'e5L', 'L is the empty-hand Palm Jab now');
  assert.equal(V(g, 'flames'), 3, 'setting it is free');
});

test('6R Lob arcs to mid-screen and hangs HIGH (in place on 22); 2R Slide stops LOW; j.R Leave stays where he was', () => {
  let g = setup(800);
  run(g, '6+R');
  run(g, idle(21));
  assert.equal(L(g).mode, 'rest');
  assert.equal(L(g).height, 'high');
  assert.ok(L(g).x - g.players[0].x > px(150), 'well out in front');
  g = setup(800);
  run(g, '2+R');
  run(g, idle(9 + 24));
  assert.equal(L(g).mode, 'rest');
  assert.equal(L(g).height, 'low');
  assert.equal(L(g).y, px(50));
  g = setup(800);
  run(g, `8 ${idle(8)} 5+R`);
  assert.equal(g.players[0].state, 'riteLeave');
  const y = g.players[0].y;
  run(g, idle(9));
  assert.equal(L(g).mode, 'rest');
  assert.ok(L(g).y > px(100) && L(g).y < y + px(200), 'left hanging in the air');
});

test('Recall: leaves on frame 8, flies home and is caught (the catch drawing starts the frame it arrives, never two lanterns); hold R to delay up to 40 frames', () => {
  let g = setup(800);
  run(g, `5+R ${idle(25)}`);
  assert.equal(V(g, 'lantern'), 1);
  run(g, '5+R');
  run(g, idle(6));
  assert.equal(L(g).mode, 'rest', 'still set through frame 7');
  run(g, idle(1)); // frame 8, R already released: it leaves at once
  assert.equal(L(g).mode, 'return');
  assert.equal(V(g, 'lantern'), 2);
  let caught = null;
  for (let i = 0; i < 60 && !caught; i++) { const c = run(g, idle(1)); if (c.some((x) => x.type === 'relicCaught')) caught = i; }
  assert.ok(caught !== null, 'it comes home');
  assert.equal(L(g).mode, 'hand');
  assert.equal(V(g, 'lantern'), 0);
  // Held: it waits while R stays down, at most 40 frames.
  g = setup(800);
  run(g, `5+R ${idle(25)}`);
  run(g, '5+R*47'); // the recall leaves its wait on its 8th frame; 39 more held
  assert.equal(L(g).mode, 'wait', 'held back through 40');
  run(g, '5+R');
  assert.equal(L(g).mode, 'return', 'not past 40');
  g = setup(800);
  run(g, `5+R ${idle(25)} 5+R*20`);
  assert.equal(L(g).mode, 'wait', 'still held back at 20');
});

test('Catch: standing free he plays the catch, his position moves back to the lantern stance over the same foot; busy, it simply snaps into his hand', () => {
  const g = setup(800);
  run(g, `5+R ${idle(25)} 5+R`);
  const before = g.players[0].x;
  let cues = [];
  for (let i = 0; i < 80 && L(g).mode !== 'hand'; i++) cues = run(g, idle(1));
  assert.equal(g.players[0].state, 'riteCatch', 'the Recall ends in the catch');
  assert.equal(g.players[0].x, before - A.relic.catch.shift);
  assert.ok(cues.some((c) => c.type === 'relicCaught' && c.played === 1));
  const g2 = setup(800);
  run(g2, `5+R ${idle(25)}`);
  // Dark and flying home while he is in the air: no catch, it is simply back.
  g2.players[0].vars.flames = 0;
  run(g2, '8');
  let y = null;
  for (let i = 0; i < 80 && y === null; i++) if (run(g2, '5').some((c) => c.type === 'relicCaught')) y = g2.players[0].y;
  assert.ok(y > 0, 'still in the air when it arrives');
  assert.equal(L(g2).mode, 'hand');
  assert.notEqual(g2.players[0].state, 'riteCatch');
});

test('flames relight one every 120 frames, only in his hand; at 0 it goes dark, comes home in about 30 frames, and cannot be set until a flame is back', () => {
  const g = setup(800);
  g.players[0].vars.flames = 1;
  run(g, idle(119));
  assert.equal(V(g, 'flames'), 1);
  run(g, idle(1));
  assert.equal(V(g, 'flames'), 2, 'relit at 120');
  // Set, then out of flames: dark, home by itself.
  g.players[0].vars.flames = 1;
  run(g, `5+R ${idle(25)}`);
  run(g, idle(200));
  assert.equal(V(g, 'flames'), 1, 'no relight while it is set');
  g.players[0].vars.flames = 0;
  const cues = run(g, idle(1));
  assert.ok(cues.some((c) => c.type === 'relicDark'));
  assert.equal(L(g).dark, 1);
  let n = 0;
  while (L(g).mode !== 'hand' && n < 60) { run(g, idle(1)); n++; }
  assert.ok(n >= 28 && n <= 32, `home in ${n} frames`);
  run(g, '5+R');
  assert.notEqual(g.players[0].state, 'riteHang', 'no flame: it cannot be set');
});

test('a set lantern comes home by itself after 480 frames', () => {
  const g = setup(800);
  run(g, `5+R ${idle(9)}`); // frame 10: set
  assert.equal(L(g).mode, 'fly');
  let n = 1;
  while (L(g).mode !== 'return' && n < 600) { run(g, idle(1)); n++; }
  assert.equal(n, 480, 'home by itself 480 frames after it was set');
});

test('struck by the opponent: it loses a flame, then cannot be struck again for 20 frames', () => {
  const g = setup(300);
  run(g, `5+R ${idle(20)}`);
  // Put the opponent's 5H right on the lantern.
  const o = g.players[1];
  o.x = L(g).x + px(60);
  o.facing = -1;
  const cues = [];
  for (let i = 0; i < 40; i++) cues.push(...run(g, idle(1), i === 0 || i === 12 ? '5+H' : '5'));
  assert.equal(cues.filter((c) => c.type === 'relicStruck').length, 1, 'once, and not again inside 20 frames');
  assert.equal(cues.filter((c) => c.type === 'relicFlame' && c.why === 'struck').length, 1, 'one flame');
});

test('Avner hit while it is set: it loses a flame and stops what it was doing (the pendulum)', () => {
  const g = setup(160);
  run(g, `5+R ${idle(20)} 2+R ${idle(8)}`);
  assert.equal(L(g).mode, 'pendulum');
  assert.equal(V(g, 'flames'), 2, 'the pendulum cost a flame');
  g.players[1].x = g.players[0].x + px(80);
  run(g, idle(14), `5+L ${idle(13)}`);
  assert.equal(V(g, 'flames'), 1);
  assert.equal(L(g).mode, 'rest', 'stopped');
});

test('2R Pendulum: one flame, swings 120 frames, 4 hits at the bottom of each pass, the first on his frame 16', () => {
  const g = setup(200);
  run(g, `5+R ${idle(20)}`);
  g.players[1].x = L(g).x + px(30);
  const hits = [];
  const cues = run(g, `2+R ${idle(140)}`, '5*141');
  for (const c of cues) if ((c.type === 'hit' || c.type === 'block' || c.type === 'counter') && c.move === 'relic:ritePendulum') hits.push(c.i);
  void hits;
  const all = cues.filter((c) => (c.type === 'hit' || c.type === 'counter' || c.type === 'witness') && String(c.move).startsWith('relic:'));
  assert.equal(all.length, 4, `4 hits (${all.map((c) => c.i)})`);
  assert.equal(all[0].i + 1, 16, 'first on 16');
});

test('214 Moonstruck: marks on hit and on block, slides them away on hit, -4 on block, cancels into 2R Slide on hit only', () => {
  let g = setup(160);
  const cues = run(g, `2 1 4+L ${idle(40)}`);
  assert.ok(cues.some((c) => c.type === 'hit' && c.move === 'moonstruckL'));
  assert.ok(V(g, 'mark') > 250, 'marked');
  g = setup(160);
  run(g, `2 1 4+L ${idle(40)}`, '4*60');
  assert.ok(V(g, 'mark') > 250, 'marked on block too');
  // Cancel into 2R on hit.
  g = setup(160);
  run(g, `2 1 4+L ${idle(22)} 2+R 5`); // after the hit's hitstop
  assert.equal(g.players[0].state, 'riteSlide');
  g = setup(160);
  run(g, `2 1 4+L ${idle(22)} 2+R 5`, '4*60');
  assert.notEqual(g.players[0].state, 'riteSlide', 'not on block');
});

test('214 Pulse (set): near the lantern it always hits and pops them toward him (1 flame); far, only a marked opponent, using the mark; a blocked pulse marks and costs nothing', () => {
  let g = setup(800);
  run(g, `5+R ${idle(20)}`);
  g.players[1].x = L(g).x + px(40);
  let cues = run(g, `2 1 4+L ${idle(30)}`);
  const h = cues.find((c) => c.type === 'hit' && c.move === 'relic:pulse');
  assert.ok(h, 'hits near');
  assert.equal(V(g, 'flames'), 2);
  // Far and unmarked: nothing.
  g = setup(800);
  run(g, `5+R ${idle(20)}`);
  g.players[1].x = L(g).x + px(300);
  cues = run(g, `2 1 4+L ${idle(30)}`);
  assert.ok(!cues.some((c) => c.type === 'hit' && c.move === 'relic:pulse'), 'no hit far away');
  assert.equal(V(g, 'flames'), 3);
  // Far and marked: hits, the mark is used.
  g = setup(800);
  run(g, `5+R ${idle(20)}`);
  g.players[1].x = L(g).x + px(300);
  g.players[0].vars.mark = 200;
  cues = run(g, `2 1 4+L ${idle(30)}`);
  assert.ok(cues.some((c) => c.type === 'hit' && c.move === 'relic:pulse'), 'a marked opponent is hit far away');
  assert.equal(V(g, 'mark'), 0, 'mark used');
  // Blocked: marks, no flame.
  g = setup(800);
  run(g, `5+R ${idle(20)}`);
  g.players[1].x = L(g).x + px(40);
  cues = run(g, `2 1 4+L ${idle(30)}`, '6*60');
  assert.ok(cues.some((c) => c.type === 'block' && c.move === 'relic:pulse'), 'blocked');
  assert.equal(V(g, 'flames'), 3);
  assert.ok(V(g, 'mark') > 250);
});

test('623 Rising Moon: invincible only with the lantern in hand; set, a second moon rises from the lantern (1 flame)', () => {
  const inv = (id) => A.states[id].frames.slice(0, 8).every((f) => f.invStrike);
  assert.ok(inv('haloL') && inv('haloM') && inv('haloH'));
  assert.ok(!A.states.haloSetL.frames.some((f) => f.invStrike) && !A.states.haloSetH.frames.some((f) => f.invStrike));
  const g = setup(800);
  run(g, `5+R ${idle(20)}`);
  g.players[1].x = L(g).x + px(20);
  const cues = run(g, `6 2 3+L ${idle(30)}`);
  assert.ok(cues.some((c) => c.type === 'relicFx'), 'the second moon');
  assert.ok(cues.some((c) => c.type === 'hit' && c.move === 'relic:moon'), 'and it hits from the lantern');
  assert.equal(V(g, 'flames'), 2);
});

test('236 Crescent: through a set lantern it becomes the Full Crescent (1 flame, 2 hits); low lantern: along the floor; high: down from above; homes on a marked opponent', () => {
  const through = (rite, wait, gapAfter) => {
    const g = setup(600);
    run(g, `${rite} ${idle(wait)}`);
    g.players[1].x = L(g).x + px(gapAfter);
    const cues = run(g, `2 3 6+H ${idle(60)}`);
    return { g, cues, made: cues.find((c) => c.type === 'relicCrescent') };
  };
  const low = through('2+R', 40, 150);
  assert.ok(low.made, 'a low lantern turns it');
  assert.equal(low.made.height, 'low');
  assert.equal(V(low.g, 'flames'), 2);
  const hang = through('5+R', 20, 150);
  assert.ok(hang.made, 'a hanging lantern turns it');
  const hits = hang.cues.filter((c) => (c.type === 'hit' || c.type === 'counter') && c.move === 'fullCrescent');
  assert.equal(hits.length, 2, `two hits (${hits.length})`);
});

test('236 with the lantern set or coming home is the Sliver: the shot leaves on frame 13, he is free on 36, 0.8x the speed and 0.7x the damage of the Crescent, one hit; in hand it is still Rising Moon', () => {
  for (const b of ['L', 'M', 'H']) {
    const st = A.states['sliver' + b], s = RAW.projectiles['sliver' + b], c = RAW.projectiles['moonOrb' + b];
    assert.equal(st.frames.length, 36, `sliver${b} is free on 36`);
    assert.equal(sum(RAW.moves.find((m) => m.id === 'sliver' + b).sprite.holds), 36, `sliver${b}: the drawings fill it`);
    assert.equal(st.onEnter.findIndex((ev) => ev.some((e) => e.type === 'spawn')) + 1, 13, `sliver${b} shoots on frame 13`);
    assert.equal(s.speed / c.speed, 0.8);
    assert.equal(s.damage / c.damage, 0.7);
    assert.equal(s.hits ?? 1, 1);
    assert.equal(s.bend.into, 'fullCrescent', 'through a set lantern it becomes the Full Crescent');
  }
  const which = (before) => {
    const g = setup(600);
    if (before) run(g, before);
    run(g, '2 3 6+L');
    return g.players[0].state;
  };
  assert.equal(which(''), 'risingMoonL', 'in hand');
  assert.equal(which(`5+R ${idle(30)}`), 'sliverL', 'set');
  const g = setup(600);
  run(g, `6+R ${idle(40)} 5+R ${idle(18)}`);
  assert.equal(V(g, 'lantern'), 2, 'coming home');
  run(g, '2 3 6+L');
  assert.equal(g.players[0].state, 'sliverL', 'coming home');
  run(g, idle(12));
  assert.ok(g.projectiles.some((q) => q.owner === 0 && q.kind === 'sliverL'), 'the shot is out');
});

test('6H (empty hand) data: on an airborne opponent it spikes them into a slide toward the lantern, once per combo, then a plain knockdown (played in the route test below)', () => {
  const m = A.states.e6H.move;
  assert.equal(m.airReaction, 'slide');
  assert.equal(m.slideTo, 'relic');
  assert.deepEqual([m.slideLimit.perCombo, m.slideLimit.then], [1, 'softKD']);
  assert.equal(m.guard, 'high');
});

test('normals: empty-hand frame data is the brief\'s, they jump-cancel on hit, and the lantern 6H is 22 / 4 / 22 overhead', () => {
  const want = { e5L: [5, 2, 9], e5M: [8, 3, 14], e5H: [11, 4, 19], e4H: [13, 4, 20], e6H: [24, 4, 22], e5S: [10, 4, 22], e2L: [5, 2, 9], e2M: [8, 3, 15], e2H: [10, 5, 22], e3H: [12, 3, 22], 'ej.L': [5, 3, 10], 'ej.M': [7, 4, 14], 'ej.H': [10, 5, 18], lantern6H: [22, 4, 22] };
  for (const [id, [s, a, r]] of Object.entries(want)) {
    const st = A.states[id];
    assert.deepEqual([st.move.startup, st.move.active, st.move.recovery], [s, a, r], id);
    assert.equal(st.frames.length, s - 1 + a + r, `${id} length`);
    assert.equal(sum(RAW.moves.find((m) => m.id === id).sprite.holds), st.frames.length, `${id}: drawings fill it`);
    assert.equal(st.frames.findIndex((f) => f.hit.length), s - 1, `${id} first active`);
    if (id.startsWith('e')) assert.ok(st.cancels.some((c) => c.into.has('#jump') && c.hit && !c.block), `${id} jump-cancels on hit`);
  }
  for (const id of ['e2L', 'e2M', 'e3H']) assert.equal(A.states[id].move.guard, 'low', `${id} hits low`);
  for (const id of ['e6H', 'ej.H', 'lantern6H']) assert.equal(A.states[id].move.guard, 'high', `${id} is an overhead`);
  // Upper body invincible: 4H on 7-16 (only hurtboxes below the chest). 2H was too (5-14) until the owner redrew its
  // hurtboxes in the editor (Nov 27, kept at his word): from frame 5 it is hittable up to 150 px.
  const low = (id, a, b) => { for (let f = a - 1; f < b; f++) assert.ok(A.states[id].frames[f].hurt.every((h) => h[1] + h[3] <= px(95)), `${id} frame ${f + 1}`); };
  low('e4H', 7, 16);
  assert.deepEqual(RAW.moves.find((m) => m.id === 'e2H').timeline.find((e) => e.at === 4).hurt, [[-38, 0, 121, 150]], 'e2H: the owner\'s hurtbox from frame 5');
});

test('the pulse after the first in a combo launches lower and does 0.8 of the damage; hitting a sliding opponent does not use the OTG allowance', () => {
  const P = A.relic.actions.pulse.hit;
  assert.equal(P.repeatDamage, 8000);
  assert.equal(P.repeatLaunch, 8000);
  // A sliding fighter is not on the floor: the slide state is airborne in the engine, so no OTG is spent.
  assert.notEqual(W.chars[1].states.slide.stance, 'floor');
});

test('the lantern is part of the game state: rollback replays a lantern fight exactly', () => {
  const r = lcg(7);
  const B = ['', '+L', '+M', '+H', '+R'], D = ['5', '6', '4', '2', '3', '1'];
  const frames = Array.from({ length: 600 }, () => D[r() % D.length] + (r() % 3 === 0 ? B[r() % B.length] : ''));
  const a = script(frames.join(' ')), b = script(frames.slice().reverse().join(' '));
  const res = runSyncTest(W, (f) => [a[f] ?? 0, b[f] ?? 0], { frames: 600 });
  assert.ok(res.ok ?? !res.desync, JSON.stringify(res).slice(0, 300));
});

test('the brief\'s main route connects mid-screen: L > M > H > 214 > 2R Slide > 214 pulse > 6H spike > 214 pulse; flames 3 > 2 > 1; the second pulse launches lower', () => {
  const g = setup(90);
  const pulses = [];
  let f = 0;
  const tick = (raw) => {
    step(g, [raw, 0], W);
    f++;
    for (const c of g.cues) if (c.type === 'hit' && c.move === 'relic:pulse') pulses.push({ vy: g.players[1].vy, flames: V(g, 'flames') });
  };
  // Press each input on the first frame its move comes out (released between tries), as a player buffering it would.
  const act = (input, want) => {
    for (let t = 0; t < 60; t++) {
      for (const r of script(input)) tick(r);
      if (g.players[0].state === want) return;
      tick(0);
      if (g.players[0].state === want) return;
    }
    assert.fail(`${want} did not come out (frame ${f})`);
  };
  for (const [input, want] of [['5+L', '5L'], ['5+M', '5M'], ['5+H', '5H'], ['2 1 4+L', 'moonstruckL'], ['2+R', 'riteSlide'], ['2 1 4+L', 'pulseL'], ['6+H', 'e6H'], ['2 1 4+L', 'pulseL']]) {
    act(input, want);
    assert.ok(g.players[1].combo || want === '5L', `the combo is still going at ${want}`);
  }
  for (let i = 0; i < 40; i++) tick(0);
  assert.equal(pulses.length, 2, 'both pulses hit');
  assert.deepEqual(pulses.map((p) => p.flames), [2, 1], 'flames 3 > 2 > 1');
  assert.ok(pulses[1].vy < pulses[0].vy, `the second pulse launches lower (${pulses[0].vy} then ${pulses[1].vy})`);
});

test('the rekka\'s full moon throws them at a set lantern; they bounce back off it for a pickup (1 flame); a marked opponent floats longer and the mark is used', () => {
  const bounce = (mark) => {
    const g = setup(600);
    run(g, `6+R ${idle(30)}`); // lobbed: hanging high, out in front
    g.players[0].x = L(g).x - px(270);
    g.players[1].x = L(g).x - px(160);
    g.players[0].vars.mark = mark;
    const cues = run(g, `9 ${idle(8)} 2 3 6+L ${idle(12)} 2 3 6+L ${idle(12)} 2 3 6+L ${idle(10)}`);
    const full = cues.findIndex((c) => c.type === 'hit' && c.move === 'fullPhaseL');
    assert.ok(full >= 0, 'the full moon hits');
    const before = g.players[1].x;
    let b = null;
    for (let i = 0; i < 60 && !b; i++) b = run(g, idle(1)).find((c) => c.type === 'relicBounce');
    assert.ok(b, 'they reach the lantern and bounce');
    const after = run(g, idle(4));
    void after;
    assert.ok(g.players[1].vx < 0, 'back off it, toward Avner');
    void before;
    return { g, b };
  };
  const plain = bounce(0);
  assert.equal(V(plain.g, 'flames'), 2, 'one flame');
  const marked = bounce(200);
  assert.equal(marked.b.marked, 1);
  assert.equal(V(marked.g, 'mark'), 0, 'mark used');
});

// Beckon (owner, Nov 28): 6R with the lantern set calls it straight to where the opponent stands, hitting once on the
// way; it stays set where it stops. One flame, once per combo. Pendulum holds a spot; Beckon moves it.
test('6R Beckon: the lantern flies to where the opponent stood, hits once, and stays set there; one flame; free on 16', () => {
  const g = setup(400);
  run(g, `5+R ${idle(25)}`);
  assert.equal(L(g).mode, 'rest');
  const ox = g.players[1].x;
  const cues = run(g, `6+R ${idle(40)}`);
  assert.equal(A.states.riteBeckon.frames.length, 16, 'free on 16');
  assert.ok(cues.some((c) => c.type === 'relicBeckon'), 'called');
  const hits = cues.filter((c) => (c.type === 'hit' || c.type === 'counter' || c.type === 'witness') && c.move === 'relic:beckon');
  assert.equal(hits.length, 1, 'one hit');
  assert.equal(L(g).mode, 'rest', 'set again where it stopped');
  assert.equal(L(g).x, ox, 'where they stood when he called it');
  assert.equal(V(g, 'lantern'), 1);
  assert.equal(V(g, 'flames'), 2, 'one flame');
  assert.ok(g.players[1].x < ox, 'the hit pops them back toward him');
});

test('Beckon: not with the lantern in hand, not dark; 5R is still Recall', () => {
  let g = setup(400);
  run(g, '6+R');
  assert.equal(g.players[0].state, 'riteLob', 'in hand, 6R is still the Lob');
  g = setup(400);
  run(g, `5+R ${idle(25)} 5+R`);
  assert.equal(g.players[0].state, 'riteRecall');
  g = setup(400);
  run(g, `5+R ${idle(25)}`);
  g.players[0].vars.flames = 0;
  run(g, idle(1)); // out of flames: it goes dark and heads home
  run(g, '6+R');
  assert.notEqual(g.players[0].state, 'riteBeckon', 'no flame, no Beckon');
});

test('Beckon: once per combo (its lantern hit counts for the move), and a blocked one leaves the lantern by the opponent', () => {
  const g = setup(400);
  run(g, `5+R ${idle(25)}`);
  const cues = run(g, `6+R ${idle(17)} 6+R ${idle(10)}`);
  assert.equal(cues.filter((c) => c.type === 'hit' && c.move === 'relic:beckon').length, 1);
  assert.ok(g.players[1].combo, 'still in the combo');
  assert.ok(!cues.slice(18).some((c) => c.type === 'relicBeckon'), 'the second 6R in the same combo is refused');
  const b = setup(400);
  run(b, `5+R ${idle(25)}`);
  const ox = b.players[1].x;
  const bc = run(b, `6+R ${idle(30)}`, '3*40'); // crouch-blocking: walking back would take them out of its path
  assert.ok(bc.some((c) => c.type === 'block' && c.move === 'relic:beckon'), 'blocked');
  assert.ok(Math.abs(L(b).x - ox) <= px(10), 'the lantern now hangs right by them');
});

test('Beckon: Avner hit while it flies, or the lantern struck on its way, loses its hit', () => {
  // The opponent 300 px past the lantern swings 5H as it flies at them: struck on its way (frame 15), so no hit, and it
  // still lands where it was going.
  const g = setup(600);
  run(g, `5+R ${idle(25)}`);
  g.players[1].x = L(g).x + px(300);
  g.players[1].facing = -1;
  const cues = run(g, `6+R ${idle(30)}`, `${idle(6)} 5+H ${idle(30)}`);
  const struck = cues.find((c) => c.type === 'relicStruck');
  assert.ok(struck, 'struck');
  assert.ok(!cues.some((c) => ['hit', 'counter', 'witness', 'block'].includes(c.type) && c.move === 'relic:beckon'), 'struck on its way: no hit');
  assert.equal(L(g).mode, 'rest', 'set where it was going');
  assert.equal(V(g, 'flames'), 1, 'one flame for the Beckon, one for being struck');
  // Avner hit while it is on its way: no hit either.
  const h = setup(160);
  run(h, `5+R ${idle(25)}`);
  h.players[1].x = h.players[0].x + px(100);
  const hc = run(h, `6+R ${idle(30)}`, `5+L ${idle(30)}`);
  assert.ok(hc.some((c) => ['hit', 'counter', 'witness'].includes(c.type) && c.p === 1), 'Avner was hit');
  assert.ok(!hc.some((c) => ['hit', 'counter', 'witness', 'block'].includes(c.type) && c.move === 'relic:beckon'), 'and the Beckon lost its hit');
});
