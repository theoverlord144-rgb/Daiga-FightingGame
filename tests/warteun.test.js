// War'Teun (the owner's brief, Nov 26 2026): warps and the vacuums they leave, Resonance, Wiretap, Listen,
// Displacement, Tune and Swap. Every number is read from his file, so retuning him does not break these.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../src/core/game.js';
import { enterState } from '../src/core/fighter.js';
import { RAW } from '../src/core/input.js';
import { px } from '../src/core/fixed.js';
import { runSyncTest } from '../src/net/sync-test.js';
import { loadWorld, loadChar, loadJSON, script, lcg } from './helpers.js';

const FILE = loadJSON('data/characters/warteun/warteun.toska.json');
const WT = loadChar('data/characters/warteun/warteun.toska.json');
const MALIK = loadChar('data/characters/malik/malik.toska.json');
const W = loadWorld(WT, WT);
const WM = loadWorld(WT, MALIK);
for (const w of [W, WM]) w.battle.maxGapUnits = 0; // these tests place the fighters wherever they need them
const V = FILE.projectiles.vacuum;
const B = V.burst;
const HIT = ['hit', 'counter', 'witness'];
const GUARD = RAW.RIGHT | RAW.DOWN; // Player 2 crouch-blocking (standing would walk them out of range)
const rawMove = (id) => FILE.moves.find((m) => m.id === id);
const vacs = (g) => g.projectiles.filter((q) => q.kind === 'vacuum');

function setup(world, gap = 300) {
  const g = createGame(world);
  g.players[0].x = -px(gap / 2);
  g.players[1].x = px(gap / 2);
  return g;
}
/** P1 does `state` now and it is run through its frame number `frames` (frame 1 is the frame it begins on, so that
 *  is frames - 1 steps: a cue's `i` is then the move's own frame, counted from 0). With no state: `frames` steps. */
function play(g, world, state, frames, p2 = 0) {
  if (state) enterState(g.players[0], world.chars[0], state);
  const cues = [];
  const off = state ? 1 : 0;
  for (let i = off; i < frames; i++) { step(g, [0, typeof p2 === 'function' ? p2(i, g) : p2], world); for (const c of g.cues) cues.push({ ...c, i }); }
  return cues;
}

test("War'Teun: every move's drawings add up to its frame data, and the frame data is the brief's (5H and 6H slowed by the owner, Nov 26)", () => {
  const brief = { '5L': [5, 2, 9], '5M': [7, 3, 14], '5H': [16, 4, 18], '5S': [11, 4, 22], '6M': [20, 3, 16], '4H': [16, 3, 20], '6H': [20, 3, 24], '2L': [5, 2, 9], '2H': [12, 3, 24],
    'j.L': [5, 3, 10], 'j.M': [7, 4, 14], 'j.H': [10, 4, 18] };
  for (const [id, [s, a, r]] of Object.entries(brief)) {
    const m = rawMove(id);
    assert.deepEqual([m.startup, m.active, m.recovery], [s, a, r], id);
  }
  for (const m of FILE.moves) {
    if (m.startup === undefined || !m.sprite?.holds) continue;
    const sum = m.sprite.holds.slice(0, m.sprite.count).reduce((x, y) => x + y, 0);
    assert.equal(sum, WT.states[m.id].duration, `${m.id}: holds ${sum}, length ${WT.states[m.id].duration}`);
  }
  assert.equal(WT.stats.health, 10000);
  assert.equal(FILE.meter.archetype, 'trickster');
  assert.equal(rawMove('2M').startup + rawMove('2M').recovery - 1, 9 - 1 + 4 + 16, '2M lasts what the brief says (its active frames are the ripple)');
});

