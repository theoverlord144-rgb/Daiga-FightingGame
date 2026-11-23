// Rounds and the timer. Part of the game state (game.match), so rollback, replays and netplay agree on who won.
// Training mode runs without it (world.match = null): no timer, no KO.
//
// Phases: intro (fighters frozen, "ROUND n / FIGHT") → fight (timer runs) → ko or timeup (nobody can act; the
// loser falls and stays down) → the next round's intro, or end (the match is over).

import { createFighter, enterState } from './fighter.js';
import { px } from './fixed.js';

/** The match rules in world form (from data/system/match.json, with menu settings merged in). */
export function compileMatch(m) {
  if (!m) return null;
  return {
    ...m,
    timerFrames: m.timerSeconds > 0 ? m.timerSeconds * 60 : 0, // 0 = no timer
    koLaunchUnits: { x: px(m.koLaunch.x), y: px(m.koLaunch.y) },
  };
}

export function createMatch(world) {
  const m = world.match;
  return {
    round: 1,
    wins: [0, 0],
    timer: m.timerFrames,
    phase: 'intro',
    phaseTime: 0,
    roundWinner: -1, // after a round: 0, 1, or 2 for a draw
    winner: -1, // after the match: 0, 1, or 2 for a draw
    ko: [false, false],
  };
}

/** Called after inputs are pushed. True = nothing else happens this frame (the round intro). */
export function matchBefore(game, world) {
  const m = game.match;
  if (m.phase !== 'intro') return false;
  m.phaseTime++;
  if (m.phaseTime >= world.match.introFrames) {
    m.phase = 'fight';
    m.phaseTime = 0;
  }
  return true;
}

/** Whether players' controls work this frame (raw input is replaced with nothing when they don't). */
export function controlsLive(game) {
  return !game.match || game.match.phase === 'fight' || game.match.phase === 'intro';
}

/** Called at the end of every frame that ran. */
export function matchAfter(game, world) {
  const m = game.match;
  const rules = world.match;
  const ps = game.players;
  if (m.phase === 'fight') {
    const down = ps.map((p) => p.health <= 0);
    if (down[0] || down[1]) {
      m.phase = 'ko';
      m.phaseTime = 0;
      m.ko = down;
      m.roundWinner = down[0] && down[1] ? 2 : down[0] ? 1 : 0;
      for (const p of ps) if (down[p.id]) koFall(p, world);
      return;
    }
    if (rules.timerFrames > 0) {
      m.timer--;
      if (m.timer <= 0) {
        m.timer = 0;
        m.phase = 'timeup';
        m.phaseTime = 0;
        // Higher share of health left wins; equal = a draw.
        const share = ps.map((p) => Math.trunc((p.health * 10000) / world.chars[p.id].stats.health));
        m.roundWinner = share[0] === share[1] ? 2 : share[0] > share[1] ? 0 : 1;
      }
    }
    return;
  }
  if (m.phase === 'ko' || m.phase === 'timeup') {
    m.phaseTime++;
    // A knocked-out fighter stays down.
    for (const p of ps) if (m.ko[p.id] && p.state === 'knockdown') enterState(p, world.chars[p.id], 'koDown');
    if (m.phaseTime >= (m.phase === 'ko' ? rules.koFrames : rules.timeupFrames)) endRound(game, world);
  }
}

function koFall(p, world) {
  // Being thrown or already down: the throw / knockdown plays out and ends in koDown.
  if (p.state === 'thrown' || p.state === 'knockdown' || p.state === 'koDown') return;
  const airborne = p.state === 'hitAir' || p.state === 'tumble' || p.y > 0;
  enterState(p, world.chars[p.id], 'hitAir');
  p.stun = 999; // never recovers or techs: falls until it lands in a knockdown
  if (!airborne) { // standing: knocked off their feet
    p.vx = -p.facing * world.match.koLaunchUnits.x;
    p.vy = world.match.koLaunchUnits.y;
  }
}

function endRound(game, world) {
  const m = game.match;
  const rules = world.match;
  if (m.roundWinner === 2) { m.wins[0]++; m.wins[1]++; } else m.wins[m.roundWinner]++;
  const done = m.wins.map((w) => w >= rules.roundsToWin);
  if (done[0] || done[1]) {
    m.phase = 'end';
    m.phaseTime = 0;
    m.winner = done[0] && done[1] ? 2 : done[0] ? 0 : 1;
    return;
  }
  m.round++;
  m.timer = rules.timerFrames;
  m.phase = 'intro';
  m.phaseTime = 0;
  m.roundWinner = -1;
  m.ko = [false, false];
  game.flash = 0;
  game.flashBy = -1;
  game.projectiles = [];
  for (const p of game.players) {
    const def = world.chars[p.id];
    const keep = { input: p.input, meter: p.meter, burst: p.burst };
    Object.assign(p, createFighter(def, p.id, p.id === 0 ? -world.battle.startXUnits : world.battle.startXUnits));
    p.input = keep.input;
    p.meter = rules.meterCarries ? keep.meter : p.meter;
    p.burst = rules.burstRefillsEachRound && world.burst ? world.burst.start : keep.burst;
  }
}
