// One fighter's frame, in stages the game runs for both fighters together (see game.js step()):
//   advanceAndDecide  -> timeline + input decisions (positions don't change, so both fighters see the same world)
//   move              -> one-shot events, physics, pushback slide
//   land              -> touching the ground ends air states
// All fighter data lives on the player object in the game state; the character definition is read-only.

import { BTN, readMotion, pressedWithin, relDirAt, dirMotionNow, chordWithin, motionAt, held as isHeld } from './input.js';
import { pct } from './fixed.js';

export const CONTACT = { NONE: 0, HIT: 1, BLOCK: 2, CLASH: 3 };
const BTN_INDEX = { L: 0, M: 1, H: 2, S: 3, R: 4 };
const ATTACK = ['L', 'M', 'H'];
/** Is the Rite gauge unlimited right now (the character's `unlimitedWhile` var is running)? */
export const riteUnlimited = (p, def) => !!def.rite?.gauge?.unlimitedWhile && (p.vars[def.rite.gauge.unlimitedWhile] | 0) > 0;

/** The Rite gauge refills one charge at a time, each taking rechargeFrames. */
export function tickRite(p, def) {
  const g = def.rite?.gauge;
  if (!g) return;
  if (p.rite >= g.charges) { p.riteTimer = 0; return; }
  if (++p.riteTimer >= g.rechargeFrames) { p.rite++; p.riteTimer = 0; }
}

/** The button pairs that Repel or Draw during blockstun: any two of the three attack buttons. */
const GUARD_PAIRS = [['M', 'H'], ['L', 'M'], ['L', 'H']];

/**
 * Apply this frame's Repel and Draw requests (p.guardAct), after both fighters have advanced and decided.
 * Repel: the attacker slides far away; free; locked out for a while after. Draw: costs Devotion; an attacker on
 * the ground and in an attack is pulled a step closer and left at a disadvantage; otherwise nothing happens.
 */
export function resolveGuardActions(game, world) {
  for (const p of game.players) {
    const act = p.guardAct;
    if (!act) continue;
    p.guardAct = 0;
    const opp = game.players[1 - p.id];
    const def = world.chars[p.id];
    const odef = world.chars[opp.id];
    const away = opp.x > p.x || (opp.x === p.x && p.facing > 0) ? 1 : -1; // from the defender toward the attacker
    const stun = p.stun;
    if (act === 1) {
      const R = world.sys.repel;
      p.repelAt = game.frame;
      startSlide(opp, away * R.push, R.frames);
      enterState(p, def, 'repel');
      p.stun = Math.max(1, stun); // the blockstun runs on as it was
      gainDevotion(game, p, def, def.devotion.extras.repel, 'repel');
      game.cues.push({ p: p.id, type: 'repel', x: p.x, y: p.y });
      continue;
    }
    const D = world.sys.draw;
    p.meter = Math.max(0, p.meter - D.cost);
    const ost = odef.states[opp.state];
    const works = !!ost.move && ost.move.active > 0 && !isAirborne(odef, opp);
    if (works) {
      p.drawAt = game.frame;
      const gap = Math.abs(opp.x - p.x);
      startSlide(opp, -away * Math.max(0, Math.min(D.step, gap - D.minGap)), D.frames);
      enterState(opp, odef, 'drawn');
      opp.stun = D.stun + D.advantage;
      opp.hitstop = 0;
      enterState(p, def, 'draw');
      p.stun = D.stun;
    }
    game.cues.push({ p: p.id, type: 'draw', x: p.x, y: p.y, whiffed: !works });
  }
}