test('Vacuum: a warp leaves one where he stood, on the warp frame; it waits its fuse, pulls for the collapse, then bursts', () => {
  const g = setup(W, 1200);
  const a = g.players[0], d = g.players[1];
  const x0 = a.x;
  const warpAt = rawMove('5H').timeline.find((e) => e.warp).at;
  const fuse = rawMove('5H').timeline.find((e) => e.spawn).spawn.fuse;
  let cues = play(g, W, '5H', warpAt);
  assert.equal(vacs(g).length, 0, 'not before the warp frame');
  cues = play(g, W, null, 1);
  assert.equal(vacs(g).length, 1);
  const v = vacs(g)[0];
  assert.deepEqual([v.x, v.y], [x0, px(V.spawn[1])], 'at the spot he left');
  assert.equal(a.x, x0 + px(rawMove('5H').timeline.find((e) => e.warp).warp.x), 'and he is a step forward, at once');
  assert.ok(cues.some((c) => c.type === 'warp'));
  // He goes elsewhere; the opponent stands just inside its pull: nothing moves them during the fuse.
  a.x = x0 - px(450);
  d.x = x0 + px(B.pull.range - 10);
  const dx0 = d.x;
  play(g, W, null, fuse - 1);
  assert.equal(d.x, dx0, 'no pull during the fuse');
  // Collapse: pulled toward its centre, pull.speed a frame, for `collapse` frames. Then the burst.
  const seen = [];
  let burstAt = -1;
  for (let i = 0; i < B.collapse + 2 && burstAt < 0; i++) { step(g, [0, 0], W); seen.push(d.x); if (g.cues.some((c) => c.type === 'projBurst')) burstAt = i; }
  assert.equal(seen[0], dx0 - px(B.pull.speed), 'the first collapse frame pulls');
  assert.equal(burstAt, B.collapse, `the burst comes ${B.collapse} frames after the fuse ends`);
  assert.ok(Math.abs(seen[B.collapse - 1] - x0) < Math.abs(dx0 - x0), 'they ended nearer its centre');
  // The hit lands on the fire's second drawing: `delay` frames after the burst begins.
  assert.equal(B.delay, 1);
  assert.ok(!g.cues.some((c) => c.move === 'vacuum'), 'not on the first frame of the burst');
  for (let i = 0; i < B.delay; i++) step(g, [0, 0], W);
  assert.ok(g.cues.some((c) => HIT.includes(c.type) && c.move === 'vacuum'), 'and the burst hit them');
  assert.ok(d.health < WT.stats.health);
});

test('Vacuum: the burst is a mid that is blocked holding either way; out of range it pulls and hits nobody', () => {
  for (const hold of [RAW.LEFT, RAW.RIGHT]) {
    const g = setup(W, 1200);
    const x0 = g.players[0].x;
    play(g, W, 'warpStepL', 9);
    g.players[1].x = x0 + px(40);
    const cues = play(g, W, null, 40, hold);
    assert.ok(cues.some((c) => c.type === 'block' && c.move === 'vacuum'), `holding ${hold === RAW.LEFT ? 'left' : 'right'} blocks it`);
    assert.equal(g.players[1].health, WT.stats.health);
  }
  const g = setup(W, 1200);
  const cues = play(g, W, 'warpStepL', 60);
  assert.equal(g.players[1].x, px(600), 'far away: not pulled');
  assert.ok(!cues.some((c) => c.move === 'vacuum'));
  assert.equal(vacs(g).length, 0, 'and it is gone after its burst');
});

