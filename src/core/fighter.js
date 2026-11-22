// One fighter's frame, in stages the game runs for both fighters together (see game.js step()):
//   advanceAndDecide  -> timeline + input decisions (positions don't change, so both fighters see the same world)
//   move              -> one-shot events, physics, pushback slide
//   land              -> touching the ground ends air states
// All fighter data lives on the player object in the game state; the character definition is read-only.

import { BTN, readMotion, pressedWithin, relDirAt, dirMotionNow } from './input.js';
import { pct } from './fixed.js';

export const CONTACT = { NONE: 0, HIT: 1, BLOCK: 2, CLASH: 3 };
const BTN_INDEX = { L: 0, M: 1, H: 2, S: 3 };

/** Fighter fields, merged into a player object. */
export function createFighter(def, side, x) {
  return {
    char: def.id,
    x,
    y: 0,
    vx: 0,
    vy: 0,
    facing: side === 0 ? 1 : -1,
    state: 'idle',
    frame: 0,
    stun: 0,
    hitstop: 0,
    freezeAge: 0, // hitstop frames since this fighter last acted: presses made during hitstop stay buffered
    health: def.stats.health,
    contact: CONTACT.NONE,
    hitsDone: 0, // bitmask of this move's hit ids that already connected (multi-hit moves)
    armorUsed: 0,
    consumed: [-1, -1, -1, -1], // game frame of the last press used per button, so one press = one move
    jumpDir: 8,
    airJumpsUsed: 0,
    airDashesUsed: 0,
    slide: 0, // pushback still to travel (signed, units), spread over slideLeft frames
    slideLeft: 0,
    slid: 0, // how far the slide moved the fighter this frame (for corner transfer)
    combo: null, // while this fighter is being comboed: { hits, damage, time, scale, used: { moveId: n }, wb, gb }
    lastCombo: null, // the last finished combo against this fighter (for the HUD and training mode)
    wbX: 0, // pending wall bounce (rebound speed, units; 0 = none)
    wbY: 0,
    gbY: 0, // pending ground bounce (upward speed, units; 0 = none)
    throwBy: -1, // while being thrown: the attacker's id
    throwMove: '',
  };
}

export const isAirborne = (def, p) => def.states[p.state].stance === 'air';

/** Switch state. Velocity rules: ground states stop the fighter unless the state keeps velocity. */
export function enterState(p, def, name) {
  const st = def.states[name];
  if (!st) throw new Error(`${def.id}: no state ${name}`);
  p.state = name;
  p.frame = 0;
  p.contact = CONTACT.NONE;
  p.hitsDone = 0;
  p.armorUsed = 0;
  if (!st.keepVel && st.stance !== 'air') { p.vx = 0; p.vy = 0; }
}

/** Fire the one-shot events of the fighter's current frame. */
export function fireOnEnter(game, p, def) {
  const st = def.states[p.state];
  const shots = st.onEnter[p.frame < st.onEnter.length ? p.frame : st.onEnter.length - 1];
  if (!shots || !shots.length) return;
  for (const s of shots) {
    const v = s.value;
    switch (s.type) {
      case 'vel':
        if (v.x !== undefined) p.vx = v.x * p.facing;
        if (v.y !== undefined) p.vy = v.y;
        break;
      case 'addVel':
        if (v.x !== undefined) p.vx += v.x * p.facing;
        if (v.y !== undefined) p.vy += v.y;
        break;
      case 'velScale':
        if (v.x !== undefined) p.vx = pct(p.vx, v.x);
        if (v.y !== undefined) p.vy = pct(p.vy, v.y);
        break;
      case 'jump': {
        // Three jump kinds, each with its own numbers: normal, super, air (double jump).
        const s2 = def.stats;
        const k = v === 'super' ? 'superJump' : v === 'air' ? 'airJump' : 'jump';
        const d = p.jumpDir;
        p.vy = s2[`${k}Up`];
        p.vx = (d === 9 ? s2[`${k}Forward`] : d === 7 ? -s2[`${k}Back`] : 0) * p.facing;
        break;
      }
      case 'sound':
      case 'fx':
        game.cues.push({ p: p.id, type: s.type, name: v, x: p.x, y: p.y, facing: p.facing });
        break;
    }
  }
}