/** Hitstun states a fighter can tech out of once the combo has run past combo.json techOutAt. */
const TECH_OUT_STATES = new Set(['hitStand', 'hitCrouch', 'hitAir', 'crumple']);

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
    stateTime: 0, // frames spent in the current state, loops included (held stances time out on it)
    stun: 0,
    hitstop: 0,
    freezeAge: 0, // hitstop frames since this fighter last acted: presses made during hitstop stay buffered
    health: def.stats.health,
    contact: CONTACT.NONE,
    hitsDone: 0, // bitmask of this move's hit ids that already connected (multi-hit moves)
    armorUsed: 0,
    consumed: [-1, -1, -1, -1, -1], // game frame of the last press used per button, so one press = one move
    viaCancel: 0, // 1 = the current move was cancelled into (not started from a free state)
    hsEnd: -1, // the game frame this fighter came out of the hitstop of its current move's hit (-1 = it hasn't)
    hsLen: 0, // how long that hitstop was
    link: 0, // 1 = the current move was a Perfect Link: its first hit adds nothing to the combo's scaling
    debt: 0, // Vow: damage absorbed and still owed (health units)
    debtRate: 0, // how much of it drains away per frame once Vow is over
    atkFrame: -1000, // the last game frame this fighter was in an attack's active or recovery frames
    repelAt: -1000, // the game frame of this fighter's last Repel (its lockout counts from here)
    drawAt: -1000, // the game frame of this fighter's last Draw that pulled the attacker in (for the punish refund)
    rite: def.rite?.gauge ? def.rite.gauge.charges : 0, // Rite gauge: charges ready
    riteTimer: 0, // frames into refilling the next charge
    guardAct: 0, // this frame's request: 1 = Repel, 2 = Draw (resolved after both fighters have acted)
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
    meter: def.meterStart ?? 0, // Devotion, game units (one point is 100 units; a bar is 10000)
    spGain: 0, // Devotion the current move gave for being a special (taken back if it turns into its EX version)
    burst: 0, // burst gauge (set from burst.json when the game is created)
    gauge: def.mechanic?.gauge ? def.mechanic.gauge.start : 0, // the character mechanic's gauge
    vars: Object.fromEntries(Object.entries(def.mechanic?.vars || {}).map(([k, v]) => [k, v.start])), // its counters
  };
}

// ---------- Resources: meter, the mechanic gauge and vars ----------

const clampTo = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Add meter / gauge / vars, clamped to their limits. r = { meter, gauge, vars: { name: n } } */
export function applyResources(p, def, r) {
  if (!r) return;
  if (r.meter) p.meter = clampTo(p.meter + r.meter, 0, def.meterMax);
  const g = def.mechanic?.gauge;
  if (g && r.gauge) p.gauge = clampTo(p.gauge + r.gauge, 0, g.max);
  for (const [k, n] of Object.entries(r.vars || {})) {
    const v = def.mechanic.vars[k];
    if (v) p.vars[k] = clampTo(p.vars[k] + n, v.min, v.max);
  }
}

/**
 * Give a fighter Devotion from a named source. `give` = it came from the Give side (attacking): the opponent's
 * current combo keeps the total, because Absolve wipes it. The combo it belongs to (the opponent's for Give, the
 * fighter's own for Take) also keeps a tally per source, for the training readouts. Returns what was actually
 * gained (the meter may be full).
 */
export function gainDevotion(game, p, def, amount, source, give = false) {
  if (amount <= 0) return 0;
  const before = p.meter;
  applyResources(p, def, { meter: amount });
  const got = p.meter - before;
  if (got > 0) {
    const c = give ? game.players[1 - p.id].combo : p.combo;
    if (c) {
      if (give) c.gave += got;
      c.by[source] = (c.by[source] || 0) + got;
    }
  }
  return got;
}

/** Do the fighter's resources satisfy a requirement { meter, gauge, vars: { name: [min, max] or min } }? */
export function meets(p, req) {
  if (!req) return true;
  if (p.meter < (req.meter | 0) || p.gauge < (req.gauge | 0)) return false;
  for (const [k, range] of Object.entries(req.vars || {})) {
    const [lo, hi] = Array.isArray(range) ? range : [range, Infinity];
    const v = p.vars[k] ?? 0;
    if (v < lo || v > hi) return false;
  }
  return true;
}

/** Can the fighter pay a cost { meter, gauge, vars: { name: n } }? */
function affords(p, cost) {
  if (!cost) return true;
  if (p.meter < cost.meter || p.gauge < cost.gauge) return false;
  for (const [k, n] of Object.entries(cost.vars)) if ((p.vars[k] ?? 0) < n) return false;
  return true;
}

const negate = (cost) => ({ meter: -cost.meter, gauge: -cost.gauge, vars: Object.fromEntries(Object.entries(cost.vars).map(([k, n]) => [k, -n])) });

export const isAirborne = (def, p) => def.states[p.state].stance === 'air';

