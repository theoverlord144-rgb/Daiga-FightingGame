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

const AVNER = loadChar('data/characters/_archive/avner_chain/avner.toska.json');
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
  assert.deepEqual(MALIK_FILE.rite, { gauge: { charges: 3, rechargeFrames: 240, unlimitedWhile: 'install' }, moves: ['rite_4', 'rite_5', 'rite_2', 'rite_j'] });
  const inputs = Object.fromEntries(MALIK_FILE.moves.filter((m) => m.id.startsWith('rite_')).map((m) => [m.id, m.input]));
  assert.deepEqual(inputs, { rite_4: '4R', rite_5: '5R', rite_2: '2R', rite_j: 'j.R' });
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

// ---------- Malik: the Rite set of Nov 25 2026 (the owner's design; it replaces the low, rising and ground-hand palms) ----------

const HIT = ['hit', 'counter', 'witness'];
const mine = (g) => g.projectiles.filter((q) => q.owner === 0);

test('Malik 6R: there is none any more; forward + R is the neutral Rite', () => {
  assert.equal(MALIK.states.rite_6, undefined);
  assert.equal(MALIK.projectiles.palm6, undefined);
  const g = setup(WM, 900);
  run(g, WM, '6+R');
  assert.equal(g.players[0].state, 'rite_5');
});

/** Malik does 2R from `gap` away while P2 jumps back over the frame the orb rises (so it finds nobody to hit). */
function seal(g) {
  const a = g.players[0], d = g.players[1];
  let born = null;
  for (let i = 0; i < 40 && !born; i++) {
    const before = d.x;
    step(g, [i === 0 ? RAW.DOWN | RAW.R : 0, i === 5 ? RAW.UP | RAW.RIGHT : 0], WM);
    const m = mine(g).find((q) => q.kind === 'palm2' && !q.end);
    if (m && !mine(g).some((q) => q.end)) born = { x: m.x, y: m.y, under: [before, d.x], malik: a.x };
  }
  return born;
}

test("Malik 2R, Ancestor's Seal: the orb always rises under the opponent, wherever they are, and stays there for 3 seconds; one at a time", () => {
  const P = MALIK.projectiles.palm2;
  assert.equal(P.speed, 0, 'it does not travel');
  assert.equal(P.lifetime, 180, '3 seconds');
  for (const gap of [200, 600, 1000]) {
    const g = setup(WM, gap);
    const born = seal(g);
    assert.ok(born, 'it rose');
    assert.ok(born.under.includes(born.x), `gap ${gap}: under the opponent, not a fixed step from Malik`);
    assert.ok(born.y > 0 && born.y < px(50), 'at shin height');
  }
  // Nobody touches it: it hovers where it rose for 180 frames, then it is gone.
  const g = setup(WM, 400);
  const a = g.players[0], d = g.players[1];
  const born = seal(g);
  let alive = 1;
  for (let i = 0; i < 260; i++) {
    step(g, [0, d.y > 0 || Math.abs(d.x - born.x) < px(200) ? RAW.RIGHT : 0], WM); // P2 lands and walks clear of it
    const m = mine(g);
    if (!m.length) continue;
    assert.deepEqual({ x: m[0].x, y: m[0].y }, { x: born.x, y: born.y }, 'it does not follow them afterwards');
    alive++;
  }
  assert.equal(alive, 180);
  assert.equal(d.health, MALIK.stats.health, '(nobody was hit)');
  // A second one removes the first.
  a.rite = 3;
  seal(g);
  const first = mine(g)[0].x;
  for (let i = 0; i < 60; i++) step(g, [0, d.y > 0 || i < 30 ? RAW.LEFT : 0], WM);
  assert.equal(mine(g).length, 1, 'the first is still out');
  a.rite = 3;
  let two = false;
  for (let i = 0; i < 40; i++) { step(g, [i === 0 ? RAW.DOWN | RAW.R : 0, i === 5 ? RAW.UP | RAW.RIGHT : 0], WM); two ||= mine(g).filter((q) => !q.end).length > 1; }
  assert.equal(two, false, 'never two at once');
  assert.equal(mine(g).length, 1);
  assert.notEqual(mine(g)[0].x, first, 'the new one, under where they are now');
});