test('Vacuum: his dashes and air dash leave none; his warping normals, j.S and the special warps each leave one', () => {
  for (const s of ['dashF', 'backdash']) { const g = setup(W, 1000); play(g, W, s, 25); assert.equal(vacs(g).length, 0, s); }
  for (const s of ['airdashF', 'airdashB']) {
    const g = setup(W, 1000);
    g.players[0].y = px(200);
    const y = g.players[0].y;
    const cues = play(g, W, s, 8);
    assert.equal(vacs(g).length, 0, s);
    assert.equal(g.players[0].y, y, `${s} keeps his height`);
    assert.ok(cues.some((c) => c.type === 'warp'));
  }
  for (const s of ['5H', '6H', '4H', 'warpStepL', 'warpStepM', 'warpStepH', 'displacementM']) {
    const g = setup(W, 1000);
    const at = rawMove(s).timeline.find((e) => e.spawn).at;
    play(g, W, s, at + 1);
    assert.equal(vacs(g).length, 1, s);
  }
  for (const s of ['j.S', 'airWarpM']) {
    const g = setup(W, 1000);
    g.players[0].y = px(260);
    enterState(g.players[0], WT, 'fall');
    play(g, W, s, rawMove(s).timeline.find((e) => e.spawn).at + 1);
    assert.equal(vacs(g).length, 1, s);
    assert.ok(vacs(g)[0].y > px(200), `${s}: an air vacuum, up where he was`);
  }
  // The three Warp Steps: farther and a longer fuse by button.
  const fuses = ['L', 'M', 'H'].map((b) => rawMove(`warpStep${b}`).timeline.find((e) => e.spawn).spawn.fuse);
  const dists = ['L', 'M', 'H'].map((b) => rawMove(`warpStep${b}`).timeline.find((e) => e.warp).warp.x);
  assert.ok(fuses[0] < fuses[1] && fuses[1] < fuses[2]);
  assert.ok(dists[0] < dists[1] && dists[1] < dists[2]);
});

test("His ground dashes, done with real double taps, cover exactly Avner's distance and he does not slide", () => {
  const AVNER = loadChar('data/characters/avner/avner.toska.json');
  const WA = loadWorld(AVNER, AVNER);
  WA.battle.maxGapUnits = 0;
  for (const [name, taps, state] of [['forward', '6 5 6 5*70', 'dashF'], ['back', '4 5 4 5*70', 'backdash']]) {
    const travel = (world) => {
      const g = setup(world, 1200);
      const p = g.players[0];
      const x0 = p.x;
      const xs = [];
      let dashed = false;
      for (const r of script(taps)) { step(g, [r, 0], world); dashed = dashed || p.state === state; if (p.state === state) xs.push(p.x); }
      assert.ok(dashed, `${name}: the dash came out`);
      return { total: p.x - x0, xs };
    };
    const his = travel(W), avners = travel(WA);
    assert.equal(his.total, avners.total, `${name} dash: the same distance as Avner's`);
    // A teleport: during the dash he stands in one place, then in another. Never anything in between.
    assert.equal(new Set(his.xs).size, 2, `${name} dash: he does not slide`);
  }
});

test("2M's ripple travels along the floor and its picture travels with it", () => {
  const R = FILE.projectiles.ripple;
  assert.ok(!R.sprite.ground && !R.sprite.rooted, 'drawn on the moving hit, not pinned where it began');
  const g = setup(W, 1200);
  const seen = [];
  for (const r of script('2+M 2*60')) { step(g, [r, 0], W); const q = g.projectiles.find((x) => x.kind === 'ripple'); if (q) seen.push(q.x); }
  assert.ok(seen.length > 30);
  const went = (seen[seen.length - 1] - seen[0]) / 100;
  assert.ok(went > 280 && went < 360, `it runs about a third of the screen (${went} px)`);
  // It hits low, where its picture is.
  const h = setup(W, 300);
  const cues = [];
  for (const r of script('2+M 2*50')) { step(h, [r, 0], W); cues.push(...h.cues.map((c) => ({ ...c }))); }
  assert.ok(cues.some((c) => HIT.includes(c.type) && c.move === 'ripple'), 'it reaches a standing opponent 300 px away');
  const b = setup(W, 150); // nearer: holding back walks them away from it
  const blocked = [];
  for (const r of script('2+M 2*50')) { step(b, [r, RAW.RIGHT], W); blocked.push(...b.cues.map((c) => c.type)); }
  assert.ok(blocked.some((t) => HIT.includes(t)) && !blocked.includes('block'), 'standing guard does not stop it: it is a low');
});