/** Switch state. Velocity rules: ground states stop the fighter unless the state keeps velocity. */
export function enterState(p, def, name) {
  const st = def.states[name];
  if (!st) throw new Error(`${def.id}: no state ${name}`);
  // Leaving a move that never touched anyone: the move's on-whiff effects (a whiff builds no Devotion). Not when
  // the fighter is knocked out of it by a hit, a block or a throw: that's an interruption, not a whiff.
  const old = def.states[p.state]?.move;
  if (old && p.contact === CONTACT.NONE && p.hitsDone === 0 && !st.stun && !st.throwVictim) applyResources(p, def, old.onWhiff);
  p.state = name;
  p.frame = 0;
  p.stateTime = 0;
  p.hsEnd = -1;
  p.hsLen = 0;
  p.link = 0;
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
      case 'superFlash':
        // The whole game freezes for v frames (the screen dims); presses made meanwhile stay buffered.
        game.flash = v;
        game.flashBy = p.id;
        game.cues.push({ p: p.id, type: 'superflash', frames: v, x: p.x, y: p.y });
        break;
      case 'meter':
        applyResources(p, def, { meter: v });
        break;
      case 'gauge':
        applyResources(p, def, { gauge: v });
        break;
      case 'addVar':
        applyResources(p, def, { vars: v });
        break;
      case 'toOpponent': {
        // Slide to the opponent, stopping v.to units in front of them (Lightstep). Pushboxes still keep the two apart.
        const o = game.players[1 - p.id];
        const gap = o.x - p.x;
        const dir = gap === 0 ? p.facing : gap > 0 ? 1 : -1;
        const dist = (gap < 0 ? -gap : gap) - v.to;
        startSlide(p, dist > 0 ? dir * dist : 0, v.frames);
        break;
      }
      case 'spawn': {
        // A projectile: its own object in the game state from here on (see combat.js).
        const d = def.projectiles[v];
        game.projectiles.push({ owner: p.id, kind: v, x: p.x + p.facing * d.spawn[0], y: (d.fromGround ? 0 : p.y) + d.spawn[1], facing: p.facing, age: 0 });
        game.cues.push({ p: p.id, type: 'spawn', name: v, x: p.x, y: p.y, facing: p.facing });
        break;
      }
      case 'setVar':
        for (const [k, n] of Object.entries(v)) {
          const d = def.mechanic.vars[k];
          if (d) p.vars[k] = clampTo(n, d.min, d.max);
        }
        break;
    }
  }
}

/** Is a command's direction/stance satisfied right now? */
function stanceOk(cmd, def, p, dir) {
  if (cmd.air !== isAirborne(def, p)) return false;
  if (cmd.motion || cmd.anyDir) return true;
  const d = cmd.dir;
  if (d === '5') return cmd.air ? true : dir >= 4; // any non-down
  if (d === '2') return dir <= 3;
  return String(dir) === d;
}

/**
 * Is this command's input there? Returns the press frame per button used ({ L: frame, ... }) or null.
 * One button: the usual press (or release, for negative edge) within the buffer, after the motion if any.
 * Several buttons (a chord, e.g. EX 236LS): all pressed within chordWindow frames of each other.
 */
// reuse = button letters whose press may be used again although the move being replaced already used it (EX
// upgrades, and an S launcher swapped for what the attack button pressed with it asks for).
function commandInput(game, p, cmd, world, buffer, reuse = '') {
  const inp = p.input;
  const rules = world.input;
  if (cmd.buttons.length === 1) {
    const b = cmd.buttons;
    const age = cmd.motion
      ? readMotion(inp, rules, cmd.motion, BTN[b], p.facing, { negativeEdge: cmd.negativeEdge, pressBuffer: buffer })
      : pressedWithin(inp, BTN[b], buffer, cmd.negativeEdge);
    if (age < 0) return null;
    const f = game.frame - age;
    return f < p.consumed[BTN_INDEX[b]] || (f === p.consumed[BTN_INDEX[b]] && !reuse.includes(b)) ? null : { [b]: f };
  }
  const bs = [...cmd.buttons];
  const ch = chordWithin(inp, bs.map((b) => BTN[b]), buffer, rules.chordWindow ?? 3);
  if (!ch) return null;
  if (cmd.motion && !motionAt(inp, rules, cmd.motion, p.facing, Math.max(...ch.ages))) return null;
  const out = {};
  for (let i = 0; i < bs.length; i++) {
    const f = game.frame - ch.ages[i];
    const used = p.consumed[BTN_INDEX[bs[i]]];
    if (f < used || (f === used && !reuse.includes(bs[i]))) return null;
    out[bs[i]] = f;
  }
  return out;
}

