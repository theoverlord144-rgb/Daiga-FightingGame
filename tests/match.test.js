import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../src/core/game.js';
import { px } from '../src/core/fixed.js';
import { runSyncTest } from '../src/net/sync-test.js';
import { createReplayRecorder, playReplay } from '../src/net/replay.js';
import { loadWorld, loadJSON, script, fightInputs } from './helpers.js';

const RULES = loadJSON('data/system/match.json');
const worldWith = (over = {}) => loadWorld(undefined, undefined, { match: { ...RULES, ...over } });
const W = worldWith();
const idle = (g, n, w = W) => { for (let i = 0; i < n; i++) step(g, [0, 0], w); };
const skipIntro = (g, w = W) => idle(g, w.match.introFrames);

/** P1 hits P2 with 5M from close range (P2 has `hp` health first). */
function koWith5M(g, hp = 1, w = W) {
  g.players[0].x = -px(30);
  g.players[1].x = px(30);
  g.players[1].health = hp;
  for (const r of script('5+M 5*12')) step(g, [r, 0], w);
}

test('a round starts with an intro: nobody can act until FIGHT', () => {
  const g = createGame(W);
  assert.equal(g.match.phase, 'intro');
  for (let i = 0; i < W.match.introFrames - 1; i++) step(g, [script('6+L')[0], 0], W);
  assert.equal(g.players[0].state, 'idle');
  assert.equal(g.players[0].x, -W.battle.startXUnits, 'did not move');
  step(g, [0, 0], W);
  assert.equal(g.match.phase, 'fight');
  for (const r of script('5+L 5')) step(g, [r, 0], W);
  assert.equal(g.players[0].state, '5L');
});

test('the timer counts down once per frame and stops for a super flash', () => {
  const g = createGame(W);
  skipIntro(g);
  const t0 = g.match.timer;
  assert.equal(t0, RULES.timerSeconds * 60);
  idle(g, 60);
  assert.equal(g.match.timer, t0 - 60);
  g.flash = 20;
  idle(g, 20);
  assert.equal(g.match.timer, t0 - 60, 'frozen during the flash');
});

test('KO: the loser falls and stays down, nobody can act, then the next round starts fresh', () => {
  const g = createGame(W);
  skipIntro(g);
  g.players[0].meter = 7000;
  g.players[1].burst = 0;
  koWith5M(g);
  const [a, d] = g.players;
  assert.equal(g.match.phase, 'ko');
  assert.equal(g.match.roundWinner, 0);
  assert.equal(d.health, 0);
  idle(g, 100);
  assert.equal(d.state, 'koDown', 'stays down');
  // The winner can't act during the KO.
  for (const r of script('5+L 5*5')) step(g, [r, 0], W);
  assert.ok(!a.state.startsWith('5L'));
  const meterAtEnd = a.meter;
  while (g.match.phase === 'ko') step(g, [0, 0], W);
  assert.equal(g.match.phase, 'intro');
  assert.equal(g.match.round, 2);
  assert.deepEqual(g.match.wins, [1, 0]);
  assert.equal(d.health, W.chars[1].stats.health, 'health back');
  assert.equal(d.state, 'idle');
  assert.equal(a.x, -W.battle.startXUnits, 'back at the start positions');
  assert.equal(d.x, W.battle.startXUnits);
  assert.equal(g.match.timer, RULES.timerSeconds * 60);
  assert.equal(a.meter, meterAtEnd, 'meter carries over');
  assert.equal(d.burst, W.burst.start, 'burst refilled for the new round');
});

test('two round wins take the match; the match then stays over', () => {
  const g = createGame(W);
  for (let r = 0; r < 2; r++) {
    skipIntro(g);
    koWith5M(g);
    idle(g, RULES.koFrames + 5);
  }
  assert.equal(g.match.phase, 'end');
  assert.equal(g.match.winner, 0);
  assert.deepEqual(g.match.wins, [2, 0]);
  idle(g, 300);
  assert.equal(g.match.phase, 'end');
});

test('time up: more health left (as a share of max) wins; equal health is a draw', () => {
  const w = worldWith({ timerSeconds: 2 });
  let g = createGame(w);
  skipIntro(g, w);
  g.players[0].health -= 100;
  idle(g, 120);
  assert.equal(g.match.phase, 'timeup');
  assert.equal(g.match.roundWinner, 1);
  idle(g, RULES.timeupFrames);
  assert.deepEqual(g.match.wins, [0, 1]);
  g = createGame(w);
  skipIntro(g, w);
  idle(g, 120 + RULES.timeupFrames);
  assert.deepEqual(g.match.wins, [1, 1], 'a draw gives both a round');
});

test('a double KO is a draw round; a draw at match point ends the match as a draw', () => {
  const w = worldWith({ roundsToWin: 1 });
  const g = createGame(w);
  skipIntro(g, w);
  g.players[0].health = 0;
  g.players[1].health = 0;
  idle(g, 1, w);
  assert.equal(g.match.phase, 'ko');
  assert.equal(g.match.roundWinner, 2);
  idle(g, RULES.koFrames, w);
  assert.equal(g.match.phase, 'end');
  assert.equal(g.match.winner, 2);
});

test('the timer can be switched off', () => {
  const w = worldWith({ timerSeconds: 0 });
  const g = createGame(w);
  skipIntro(g, w);
  idle(g, 100 * 60, w);
  assert.equal(g.match.phase, 'fight');
});

test('sync test over whole matches (short timer, low health): identical after every 8-frame rewind', () => {
  const w = worldWith({ timerSeconds: 8, introFrames: 30, koFrames: 40, timeupFrames: 30, roundsToWin: 9 });
  const inp = fightInputs(99);
  let rounds = 0;
  let lastRound = 1;
  const r = runSyncTest(w, (g) => {
    if (g.match.round !== lastRound) { rounds++; lastRound = g.match.round; }
    return inp(g);
  }, { frames: 5000, distance: 8 });
  assert.ok(r.ok, `desync at ${r.failFrame}: ${r.diff}`);
  assert.ok(rounds >= 3, `several rounds played (${rounds})`);
});

test('a recorded match replays exactly, rounds and all', () => {
  const rules = { ...RULES, timerSeconds: 10, introFrames: 30 };
  const w = loadWorld(undefined, undefined, { match: rules });
  const g = createGame(w);
  const rec = createReplayRecorder({ chars: ['avner', 'avner'], match: rules, checkEvery: 120 });
  const inp = fightInputs(5);
  for (let i = 0; i < 2400 && g.match.phase !== 'end'; i++) {
    const raws = inp(g);
    step(g, raws, w);
    rec.record(raws, g);
  }
  assert.ok(g.match.round > 1);
  // The file alone rebuilds the same match rules.
  const file = JSON.parse(JSON.stringify(rec.finish(g)));
  const r = playReplay(loadWorld(undefined, undefined, { match: file.match }), file);
  assert.equal(r.ok, true);
  assert.equal(r.game.match.round, g.match.round);
});