test('5H and 6H step forward but never through the opponent: they stop in front', () => {
  for (const id of ['5H', '6H']) {
    const w = rawMove(id).timeline.find((e) => e.warp);
    assert.ok(w.warp.stop > 0, id);
    // Far away: the full step.
    const far = setup(W, 800);
    const x0 = far.players[0].x;
    play(far, W, id, w.at + 1);
    assert.equal(far.players[0].x, x0 + px(w.warp.x), `${id}: the whole step when nobody is in the way`);
    // Closer than the step: he stops `stop` px in front of them, on his own side.
    for (const gap of [w.warp.x + w.warp.stop - 30, w.warp.x, w.warp.stop + 20]) {
      const g = setup(W, gap);
      const a = g.players[0], d = g.players[1];
      play(g, W, id, w.at + 1);
      assert.equal(d.x - a.x, px(w.warp.stop), `${id} from ${gap} px: stops in front`);
    }
    // Already nearer than that: he does not move at all (never backward, never through).
    const g = setup(W, w.warp.stop - 10);
    const a = g.players[0], d = g.players[1];
    const before = d.x - a.x;
    play(g, W, id, w.at + 1);
    assert.ok(a.x < d.x && d.x - a.x >= before, `${id} up close: still in front`);
    // Facing left, the same.
    const m = setup(W, 100);
    [m.players[0].x, m.players[1].x] = [m.players[1].x, m.players[0].x];
    m.players[0].facing = -1; m.players[1].facing = 1;
    play(m, W, id, w.at + 1);
    assert.equal(m.players[0].x - m.players[1].x, px(w.warp.stop), `${id} facing left`);
  }
});

test('Vacuum: at most three wait at once; a fourth makes the oldest start its collapse', () => {
  const g = setup(W, 1600);
  const a = g.players[0];
  const at = rawMove('warpStepH').timeline.find((e) => e.spawn).at;
  for (let n = 0; n < B.limit; n++) { a.x = -px(700) + px(n * 20); play(g, W, 'warpStepH', at + 1); }
  assert.equal(vacs(g).length, B.limit);
  assert.ok(vacs(g).every((q) => q.age < q.fuse), 'all three still waiting');
  const oldest = vacs(g)[0];
  const due = oldest.boom;
  play(g, W, 'warpStepH', at + 1);
  assert.equal(vacs(g).length, B.limit + 1, 'the fourth is out');
  assert.ok(oldest.age >= oldest.fuse, 'the oldest is collapsing now');
  assert.ok(oldest.boom < due, 'so it bursts sooner than it would have');
  assert.equal(oldest.boom - oldest.fuse, B.collapse, 'after a full collapse');
  assert.ok(vacs(g).slice(1).every((q) => q.age < q.fuse), 'the others still wait');
});