/**
 * Find the command to start this frame, if any. `allowed(cmd)` filters by cancel rules.
 *
 * S next to an attack button: S pressed within chordWindow frames of L, M or H is never the S move. With a motion
 * the pair is the EX version (a two-button command, found first); otherwise the attack button's own move comes out
 * and the S press is used up with it. The S move only comes out if nothing the attack button asks for can.
 */
function pickCommand(game, p, def, world, allowed, reuse = '') {
  const inp = p.input;
  const cw = world.input.chordWindow ?? 3;
  const buffer = world.input.pressBuffer + p.freezeAge;
  const dir = relDirAt(inp, 0, p.facing);
  const sAge = pressedWithin(inp, BTN.S, buffer + cw);
  const sFrame = game.frame - sAge;
  const sFree = sAge >= 0 && sFrame > p.consumed[BTN_INDEX.S];
  const near = (f) => (f > sFrame ? f - sFrame : sFrame - f) <= cw;
  const withAttack = sAge >= 0 && ATTACK.some((b) => {
    const a = pressedWithin(inp, BTN[b], buffer + cw);
    return a >= 0 && game.frame - a > p.consumed[BTN_INDEX[b]] && near(game.frame - a);
  });
  for (const pass of withAttack ? [0, 1] : [1]) {
    for (const cmd of def.commands) {
      if (pass === 0 && cmd.buttons === 'S' && !cmd.motion) continue; // first, everything but the plain S moves
      if (!allowed(cmd) || !stanceOk(cmd, def, p, dir)) continue;
      if (!affords(p, cmd.cost) || !meets(p, cmd.requires)) continue;
      if (cmd.rite && p.rite < 1 && !riteUnlimited(p, def)) continue;
      if (cmd.perCombo && overCombo(game.players[1 - p.id], cmd)) continue;
      if (cmd.throw && !throwInRange(game, p, def, world, cmd)) continue;
      if (cmd.oneAtATime && game.projectiles.some((q) => q.owner === p.id && q.kind === cmd.oneAtATime)) continue;
      const presses = commandInput(game, p, cmd, world, buffer, reuse);
      if (!presses) continue;
      // An attack button's move takes the S pressed with it along, so that S can't start anything later.
      if (sFree && presses.S === undefined && ATTACK.some((b) => presses[b] !== undefined && near(presses[b]))) presses.S = sFrame;
      return { cmd, presses };
    }
  }
  return null;
}

/** The opponent's current combo already took this move as many times as it's allowed. */
const overCombo = (o, cmd) => !!o.combo && (o.combo.used[cmd.move] || 0) >= cmd.perCombo;

/**
 * Would this throw grab the opponent as they stand right now? A throw command only comes out in range of an
 * opponent who can be thrown; otherwise the input falls through to the next command it matches (4H: back throw up
 * close, the Back Heavy strike from farther away), so a throw never whiffs by accident.
 */
function throwInRange(game, p, def, world, cmd) {
  const o = game.players[1 - p.id];
  const ost = world.chars[o.id].states[o.state];
  if (ost.stance === 'air' || ost.stun || o.y !== 0) return false; // the same rule the grab itself uses (combat.js)
  const fo = ost.frames[o.frame < ost.frames.length ? o.frame : ost.frames.length - 1];
  if (fo.invThrow) return false;
  const st = def.states[cmd.move];
  const grab = st.frames[Math.min(st.move.startup - 1, st.frames.length - 1)].throw;
  const span = (q, [x, y, w, h]) => {
    const l = q.facing > 0 ? q.x + x : q.x - x - w;
    return [l, q.y + y, l + w, q.y + y + h];
  };
  for (const tb of grab) {
    const a = span(p, tb);
    for (const hb of fo.throwHurt) {
      const b = span(o, hb);
      if (a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]) return true;
    }
  }
  return false;
}

/**
 * Perfect Link timing of a cancel after a hit: was the button pressed in the last `window` frames of the hit's
 * hitstop? Returns { timing: 'early' | 'perfect' | 'late', frames } (frames = how far from the window), or null
 * when the move being cancelled hasn't hit.
 */
