// Training-mode frame meter. Watches the game after every step and measures, live:
//   - a frame bar per player (one cell per frame: startup, active, recovery, stun, busy, free; invincible marked),
//   - each move's startup / active / recovery, as played,
//   - the frame advantage after a hit or block.
// Pure (no DOM): the tests drive it directly. It only reads the game; it never changes it.
// Frames where a fighter is frozen in hitstop are skipped, as frame meters usually do.

import { frameOf } from '../../core/character.js';

/** States in which a fighter is stuck because they were hit, blocked or knocked down. */
export const STUN_STATES = new Set(['hitStand', 'hitCrouch', 'hitAir', 'tumble', 'knockdown', 'wakeup', 'crumple',
  'blockStand', 'blockCrouch', 'blockAir', 'thrown']);

/** Frame advantage straight from the data: hitstun (or blockstun) minus the attacker's frames left after contact. */
export function advantageFromData(move, { block = false, activeIndex = 0, counterAdd = 0 } = {}) {
  const left = move.active + move.recovery - 1 - activeIndex;
  return (block ? move.blockstun : move.hitstun + counterAdd) - left;
}

export function createFrameMeter({ length = 80 } = {}) {
  const bars = [[], []]; // per player: [{ kind, inv }] oldest first, at most `length`
  const prev = [null, null]; // per player: { state, frame, hitstop, dur }
  const track = [null, null]; // per player: the move instance being measured
  const last = [null, null]; // per player: the last finished move measurement
  let adv = null; // the advantage being (or last) measured
  let idleRun = 0; // frames both players have been free: after a pause, the next action starts a fresh bar

  function finishMove(i) {
    const t = track[i];
    track[i] = null;
    if (!t) return;
    last[i] = t.firstActive === null
      ? { move: t.move, startup: null, active: null, recovery: null, total: t.t, cancelled: t.cancelled }
      : { move: t.move, startup: t.firstActive, active: t.lastActive - t.firstActive + 1,
        recovery: t.t - t.lastActive, total: t.t, cancelled: t.cancelled };
  }

  let flashPrev = 0;
  function update(game, world) {
    const flashNow = game.flash ?? 0;
    const pending = [null, null];
    for (const p of game.players) {
      const i = p.id;
      const def = world.chars[i];
      const st = def.states[p.state];
      const pv = prev[i];
      // Hitstop at the start of this step froze the fighter; a super flash freezes everyone.
      const frozen = (pv !== null && pv.hitstop > 0) || flashPrev > 0;
      prev[i] = { state: p.state, frame: p.frame, hitstop: p.hitstop, dur: st.duration };
      if (frozen) continue;

      // Move tracking: a move starts on its frame 0 (a cancel ends the previous one early).
      if (st.move && p.frame === 0) {
        if (track[i]) { track[i].cancelled = true; finishMove(i); }
        track[i] = { move: p.state, t: 0, firstActive: null, lastActive: null, cancelled: false };
      } else if (track[i] && track[i].move !== p.state) {
        // A throw that grabs leaves its move on the very frame its throwbox is out: count that frame as active.
        const t = track[i];
        if (game.cues.some((c) => c.type === 'throw' && c.p === i)) {
          t.t++;
          if (t.firstActive === null) t.firstActive = t.t;
          t.lastActive = t.t;
        }
        finishMove(i);
      }

      const fr = frameOf(def, p.state, p.frame);
      let kind;
      const t = track[i];
      if (t) {
        t.t++;
        if (fr.hit.length || fr.throw.length) {
          if (t.firstActive === null) t.firstActive = t.t;
          t.lastActive = t.t;
          kind = 'active';
        } else kind = t.firstActive === null ? 'startup' : 'recovery';
      } else if (STUN_STATES.has(p.state)) kind = 'stun';
      else if (st.free) kind = 'free';
      else kind = 'busy';
      pending[i] = { kind, inv: !!(fr.invStrike || fr.invThrow) };
    }

    flashPrev = flashNow;
    // While both players are free the bar holds still, showing the last exchange. After 20 quiet frames, the next
    // action clears it, so a new move always starts at the left edge.
    // (The first few free frames still show, so short gaps where both players can act are visible.)
    const quiet = pending[0]?.kind === 'free' && pending[1]?.kind === 'free';
    if (quiet && ++idleRun > 8) return finishAdvantage(game, world);
    if (quiet) { for (const i of [0, 1]) bars[i].push(pending[i]); trim(); return finishAdvantage(game, world); }
    if (idleRun >= 20) { bars[0].length = 0; bars[1].length = 0; }
    idleRun = 0;
    for (const i of [0, 1]) if (pending[i]) bars[i].push(pending[i]);
    trim();
    finishAdvantage(game, world);
  }

  function trim() {
    for (const bar of bars) if (bar.length > length) bar.splice(0, bar.length - length);
  }

  function finishAdvantage(game, world) {

    // Advantage: from a hit or block, the first frame each side can act again.
    for (const c of game.cues) {
      if ((c.type !== 'hit' && c.type !== 'counter' && c.type !== 'witness' && c.type !== 'block') || c.throw) continue;
      adv = { attacker: c.p, kind: c.type === 'block' ? 'block' : 'hit', move: c.move, start: game.frame,
        aFree: null, dFree: null, value: null, done: false, note: null };
    }
    if (adv && !adv.done && adv.start !== game.frame) {
      const A = game.players[adv.attacker];
      const D = game.players[1 - adv.attacker];
      const aPrev = prevA;
      const restarted = aPrev && A.state === aPrev.state && A.frame < aPrev.frame; // the same move again
      if (adv.aFree === null && (A.state !== adv.move || restarted)) {
        // Left the move: on its last frame = free to act now; before that = cancelled into something.
        const natural = aPrev && aPrev.state === adv.move && aPrev.frame >= aPrev.dur - 1;
        if (natural || world.chars[A.id].states[A.state].free) adv.aFree = game.frame;
        else { adv.done = true; adv.note = 'cancelled'; }
      }
      if (adv.dFree === null && !STUN_STATES.has(D.state)) adv.dFree = game.frame;
      if (!adv.done && adv.aFree !== null && adv.dFree !== null) {
        adv.value = adv.dFree - adv.aFree;
        adv.done = true;
      }
    }
    if (adv) {
      const A = game.players[adv.attacker];
      prevA = { state: A.state, frame: A.frame, dur: world.chars[A.id].states[A.state].duration };
    }
  }
  let prevA = null;

  return {
    get quietFrames() { return idleRun; },
    bars,
    last,
    get advantage() { return adv; },
    update,
    reset() { bars[0].length = bars[1].length = 0; track[0] = track[1] = null; adv = null; prevA = null; prev[0] = prev[1] = null; },
  };
}