test('Tune: every vacuum bursts on the strike; two close together burst as one, bigger; Resonance is spent on them', () => {
  const g = setup(W, 1600);
  const a = g.players[0];
  const at = rawMove('warpStepH').timeline.find((e) => e.spawn).at;
  const spots = [-700, -700 + B.resonate.gap - 20, 300];
  for (const x of spots) { a.x = px(x); play(g, W, 'warpStepH', at + 1); }
  a.x = px(-100);
  a.vars.resonance = 2 * FILE.mechanic.vars.resonance.per; // two levels
  const strike = rawMove('tune').timeline.find((e) => e.detonate).at;
  const cues = play(g, W, 'tune', strike + 1);
  const bursts = cues.filter((c) => c.type === 'projBurst');
  assert.equal(bursts.length, 2, 'two bursts: the close pair as one, and the far one');
  assert.ok(bursts.every((c) => c.i === strike), 'all on the frame the fork is struck');
  const [joined, alone] = bursts[0].joined ? bursts : [bursts[1], bursts[0]];
  assert.equal(joined.joined, 2);
  assert.equal(alone.joined, 0);
  const lvSize = 10000 + 2 * B.scale.sizePct * 100;
  assert.equal(alone.size, lvSize, 'Resonance 2: each level makes the burst bigger');
  assert.equal(joined.size, Math.trunc((lvSize * B.resonate.pct) / 100), 'and resonating multiplies that');
  assert.equal(joined.x, px(Math.trunc((spots[0] + spots[1]) / 2)), 'the joined burst sits between the two');
  assert.equal(a.vars.resonance, 0, 'Tune spends all of it');
  // Damage: level 2 and resonating.
  const g2 = setup(W, 1600);
  const b = g2.players[0];
  for (const x of [-700, -640]) { b.x = px(x); play(g2, W, 'warpStepH', at + 1); }
  b.x = px(-100);
  g2.players[1].x = px(-670);
  b.vars.resonance = 12;
  const hit = play(g2, W, 'tune', strike + 1 + B.delay).find((c) => HIT.includes(c.type) && c.move === 'vacuum');
  assert.ok(hit, 'the joined burst hit');
  const plain = (() => { const g3 = setup(W, 1600); g3.players[0].x = px(-700); play(g3, W, 'warpStepH', at + 1); g3.players[0].x = px(-100); g3.players[1].x = px(-670); return play(g3, W, 'tune', strike + 1 + B.delay).find((c) => c.move === 'vacuum').damage; })();
  assert.ok(hit.damage > plain * 2, `level 2 and joined (${hit.damage}) does far more than a plain burst (${plain})`);
  // No vacuums: only the animation, and Resonance is still spent.
  const g4 = setup(W, 600);
  g4.players[0].vars.resonance = 18;
  const none = play(g4, W, 'tune', WT.states.tune.duration);
  assert.ok(!none.some((c) => c.type === 'projBurst' || HIT.includes(c.type) || c.type === 'block'));
  assert.equal(g4.players[0].vars.resonance, 0);
});

test('Resonance: fills by a third for a normal and a half for a special, tops out at 3, drops a level after 3 seconds without a hit', () => {
  const R = FILE.mechanic.vars.resonance;
  assert.equal(R.max, 3 * R.per);
  assert.equal(rawMove('5L').onHit.vars.resonance * 3, R.per, 'a normal: a third of a level');
  assert.equal(rawMove('displacementL').onHit.vars.resonance * 2, R.per, 'a special: half a level');
  const g = setup(W, 120);
  const a = g.players[0];
  play(g, W, '5L', 12);
  assert.equal(a.vars.resonance, rawMove('5L').onHit.vars.resonance, 'one hit');
  a.vars.resonance = R.max - 1;
  g.players[1].x = a.x + px(120);
  play(g, W, '5M', 12);
  assert.equal(a.vars.resonance, R.max, 'never above 3 levels');
  // Blocked hits and whiffs add nothing.
  const gb = setup(W, 120);
  assert.ok(play(gb, W, '5L', 12, GUARD).some((c) => c.type === 'block'), 'it was blocked');
  assert.equal(gb.players[0].vars.resonance, 0, 'blocked: nothing');
  // Decay: a level after `after` frames without a hit, counted from the last hit.
  const g2 = setup(W, 900);
  const b = g2.players[0];
  b.vars.resonance = 14;
  play(g2, W, null, R.drain.after - 1);
  assert.equal(b.vars.resonance, 14, 'not yet');
  play(g2, W, null, 1);
  assert.equal(b.vars.resonance, 14 - R.drain.by, 'one level gone');
  play(g2, W, null, R.drain.after);
  assert.equal(b.vars.resonance, 14 - 2 * R.drain.by);
  play(g2, W, null, R.drain.after * 2);
  assert.equal(b.vars.resonance, 0, 'never below zero');
  // A hit restarts the count.
  const g3 = setup(W, 120);
  const c = g3.players[0];
  c.vars.resonance = 12;
  play(g3, W, null, R.drain.after - 30);
  play(g3, W, '5L', 40);
  assert.equal(c.vars.resonance, 12 + rawMove('5L').onHit.vars.resonance, 'the hit came in time and the count began again');
});

