// Malik's level 3, Ancestral Specter (owner, Nov 27), and his Air Spirit Orb (j.236L).
// Super: 236236S, three bars; an 18-drawing transformation, invincible; then 10 seconds in which he walks slowly,
// cannot jump, glides instead of dashing, keeps his footing, takes half pushback, his normals are wall normals with
// armor through their startup, and R places up to three dormant trap orbs that wake when the opponent comes near,
// pull them in and burst; when the mode ends, every trap still waiting bursts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../src/core/game.js';
import { RAW } from '../src/core/input.js';
import { px } from '../src/core/fixed.js';
import { loadWorld, loadChar, script } from './helpers.js';

const MALIK = loadChar('data/characters/malik/malik.toska.json');
const W = loadWorld(MALIK, MALIK);
const HIT = ['hit', 'counter', 'witness'];
function setup(gap = 300) {
  const g = createGame(W);
  g.players[0].x = -px(gap / 2);
  g.players[1].x = px(gap / 2);
  return g;
}
const run = (g, s, p2 = '') => { const a = script(s), b = p2 ? script(p2) : []; for (let i = 0; i < Math.max(a.length, b.length); i++) step(g, [a[i] ?? 0, b[i] ?? 0], W); };
const specter = (g, who = 0) => { g.players[who].vars.specter = 600; g.players[who].state = 'specterIdle'; g.players[who].frame = 0; };

test('Specter: 236236S costs three bars, is invincible through the transformation, then runs for 600 frames', () => {
  const g = setup(400);
  const a = g.players[0];
  a.meter = 30000;
  run(g, '2 3 6 2 3 6+S');
  assert.equal(a.state, 'specter');
  assert.equal(a.meter, 0, 'three bars');
  const st = MALIK.states.specter;
  assert.equal(st.frames.length, 58);
  assert.ok(st.frames.slice(0, 57).every((f) => f.invStrike && f.invThrow), 'invincible through the transformation');
  for (let i = 0; i < 140 && a.vars.specter === 0; i++) step(g, [0, 0], W); // (the super flash freezes the game 40 frames)
  assert.ok(a.vars.specter > 590, 'the mode starts as he plants');
  for (let i = 0; i < 70; i++) step(g, [0, 0], W);
  assert.equal(a.state, 'specterIdle', 'he stands as the Specter');
  for (let i = 0; i < 600; i++) step(g, [0, 0], W);
  assert.equal(a.vars.specter, 0);
  assert.equal(a.state, 'idle', 'and back to himself when it ends');
});

test('Specter: he walks slower, cannot jump, and his dashes are short glides', () => {
  const walk = (on) => { const g = setup(600); g.players[0].x = -px(400); if (on) specter(g); const x0 = g.players[0].x; for (let i = 0; i < 40; i++) step(g, [RAW.RIGHT, 0], W); return g.players[0].x - x0; };
  const normal = walk(false), slow = walk(true);
  assert.ok(slow > 0 && slow <= normal * 0.65, `walks ${slow / 100} px against ${normal / 100}`);
  const g = setup(600);
  specter(g);
  const a = g.players[0];
  for (let i = 0; i < 20; i++) step(g, [RAW.UP, 0], W);
  assert.equal(a.y, 0, 'up does nothing');
  run(g, '5*3 6 5 6 5*2');
  assert.equal(a.state, 'specterDash');
  run(g, '5*40');
  run(g, '4 5 4 5*2');
  assert.equal(a.state, 'specterBack');
});

test("Specter: a hit that would knock him down or launch him leaves him on his feet, and he takes half the pushback", () => {
  const hitBy = (on, move) => {
    const g = setup(90);
    if (on) specter(g, 1);
    const d = g.players[1], x0 = d.x;
    run(g, move);
    let down = false, air = false;
    for (let i = 0; i < 40; i++) { step(g, [0, 0], W); down ||= d.state.startsWith('knockdown'); air ||= d.y > 0; }
    return { down, air, slid: d.x - x0, hit: d.health < MALIK.stats.health };
  };
  const sweep = hitBy(false, '2+H'), held = hitBy(true, '2+H');
  assert.ok(sweep.hit && held.hit);
  assert.ok(sweep.down, 'his 2H knocks a normal opponent down');
  assert.ok(!held.down && !held.air, 'but not the Specter');
  const lift = hitBy(false, '5+S'), stood = hitBy(true, '5+S');
  assert.ok(lift.air, 'the launcher sends a normal opponent up');
  assert.ok(!stood.air, 'but not the Specter');
  const push = hitBy(false, '5+L'), half = hitBy(true, '5+L');
  assert.ok(half.slid > 0 && half.slid <= push.slid * 0.6, `pushed ${half.slid / 100} px against ${push.slid / 100}`);
});