function linkTiming(game, p, world, pick) {
  if (p.contact !== CONTACT.HIT || p.hsEnd < 0) return null;
  const f = Math.max(...[...pick.cmd.buttons].map((b) => pick.presses[b] ?? -1));
  const first = p.hsEnd - Math.min(world.sys.link.window, p.hsLen);
  if (f < first) return { timing: 'early', frames: first - f };
  if (f < p.hsEnd) return { timing: 'perfect', frames: p.hsEnd - f };
  return { timing: 'late', frames: f - p.hsEnd + 1 };
}

/**
 * Start a command's move: mark its presses used and pay its cost. `link` = this is a cancel the player timed
 * (not an EX upgrade or a launcher swap): check it for a Perfect Link.
 */
function startCommand(game, p, def, world, pick, viaCancel = p.viaCancel, link = false) {
  p.viaCancel = viaCancel ? 1 : 0;
  const timing = link ? linkTiming(game, p, world, pick) : null;
  const keepLink = link ? 0 : p.link;
  for (const [b, f] of Object.entries(pick.presses)) p.consumed[BTN_INDEX[b]] = f;
  enterState(p, def, pick.cmd.move);
  p.link = keepLink;
  if (timing) {
    // Perfect Link: the hit of this move adds nothing to the combo's scaling, a little Devotion, and an event for
    // the flash and sound. At most `max` per combo; every timed cancel reports its timing (training mode shows it).
    const c = game.players[1 - p.id].combo;
    const rewarded = timing.timing === 'perfect' && !!c && c.links < world.sys.link.max;
    if (rewarded) {
      c.links++;
      p.link = 1;
      const amount = def.devotion.extras.perfectLink ?? world.meter?.gain.perfectLink ?? 0;
      gainDevotion(game, p, def, pct(amount, def.devotion.give), 'link', true);
      game.cues.push({ p: p.id, type: 'perfect', x: p.x, y: p.y });
    }
    game.cues.push({ p: p.id, type: 'link', timing: timing.timing, frames: timing.frames, rewarded });
  }
  applyResources(p, def, negate(pick.cmd.cost));
  // A Rite move spends a charge of the Rite gauge (none while the gauge is unlimited).
  if (pick.cmd.rite && !riteUnlimited(p, def)) p.rite = Math.max(0, p.rite - 1);
  // Vow is free from neutral; cancelling a normal into it costs Devotion.
  if (pick.cmd.move === 'vow_start' && p.viaCancel) p.meter = Math.max(0, p.meter - world.sys.vow.cancelCost);
  // Doing a special move builds a little Devotion (not its EX version, which costs a bar).
  const mv = def.states[pick.cmd.move].move;
  p.spGain = mv.kind === 'special' && !mv.ex ? gainDevotion(game, p, def, def.devotion.special, 'special', true) : 0;
}