test('Wiretap: marks on hit and on block for 6 seconds; a marked opponent has Warp Step land behind them and is pulled from twice as far', () => {
  const T = FILE.mechanic.vars.wiretap.max;
  assert.equal(T, 360);
  for (const hold of [0, GUARD]) {
    const g = setup(W, 120);
    const cues = play(g, W, 'wiretapM', rawMove('wiretapM').startup + 1, hold);
    assert.ok(cues.some((c) => (hold ? c.type === 'block' : HIT.includes(c.type)) && c.i === rawMove('wiretapM').startup - 1), 'it lands on its hit frame');
    assert.ok(g.players[0].vars.wiretap >= T - 2, hold ? 'marked on block' : 'marked on hit');
    play(g, W, null, T - 3);
    assert.ok(g.players[0].vars.wiretap > 0);
    play(g, W, null, 5);
    assert.equal(g.players[0].vars.wiretap, 0, 'gone after 6 seconds');
  }
  // Warp Step: unmarked it travels its distance; marked it lands directly behind them, any version, facing them.
  for (const b of ['L', 'M', 'H']) {
    const w = rawMove(`warpStep${b}`).timeline.find((e) => e.warp);
    const g = setup(W, 1000);
    const a = g.players[0], d = g.players[1];
    const x0 = a.x;
    play(g, W, `warpStep${b}`, w.at + 1);
    assert.ok(a.x >= x0 + px(w.warp.x), `${b}: unmarked, it goes its own distance`);
    assert.ok(a.x < d.x);
    const g2 = setup(W, 1000);
    const a2 = g2.players[0], d2 = g2.players[1];
    a2.vars.wiretap = 200;
    const arrive = play(g2, W, `warpStep${b}`, w.at + 1).find((c) => c.type === 'warp');
    assert.equal(arrive.x, d2.x + px(w.warp.gap), `${b}: marked, directly behind them`);
    assert.equal(a2.facing, -1, 'facing them');
  }
  // The pull reaches twice as far while they are marked.
  const far = B.pull.range + 40;
  for (const marked of [false, true]) {
    const g = setup(W, 1500);
    const a = g.players[0], d = g.players[1];
    const x0 = a.x;
    if (marked) a.vars.wiretap = 300;
    play(g, W, 'warpStepL', 9);
    a.x = px(-100); // he walks off; the vacuum stays
    d.x = x0 + px(far);
    const before = d.x;
    play(g, W, null, rawMove('warpStepL').timeline.find((e) => e.spawn).spawn.fuse + 4);
    assert.equal(d.x < before, marked, marked ? 'marked: pulled from beyond the usual range' : 'unmarked: out of range');
  }
});