/** Is a command's direction/stance satisfied right now? */
function stanceOk(cmd, def, p, dir) {
  if (cmd.air !== isAirborne(def, p)) return false;
  if (cmd.motion) return true;
  const d = cmd.dir;
  if (d === '5') return cmd.air ? true : dir >= 4; // any non-down
  if (d === '2') return dir <= 3;
  return String(dir) === d;
}

/** Find the command to start this frame, if any. `allowed(cmd)` filters by cancel rules. */
function pickCommand(game, p, def, world, allowed) {
  const inp = p.input;
  const rules = world.input;
  const buffer = rules.pressBuffer + p.freezeAge;
  const dir = relDirAt(inp, 0, p.facing);
  for (const cmd of def.commands) {
    if (!allowed(cmd) || !stanceOk(cmd, def, p, dir)) continue;
    const b = cmd.buttons[cmd.buttons.length - 1];
    const bit = BTN[b];
    const age = cmd.motion
      ? readMotion(inp, rules, cmd.motion, bit, p.facing, { negativeEdge: cmd.negativeEdge, pressBuffer: buffer })
      : pressedWithin(inp, bit, buffer, cmd.negativeEdge);
    if (age < 0) continue;
    const pressFrame = game.frame - age;
    if (pressFrame <= p.consumed[BTN_INDEX[b]]) continue;
    return { cmd, pressFrame };
  }
  return null;
}

/** Cancel windows of the current state that are open on this frame for this contact. */
function openCancels(st, p) {
  const out = [];
  for (const c of st.cancels) {
    if (p.frame < c.from || p.frame > c.to) continue;
    const ok = p.contact === CONTACT.HIT ? c.hit : p.contact === CONTACT.NONE ? c.whiff : c.block; // a clash counts as block
    if (ok) out.push(c);
  }
  return out;
}

/** Decide what to do this frame: start a move, cancel, jump, crouch, walk, stand. */
function decide(game, p, opp, def, world) {
  const st = def.states[p.state];
  const air = st.stance === 'air';
  const windows = st.free ? null : openCancels(st, p);
  if (!st.free && !windows.length) return;
  if (st.free && !air) {
    if (opp.x > p.x) p.facing = 1;
    else if (opp.x < p.x) p.facing = -1;
  }

  const allowed = st.free
    ? () => true
    : (cmd) => windows.some((w) => w.into.has(cmd.move) || w.into.has(`#${cmd.kind}`));
  const pick = pickCommand(game, p, def, world, allowed);
  if (pick) {
    p.consumed[BTN_INDEX[pick.cmd.buttons[pick.cmd.buttons.length - 1]]] = pick.pressFrame;
    enterState(p, def, pick.cmd.move);
    return;
  }

  const inp = p.input;
  const rules = world.input;
  const dir = relDirAt(inp, 0, p.facing);
  const freshUp = dir >= 7 && relDirAt(inp, 1, p.facing) < 7;
  const canJump = st.free || windows.some((w) => w.into.has('#jump'));
  const canDash = st.free || windows.some((w) => w.into.has('#dash'));
  // Launcher: on hit, up goes straight into a super jump (no pre-jump), following the opponent up.
  if (!st.free && !air && dir >= 7 && windows.some((w) => w.into.has('#superjump'))) {
    p.jumpDir = dir;
    enterState(p, def, 'superJump');
    return;
  }
  const stats = def.stats;

  if (air) {
    // Airdash (66 / 44) and double jump (a fresh up), each limited per jump.
    if (canDash && p.airDashesUsed < stats.airDashes) {
      const f = dirMotionNow(inp, rules, '66', p.facing);
      if (f || dirMotionNow(inp, rules, '44', p.facing)) {
        p.airDashesUsed++;
        enterState(p, def, f ? 'airdashF' : 'airdashB');
        return;
      }
    }
    if (canJump && freshUp && p.airJumpsUsed < stats.airJumps) {
      p.airJumpsUsed++;
      p.jumpDir = dir;
      enterState(p, def, 'airJump');
    }
    return;
  }

  if (canJump && dir >= 7) {
    p.jumpDir = dir;
    // Down then up quickly (28) is a super jump.
    enterState(p, def, dirMotionNow(inp, rules, '28', p.facing) ? 'superJumpSquat' : 'jumpSquat');
    return;
  }
  if (canDash) {
    if (dirMotionNow(inp, rules, '66', p.facing)) { enterState(p, def, 'dashF'); return; }
    if (dirMotionNow(inp, rules, '44', p.facing)) { enterState(p, def, 'backdash'); return; }
  }
  if (!st.free) return;
  const want = dir <= 3 ? 'crouch' : dir === 6 ? 'walkF' : dir === 4 ? 'walkB' : 'idle';
  if (p.state !== want) enterState(p, def, want);
}