/** Take back what the current move gave for being a special (it is being replaced before it did anything). */
function undoSpecialGain(game, p) {
  if (!p.spGain) return;
  p.meter -= p.spGain;
  const c = game.players[1 - p.id].combo;
  if (c) { c.gave = Math.max(0, c.gave - p.spGain); c.by.special = Math.max(0, (c.by.special || 0) - p.spGain); }
  p.spGain = 0;
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
  // First frame out of the hitstop of a hit this move landed: remember it, for Perfect Link timing.
  if (p.freezeAge > 0 && p.contact === CONTACT.HIT && st.move) { p.hsEnd = game.frame; p.hsLen = p.freezeAge; }

  // EX upgrade: the second button of a chord arrived a frame or two after the one-button version started.
  const ups = def.upgrades[p.state];
  if (ups && p.frame <= (world.input.chordWindow ?? 3)) {
    const buffer = world.input.pressBuffer + p.freezeAge;
    for (const cmd of ups) {
      if (!meets(p, cmd.requires)) continue;
      const paid = def.states[p.state].move.cost;
      // What the fighter had before the one-button version started: its cost back, and without the Devotion it
      // gave for being a special (that must never be what pays for the EX).
      const refunded = { ...p, vars: { ...p.vars }, meter: p.meter + paid.meter - p.spGain, gauge: p.gauge + paid.gauge };
      if (!affords(refunded, cmd.cost)) continue;
      if (cmd.move === 'vow_start' && p.viaCancel && refunded.meter < world.sys.vow.cancelCost) continue;
      const presses = commandInput(game, p, cmd, world, buffer, cmd.buttons);
      if (presses) {
        // Refund the one-button version's cost (and take back its Devotion), then start the chord version.
        applyResources(p, def, paid);
        undoSpecialGain(game, p);
        p.contact = CONTACT.HIT; // no on-whiff effects for the swap
        startCommand(game, p, def, world, { cmd, presses });
        return;
      }
    }
  }

  if (st.vow) {
    // Vow's guard: no blocking, walking or jumping. Dash out (for Devotion), keep holding, or let go to strike.
    const V = world.sys.vow;
    if (p.meter >= V.dashCost) {
      const f = dirMotionNow(p.input, world.input, '66', p.facing);
      if (f || dirMotionNow(p.input, world.input, '44', p.facing)) {
        p.meter -= V.dashCost;
        enterState(p, def, f ? 'dashF' : 'backdash');
        return;
      }
    }
    const heldFor = V.startup + p.stateTime;
    if (heldFor >= V.maxHold || !(isHeld(p.input, BTN.M) || isHeld(p.input, BTN.H))) {
      enterState(p, def, heldFor < V.strikeAt ? 'vow_strike_quick' : heldFor < V.fullAt ? 'vow_strike' : 'vow_strike_full');
      game.cues.push({ p: p.id, type: 'vowrelease', held: heldFor, x: p.x, y: p.y });
    }
    return;
  }

  const cw = world.input.chordWindow ?? 3;
  if (def.sOnly.has(p.state) && p.frame <= cw && p.hitsDone === 0) {
    // The S move started, and an attack button arrived a frame or two later: the two were pressed together, so
    // S doesn't count. The S move is swapped for what the attack button asks for (the EX version with a motion and
    // the meter, else its special, else its normal). After a cancel only specials and supers may take over.
    const pick = pickCommand(game, p, def, world,
      (cmd) => cmd.neutral && cmd.buttons !== 'S' && ATTACK.some((b) => cmd.buttons.includes(b)) && (!p.viaCancel || cmd.kind !== 'normal'), 'S');
    if (pick) {
      applyResources(p, def, def.states[p.state].move.cost);
      undoSpecialGain(game, p);
      p.contact = CONTACT.HIT; // no on-whiff effects for the swap
      startCommand(game, p, def, world, pick);
      return;
    }
  }
  if (def.attackOnly.has(p.state) && p.frame <= cw) {
    // An attack button's move started and S arrived a frame or two later (and it wasn't an EX): S is ignored.
    const a = pressedWithin(p.input, BTN.S, cw + 1 + p.freezeAge);
    if (a >= 0 && game.frame - a > p.consumed[BTN_INDEX.S]) p.consumed[BTN_INDEX.S] = game.frame - a;
  }

  // A held stance: holding back steps out of it (a pressed follow-up wins, below).
  const backOut = () => {
    if (!st.onBack) return false;
    const d = relDirAt(p.input, 0, p.facing);
    if (d !== 1 && d !== 4 && d !== 7) return false;
    enterState(p, def, st.onBack);
    return true;
  };
  const windows = st.free ? null : openCancels(st, p);
  if (!st.free && !windows.length) { backOut(); return; }
  if (st.free && !air) {
    if (opp.x > p.x) p.facing = 1;
    else if (opp.x < p.x) p.facing = -1;
  }

  // A move with neutral: false only comes out of a cancel window that names it (chains, follow-ups).
  // Vow: from neutral, or cancelled from a normal wherever a special could be (that costs Devotion).
  const vowOk = world.sys.vow.enabled && (st.free
    ? true
    : st.kind === 'normal' && p.meter >= world.sys.vow.cancelCost && windows.some((w) => w.into.has('#special')));
  const allowed = st.free
    ? (cmd) => cmd.neutral && (cmd.kind !== 'vow' || vowOk)
    : (cmd) => (cmd.kind === 'vow' ? vowOk : false) || windows.some((w) => w.into.has(cmd.move) || (cmd.base && w.into.has(cmd.base)) || (cmd.neutral && w.into.has(`#${cmd.kind}`)));
  const pick = pickCommand(game, p, def, world, allowed);
  if (pick) {
    startCommand(game, p, def, world, pick, !st.free, !st.free);
    return;
  }
  if (backOut()) return;

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
    p.stateTime++;
    if (st.timeout && p.stateTime >= st.timeout) enterState(p, def, st.timeoutTo);
    else if (p.frame >= st.duration) {
      if (st.loop) p.frame = st.loopFrom;
      else enterState(p, def, (st.nextIf.find((b) => meets(p, b.when)) || { to: st.next }).to);
    }
  }
  // Absolve: while being comboed, once per round (the gauge), with enough Devotion, the Absolve buttons together.
  const B = world.burst;
  const absolveCost = p.combo && p.combo.witness ? world.sys.absolve.witnessCost : world.sys.absolve.cost;
  if (B && B.enabled && p.burst >= B.gaugeMax && B.stateSet.has(p.state) && p.meter >= absolveCost) {
    const ch = chordWithin(p.input, B.bits, world.input.pressBuffer + p.freezeAge, world.input.chordWindow ?? 3);
    if (ch && ch.ages.every((a, i) => game.frame - a > p.consumed[BTN_INDEX[B.buttons[i]]])) {
      ch.ages.forEach((a, i) => { p.consumed[BTN_INDEX[B.buttons[i]]] = game.frame - a; });
      p.burst = 0;
      p.meter -= absolveCost;
      // The slate is wiped: the attacker loses the Devotion this combo gave them.
      const wiped = p.combo ? Math.min(opp.meter, p.combo.gave) : 0;
      opp.meter -= wiped;
      p.stun = 0;
      p.wbX = p.wbY = p.gbY = 0;
      enterState(p, def, isAirborne(def, p) ? 'absolve_air' : 'absolve');
      game.cues.push({ p: p.id, type: 'burst', x: p.x, y: p.y, cost: absolveCost, wiped });
      p.freezeAge = 0;
      return;
    }
  }
  // Repel and Draw: two attack buttons together during ground blockstun, holding back or forward. Only the
  // request is noted here; resolveGuardActions applies it once both fighters have acted, so neither goes first.
  const R = world.sys.repel;
  const Dw = world.sys.draw;
  if ((R.enabled || Dw.enabled) && (p.state === 'blockStand' || p.state === 'blockCrouch')) {
    const dir = relDirAt(p.input, 0, p.facing);
    const back = dir === 4 || dir === 1 || dir === 7;
    const fwd = dir === 6 || dir === 3 || dir === 9;
    const can = (back && R.enabled && game.frame - p.repelAt >= R.lockout) || (fwd && Dw.enabled && p.meter >= Dw.cost);
    if (can) {
      for (const pair of GUARD_PAIRS) {
        const ch = chordWithin(p.input, pair.map((b) => BTN[b]), world.input.pressBuffer + p.freezeAge, world.input.chordWindow ?? 3);
        if (!ch || !ch.ages.every((a, i) => game.frame - a > p.consumed[BTN_INDEX[pair[i]]])) continue;
        ch.ages.forEach((a, i) => { p.consumed[BTN_INDEX[pair[i]]] = game.frame - a; });
        p.guardAct = back ? 1 : 2;
        p.freezeAge = 0;
        return;
      }
    }
  }
  // Air tech: once the untechable time is over, any button recovers. And once a combo has run past techOutAt,
  // any button techs out of hitstun itself, in the air or on the ground.
  const st1 = def.states[p.state];
  const late = !!p.combo && p.combo.time - p.combo.extend >= (world.combo.techOutAt ?? Infinity) && TECH_OUT_STATES.has(p.state);
  if (st1.techable || late) {
    const buffer = world.input.pressBuffer + p.freezeAge;
    if ([BTN.L, BTN.M, BTN.H, BTN.S, BTN.R].some((b) => pressedWithin(p.input, b, buffer) >= 0)) {
      const air = st1.stance === 'air';
      p.stun = 0;
      p.wbX = p.wbY = p.gbY = 0;
      if (!air) { p.slide = 0; p.slideLeft = 0; }
      enterState(p, def, air ? 'airTech' : 'groundTech');
      if (late) game.cues.push({ p: p.id, type: 'techout', x: p.x, y: p.y });
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