test('Listen: a strike in the window is caught (he warps behind and a vacuum bursts on the attacker); a throw or a projectile is not', () => {
  const win = rawMove('listenM').timeline.find((e) => e.catch);
  assert.deepEqual([win.from + 1, win.to + 1], [4, 24], 'frames 4 to 24');
  // A strike.
  const g = setup(WM, 110);
  const a = g.players[0], d = g.players[1];
  enterState(a, WT, 'listenM');
  for (let i = 0; i < 6; i++) step(g, [0, 0], WM);
  enterState(d, MALIK, '5L');
  const cues = [];
  for (let i = 0; i < 30; i++) { step(g, [0, 0], WM); for (const c of g.cues) cues.push({ ...c, i }); }
  assert.ok(cues.some((c) => c.type === 'catch'), 'caught');
  assert.equal(a.health, WT.stats.health, 'no damage');
  assert.ok(a.x > d.x, 'he is behind the attacker');
  const hit = cues.find((c) => HIT.includes(c.type) && c.move === 'vacuum');
  assert.ok(hit, 'the vacuum burst on the attacker');
  assert.ok(hit.i - cues.find((c) => c.type === 'catch').i <= 2 + B.delay, 'at once');
  assert.ok(d.health < MALIK.stats.health);
  // Before the window (frames 1-3) the strike just hits him.
  const g1 = setup(WM, 110);
  enterState(g1.players[1], MALIK, '5L');
  for (let i = 0; i < 2; i++) step(g1, [0, 0], WM);
  enterState(g1.players[0], WT, 'listenM');
  const early = [];
  for (let i = 0; i < 6; i++) { step(g1, [0, 0], WM); early.push(...g1.cues.map((c) => c.type)); }
  assert.ok(!early.includes('catch') && early.some((t) => HIT.includes(t)), 'too early: he is hit');
  // A throw goes through.
  const g2 = setup(WM, 70);
  enterState(g2.players[0], WT, 'listenM');
  for (let i = 0; i < 6; i++) step(g2, [0, 0], WM);
  enterState(g2.players[1], MALIK, '6H');
  const t = [];
  for (let i = 0; i < 14; i++) { step(g2, [0, 0], WM); t.push(...g2.cues.map((c) => c.type)); }
  assert.ok(t.includes('throw') && !t.includes('catch'), 'thrown out of it');
  assert.equal(g2.players[0].state, 'thrown');
  // A projectile goes through.
  const g3 = setup(WM, 300);
  enterState(g3.players[1], MALIK, 'spiritOrb');
  let shot = [];
  for (let i = 0; i < 70; i++) {
    if (g3.projectiles.length && g3.players[0].state === 'idle' && Math.abs(g3.projectiles[0].x - g3.players[0].x) < px(90)) enterState(g3.players[0], WT, 'listenM');
    step(g3, [0, 0], WM);
    shot.push(...g3.cues.filter((c) => c.move === 'spiritOrb' || c.type === 'catch').map((c) => c.type));
  }
  assert.ok(shot.some((x) => HIT.includes(x)) && !shot.includes('catch'), `the orb hits him: ${shot.join(',')}`);
  // Nothing comes: he is stuck for the whiff's 20 frames after the window.
  assert.equal(WT.states.listenM.duration - (win.to + 1), 20);
});

test('Displacement: he passes through to the other side and strikes on frame 18; the vacuum he left bursts 16 frames later, never together', () => {
  const m = rawMove('displacementM');
  assert.equal(m.startup, 18);
  for (const hold of [0, RAW.RIGHT, RAW.LEFT]) {
    const g = setup(W, 160);
    const a = g.players[0], d = g.players[1];
    const cues = play(g, W, 'displacementM', 60, (i) => (i < 40 ? hold : 0));
    assert.ok(a.x > d.x || cues.some((c) => c.type === 'warp' && c.x > d.x), 'he switched sides');
    const strike = cues.find((c) => c.move === 'displacementM');
    const burst = cues.find((c) => c.type === 'projBurst');
    assert.equal(strike.i, m.startup - 1, 'the strike touches on frame 18');
    assert.equal(burst.i + B.delay - strike.i, 16, 'the burst lands 16 frames after it');
    const touch = cues.find((c) => c.move === 'vacuum');
    if (touch) assert.equal(touch.i - strike.i, 16);
    const touches = cues.filter((c) => c.move === 'vacuum' || c.move === 'displacementM').map((c) => c.i);
    assert.equal(new Set(touches).size, touches.length, 'the two never land on the same frame');
  }
  // Blocking the strike means holding the other way (he is behind now).
  const g = setup(W, 160);
  const cues = play(g, W, 'displacementM', 30, RAW.LEFT);
  assert.ok(cues.some((c) => c.type === 'block' && c.move === 'displacementM'), 'blocked by holding away from where he reappears');
  const g2 = setup(W, 160);
  const c2 = play(g2, W, 'displacementM', 30, RAW.RIGHT);
  assert.ok(c2.some((c) => HIT.includes(c.type) && c.move === 'displacementM'), 'holding the old way is hit');
});