test('Malik 2R: the orb is a low: a crouching block stops it, a standing block does not; whoever walks back into it later is hit', () => {
  assert.equal(MALIK.projectiles.palm2.move.guard, 'low');
  // From across the screen, on an opponent who stays where they are.
  assert.equal(palm('2+R', { gap: 900, p2: '5' }).end, 'hit');
  assert.equal(palm('2+R', { gap: 900, p2: '6' }).end, 'hit', 'standing block (walking back): it rises under them all the same');
  assert.equal(palm('2+R', { gap: 900, p2: '3' }).end, 'block', 'crouching block');
  // Left hovering, it waits.
  const g = setup(WM, 900);
  const d = g.players[1];
  const born = seal(g);
  let got = null;
  for (let i = 0; i < 150 && !got; i++) {
    step(g, [0, d.y > 0 ? 0 : RAW.LEFT], WM); // they land behind it and walk forward, into it
    got = g.cues.find((c) => [...HIT, 'block'].includes(c.type))?.type ?? null;
  }
  assert.equal(got, 'hit');
  assert.equal(mine(g).length, 0, 'and the orb is spent');
  void born;
});

/** Malik jumps and claps; P2 does p2 (a script) from the frame of the R press. Returns what happened. */
function judgment({ gap = 500, p2 = '5', frames = 40 } = {}) {
  const g = setup(WM, gap);
  const a = g.players[0], d = g.players[1];
  run(g, WM, '8 5*10');
  const b = script(p2);
  step(g, [RAW.R, b[0] ?? 0], WM);
  const r = { g, state: a.state, born: null, bornX: null, victimX: null, hit: null, type: null };
  for (let i = 1; i < frames && r.hit === null; i++) {
    const before = d.x;
    step(g, [0, b[i] ?? 0], WM);
    const q = mine(g)[0];
    if (q && r.born === null) { r.born = i; r.bornX = q.x; r.victimX = before; }
    const c = g.cues.find((c) => [...HIT, 'block'].includes(c.type));
    if (c) { r.hit = i; r.type = c.type; }
  }
  return r;
}

test("Malik j.R, Guardian's Judgment: it opens where the opponent stands on the clap, whatever the distance, and strikes 11 frames later", () => {
  const P = MALIK.projectiles.palmJ;
  assert.equal(P.speed, 0);
  assert.equal(MALIK.states.rite_j.frames.every((f) => f.hit.length === 0), true, 'Malik himself has no hitbox in it');
  for (const gap of [150, 500, 900]) {
    const r = judgment({ gap });
    assert.equal(r.state, 'rite_j');
    assert.equal(r.born, 11, 'on the clap');
    assert.equal(r.bornX, r.g.players[1].x, `gap ${gap}: on the opponent, not a fixed step from Malik`);
    assert.equal(r.type, 'hit');
    assert.equal(r.hit - r.born, 11, 'the beams meet 11 frames after the clap');
  }
});

test('Malik j.R: it locks on the clap; an opponent who gets away before the beams meet is missed', () => {
  // A backdash begun as the portals open.
  const r = judgment({ gap: 500, p2: '5*10 6 5 6 5*40' });
  assert.ok(r.born !== null);
  assert.equal(r.hit, null, 'missed');
  assert.ok(Math.abs(r.g.players[1].x - r.bornX) > px(60), 'they are no longer between the portals');
  assert.equal(mine(r.g).length, 0, 'and it is over');
});