test('Specter: his normals are wall normals, standing taller than his own, with armor through their startup, drawn as the Specter', () => {
  // (Owner, Nov 27, second batch: the Specter's own drawings for 5L, 5M, 5H, 2L and 2M. Their boxes sit on the giant
  // limbs as drawn, which are no longer than his own reach in every case, so only height is compared now.)
  for (const id of ['5L', '5M', '5H', '2L', '2M', '2H']) {
    const base = MALIK.states[id], wall = MALIK.states['specter' + id];
    assert.ok(wall, id);
    const b = base.frames.find((f) => f.hit.length).hit[0], w = wall.frames.find((f) => f.hit.length).hit[0];
    assert.ok(w[3] >= b[3], `${id}: at least as tall`);
    assert.ok(wall.frames[0].armor >= 1, `${id}: armor in its startup`);
    if (id !== '2H') assert.equal(MALIK.sheets[wall.frames[0].sprite.sheet].image, `sheets/specter-${id}.png`, `${id}: his Specter drawings`);
  }
  const g = setup(300);
  specter(g);
  run(g, '5+L');
  assert.equal(g.players[0].state, 'specter5L');
});

test('Specter traps: 5R places a dormant orb that wakes when the opponent comes near, pulls them in and bursts; three at most; each costs a Rite charge', () => {
  const g = setup(700);
  const a = g.players[0], d = g.players[1];
  specter(g);
  run(g, '5+R 5*40');
  const trap = () => g.projectiles.filter((q) => q.owner === 0 && q.kind === 'specterOrb');
  assert.equal(trap().length, 1);
  assert.equal(trap()[0].woke, -1, 'it waits');
  assert.ok(a.rite < 3, 'a Rite charge');
  // The opponent walks into it.
  let got = false, pulled = false, prev = d.x;
  for (let i = 0; i < 200 && !got; i++) {
    step(g, [0, RAW.LEFT], W);
    if (trap()[0]?.woke >= 0 && d.x < prev - px(5)) pulled = true;
    prev = d.x;
    got = g.cues.some((c) => HIT.includes(c.type) && c.p === 0);
  }
  assert.ok(got, 'it bursts on them');
  assert.ok(pulled, 'after pulling them in');
  // Four placed (waiting for a charge between them): three remain.
  const h = setup(900);
  specter(h);
  for (let k = 0; k < 4; k++) run(h, '5+R 5*90');
  h.players[1].x = px(450);
  assert.equal(h.projectiles.filter((q) => q.owner === 0 && q.kind === 'specterOrb' && !q.end).length, 3);
});

test('Specter seal: 2R seals a dome trap into the floor ahead; it waits until a grounded opponent steps on it, then the dome bursts up under them', () => {
  const g = setup(700);
  const d = g.players[1];
  specter(g);
  run(g, '2+R 5*40');
  const seal = () => g.projectiles.find((q) => q.owner === 0 && q.kind === 'specterSeal');
  assert.ok(seal(), 'the seal is down');
  assert.equal(seal().y, 0, 'on the floor');
  assert.equal(seal().woke, -1, 'it waits');
  // A jump over it does not set it off.
  d.y = px(120); d.state = 'jump';
  for (let i = 0; i < 3; i++) step(g, [0, 0], W);
  d.x = seal().x; d.y = px(120);
  step(g, [0, 0], W);
  assert.equal(seal()?.woke, -1, 'not from the air');
  // Walked onto: it wakes and bursts.
  const h = setup(700);
  specter(h);
  run(h, '2+R 5*40');
  let got = false, up = false;
  for (let i = 0; i < 200 && !got; i++) { step(h, [0, RAW.LEFT], W); got = h.cues.some((c) => HIT.includes(c.type) && c.p === 0); }
  for (let i = 0; i < 20; i++) { step(h, [0, 0], W); up ||= h.players[1].y > 0; }
  assert.ok(got, 'it bursts on them');
  assert.ok(up, 'and lifts them');
});

