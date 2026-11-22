// Movement: every distance and frame count must match the character's data exactly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileCharacter, frameOf } from '../src/core/character.js';
import { createGame, step } from '../src/core/game.js';
import { pct } from '../src/core/fixed.js';
import { loadWorld, loadChar, script, SYSTEM } from './helpers.js';

const FIGHTER = loadChar('tests/fixtures/fighter.toska.json');
const S = FIGHTER.stats; // units and frames
const W = loadWorld(FIGHTER, FIGHTER);

/** P1 far left, P2 far right, so nothing gets in the way. */
function setup(world = W) {
  const g = createGame(world);
  g.players[0].x = -40000;
  g.players[1].x = 60000;
  return g;
}

/** Run a P1 script; returns per-step snapshots of P1. */
function run(g, s, world = W) {
  const out = [];
  for (const r of script(s)) {
    step(g, [r, 0], world);
    const p = g.players[0];
    out.push({ state: p.state, frame: p.frame, x: p.x, y: p.y, vx: p.vx, vy: p.vy });
  }
  return out;
}

const count = (snaps, state) => snaps.filter((s) => s.state === state).length;

/** Independent jump arc: steps until the ground is reached again (the landing step included), and the apex. */
function arc(up, gravity) {
  let y = 0;
  let vy = up;
  let n = 0;
  let apex = 0;
  do { y += vy; vy -= gravity; n++; apex = Math.max(apex, y); } while (!(y <= 0 && vy < 0));
  return { n, apex };
}

test('walking: forward and back speeds per frame', () => {
  const g = setup();
  const x0 = g.players[0].x;
  run(g, '6*30');
  assert.equal(g.players[0].x - x0, 30 * S.walkForward);
  const x1 = g.players[0].x;
  run(g, '4*20');
  assert.equal(g.players[0].x - x1, -20 * S.walkBack);
});

test('jump: pre-jump frames, airtime, apex, forward distance and landing recovery all match the data', () => {
  const g = setup();
  const x0 = g.players[0].x;
  const snaps = run(g, '9 5*120');
  assert.equal(count(snaps, 'jumpSquat'), S.prejump);
  const { n, apex } = arc(S.jumpUp, S.gravity);
  assert.equal(count(snaps, 'jump'), n - 1, 'airborne steps (the n-th step lands)');
  assert.equal(Math.max(...snaps.map((s) => s.y)), apex);
  assert.equal(g.players[0].x - x0, n * S.jumpForward);
  assert.equal(count(snaps, 'land'), S.landing);
  assert.equal(snaps[snaps.length - 1].state, 'idle');
});

test('back jump uses the back-jump speed', () => {
  const g = setup();
  const x0 = g.players[0].x;
  run(g, '7 5*120');
  assert.equal(g.players[0].x - x0, -arc(S.jumpUp, S.gravity).n * S.jumpBack);
});

test('super jump: down then up, much higher, with its own numbers', () => {
  const g = setup();
  const snaps = run(g, '2 8 5*160');
  assert.equal(count(snaps, 'superJumpSquat'), S.prejump);
  const { n, apex } = arc(S.superJumpUp, S.gravity);
  assert.equal(count(snaps, 'superJump'), n - 1);
  assert.equal(Math.max(...snaps.map((s) => s.y)), apex);
  assert.ok(apex > arc(S.jumpUp, S.gravity).apex * 1.5);
  // Up without the down first is a normal jump.
  const g2 = setup();
  assert.equal(count(run(g2, '5*5 8 5*20'), 'superJump'), 0);
});

test('dash: distance, frames, then a short stop', () => {
  const g = setup();
  const x0 = g.players[0].x;
  const snaps = run(g, '6 5 6 5*40');
  assert.equal(count(snaps, 'dashF'), S.dashFrames);
  assert.equal(count(snaps, 'dashStop'), S.dashRecovery);
  // The first tap is one walking frame, then the dash.
  assert.equal(g.players[0].x - x0, S.walkForward + S.dashFrames * S.dashSpeed);
});

test('dash cancels into attacks from its cancel frame, not before', () => {
  const g = setup();
  // L pressed on the dash's second frame (pressing it on the same frame as the tap is a plain 5L: buttons win).
  const snaps = run(g, '6 5 6 5+L 5*10');
  const start = snaps.findIndex((s) => s.state === 'dashF');
  const attack = snaps.findIndex((s) => s.state === '5L');
  assert.equal(attack - start, S.dashCancel, 'the buffered L comes out on the first cancel frame');
  // Holding forward never re-triggers a dash: the second 6 must be a fresh press.
  const g2 = setup();
  assert.equal(count(run(g2, '6*40'), 'dashF'), 0);
});