test('Malik j.R: must be blocked standing; a hit launches upward (a hard launch while the combo has one, else a soft one); once per jump', () => {
  const P = MALIK.projectiles.palmJ;
  assert.equal(P.move.guard, 'high');
  assert.equal(P.move.launchType, 'hard');
  assert.equal(judgment({ p2: '3*40' }).type, 'hit', 'a crouching block does not stop it');
  const r = judgment();
  const d = r.g.players[1];
  let peak = 0;
  for (let k = 0; k < 40; k++) { step(r.g, [0, 0], WM); peak = Math.max(peak, d.y); }
  assert.ok(peak > px(80), `sent up (${peak})`);
  assert.equal(d.health, MALIK.stats.health - P.move.damage);
  // Once per jump.
  assert.equal(MALIK.commands.find((c) => c.move === 'rite_j').perJump, 'rite');
  const g = setup(WM, 900);
  const a = g.players[0];
  run(g, WM, '8+9 5 2*2 8 5*4 5+R'); // (a super jump, to have the air time for a second try)
  if (a.state !== 'rite_j') { g.players[0].x = -px(450); run(g, WM, '5*80 8 5*3 5+R'); }
  assert.equal(a.state, 'rite_j');
  assert.equal(a.rite, 2);
  let tried = false;
  for (let i = 0; i < 80 && a.y > 0; i++) {
    const free = a.state !== 'rite_j';
    step(g, [free && i % 2 ? RAW.R : 0, 0], WM);
    if (free && a.y > 0) { tried = true; assert.notEqual(a.state, 'rite_j', 'no second one in the same jump'); }
  }
  assert.equal(a.rite, 2, 'and no second charge spent');
  assert.ok(a.airUsed.includes('rite') || a.y === 0);
  void tried;
});

test("Malik 4R, Guardian's Wrath: strike- and projectile-invincible from the first frame until the burst on frame 12; not against throws", () => {
  const st = MALIK.states.rite_4;
  assert.equal(st.duration, 35);
  st.frames.forEach((f, i) => {
    assert.equal(f.invStrike, i <= 10, `frame ${i + 1}`);
    assert.equal(f.invThrow, false, 'a throw still takes him');
    assert.equal(f.hit.length, 0);
  });
  // An opponent's Light, pressed with it at point blank, passes through him; the burst then hits them.
  const g = setup(WM, 110);
  const a = g.players[0], d = g.players[1];
  step(g, [RAW.LEFT | RAW.R, RAW.L], WM);
  assert.equal(a.state, 'rite_4');
  assert.equal(a.rite, 2);
  let burst = null;
  for (let i = 1; i < 30 && burst === null; i++) {
    step(g, [0, 0], WM);
    for (const c of g.cues) if (HIT.includes(c.type)) burst = a.frame;
  }
  assert.equal(a.health, MALIK.stats.health, 'nothing touched him');
  assert.ok(d.health < MALIK.stats.health, 'and the burst hit them');
  assert.equal(burst, 11, 'on his 12th frame');
  const x0 = d.x;
  for (let i = 0; i < 30; i++) step(g, [0, 0], WM);
  assert.ok(d.x - x0 > px(60) || d.y > 0, 'knocked well away');
});

test('Malik 4R: it hits all round him, above too (a jump-in is caught); blocked or whiffed he is open for a long time', () => {
  const box = MALIK.projectiles.ward.hitbox[0];
  assert.ok(box[0] < -px(80) && box[0] + box[2] > px(80), 'behind him and in front');
  assert.ok(MALIK.projectiles.ward.spawn[1] + box[1] + box[3] > px(280), 'well above his head');
  // A jump-in.
  const tries = [];
  for (let wait = 6; wait < 34; wait += 1) {
    const g = setup(WM, 300);
    const a = g.players[0], d = g.players[1];
    let got = null;
    for (let i = 0; i < 70 && !got; i++) {
      step(g, [i === wait ? RAW.LEFT | RAW.R : 0, i === 0 ? RAW.UP | RAW.LEFT : i > 20 && i < 26 ? RAW.H : 0], WM);
      if (a.health < MALIK.stats.health) got = 'he was hit';
      else if (d.health < MALIK.stats.health) got = d.y > 0 ? 'caught in the air' : 'caught';
    }
    tries.push(got);
  }
  assert.ok(tries.filter((t) => t === 'caught in the air').length >= 5, `a jumping Heavy is caught in the air from several timings (${tries.join(', ')})`);
  // Blocked: count how long he is still stuck after the blocker is free.
  const g = setup(WM, 110);
  const a = g.players[0], d = g.players[1];
  step(g, [RAW.LEFT | RAW.R, 0], WM);
  let blocked = false, free = null, done = null;
  for (let i = 1; i < 80 && done === null; i++) {
    step(g, [0, !blocked && a.frame >= 9 ? RAW.RIGHT : 0], WM); // (guarding only as it bursts, so as not to walk out of it)
    if (g.cues.some((c) => c.type === 'block')) blocked = true;
    if (blocked && free === null && d.state === 'idle') free = i;
    if (a.state !== 'rite_4') done = i;
  }
  assert.ok(blocked, 'it can be blocked');
  assert.ok(done - free >= 8, `the blocker is free ${done - free} frames before he is: a full punish`);
  // Whiffed: 24 frames with no invincibility and no hitbox.
  assert.equal(st4().frames.slice(11).every((f) => !f.invStrike), true);
  assert.equal(st4().frames.length - 11, 24);
});
const st4 = () => MALIK.states.rite_4;