test("Warden's Toll: 4R claps, hits close all round him, and wakes every trap he has waiting at once", () => {
  const g = setup(900);
  const a = g.players[0];
  specter(g);
  run(g, '5+R 5*90');
  run(g, '2+R 5*90');
  assert.equal(g.projectiles.filter((q) => q.owner === 0 && q.woke === -1).length, 2);
  run(g, '4+R');
  assert.equal(a.state, 'specterToll');
  let woke = -1;
  for (let i = 0; i < 30; i++) { step(g, [0, 0], W); if (woke < 0 && g.projectiles.filter((q) => q.owner === 0).every((q) => q.woke >= 0)) woke = a.frame; }
  assert.ok(woke > 0, 'both traps woke');
  assert.equal(MALIK.states.specterToll.frames[woke].sprite.index + 1, 7, 'on the clap (drawing 7)');
  const box = MALIK.states.specterToll.frames.find((f) => f.hit.length).hit[0];
  assert.ok(box[0] < 0 && box[0] + box[2] > 0, 'its ring hits behind and in front');
  // Outside the mode, 4R is still Colossus Clap.
  const h = setup(300);
  run(h, '4+R');
  assert.equal(h.players[0].state, 'rite_4');
});

test('Specter: his Rite charges come back three times as fast while he is the Specter', () => {
  const refill = (on) => { const g = setup(900); const a = g.players[0]; if (on) specter(g); a.rite = 0; a.riteTimer = 0; let n = 0; while (a.rite < 1 && n < 400) { step(g, [0, 0], W); n++; } return n; };
  const normal = refill(false), fast = refill(true);
  assert.equal(normal, 240);
  assert.equal(fast, 80);
});

test('Specter: his crouch and blocks are drawn as the Specter, with the spirit shield on a block (drawing only)', () => {
  const v = MALIK.mechanic.vars.specter;
  assert.deepEqual(v.art, { crouch: 'specterCrouch', blockStand: 'specterBlockStand', blockCrouch: 'specterBlockCrouch' });
  for (const s of Object.values(v.art)) assert.ok(MALIK.states[s]?.frames[0].sprite, s);
  assert.equal(v.aura[0].swap.blockStand, 'specterShield');
  assert.ok(MALIK.effects.specterShield);
  for (const [s, sheet] of [['specterWalkF', 'specter-walk'], ['specterWalkB', 'specter-walk-back'], ['specterDash', 'specter-dash'], ['specterBack', 'specter-backdash']])
    assert.equal(MALIK.sheets[MALIK.states[s].frames[0].sprite.sheet].image, `sheets/${sheet}.png`, s);
});

test('Specter traps: when the mode ends, every waiting trap bursts', () => {
  const g = setup(900);
  specter(g);
  run(g, '5+R 5*40');
  g.players[0].vars.specter = 2;
  let burst = false;
  for (let i = 0; i < 60; i++) { step(g, [0, 0], W); burst ||= g.cues.some((c) => c.type === 'projectileEnd' && c.name === 'specterOrb' && c.why === 'burst'); }
  assert.ok(burst);
  assert.equal(g.projectiles.filter((q) => q.kind === 'specterOrb').length, 0);
});

test('Air Spirit Orb (j.236L): he hangs and throws an orb down and forward; once per jump', () => {
  const st = MALIK.states.airOrbL;
  assert.ok(st);
  const P = MALIK.projectiles.airOrbL;
  assert.ok(P.speed > 0 && P.speedY < 0, 'down and forward');
  const g = setup(500);
  const a = g.players[0];
  run(g, '8 5*7 2 3 6+L');
  assert.equal(a.state, 'airOrbL');
  let y0 = a.y, seen = false;
  for (let i = 0; i < 20; i++) { step(g, [0, 0], W); seen ||= g.projectiles.some((q) => q.kind === 'airOrbL'); if (i < 12) assert.equal(a.y, y0, 'he hangs'); }
  assert.ok(seen, 'the orb comes out');
  assert.equal(MALIK.commands.find((c) => c.move === 'airOrbL').perJump, 'airOrb');
});