test('backdash: distance, invincible frames, recovery', () => {
  const g = setup();
  const x0 = g.players[0].x;
  const snaps = run(g, '4 5 4 5*40');
  assert.equal(count(snaps, 'backdash'), S.backdashFrames);
  assert.equal(count(snaps, 'backdashStop'), S.backdashRecovery);
  assert.equal(g.players[0].x - x0, -S.walkBack - S.backdashFrames * S.backdashSpeed);
  const inv = FIGHTER.states.backdash.frames.filter((f) => f.invStrike && f.invThrow).length;
  assert.equal(inv, S.backdashInvuln);
  assert.ok(frameOf(FIGHTER, 'backdash', 0).invStrike);
});

test('airdash: flat, exact distance, keeps part of its speed after, once per jump', () => {
  const g = setup();
  const snaps = run(g, '8 5*12 6 5 6 5*60');
  const i = snaps.findIndex((s) => s.state === 'airdashF');
  assert.ok(i > 0);
  const during = snaps.slice(i, i + S.airdashFrames);
  assert.ok(during.every((s) => s.state === 'airdashF'));
  assert.ok(during.every((s) => s.y === during[0].y), 'no rise or fall during the airdash');
  assert.equal(during[during.length - 1].x - snaps[i - 1].x, S.airdashFrames * S.airdashSpeed);
  const after = snaps[i + S.airdashFrames];
  assert.equal(after.state, 'airdashEnd');
  assert.equal(after.vx, pct(S.airdashSpeed, S.airdashKeep));
  // A second airdash in the same jump does nothing.
  const g2 = setup();
  const s2 = run(g2, '8 5*10 6 5 6 5*16 6 5 6 5*20');
  assert.equal(s2.filter((s) => s.state === 'airdashF' && s.frame === 0).length, 1);
});

test('back airdash', () => {
  const g = setup();
  const snaps = run(g, '8 5*12 4 5 4 5*30');
  const i = snaps.findIndex((s) => s.state === 'airdashB');
  assert.equal(snaps[i + S.airdashBackFrames - 1].x - snaps[i - 1].x, -S.airdashBackFrames * S.airdashBackSpeed);
});

test('double jump: per-character option and limit', () => {
  const g = setup();
  const snaps = run(g, '8 5*10 8 5*10 8 5*80');
  const airJumps = snaps.filter((s) => s.state === 'airJump' && s.frame === 0);
  assert.equal(airJumps.length, S.airJumps, 'Avner has one');
  const j = snaps.findIndex((s) => s.state === 'airJump');
  assert.equal(snaps[j].vy, S.airJumpUp - S.gravity, 'launched with the air-jump speed (after one frame of gravity)');
  // A character without air jumps can't.
  const plain = compileCharacter({ engine: 'Toska', version: 2, character: { id: 'p', stats: { airJumps: 0 } }, moves: [] }, SYSTEM);
  const w = loadWorld(plain, plain);
  const g2 = setup(w);
  assert.equal(count(run(g2, '8 5*10 8 5*60', w), 'airJump'), 0);
});

test('every movement number is per character: a different character moves differently', () => {
  const fast = compileCharacter({ engine: 'Toska', version: 2,
    character: { id: 'f', stats: { walkForward: 9, dashSpeed: 20, dashFrames: 8, gravity: 1.2 } }, moves: [] }, SYSTEM);
  const w = loadWorld(fast, fast);
  const g = setup(w);
  const x0 = g.players[0].x;
  run(g, '6*10', w);
  assert.equal(g.players[0].x - x0, 10 * 900);
  const g2 = setup(w);
  const snaps = run(g2, '5 6 5 6 5*30', w);
  assert.equal(count(snaps, 'dashF'), 8);
  const g3 = setup(w);
  assert.equal(count(run(g3, '8 5*80', w), 'jump'), arc(fast.stats.jumpUp, 120).n - 1);
});

test('UMvC3-speed defaults: 4-frame lights, fast dashes and airdashes', () => {
  assert.equal(FIGHTER.states['5L'].move.startup, 4);
  assert.equal(FIGHTER.states['2L'].move.startup, 4);
  assert.ok(S.dashSpeed * S.dashFrames >= 18000, 'a dash covers at least 180 px');
  assert.ok(S.dashFrames + S.dashRecovery <= 16, 'and is over in 16 frames');
  assert.ok(S.airdashSpeed >= 1400);
  assert.equal(S.prejump, 3);
});