test('Malik 4R never overlaps Absolve: in hitstun back + R does nothing and spends no charge; R+S there is Absolve', () => {
  const stun = () => {
    const g = setup(WM, 110);
    run(g, WM, '5', '5+L');
    for (let i = 0; i < 12 && g.players[0].state !== 'hitStand'; i++) step(g, [0, 0], WM);
    assert.equal(g.players[0].state, 'hitStand');
    return g;
  };
  let g = stun();
  let a = g.players[0];
  let stunned = 0;
  while (a.state === 'hitStand') { step(g, [0, 0], WM); stunned++; }
  assert.ok(stunned > 8);
  g = stun();
  a = g.players[0];
  for (let i = 0; i < stunned - 1; i++) { step(g, [i % 2 ? RAW.LEFT | RAW.R : RAW.LEFT, 0], WM); assert.equal(a.state, 'hitStand', 'mashing it changes nothing while he is hit'); }
  assert.equal(a.rite, 3);
  g = stun();
  a = g.players[0];
  a.meter = MALIK.meterMax;
  for (let i = 0; i < 20 && a.state === 'hitStand'; i++) step(g, [RAW.R | RAW.S, 0], WM);
  assert.equal(a.state, 'absolve');
  assert.equal(a.rite, 3, 'Absolve costs Devotion, not a charge');
});

test('Malik: Energy Sphere cancels into his ground Rite moves once the orb has left his hand, not before; it still costs a charge', () => {
  // (The owner, Nov 25 2026. From far away, so it is a whiff: the cancel needs no contact.)
  for (const [motion, id, orb] of [['2 3 6+L', 'spiritOrb', 'spiritOrb'], ['2 3 6+M', 'spiritOrbM', 'spiritOrbM'], ['2 3 6+H', 'spiritOrbH', 'spiritOrbH']]) {
    for (const [input, rite] of [[RAW.R, 'rite_5'], [RAW.LEFT | RAW.R, 'rite_4'], [RAW.DOWN | RAW.R, 'rite_2']]) {
      const g = setup(WM, 900);
      const a = g.players[0];
      run(g, WM, motion);
      assert.equal(a.state, id);
      // Mashing R from the start: nothing until the orb is out.
      let out = false, at = null;
      for (let i = 0; i < 60 && at === null; i++) {
        step(g, [i % 2 ? input : input & ~RAW.R, 0], WM);
        out ||= g.projectiles.some((q) => q.owner === 0 && q.kind === orb);
        if (a.state !== id) at = i;
        if (!out) assert.equal(a.state, id, `${id}: no cancel before the orb leaves`);
      }
      assert.equal(a.state, rite, `${id} into ${rite}`);
      assert.ok(out, 'the orb came out first');
      assert.ok(MALIK.states[id].duration - a.frame > 10 && at < MALIK.states[id].duration - 10, 'well before the sphere would have ended by itself');
      assert.equal(a.rite, 2, 'one charge');
    }
  }
  // With no charge there is nothing to cancel into.
  const g = setup(WM, 900);
  const a = g.players[0];
  a.rite = 0;
  run(g, WM, '2 3 6+L');
  for (let i = 0; i < 30; i++) { step(g, [i % 2 ? RAW.R : 0, 0], WM); a.riteTimer = 0; assert.ok(!a.state.startsWith('rite_')); }
});

test('the gauge: each Rite move spends a charge; with none left R does nothing', () => {
  const g = setup(WM, 900);
  const a = g.players[0];
  for (const [left, input, move] of [[2, '5+R', 'rite_5'], [1, '2+R', 'rite_2'], [0, '4+R', 'rite_4']]) {
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
  run(g, WM, '5 2+R 5 4+R 5 6+R');
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