test('Spirit Orb tuning (owner, Nov 28): the light orbs travel slower, and the medium spout shows its ring on the floor before it can hit', () => {
  const P = MALIK.projectiles;
  assert.equal(P.spiritOrb.speed, px(7), 'ground light orb: 7 px a frame (was 9)');
  assert.ok(P.airOrbL.speed < px(10) && P.airOrbL.speedY < 0, 'air light orb slower (was 10)');
  const M = P.spiritOrbM;
  assert.ok(M.phases && M.phases[0].from >= 16, 'the spout hits from 16 frames after it appears, not at once');
  const g = setup(300);
  const a = g.players[0];
  run(g, '2 3 6+M');
  let born = -1, hit = -1;
  for (let i = 0; i < 80 && hit < 0; i++) { step(g, [0, 0], W); if (born < 0 && g.projectiles.some((q) => q.kind === 'spiritOrbM')) born = i; if (g.cues.some((c) => HIT.includes(c.type) && c.p === 0)) hit = i; }
  assert.ok(born >= 0 && hit - born >= 16, `ring at ${born}, hit at ${hit}`);
});

test("Specter 2H (Nov 28): his own crouching heavy, the crystal wall bursting up on drawing 6", () => {
  const st = MALIK.states.specter2H;
  assert.equal(MALIK.sheets[st.frames[0].sprite.sheet].image, 'sheets/specter-2H.png');
  const first = st.frames.findIndex((f) => f.hit.length);
  assert.equal(st.frames[first].sprite.index + 1, 6);
  assert.equal(st.frames.length, 33, 'its timing unchanged (9 startup, 3 active, 22 recovery)');
});

// ---- The Specter's specials (owner, Nov 28).
test('Ancestral Barrage (Specter 236H): the roaring head\'s blast hits 12 times on hit and 12 times on block, then the Specter form ends', () => {
  for (const blocking of [false, true]) {
    const g = setup(220);
    const a = g.players[0];
    specter(g);
    const back = blocking ? RAW.RIGHT : 0; // the opponent stands on the right: holding right is holding back
    run(g, '2 3 6+H');
    assert.equal(a.state, 'specterBarrage');
    let hits = 0, blocks = 0;
    for (let i = 0; i < 120; i++) {
      step(g, [0, i >= 24 ? back : 0], W); // (held back only as the beam comes: walking back from the start leaves its reach)
      hits += g.cues.filter((c) => HIT.includes(c.type) && c.p === 0).length;
      blocks += g.cues.filter((c) => c.type === 'block' && c.p === 0).length;
    }
    if (blocking) assert.equal(blocks, 12, `blocked ${blocks} times`);
    else assert.equal(hits, 12, `hit ${hits} times`);
    assert.equal(a.vars.specter, 0, 'the form is spent');
    assert.equal(a.state, 'idle', 'he stands as himself');
  }
  assert.equal(MALIK.states.specterBarrage.frames.length, 86); // the roaring head's 20 drawings (Nov 28)
});

test("Warden's Grasp (Specter 236L/M): the spirit hand runs along the floor and drags the opponent back to him; M reaches further", () => {
  const reach = (b) => { const P = MALIK.projectiles['graspHand' + b]; return P.speed * P.lifetime; };
  assert.ok(reach('M') > reach('L'));
  const g = setup(300);
  const d = g.players[1];
  specter(g);
  run(g, '2 3 6+L');
  assert.equal(g.players[0].state, 'specterGraspL');
  let got = false;
  for (let i = 0; i < 40 && !got; i++) { step(g, [0, 0], W); got = g.cues.some((c) => HIT.includes(c.type) && c.p === 0); }
  assert.ok(got, 'the hand catches them');
  for (let i = 0; i < 20; i++) step(g, [0, 0], W);
  assert.ok(Math.abs(d.x - g.players[0].x) < px(160), `dragged in to ${Math.abs(d.x - g.players[0].x) / 100} px`);
});