test('Swap: one bar; the two trade places and the opponent is left in a vacuum that bursts at once', () => {
  const g = setup(W, 1000);
  const a = g.players[0], d = g.players[1];
  const [ax, dx] = [a.x, d.x];
  const cues = [];
  for (const r of script('2 3 6+S 5*30')) { step(g, [r, 0], W); cues.push(...g.cues.map((c) => ({ ...c }))); }
  assert.notEqual(a.state, 'swap', 'no bar: it does not come out');
  assert.ok(!cues.some((c) => c.type === 'warp'));
  const g2 = setup(W, 1000);
  const a2 = g2.players[0], d2 = g2.players[1];
  a2.meter = 15000;
  const c2 = [];
  let at = -1;
  let spent = -1;
  script('2 3 6+S 5*30').forEach((r, i) => { step(g2, [r, 0], W); if (a2.state === 'swap' && spent < 0) spent = 15000 - a2.meter; if (g2.cues.some((c) => c.type === 'warp') && at < 0) { at = i; assert.deepEqual([a2.x, d2.x], [dx, ax], 'places traded'); } c2.push(...g2.cues.map((c) => ({ ...c, i }))); });
  assert.ok(at >= 0, 'it came out');
  assert.equal(spent, 10000, 'it cost one bar');
  const hit = c2.find((c) => HIT.includes(c.type) && c.move === 'vacuum');
  assert.ok(hit && hit.i === at + B.delay, 'the vacuum bursts on them at once');
});

test("War'Teun: rollback gives the same game with vacuums, Tune, Wiretap and Listen in play", () => {
  const plans = ['2 3 6+L 5*20', '2 3 6+H 5*30', '5+R 5*30', '2 5 2+M 5*20', '6 2 3+L 5*30', '2 1 4+M 5*30', '5+H 5*20', '6+H 5*20', '4+H 5*20', '5+L 5+M 5*10', '9*20 5+S 5*20', '6*20', '4*15', '2+M 5*20', '2 3 6+S 5*20'];
  const rnd = lcg(4242);
  const queues = [[], []];
  let bursts = 0;
  const r = runSyncTest(W, (g) => {
    bursts += g.cues.filter((c) => c.type === 'projBurst').length;
    for (const i of [0, 1]) {
      if (g.frame === 0) g.players[i].meter = 40000;
      if (!queues[i].length) {
        let raws = script(plans[rnd() % plans.length]);
        if (g.players[i].facing < 0) raws = raws.map((x) => (x & ~3) | ((x & 1) << 1) | ((x & 2) >> 1));
        queues[i] = raws;
      }
    }
    return [queues[0].shift(), queues[1].shift()];
  }, { frames: 4000, distance: 8 });
  assert.ok(r.ok, `desync at frame ${r.failFrame}: ${r.diff}`);
  assert.ok(bursts > 20, `vacuums burst during the run (${bursts})`);
});

test('He has one air jump per airtime, and gets it back on landing', () => {
  const g = setup(W, 1200);
  const p = g.players[0];
  const seen = [];
  let last = '';
  const run = (s) => { for (const r of script(s)) { step(g, [r, 0], W); if (p.state !== last) { seen.push(p.state); last = p.state; } } };
  run('8 5*14 8 5*10 8 5*10 8 5*90');
  assert.equal(seen.filter((s) => s === 'airJump').length, 1, 'three presses in the air give one air jump');
  assert.equal(p.y, 0, 'he came down');
  seen.length = 0;
  run('8 5*14 8 5*90');
  assert.equal(seen.filter((s) => s === 'airJump').length, 1, 'the air jump is back after landing');
});
