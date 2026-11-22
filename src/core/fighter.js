// One fighter's frame: timeline playback, input decisions (commands, cancels, movement) and physics.
// All fighter data lives on the player object in the game state; the character definition is read-only.

import { BTN, readMotion, pressedWithin, relDirAt } from './input.js';

export const CONTACT = { NONE: 0, HIT: 1, BLOCK: 2 };
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
    health: def.stats.health,
    contact: CONTACT.NONE,
    hitsDone: 0, // bitmask of this move's hit ids that already connected (multi-hit moves)
    consumed: [-1, -1, -1, -1], // game frame of the last press used per button, so one press = one move
    jumpDir: 8,
  };
}

const isAir = (def, p) => def.states[p.state].stance === 'air';

/** Switch state. Velocity rules: ground states stop the fighter unless the state keeps velocity. */
export function enterState(p, def, name) {
  const st = def.states[name];
  if (!st) throw new Error(`${def.id}: no state ${name}`);
  p.state = name;
  p.frame = 0;
  p.contact = CONTACT.NONE;
  p.hitsDone = 0;
  if (!st.keepVel && st.stance !== 'air') { p.vx = 0; p.vy = 0; }
}

/** Fire the one-shot events of the fighter's current frame. */
function fireOnEnter(game, p, def, world, inp) {
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
      case 'jump': {
        const s2 = def.stats;
        const d = p.jumpDir;
        p.vy = s2.jumpUp;
        p.vx = (d === 9 ? s2.jumpForward : d === 7 ? -s2.jumpBack : 0) * p.facing;
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
  if (cmd.air !== isAir(def, p)) return false;
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
  const dir = relDirAt(inp, 0, p.facing);
  for (const cmd of def.commands) {
    if (!allowed(cmd) || !stanceOk(cmd, def, p, dir)) continue;
    const b = cmd.buttons[cmd.buttons.length - 1];
    const bit = BTN[b];
    const age = cmd.motion
      ? readMotion(inp, rules, cmd.motion, bit, p.facing, { negativeEdge: cmd.negativeEdge })
      : pressedWithin(inp, bit, rules.pressBuffer, cmd.negativeEdge);
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
    if (p.contact === CONTACT.HIT ? c.hit : p.contact === CONTACT.BLOCK ? c.block : c.whiff) out.push(c);
  }
  return out;
}

/** Face the opponent (only while free on the ground). */
function autoFace(p, opp) {
  if (opp.x > p.x) p.facing = 1;
  else if (opp.x < p.x) p.facing = -1;
}

/** Decide what to do this frame: start a move, cancel, jump, crouch, walk, stand. */
function decide(game, p, opp, def, world) {
  const st = def.states[p.state];
  const air = st.stance === 'air';
  const windows = st.free ? null : openCancels(st, p);
  if (!st.free && !windows.length) return;
  if (st.free && !air) autoFace(p, opp);

  const allowed = st.free
    ? () => true
    : (cmd) => windows.some((w) => w.into.has(cmd.move) || w.into.has(`#${cmd.kind}`));
  const pick = pickCommand(game, p, def, world, allowed);
  if (pick) {
    p.consumed[BTN_INDEX[pick.cmd.buttons[pick.cmd.buttons.length - 1]]] = pick.pressFrame;
    enterState(p, def, pick.cmd.move);
    return;
  }

  const dir = relDirAt(p.input, 0, p.facing);
  const canJump = st.free ? !air : !air && windows.some((w) => w.into.has('#jump'));
  if (canJump && dir >= 7) {
    p.jumpDir = dir;
    enterState(p, def, 'jumpSquat');
    return;
  }
  if (!st.free || air) return;
  const want = dir <= 3 ? 'crouch' : dir === 6 ? 'walkF' : dir === 4 ? 'walkB' : 'idle';
  if (p.state !== want) enterState(p, def, want);
}

/**
 * Advance one fighter one frame.
 * Order: hitstop -> advance the timeline -> decide (input) -> fire the frame's one-shot events -> physics -> landing.
 */
export function stepFighter(game, p, opp, def, world) {
  if (p.hitstop > 0) { p.hitstop--; return; }
  const st = def.states[p.state];

  // 1. Advance the timeline.
  if (st.stun) {
    if (p.stun > 0) p.stun--;
    if (p.stun <= 0) enterState(p, def, st.next);
    else p.frame++;
  } else {
    p.frame++;
    if (p.frame >= st.duration) {
      if (st.loop) p.frame = st.loopFrom;
      else enterState(p, def, st.next);
    }
  }

  // 2. Input decisions. While squatting, an up-direction updates the jump direction.
  if (p.state === 'jumpSquat') {
    const d = relDirAt(p.input, 0, p.facing);
    if (d >= 7) p.jumpDir = d;
  }
  decide(game, p, opp, def, world);

  // 3. One-shot events of the frame we ended up on.
  fireOnEnter(game, p, def, world);

  // 4. Physics. Integer units throughout.
  const st2 = def.states[p.state];
  const fr = st2.frames[p.frame < st2.frames.length ? p.frame : st2.frames.length - 1];
  p.x += p.vx;
  p.y += p.vy;
  if (fr.gravity) p.vy -= def.stats.gravity;
  const half = world.battle.halfWidthUnits;
  if (p.x < -half) p.x = -half;
  if (p.x > half) p.x = half;

  // 5. Landing.
  if (st2.stance === 'air' && p.y <= 0 && p.vy < 0) {
    p.y = 0;
    p.vy = 0;
    p.vx = 0;
    enterState(p, def, st2.landTo);
    fireOnEnter(game, p, def, world);
  } else if (st2.stance !== 'air' && p.y !== 0) {
    p.y = 0;
  }
}