test('Colossal Stomp (Specter 623): the floor wave is a low, and every trap it rolls past goes off', () => {
  assert.equal(MALIK.projectiles.stompWaveM.move.guard, 'low');
  const g = setup(900);
  specter(g);
  run(g, '5+R 5*90'); // a trap orb ahead
  assert.equal(g.projectiles.filter((q) => q.kind === 'specterOrb' && q.woke < 0).length, 1);
  run(g, '6 2 3+M');
  assert.equal(g.players[0].state, 'specterStompM');
  let woke = false;
  for (let i = 0; i < 60 && !woke; i++) { step(g, [0, 0], W); woke = g.projectiles.some((q) => q.kind === 'specterOrb' && q.woke >= 0); }
  assert.ok(woke, 'the wave sets the trap off');
});

test("Ancestor's Judgment (Specter 22): the spirit wall drops at a set distance per button and is an overhead", () => {
  const at = (b) => MALIK.projectiles['judgmentWall' + b].spawn[0];
  assert.ok(at('L') < at('M') && at('M') < at('H'), 'L close, M mid, H far');
  assert.equal(MALIK.projectiles.judgmentWallM.move.guard, 'high');
  const g = setup(230);
  specter(g);
  run(g, '2 5 2+M');
  assert.equal(g.players[0].state, 'specterJudgmentM');
  let hit = false, crouched = false;
  for (let i = 0; i < 50 && !hit; i++) { step(g, [0, RAW.DOWN | RAW.RIGHT], W); hit = g.cues.some((c) => HIT.includes(c.type) && c.p === 0); }
  assert.ok(hit, 'a crouching block does not stop it');
});

test('Air Spirit Lance (j.S, Nov 28): the spirit arm shoots out flat, about 300 px; he hangs while it is out', () => {
  const st = MALIK.states['j.S'];
  const box = st.frames.find((f) => f.hit.length).hit[0];
  assert.ok(box[0] + box[2] >= px(280) && box[0] + box[2] <= px(320), 'less than a third of the screen');
  assert.ok(box[3] <= px(50), 'a flat strip');
  const g = setup(500);
  const a = g.players[0];
  run(g, '8 5*12 5+S');
  assert.equal(a.state, 'j.S');
  const y0 = a.y;
  for (let i = 0; i < 15; i++) { step(g, [0, 0], W); assert.equal(a.y, y0, 'he hangs'); }
});

test('Spirit Stomp (j.2H, Nov 28): an overhead straight down that ground-bounces; j.H stays j.H', () => {
  const st = MALIK.states['j.2H'];
  assert.equal(st.move.guard, 'high');
  assert.ok(st.move.groundBounce || st.move.gbY, 'a ground bounce');
  const box = st.frames.find((f) => f.hit.length).hit[0];
  assert.ok(box[1] < 0, 'it reaches below his feet');
  assert.equal(MALIK.sheets[st.frames[0].sprite.sheet].image, 'sheets/j2H.png');
  const g = setup(500);
  run(g, '8 5*12 2+H');
  assert.equal(g.players[0].state, 'j.2H');
  const h = setup(500);
  run(h, '8 5*12 5+H');
  assert.equal(h.players[0].state, 'j.H');
});

test('Air Spirit Burst (j.236M, Nov 28): the two orbs slam into a sphere round him, and j.H links after it', () => {
  // Both jump together; at the top of his jump he bursts, then presses H as soon as he can act.
  const g = setup(100);
  const a = g.players[0];
  const s1 = script('8 5*6 2 3 6+M'), s2 = script('8');
  const hits = [];
  for (let i = 0; i < 120; i++) {
    const free = a.state === 'jump' || a.state === 'fall';
    step(g, [i < s1.length ? s1[i] : free && i % 2 ? RAW.H : 0, i < s2.length ? s2[i] : 0], W);
    for (const c of g.cues) if (HIT.includes(c.type) && c.p === 0) hits.push(a.state);
  }
  assert.deepEqual(hits, ['airBurstM', 'j.H'], hits.join(','));
});