/** Stage A: advance the timeline, then decide. Returns false if the fighter is frozen in hitstop. */
export function advanceAndDecide(game, p, opp, def, world, hooks) {
  const st = def.states[p.state];
  if (st.stun) {
    if (p.stun > 0) { p.stun--; p.frame++; }
    else {
      if (st.throwVictim) hooks.throwLands(p);
      enterState(p, def, st.next);
    }
  } else {
    p.frame++;
    if (p.frame >= st.duration) {
      if (st.loop) p.frame = st.loopFrom;
      else enterState(p, def, st.next);
    }
  }
  // Air tech: once the untechable time is over, any button recovers.
  const st1 = def.states[p.state];
  if (st1.techable) {
    const buffer = world.input.pressBuffer + p.freezeAge;
    if ([BTN.L, BTN.M, BTN.H, BTN.S].some((b) => pressedWithin(p.input, b, buffer) >= 0)) {
      enterState(p, def, 'airTech');
    }
  }
  if (p.state === 'jumpSquat' || p.state === 'superJumpSquat') {
    const d = relDirAt(p.input, 0, p.facing);
    if (d >= 7) p.jumpDir = d;
  }
  decide(game, p, opp, def, world);
  p.freezeAge = 0;
}

/** Stage B: one-shot events, physics, pushback slide. */
export function move(game, p, def, world) {
  fireOnEnter(game, p, def);
  const st = def.states[p.state];
  const fr = st.frames[p.frame < st.frames.length ? p.frame : st.frames.length - 1];
  p.x += p.vx;
  p.y += p.vy;
  if (fr.gravity) {
    let g = def.stats.gravity;
    // Juggle gravity: the longer the combo, the faster a juggled fighter falls.
    if (p.combo && (st.stun || st.techable)) {
      const C = world.combo;
      g = pct(g, 10000 + Math.min(C.juggleGravityMax, p.combo.hits * C.juggleGravityPerHit));
    }
    p.vy -= g;
  }
  p.slid = 0;
  if (p.slideLeft > 0) {
    // Pushback slides over several frames, fastest first: frame i of n moves 2(n-i)/(n(n+1)) of the total.
    const n = p.slideLeft;
    const d = n === 1 ? p.slide : Math.trunc((p.slide * 2) / (n + 1));
    p.x += d;
    p.slid = d;
    p.slide -= d;
    p.slideLeft--;
  }
}

/** Stage D: landing. */
export function land(game, p, def, world) {
  const st = def.states[p.state];
  if (st.stance === 'air' && p.y <= 0 && p.vy < 0 && p.gbY > 0 && p.combo) {
    // Ground bounce: back up instead of a knockdown.
    p.y = 0;
    p.vy = p.gbY;
    p.gbY = 0;
    p.combo.gb++;
    enterState(p, def, 'hitAir');
    p.stun = world.combo.bounceUntech;
    game.cues.push({ type: 'groundbounce', p: p.id, x: p.x, y: 0 });
    return;
  }
  if (st.stance === 'air' && p.y <= 0 && p.vy < 0) {
    p.y = 0;
    p.vy = 0;
    p.vx = 0;
    p.stun = 0;
    p.airJumpsUsed = 0;
    p.airDashesUsed = 0;
    enterState(p, def, st.landTo);
    fireOnEnter(game, p, def);
  } else if (st.stance !== 'air' && p.y !== 0) {
    p.y = 0;
  }
}

/** Start a pushback slide of `dist` units (signed, world direction). */
export function startSlide(p, dist, frames) {
  p.slide = dist;
  p.slideLeft = dist === 0 ? 0 : Math.max(1, frames);
}
