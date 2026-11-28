// Collision and hit resolution: pushboxes and walls, strikes, blocks, counter hits, clashes, trades, armor,
// throws and throw techs, hitstop, hitstun/blockstun, pushback (and corner pushback), damage with guts.

import { frameOf } from './character.js';
import { CONTACT, enterState, isAirborne, inZone, startSlide, applyResources, meets, gainDevotion, fallState, modeOf } from './fighter.js';
import { perPercent } from './devotion.js';
import { soften } from './systems.js';
import { BTN, dirOf, frameAt, pressedAt, mirrorDir } from './input.js';
import { pct, sign, px } from './fixed.js';
import { lobRise, lobDrop, lobAges } from './lob.js';
import { relicSide, relicToss } from './relic.js';

// ---------- Boxes ----------

/** A character-space box [x, y, w, h] in world space: [left, bottom, right, top]. Flipped by facing. */
export function worldBox(p, b) {
  const [x, y, w, h] = b;
  const left = p.facing > 0 ? p.x + x : p.x - x - w;
  return [left, p.y + y, left + w, p.y + y + h];
}

export const overlaps = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

/** First overlapping pair between two box lists, as the overlap rectangle, or null. */
function contact(p, listP, q, listQ) {
  for (const bp of listP) {
    const a = worldBox(p, bp);
    for (const bq of listQ) {
      const b = worldBox(q, bq);
      if (overlaps(a, b)) return [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
    }
  }
  return null;
}

// ---------- Pushboxes, walls, corners ----------

/** Horizontal extent of a fighter's pushbox (or its centre if it has none). */
function pushExtent(p, def) {
  const fr = frameOf(def, p.state, p.frame);
  if (!fr.push.length) return [p.x, p.x, null];
  const b = worldBox(p, fr.push[0]);
  return [b[0], b[2], b];
}

/** Keep a fighter inside the stage. Returns how far it was moved back (signed). */
function clampToWalls(p, def, half) {
  const [l, r] = pushExtent(p, def);
  let d = 0;
  if (l < -half) d = -half - l;
  else if (r > half) d = half - r;
  p.x += d;
  return d;
}

/** Is the fighter at the wall on the side `dir` (-1 left, +1 right)? */
export function cornered(p, def, world, dir) {
  const half = world.battle.halfWidthUnits;
  const zone = world.battle.cornerZoneUnits;
  const [l, r] = pushExtent(p, def);
  return dir < 0 ? l <= -half + zone : r >= half - zone;
}

/**
 * Push fighters apart and keep them in the stage. If a pushback slide runs into the wall, what's left of it
 * moves the opponent instead (corner pushback).
 */
export function separate(game, world) {
  const [a, b] = game.players;
  const [da, db] = world.chars;
  const half = world.battle.halfWidthUnits;

  for (const [p, def, o, odef] of [[a, da, b, db], [b, db, a, da]]) {
    const d = clampToWalls(p, def, half);
    if (d !== 0 && p.wbY > 0 && p.combo && def.states[p.state].stance === 'air') {
      // Wall bounce: rebound off the wall and up, with fresh untechable time.
      p.vx = sign(d) * p.wbX;
      p.vy = p.wbY;
      p.wbX = p.wbY = 0;
      p.combo.wb++;
      enterState(p, def, 'hitAir');
      p.stun = world.combo.bounceUntech;
      game.cues.push({ type: 'wallbounce', p: p.id, x: p.x, y: p.y });
      continue;
    }
    if (d !== 0 && p.slid !== 0 && sign(p.slid) === -sign(d) && !isAirborne(odef, o)) {
      // The wall stopped this fighter's slide: the opponent takes the refused part and the rest, the other way.
      const refused = Math.min(Math.abs(d), Math.abs(p.slid)) * sign(p.slid) + p.slide;
      o.slide -= refused;
      o.slideLeft = Math.max(o.slideLeft, p.slideLeft, 1);
      p.slide = 0;
      p.slideLeft = 0;
      p.slid = 0;
    }
  }

  const [al, ar, ab] = pushExtent(a, da);
  const [bl, br, bb] = pushExtent(b, db);
  if (!ab || !bb) return;
  if (!(ab[1] < bb[3] && bb[1] < ab[3])) return; // no vertical overlap: one is over the other
  const ov = Math.min(ar, br) - Math.max(al, bl);
  if (ov <= 0) return;
  // Who is on the left? By position; on a tie, by facing (the one facing right is on the left).
  const aLeft = a.x !== b.x ? a.x < b.x : a.facing > 0;
  const [left, ldef, right, rdef] = aLeft ? [a, da, b, db] : [b, db, a, da];
  const h = Math.trunc(ov / 2);
  left.x -= h;
  right.x += ov - h;
  // A fighter pinned to the wall can't give ground: the other takes it all.
  const dl = clampToWalls(left, ldef, half);
  if (dl) right.x += dl;
  const dr = clampToWalls(right, rdef, half);
  if (dr) left.x += dr;
}

/**
 * The fighters can't be farther apart than the stage's `maxGap` (so both always fit on the screen). Only movement
 * away from the opponent is refused: whoever moved away this frame is put back by the part that went too far (both,
 * in proportion, if both did). Nobody is ever pulled in. `before` = each fighter's x before this frame's movement.
 */
export function holdTogether(game, world, before) {
  const max = world.battle.maxGapUnits;
  if (!max) return;
  const [a, b] = game.players;
  const over = Math.abs(a.x - b.x) - max;
  if (over <= 0) return;
  const side = a.x < b.x ? -1 : 1; // a's outward direction (b's is the opposite)
  const outA = Math.max(0, (a.x - before[0]) * side);
  const outB = Math.max(0, (b.x - before[1]) * -side);
  const back = Math.min(over, outA + outB);
  if (back <= 0) return;
  const backA = Math.trunc((back * outA) / (outA + outB));
  a.x -= side * backA;
  b.x += side * (back - backA);
}

// ---------- Damage ----------

/** Damage after guts: the lower the defender's health, the less damage taken (table in battle.json). */
export function gutsDamage(base, health, maxHealth, battle) {
  if (base <= 0) return 0;
  const ratio = Math.trunc((health * 10000) / maxHealth);
  let p = 10000;
  for (const [atOrBelow, dmgPct] of battle.guts) if (ratio <= atOrBelow) p = dmgPct;
  return Math.max(battle.minDamage, pct(base, p));
}

function applyDamage(d, ddef, amount) {
  d.health = Math.max(0, d.health - amount);
}

// ---------- Blocking ----------

/** The defender's direction relative to the attacker: "back" means away from the attacker. */
function guardDir(d, a) {
  const away = a.x > d.x ? -1 : a.x < d.x ? 1 : -d.facing; // screen direction pointing away from the attacker
  const abs = dirOf(frameAt(d.input, 0));
  return away > 0 ? mirrorDir(abs) : abs; // now 4/1/7 mean "away from the attacker"
}

/** Can the defender block this hit, and how? Returns 'stand' | 'crouch' | 'air' | null. */
function blockKind(d, ddef, a, move, world) {
  const st = ddef.states[d.state];
  const blocking = st.free || st.name.startsWith('block') || st.blocking;
  if (!blocking || move.guard === 'unblockable' || move.grab) return null;
  const g = guardDir(d, a);
  const back = g === 1 || g === 4 || g === 7;
  if (!back) return null;
  if (st.stance === 'air') return world.battle.airBlock && move.airBlockable ? 'air' : null;
  const crouching = g === 1;
  if (move.guard === 'high' && crouching) return null;
  if (move.guard === 'low' && !crouching) return null;
  return crouching ? 'crouch' : 'stand';
}

// ---------- Hits ----------

/**
 * What a clean hit on this defender is: 'counter' (they were in the startup of a move, or the active frames of a
 * normal), 'witness' (in recovery, or in the active frames of a special or super that has touched nothing), or
 * plain 'hit'. fd = the defender's frame at the start of this step.
 */
export function hitKind(world, d, fd) {
  if (d.forceCounter) return d.forceCounter === 2 ? 'witness' : 'counter'; // training mode's switch
  if (!fd.counter) return 'hit';
  if (fd.counter === 2) return 'witness';
  const mv = world.chars[d.id].states[d.state].move;
  if (mv && (mv.kind === 'special' || mv.kind === 'super') && d.frame >= mv.startup - 1 && d.contact === CONTACT.NONE && d.hitsDone === 0) return 'witness';
  return 'counter';
}

/** While held, a fighter's stun never runs out by itself: the grabber's frames end the hold. */
const HELD_STUN = 30;

/** Can a grab take this fighter? Anyone in the air who is not blocking: in hitstun too, which is what lets it end a combo. */
function grabbable(ddef, d) {
  const st = ddef.states[d.state];
  if (st.stance !== 'air' || st.throwVictim || d.state === 'grabbed') return false;
  return !(st.name.startsWith('block') || st.blocking);
}

/**
 * A grabbed fighter is kept where the grabber's current frame says (`hold`: x forward and y up from the grabber's
 * feet), never below the floor or outside the stage. A frame with no `hold` lets go: the fighter is left in the air
 * where they are, to be hit by that frame's own strike or to fall. Runs after movement and before the hits.
 */
export function holdVictims(game, world) {
  for (const d of game.players) {
    if (d.state !== 'grabbed') { if (d.heldBy !== -1) d.heldBy = -1; continue; }
    const a = game.players[d.heldBy];
    const hold = a ? frameOf(world.chars[a.id], a.state, a.frame).hold : null;
    if (!hold) { d.heldBy = -1; d.stun = Math.min(d.stun, 1); continue; }
    const half = world.battle.halfWidthUnits;
    d.x = Math.max(-half, Math.min(half, a.x + a.facing * hold.x));
    d.y = Math.max(0, a.y + hold.y);
    d.vx = d.vy = 0;
    d.stun = HELD_STUN;
  }
}

/**
 * A fighter lying in a hard knockdown can only be touched by an OTG move, and only while the combo they are in
 * still has an OTG left (after a throw there is no combo: combo.json says whether an OTG may start one).
 */
export function floorBlocks(world, move, d) {
  if (!world.chars[d.id].states[d.state].floor) return false;
  const O = world.combo.hit.otg;
  if (!move || !move.otg || O.perCombo <= 0) return true;
  return d.combo ? (d.combo.otg | 0) >= O.perCombo : !O.afterThrow;
}

function cue(game, type, p, rect, extra = {}) {
  const x = rect ? Math.trunc((rect[0] + rect[2]) / 2) : p.x;
  const y = rect ? Math.trunc((rect[1] + rect[3]) / 2) : p.y;
  game.cues.push({ type, p: p.id, x, y, ...extra });
}

/** Everything a strike does, decided from the frame-start snapshot, applied after both sides are known. */
function resolveStrike(game, world, a, d, rect, snap) {
  const adef = world.chars[a.id];
  const ddef = world.chars[d.id];
  const fa = snap[a.id].fr;
  const fd = snap[d.id].fr;
  const st = adef.states[snap[a.id].state];
  const move = { ...st.move, ...(fa.hitProps || {}) };
  const battle = world.battle;
  const block = blockKind(d, ddef, a, move, world);
  const away = d.x > a.x ? 1 : d.x < a.x ? -1 : a.facing;

  const firstOfUse = a.hitsDone === 0; // later hits of a multi-hit move are the same use of it
  a.hitsDone |= 1 << fa.hitId;
  const stagger = move.stagger && meets(a, move.stagger.when) ? move.stagger.hitstun : 0; // read before the hit's own gains
  const out = { a, d, move, block, away, rect, moveId: snap[a.id].state, firstOfUse, stagger };

  // Vow's strike is a Witness counter if the opponent was mid-string moments ago.
  if (move.vowStrike && game.frame - d.atkFrame <= world.sys.vow.witnessWindow) out.witness = true;
  if (absorbs(ddef, snap[d.id].state, move)) {
    out.kind = 'absorb';
    out.block = null;
  } else if (fd.catch && move.kind !== 'super' && !move.pierce) {
    out.kind = 'catch'; // a counter stance: the strike is caught
    out.block = null;
    out.to = fd.catch.to;
    out.freeze = fd.catch.hitstop;
    out.parry = fd.catch.parry;
  } else if (!block && fd.armor > d.armorUsed) {
    out.kind = 'armor';
  } else if (block) {
    out.kind = 'block';
  } else {
    out.kind = move.grab ? 'hit' : hitKind(world, d, fd);
  }
  // Held by the attacker (their frame has a `hold`): the hit hurts but does not knock the fighter out of the hold.
  out.held = !move.grab && !!fa.hold && d.state === 'grabbed' && d.heldBy === a.id;
  if (move.grab) { out.kind = 'hit'; out.block = null; }
  return out;
}

/** A parry landed (systems.json parry): the defender gains its Devotion, and the cue for the screen. */
function parried(game, world, d, ddef, rect, moveId) {
  const P = world.sys.parry;
  if (world.meter && P?.devotion) gainDevotion(game, d, ddef, P.devotion, 'parry');
  cue(game, 'parry', d, rect, { move: moveId });
}

/** Is this hit absorbed by the defender's Vow guard? Supers and moves flagged `pierce` go through it. */
const absorbs = (ddef, stateName, move) => ddef.states[stateName].vow && move.kind !== 'super' && !move.pierce;

/**
 * A fighter with Debt is really hit: the Debt comes due at once, with a penalty on top. Returns the damage.
 */
function cashDebt(game, world, d) {
  if (d.debt <= 0) return 0;
  const extra = d.debt + pct(d.debt, world.sys.vow.penaltyPct);
  d.health = Math.max(0, d.health - extra);
  d.debt = 0;
  d.debtRate = 0;
  game.cues.push({ type: 'debt', p: d.id, damage: extra, x: d.x, y: d.y });
  return extra;
}

/**
 * Devotion and mechanic gains when a strike connects.
 * Devotion (rules in data/system/systems.json): the attacker builds from the damage dealt, or from what a blocked
 * hit would have done, times their give; the defender builds from the health lost, times their take, capped per
 * combo. info = { fresh, switched } for the trickster's variety (a move new to the combo; a high / low / side switch).
 */
function gains(game, world, a, d, move, kind, dmg, info = {}) {
  const adef = world.chars[a.id];
  const ddef = world.chars[d.id];
  const g = adef.mechanic.gauge;
  const M = world.meter;
  const A = adef.devotion;
  const D = ddef.devotion;
  const maxHp = ddef.stats.health;
  if (kind === 'block') {
    applyResources(a, adef, { gauge: g ? g.onBlock : 0 });
    applyResources(a, adef, move.onBlock);
    if (M) {
      gainDevotion(game, a, adef, pct(move.devGain?.block ?? perPercent(move.damage, maxHp, M.gain.blockedPerPct), A.give), 'blocked', true);
      if (D.extras.guardPerPct) gainDevotion(game, d, ddef, pct(perPercent(move.damage, maxHp, D.extras.guardPerPct), D.take), 'guard');
    }
    return;
  }
  applyResources(a, adef, { gauge: g ? g.onHit : 0 });
  applyResources(a, adef, move.onHit);
  if (M) {
    let give = pct(move.devGain?.hit ?? perPercent(dmg, maxHp, M.gain.hitPerPct), A.give);
    const v = A.extras.variety;
    if (v && d.combo) {
      give = pct(give, info.fresh ? v.newMove : v.repeat);
      if (info.switched) give += v.switch;
    }
    gainDevotion(game, a, adef, give, 'hit', true);
    // The defender: from the health lost, with a cap on what one combo can hand them.
    let take = pct(perPercent(dmg, maxHp, M.gain.hurtPerPct), D.take);
    if (d.combo) take = Math.min(take, Math.max(0, M.takeCap - d.combo.took));
    gainDevotion(game, d, ddef, take, 'hurt');
    if (d.combo) d.combo.took += take;
  }
  const dg = ddef.mechanic.gauge;
  if (dg && dg.onHurt) applyResources(d, ddef, { gauge: dg.onHurt });
  const B = world.burst;
  if (B && B.enabled && B.hurtPct && dmg > 0) d.burst = Math.min(B.gaugeMax, d.burst + pct(dmg, B.hurtPct));
}

/** The attacker's mechanic damage modifier (the product of every modifier whose condition holds). */
function damageMod(world, a) {
  let m = 10000;
  for (const x of world.chars[a.id].mechanic.modifiers) if (meets(a, x.when)) m = pct(m, x.damagePct);
  return m;
}

function applyStrike(game, world, r) {
  const { a, d, move, block, away, rect } = r;
  const ddef = world.chars[d.id];
  const battle = world.battle;
  const maxHp = ddef.stats.health;

  // A projectile's hit (r.proj) is its owner's hit for damage, meter and combos, but the owner's body isn't part
  // of it: no contact flag, no hitstop and no pushback on them.
  const body = !r.proj;

  if (r.kind === 'absorb') {
    // Vow: no hitstun, a short freeze, and the damage becomes Debt instead of being taken.
    const V = world.sys.vow;
    const M = world.meter;
    const adef = world.chars[a.id];
    const owed = gutsDamage(pct(move.damage, damageMod(world, a)), d.health, maxHp, battle);
    d.debt += owed;
    d.debtRate = Math.max(1, Math.ceil(d.debt / V.drainFrames));
    d.hitstop = V.absorbHitstop;
    if (body) { a.contact = CONTACT.BLOCK; a.hitstop = V.absorbHitstop; }
    if (M) {
      // The attacker builds as from a blocked hit; the guard builds a share of what taking the hit would give.
      gainDevotion(game, a, adef, pct(perPercent(move.damage, maxHp, M.gain.blockedPerPct), adef.devotion.give), 'blocked', true);
      const share = ddef.devotion.extras.vowAbsorb ?? M.gain.vowAbsorb;
      gainDevotion(game, d, ddef, pct(pct(perPercent(owed, maxHp, M.gain.hurtPerPct), share), ddef.devotion.take), 'vow');
    }
    cue(game, 'absorb', a, rect, { move: r.moveId, damage: owed, debt: d.debt });
    return;
  }

  if (r.kind === 'catch') {
    // Caught by a counter stance: no damage, no stun. The attacker freezes; the defender goes to the stance's answer.
    a.contact = CONTACT.BLOCK;
    a.hitstop = r.freeze;
    d.hitstop = 0;
    enterState(d, ddef, r.to);
    cue(game, 'catch', a, rect, { move: r.moveId, by: d.id });
    if (r.parry) parried(game, world, d, ddef, rect, r.moveId);
    return;
  }

  if (r.kind === 'armor') {
    d.armorUsed++;
    if (body) a.contact = CONTACT.HIT;
    const armorDmg = gutsDamage(pct(move.damage, battle.armorDamagePct), d.health, maxHp, battle);
    gains(game, world, a, d, move, 'hit', armorDmg);
    applyDamage(d, ddef, armorDmg);
    cashDebt(game, world, d);
    d.hitstop = move.hitstop;
    if (body) a.hitstop = move.hitstop;
    cue(game, 'armor', a, rect, { move: r.moveId });
    return;
  }

  // Face the attacker (cross-ups turn the defender around).
  d.facing = -away;

  if (r.kind === 'block') {
    if (body) a.contact = CONTACT.BLOCK;
    gains(game, world, a, d, move, 'block', 0);
    applyDamage(d, ddef, move.chip);
    d.hitstop = move.blockHitstop;
    if (body) a.hitstop = move.blockHitstop;
    enterState(d, ddef, r.block === 'air' ? 'blockAir' : r.block === 'crouch' ? 'blockCrouch' : 'blockStand');
    d.stun = move.blockstun;
    const bp = pct(move.pushbackBlock, modeOf(d, ddef)?.pushbackPct ?? 10000); // a mode may make him harder to move
    if (body) pushback(world, a, d, away, bp, move.selfPushback);
    else if (!cornered(d, ddef, world, away)) startSlide(d, away * bp, battle.pushbackFrames);
    if (body) recoil(world, a, away, move);
    if (body && move.onBlockState) {
      // A branch when blocked (a baited Absolve's long recovery): still the same use of the move.
      enterState(a, world.chars[a.id], move.onBlockState);
      a.contact = CONTACT.BLOCK;
    }
    cue(game, 'block', a, rect, { move: r.moveId });
    return;
  }

  // Counter hit / Witness counter: only a hit that starts a combo can be one (r.witness: Vow's strike asks for it).
  const starts = !d.combo;
  // Absolve's own hit is never one: it only knocks the attacker away.
  const plain = move.kind === 'burst';
  // Hit while standing in the attacker's light (a projectile with a zone): the attacker's mark var goes up, and the
  // move's `inZone` settings (its reaction and juggle cost there) take over.
  let lit = false;
  for (const pr of game.projectiles) {
    const z = pr.owner === a.id ? world.chars[a.id].projectiles[pr.kind].zone : null;
    if (!z || !inZone(pr, z, d)) continue;
    lit = true;
    if (z.markVar && !move.noZoneMark) applyResources(a, world.chars[a.id], { vars: { [z.markVar]: 1 } });
  }
  // A reaction of the move's own for a special case: while a var of the attacker's runs (first), or in their zone.
  const zoneHit = (move.varHit && (a.vars[move.varHit.var] | 0) > 0 ? move.varHit : null) ?? (lit ? move.zoneHit : null);
  const witness = starts && !plain && (r.kind === 'witness' || !!r.witness);
  const counter = starts && !plain && r.kind === 'counter' && !witness;
  const ch = witness ? world.sys.witness : world.sys.counter; // read only when one of the two is true
  const special = counter || witness;
  const C = world.combo;
  if (body) a.contact = CONTACT.HIT;

  // The combo this hit belongs to (a new one if the defender wasn't already being comboed).
  const starter = !d.combo;
  // links: Perfect Links so far; witness: it began with a Witness counter; extend: frames its decay timer runs late.
  // hard: hard launches so far; juggle: the juggle total (see combo.json).
  // took / gave: Devotion this combo has given its victim (capped) and its attacker (Absolve wipes it); by: the
  // same per source, for the training readouts.
  // cls / side: the last hit's guard class and the attacker's side, for the trickster's variety.
  // otg / crumple / slide: how many of each this combo has had (each is limited, see combo.json hitStates).
  if (starter) d.combo = { hits: 0, damage: 0, time: 0, scale: 10000, used: {}, wb: 0, gb: 0, took: 0, gave: 0, by: {}, cls: '', side: 0, hard: 0, juggle: 0, links: 0, otg: 0, crumple: 0, slide: 0,
    witness: witness ? 1 : 0, extend: witness ? world.sys.witness.decayExtend : 0 };
  const combo = d.combo;
  const moveId = r.moveId;
  // Earlier uses of this move in the combo (a multi-hit move's own later hits don't count as a new use).
  const used = combo.used[moveId] || 0;
  const uses = r.firstOfUse ? used : Math.max(0, used - 1);

  // Damage: base (counter bonus) x combo scaling x same-move penalty, then guts.
  let base = special ? pct(move.damage, ch.damagePct) : move.damage;
  base = pct(base, damageMod(world, a));
  base = pct(base, combo.scale);
  if (uses > 0) base = pct(base, move.repeatDamage ?? C.repeatDamage); // a move used again in the same combo (a move may set its own share)
  // Lying in a hard knockdown: only an OTG move reaches here. It does a share of its damage and lifts the fighter.
  const H = C.hit;
  const floored = !!ddef.states[d.state].floor;
  if (floored) base = pct(base, H.otg.damagePct);
  const dmg = gutsDamage(base, d.health, maxHp, battle);
  applyDamage(d, ddef, dmg);
  combo.damage += cashDebt(game, world, d); // hit while Debt remains: it comes due, with the penalty
  if (move.vowStrike && body) { a.debt = 0; a.debtRate = 0; } // landing Vow's strike forgives the Debt
  // A punish soon after a Draw gives back a share of its cost (the penitent's extra).
  if (starter && game.frame - a.drawAt <= world.sys.draw.punishWindow) {
    const adef = world.chars[a.id];
    a.drawAt = -1000;
    gainDevotion(game, a, adef, pct(world.sys.draw.cost, adef.devotion.extras.drawRefund), 'draw', true);
  }

  // Proration for the hits that follow: the starter's own proration once, then every hit's combo proration.
  // A Witness combo's first hits scale it less; a Perfect Link's hit doesn't scale it at all.
  const linked = body && a.link === 1 && !starter;
  if (linked) a.link = 0;
  const easeBy = combo.witness && combo.hits < world.sys.witness.softHits ? world.sys.witness.softenPct : 0;
  const ease = (p) => (easeBy ? soften(p, easeBy) : p);
  let scale = combo.scale;
  if (starter) scale = pct(scale, ease(move.starterProration ?? C.starterProration));
  if (!linked) scale = pct(scale, ease(move.comboProration ?? C.comboProration));
  combo.scale = Math.max(C.minScale, scale);
  const cls = move.guard === 'high' || move.guard === 'low' ? move.guard : '';
  const side = a.x < d.x ? -1 : a.x > d.x ? 1 : -a.facing;
  const switched = combo.hits > 0 && ((cls !== '' && combo.cls !== '' && cls !== combo.cls) || (combo.side !== 0 && side !== combo.side));
  if (cls) combo.cls = cls;
  combo.side = side;
  combo.hits++;
  combo.damage += dmg;
  if (r.firstOfUse) combo.used[moveId] = used + 1;
  gains(game, world, a, d, move, 'hit', dmg, { fresh: uses === 0, switched });
  if (witness) gainDevotion(game, a, world.chars[a.id], world.chars[a.id].devotion.extras.witness, 'witness', true);

  d.hitstop = move.hitstop + (special ? ch.hitstopAdd : 0);
  if (body) a.hitstop = d.hitstop;
  const airborne = isAirborne(ddef, d);
  // Launches. One hard launch per combo: another one acts as a soft launch.
  // The reaction: the move's own, or its counter-hit one. Crumple and slide are limited per combo.
  // A mode that keeps its fighter's footing: a hit on the ground (not a super) never launches or knocks him down.
  const dmode = modeOf(d, ddef);
  const footed = !!dmode?.keepFooting && !isAirborne(ddef, d) && move.kind !== 'super';
  let react = footed ? 'normal' : floored ? 'normal' : (special && move.counterReaction) || (airborne && zoneHit?.airReaction) || zoneHit?.hitReaction || (airborne && move.airReaction) || move.hitReaction || 'normal';
  // slideLimit: a move's own slide, counted apart from the shared limit (the 6H spike after a Moonstruck slide); past
  // its own count it is `then` instead.
  if (react === 'slide' && move.slideLimit) {
    if (!combo.own) combo.own = {};
    const k = move.slideLimit.key, n = combo.own[k] | 0;
    if (n >= move.slideLimit.perCombo) react = move.slideLimit.then;
    else combo.own[k] = n + 1;
  } else if ((react === 'crumple' || react === 'slide') && combo[react] >= H[react].perCombo) react = 'normal';
  const whirlOf = (x) => x === 'spin' || x === 'tumble';
  // spin and tumble are air states: on a grounded fighter they are a soft launch, even if the move names no launch.
  const launchType = footed || floored || zoneHit?.noLaunch ? null : move.launchType ?? (whirlOf(react) && !airborne ? 'soft' : null);
  const skid = react === 'slide' && !airborne; // a grounded fighter starts skidding at once
  const hard = launchType === 'hard' && combo.hard < C.hardLaunchLimit;
  const soft = !!launchType && !hard;
  if (hard) combo.hard++;
  // Juggle: every hit on an airborne fighter, and every soft launch, adds to the combo's total. Past the limit
  // the fighter falls out: the hit does its damage but gives no untechable time, no launch and no bounce.
  if (floored) { combo.otg++; combo.juggle += H.otg.juggleCost; }
  else if (airborne || soft || skid) combo.juggle += zoneHit?.juggleCost ?? move.juggleCost ?? (skid ? H.slide.juggleCost : soft && !airborne ? C.softLaunchCost : C.juggleCost);
  const out = !move.grab && !move.noFallOut && !r.held && (airborne || soft || skid || floored) && combo.juggle > C.juggleLimit;
  if (out) react = 'normal'; // past the juggle limit every special reaction is gone
  const whirl = whirlOf(react);
  const R = H[react];
  const launches = !!launchType && !out;
  const inAir = launches || airborne || floored;
  // Combo time: the longer the combo has run, the shorter the hitstun and untechable time.
  let rawStun = floored ? H.otg.untech : (inAir ? move.untech ?? R.untech ?? move.hitstun : move.hitstun) + (r.stagger | 0);
  if (special) rawStun = pct(rawStun, ch.hitstunPct);
  if (uses > 0) rawStun = pct(rawStun, move.repeatHitstun ?? C.repeatHitstun);
  const clock = Math.max(0, combo.time - combo.extend); // a Witness combo's decay timer runs late
  const stun = out && (airborne || floored) ? 0 : Math.max(C.minHitstun, pct(rawStun, decayAt(inAir ? C.untechDecay : C.hitstunDecay, clock)));
  // A slide lasts its own time, shortened like untechable time (combo time, a repeated move).
  const skidFor = react === 'slide' ? Math.max(1, pct(uses > 0 ? pct(R.frames, C.repeatHitstun) : R.frames, decayAt(C.untechDecay, clock))) : 0;

  // Bounces: armed by the move, each kind limited per combo.
  const limit = move.bounceLimit ?? C.bounceLimit;
  if (!out && move.wallBounce && combo.wb < limit) { d.wbX = move.wallBounce.x; d.wbY = move.wallBounce.y; }
  if (!out && move.groundBounce && combo.gb < limit) d.gbY = move.groundBounce.y;

  // The knockdown this hit asks for when the fighter reaches the ground (0 = the system's rule).
  d.kd = react === 'hardKD' ? 1 : react === 'softKD' ? 2 : react === 'slide' ? ((zoneHit?.slideEnds ?? move.slideEnds ?? (R.endsHard ? 'hardKD' : 'softKD')) === 'hardKD' ? 1 : 2) : 0;
  d.slideV = d.slideT = 0;
  if (move.grab) {
    // Taken hold of: kept in `grabbed` wherever the grabber's frames put them, until those frames let go.
    enterState(d, ddef, 'grabbed');
    d.heldBy = a.id;
    d.vx = d.vy = 0;
    d.kd = 0;
  } else if (r.held) {
    // Hit while held: the damage and the freeze only.
  } else if (inAir) {
    const v = (floored ? H.otg.lift : null)
      || (launches ? (hard || launchType === 'soft' ? move.launch : null) ?? (!hard && whirl ? R.launch : null) ?? (hard ? C.hardLaunchUnits : C.softLaunchUnits) : null)
      || (out ? null : zoneHit?.airHit ?? move.airHit ?? (whirl ? R.launch : react === 'slide' ? R.slam : null)) || { x: battle.airHitUnits.x, y: battle.airHitUnits.y };
    // repeatLaunch: each earlier use of the move in this combo sends them that share as high (the pulse).
    let vy = v.y;
    if (launches && move.repeatLaunch) for (let i = 0; i < uses; i++) vy = pct(vy, move.repeatLaunch);
    enterState(d, ddef, react === 'spin' ? 'hitSpin' : react === 'tumble' ? 'hitTumble' : 'hitAir');
    if (react === 'slide') { d.slideV = (move.slideTo === 'relic' ? relicSide(a, d) || away : away) * R.speed; d.slideT = skidFor; combo.slide++; } // slammed down: the skid starts on landing (slideTo: toward the attacker's set lantern)
    d.vx = v.x * away; // x is authored as "away from the attacker"
    d.vy = vy;
    if (d.y === 0 && d.vy > 0) d.y = 1; // leave the ground this frame
  } else if (skid) {
    enterState(d, ddef, 'slide');
    d.y = 0;
    d.vx = (move.slideTo === 'relic' ? relicSide(a, d) || away : away) * R.speed;
    d.vy = 0;
    combo.slide++;
  } else if (react === 'hardKD' || react === 'softKD') {
    enterState(d, ddef, fallState(d, world));
  } else if (react === 'crumple' && ddef.states.crumple) {
    enterState(d, ddef, 'crumple');
    combo.crumple++;
  } else {
    enterState(d, ddef, ddef.states[d.state].stance === 'crouch' ? 'hitCrouch' : 'hitStand');
  }
  d.stun = move.grab || r.held ? HELD_STUN : d.state === 'crumple' ? world.sys.vow.crumpleStun : d.state === 'slide' ? skidFor : stun;
  if (move.grab || r.held) {
    // no pushback: the hold places them
  } else if (move.pull) {
    // Pull-in: the defender slides toward the attacker (instead of pushback), ending pull.to in front of them.
    if (inAir) d.vx = 0;
    const gap = Math.abs(d.x - a.x) - move.pull.to;
    startSlide(d, gap > 0 ? -away * gap : 0, move.pull.frames);
  } else if (!airborne && !launches && !skid && !floored) {
    const hp = pct(move.pushbackHit, dmode?.pushbackPct ?? 10000);
    if (body) pushback(world, a, d, away, hp, move.selfPushback);
    else if (!cornered(d, ddef, world, away)) startSlide(d, away * hp, battle.pushbackFrames);
  }
  if (move.toRelic && !out && !r.held && inAir) relicToss(game, world, a, d, move.toRelic); // thrown at the attacker's set lantern
  if (body) recoil(world, a, away, move);
  if (body && move.onHitState) {
    // An animation branch on hit (a catch): still the same use of the move, so it keeps its contact.
    enterState(a, world.chars[a.id], move.onHitState);
    a.contact = CONTACT.HIT;
  }
  const extra = { move: moveId, damage: dmg, hits: combo.hits, scale: combo.scale, stagger: r.stagger | 0, fellOut: out, linked, react, otg: floored };
  if (witness) extra.slow = world.sys.witness.slowFrames;
  cue(game, witness ? 'witness' : counter ? 'counter' : 'hit', a, rect, extra);
}

// ---------- Projectiles ----------

/** Every projectile flies one frame forward (before this frame's spawns, so a new one starts where it was put). */
export function moveProjectiles(game, world) {
  for (const pr of game.projectiles) {
    const pd = world.chars[pr.owner].projectiles[pr.kind];
    if (pd.lob) { moveLob(game, world, pr, pd.lob); continue; }
    // vx / vy: a projectile given its own speeds (one turned by the lantern) flies by them instead of its kind's.
    pr.x += pr.vx ?? pd.speed * pr.facing;
    pr.y += pr.vy ?? pd.speedY;
    if (pd.minY !== null && pd.minY !== undefined && pr.y < pd.minY) pr.y = pd.minY;
    pr.age++;
    if (pr.cool > 0) pr.cool--;
    // A tracking projectile follows the opponent along x until it has touched something.
    if (pd.track > 0 && !pr.end && !pr.hit) {
      const dx = game.players[1 - pr.owner].x - pr.x;
      pr.x += dx > pd.track ? pd.track : dx < -pd.track ? -pd.track : dx;
    }
    // A trap: it wakes when the opponent comes near (or when the owner's var runs out), then pulls them in.
    const Wk = pd.wake;
    if (Wk && !pr.end) {
      const d = game.players[1 - pr.owner];
      if (pr.woke < 0) {
        const dx = d.x - pr.x, dy = d.y + px(90) - pr.y;
        const ended = Wk.endVar && (game.players[pr.owner].vars[Wk.endVar] | 0) <= 0;
        if (ended || ((dx < 0 ? -dx : dx) <= Wk.range && (dy < 0 ? -dy : dy) <= Wk.reachY)) pr.woke = pr.age;
      } else if (Wk.pull > 0 && pr.age < pr.woke + Wk.delay) {
        const dst = world.chars[d.id].states[d.state];
        if (!dst.throwVictim && d.state !== 'throwHold' && !dst.floor) { const dx = pr.x - d.x; d.x += dx > 0 ? Math.min(Wk.pull, dx) : Math.max(-Wk.pull, dx); }
      }
    }
    // A trap-waker (a ground wave): its owner's waiting traps it passes over wake.
    if (pd.wakesTraps && !pr.end) for (const q of game.projectiles) if (q.owner === pr.owner && q.woke < 0 && pd.wakesTraps.names.includes(q.kind) && Math.abs(q.x - pr.x) <= pd.wakesTraps.range) q.woke = q.age;
    // A burst projectile's collapse: an opponent close to it slides toward its centre (a pull, not a hit).
    const P = pd.burst?.pull;
    if (!P || pr.end || pr.hit || pr.age < pr.fuse || pr.age >= pr.boom) continue;
    const d = game.players[1 - pr.owner];
    const dst = world.chars[d.id].states[d.state];
    if (dst.throwVictim || d.state === 'throwHold' || dst.floor) continue;
    const marked = P.markVar && (game.players[pr.owner].vars[P.markVar] | 0) > 0;
    const range = marked ? pct(P.range, P.markRangePct) : P.range;
    const dx = pr.x - d.x, dy = pr.y - (d.y + P.bodyY);
    if ((dx < 0 ? -dx : dx) > range || (dy < 0 ? -dy : dy) > P.reachY) continue;
    d.x += dx > 0 ? Math.min(P.speed, dx) : Math.max(-P.speed, dx);
  }
}

/** A lobbed projectile's frame: up its arc, hanging (tracking the opponent if it can), down, then lying where it fell. */
function moveLob(game, world, pr, L) {
  pr.age++;
  const [rise, hang, landed] = lobAges(L);
  if (pr.age <= rise) [pr.x, pr.y] = lobRise(L, pr.x0, pr.y0, pr.tx, pr.age);
  else if (pr.age <= hang) {
    pr.y = L.apex;
    if (L.track > 0) {
      const edge = world.battle.halfWidthUnits - L.margin;
      const dx = Math.max(-edge, Math.min(edge, game.players[1 - pr.owner].x)) - pr.x;
      pr.x += dx > L.track ? L.track : dx < -L.track ? -L.track : dx;
    }
  } else if (pr.age <= landed) {
    pr.y = lobDrop(L, pr.age - hang);
    if (pr.age === landed) game.cues.push({ type: 'lobLand', p: pr.owner, name: pr.kind, x: pr.x, y: 0, facing: pr.facing });
  } else pr.y = 0;
}

/** A burst projectile's box, scaled about its own centre by the burst's size (percent out of 10000). */
function scaledBox(list, size) {
  if (size === 10000) return list;
  return list.map(([x, y, w, h]) => { const W = pct(w, size), H = pct(h, size); return [x - Math.trunc((W - w) / 2), y - Math.trunc((H - h) / 2), W, H]; });
}

/**
 * Projectiles against each other, then against the opponent, then the stage edge and their lifetime.
 * Two opposing projectiles that touch both vanish. A hit or a block uses the projectile up.
 */
export function resolveProjectiles(game, world) {
  const list = game.projectiles;
  if (!list.length) return;
  const gone = new Array(list.length).fill('');
  const pdef = (pr) => world.chars[pr.owner].projectiles[pr.kind];
  // The box a projectile has out right now: none for a marker, or outside its phases, or once a staying one has hit.
  // Burst projectiles reaching their burst now: the owner's var sets the size and damage (unless a detonation did).
  for (const pr of list) {
    const B = pdef(pr).burst;
    if (!B || pr.end || pr.age < pr.boom || pr.age > pr.boom) continue;
    if (pr.lv < 0) {
      const lv = B.scale ? Math.trunc((game.players[pr.owner].vars[B.scale.var] | 0) / B.scale.per) : 0;
      pr.lv = lv;
      pr.size = 10000 + lv * (B.scale ? B.scale.sizePct : 0);
      pr.dmg = 10000 + lv * (B.scale ? B.scale.damagePct : 0);
    }
    game.cues.push({ type: 'projBurst', p: pr.owner, name: pr.kind, x: pr.x, y: pr.y, lv: pr.lv, size: pr.size, joined: pr.joined | 0 });
  }
  const boxOf = (pr, def) => (def.wake ? (pr.woke < 0 || pr.age < pr.woke + def.wake.delay || pr.age >= pr.woke + def.wake.delay + def.wake.active ? null : def.hitbox) : def.burst ? (pr.hit || pr.age < pr.boom + def.burst.delay || pr.age >= pr.boom + def.burst.delay + def.burst.active ? null : scaledBox(def.hitbox, pr.size)) : def.noHit || pr.hit || pr.cool > 0 ? null : def.phases ? def.phases.find((ph) => pr.age >= ph.from && pr.age <= ph.to)?.box ?? null : def.hitbox);
  list.forEach((pr, i) => { if (pr.end) gone[i] = 'recall'; });
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      if (gone[i] || gone[j] || list[i].owner === list[j].owner) continue;
      const solid = (q) => (pdef(q).persist || pdef(q).burst ? null : boxOf(q, pdef(q)));
      const bi = solid(list[i]), bj = solid(list[j]);
      if (bi && bj && contact(list[i], bi, list[j], bj)) gone[i] = gone[j] = 'clash';
    }
  }
  const half = world.battle.halfWidthUnits;
  list.forEach((pr, i) => {
    if (gone[i]) return;
    const def = pdef(pr);
    const a = game.players[pr.owner];
    const d = game.players[1 - pr.owner];
    const ddef = world.chars[d.id];
    const fd = frameOf(ddef, d.state, d.frame);
    const box = boxOf(pr, def);
    const rect = !box || fd.invStrike || floorBlocks(world, def.move, d) || (!def.move.hitsAirborne && isAirborne(ddef, d)) ? null : contact(pr, box, d, fd.hurt);
    if (rect) {
      const move = def.burst && pr.dmg !== 10000 ? { ...def.move, damage: pct(def.move.damage, pr.dmg) } : def.move;
      // It pushes the way it flies, and is blocked by holding away from where it came from. A burst knocks away
      // from its centre and is blocked holding either way.
      const away = def.burst ? (d.x > pr.x ? 1 : d.x < pr.x ? -1 : pr.facing) : pr.vx ? (pr.vx > 0 ? 1 : -1) : pr.facing;
      const block = blockKind(d, ddef, { x: d.x - away }, move, world) || (def.burst ? blockKind(d, ddef, { x: d.x + away }, move, world) : null);
      // Parried (a catch that takes projectiles, the universal parry): it is used up, nothing else happens to anyone.
      if (!block && fd.catch?.projectiles && move.kind !== 'super' && !move.pierce) {
        enterState(d, ddef, fd.catch.to);
        if (fd.catch.parry) parried(game, world, d, ddef, rect, pr.kind);
        gone[i] = 'block';
        return;
      }
      const kind = absorbs(ddef, d.state, move) ? 'absorb' : !block && fd.armor > d.armorUsed ? 'armor' : block ? 'block' : hitKind(world, d, fd);
      const stagger = move.stagger && meets(a, move.stagger.when) ? move.stagger.hitstun : 0;
      applyStrike(game, world, { a, d, move, block, away, rect, moveId: pr.kind, firstOfUse: !(pr.n > 0), kind, stagger, proj: pr });
      // hits: a projectile that hits more than once waits `rehit` frames between its hits, then is used up.
      if (def.hits > 1 && (pr.n | 0) + 1 < def.hits) { pr.n = (pr.n | 0) + 1; pr.cool = def.rehit; }
      else if (def.persist || def.burst) pr.hit = 1;
      else gone[i] = kind === 'block' || kind === 'absorb' ? 'block' : 'hit';
      // A catch: the owner, still in the move that made it, goes to a follow-up state.
      if (def.ownerOnHit && kind !== 'block' && kind !== 'absorb' && kind !== 'armor' && a.state === pr.from) {
        enterState(a, world.chars[a.id], def.ownerOnHit);
        a.contact = CONTACT.HIT;
      }
      if (def.persist && pr.age >= def.lifetime) gone[i] = 'edge';
    } else if (def.endsOnGround && pr.y <= 0) { pr.y = 0; gone[i] = 'ground'; }
    else if (def.burst) { if (pr.age >= pr.boom + def.burst.delay + def.burst.active + def.burst.linger) gone[i] = 'edge'; }
    else if (def.wake && pr.woke >= 0) { if (pr.age >= pr.woke + def.wake.delay + def.wake.active) gone[i] = 'burst'; }
    else if (pr.x < -half || pr.x > half || pr.age >= def.lifetime) gone[i] = 'edge';
  });
  list.forEach((pr, i) => {
    const end = gone[i] ? pdef(pr).onEnd : null;
    if (end) { // what its owner's vars are set to when it ends
      const o = game.players[pr.owner], odef = world.chars[pr.owner];
      for (const [k, n] of Object.entries(end)) { const v = odef.mechanic.vars[k]; if (v) o.vars[k] = Math.max(v.min, Math.min(v.max, n)); }
    }
    if (gone[i]) game.cues.push({ type: 'projectileEnd', p: pr.owner, name: pr.kind, x: pr.x, y: pr.y, facing: pr.facing, why: gone[i] });
  });
  game.projectiles = list.filter((_, i) => !gone[i]);
}

/**
 * A hit from something of the attacker's that is not their body (the relic): blocked by holding away from `away`,
 * then applied like a projectile's (no hitstop, contact or pushback on the attacker). Returns what it was:
 * 'hit' | 'counter' | 'witness' | 'block' | 'armor' | 'absorb'.
 */
export function strikeRemote(game, world, { a, d, move, rect, away, moveId, firstOfUse = true }) {
  const ddef = world.chars[d.id];
  const fd = frameOf(ddef, d.state, d.frame);
  const block = blockKind(d, ddef, { x: d.x - away }, move, world);
  const kind = absorbs(ddef, d.state, move) ? 'absorb' : !block && fd.armor > d.armorUsed ? 'armor' : block ? 'block' : hitKind(world, d, fd);
  const stagger = move.stagger && meets(a, move.stagger.when) ? move.stagger.hitstun : 0;
  applyStrike(game, world, { a, d, move, block, away, rect, moveId, firstOfUse, kind, stagger, proj: true });
  return kind;
}

/** Percent from a decay table at combo time t: the last row whose time has been reached. */
export function decayAt(table, t) {
  let p = 10000;
  for (const [at, v] of table) if (t >= at) p = v;
  return p;
}

/**
 * Pushback: the defender slides away. If the defender is already in the corner, the attacker slides back instead
 * (by its self pushback, or the full pushback if the move has none). Airborne attackers aren't pushed.
 */
function pushback(world, a, d, away, amount, self) {
  const frames = world.battle.pushbackFrames;
  const adef = world.chars[a.id];
  const ddef = world.chars[d.id];
  if (cornered(d, ddef, world, away)) {
    if (!isAirborne(adef, a)) startSlide(a, -away * (self || amount), frames);
  } else {
    startSlide(d, away * amount, frames);
  }
}

/**
 * Recoil: a move with `recoil` slides its user back whenever it touches (hit or block), wherever the defender is
 * and whatever happens to them (launched, cornered). It adds to a corner pushback that has just started.
 */
function recoil(world, a, away, move) {
  if (!move.recoil || isAirborne(world.chars[a.id], a)) return;
  const already = a.slideLeft > 0 && sign(a.slide) === -away ? Math.abs(a.slide) : 0;
  startSlide(a, -away * (already + move.recoil), world.battle.pushbackFrames);
}

// ---------- Throws ----------

function canBeThrown(d, ddef) {
  const st = ddef.states[d.state];
  if (st.stance === 'air' || st.stun) return false; // no throwing out of hit or block stun, or in the air
  return d.y === 0;
}

function startThrow(game, world, a, d) {
  const adef = world.chars[a.id];
  const ddef = world.chars[d.id];
  const move = adef.states[a.state].move;
  a.contact = CONTACT.HIT;
  a.hitsDone = -1;
  d.throwBy = a.id;
  d.throwMove = a.state;
  d.kd = 1; // a throw ends in the hard knockdown
  // The hold lasts `throwHold` frames (the thrower's stat; without it, as long as the break window).
  const hold = Math.max(adef.stats.throwHold ?? 0, adef.stats.throwBreak);
  enterState(a, adef, 'throwHold');
  a.stun = hold;
  // The thrown fighter stays held `throwHit` frames longer: the throw hits on its hit drawing, not when the hold ends.
  enterState(d, ddef, 'thrown');
  d.stun = hold + move.throwHit;
  d.throwHeld = d.stun;
  d.throwWait = move.throwHit;
  d.facing = -a.facing;
  d.x = a.x + a.facing * move.throwDistance;
  d.slide = 0;
  d.slideLeft = 0;
  cue(game, 'throw', a, null, { move: d.throwMove });
}

function throwTech(game, world, a, b) {
  const t = world.battle.throwTech;
  for (const [p, o] of [[a, b], [b, a]]) {
    const def = world.chars[p.id];
    enterState(p, def, 'throwTech');
    p.stun = t.stun;
    p.throwBy = -1;
    const away = p.x < o.x ? -1 : p.x > o.x ? 1 : -p.facing;
    startSlide(p, away * world.battle.throwTechPushUnits, world.battle.pushbackFrames);
  }
  cue(game, 'tech', a, null);
}

/** A back throw puts the thrown fighter on the other side and turns the thrower round. */
function throwSwaps(a, d, move) {
  d.x = a.x - a.facing * move.throwDistance;
  a.facing = -a.facing;
}

/** Called when the hold ends and the throw's hit is still to come (throwHit > 0). */
export function throwTurns(game, world, d) {
  const a = game.players[d.throwBy];
  const move = a && world.chars[a.id].states[d.throwMove]?.move;
  if (move?.throwSwap) throwSwaps(a, d, move);
}

/** Called when a thrown fighter's hold (and the wait for the hit drawing) ends unbroken: the throw lands. */
export function throwLands(game, world, d) {
  const a = game.players[d.throwBy];
  if (!a) return;
  const adef = world.chars[a.id];
  const ddef = world.chars[d.id];
  const move = adef.states[d.throwMove]?.move;
  if (move) {
    const dmg = gutsDamage(pct(move.damage, damageMod(world, a)), d.health, ddef.stats.health, world.battle);
    applyDamage(d, ddef, dmg);
    cashDebt(game, world, d); // a throw goes through Vow and makes the Debt come due
    gains(game, world, a, d, move, 'hit', dmg, { fresh: true });
    if (move.throwSwap && !d.throwWait) throwSwaps(a, d, move);
    const away = d.x > a.x ? 1 : -1;
    d.facing = -away;
    startSlide(d, away * move.pushbackHit, world.battle.pushbackFrames);
    const fx = move.throwFx && [a.x + a.facing * move.throwFx[0], a.y + move.throwFx[1]];
    cue(game, 'hit', a, fx ? [fx[0], fx[1], fx[0], fx[1]] : null, { move: d.throwMove, damage: dmg, throw: true });
  }
  d.throwBy = -1;
}

/** A thrown fighter who presses H in the break window (the first `throwBreak` frames of the hold) breaks the throw. */
export function checkThrowBreaks(game, world, frozen) {
  for (const d of game.players) {
    if (frozen[d.id] || d.state !== 'thrown' || d.throwBy < 0) continue;
    const window = world.chars[d.throwBy].stats.throwBreak;
    if (d.throwHeld - d.stun < window && pressedAt(d.input, BTN.H, 0)) throwTech(game, world, game.players[d.throwBy], d);
  }
}

// ---------- The hit stage ----------

/** Resolve every contact this frame, both directions at once (so trades happen). */
export function resolveHits(game, world, frozen) {
  const [a, b] = game.players;
  const snap = {};
  for (const p of game.players) snap[p.id] = { state: p.state, fr: frameOf(world.chars[p.id], p.state, p.frame) };

  const live = (p) => !frozen[p.id];
  const strikeOf = (p, q) => {
    const fp = snap[p.id].fr;
    const fq = snap[q.id].fr;
    if (!live(p) || !fp.hit.length || !fp.hitId || (p.hitsDone & (1 << fp.hitId)) || p.hitsDone === -1) return null;
    if (fq.invStrike) return null;
    const mv = world.chars[p.id].states[snap[p.id].state].move;
    if (floorBlocks(world, mv, q)) return null; // lying in a hard knockdown: OTG moves only
    if (mv?.hitRequires && !meets(p, mv.hitRequires)) return null; // e.g. only a branded opponent can be hit
    if (mv && mv.hitsAirborne === false && isAirborne(world.chars[q.id], q)) return null; // a ground-only hit
    if (mv && mv.hitsGrounded === false && !isAirborne(world.chars[q.id], q)) return null; // an air-only hit
    if (mv?.grab && !grabbable(world.chars[q.id], q)) return null;
    // The hits of a grab only ever touch the fighter being held.
    if (fp.hold && !(q.state === 'grabbed' && q.heldBy === p.id)) return null;
    // A remote hit lands wherever the opponent is: the "contact" is their body (their position if they have no hurtbox).
    if (mv?.remote) return fq.hurt[0] ? worldBox(q, fq.hurt[0]) : [q.x, q.y, q.x, q.y];
    return contact(p, fp.hit, q, fq.hurt);
  };
  const throwOf = (p, q) => {
    const fp = snap[p.id].fr;
    const fq = snap[q.id].fr;
    if (!live(p) || !fp.throw.length || fq.invThrow || p.hitsDone === -1) return null;
    if (!canBeThrown(q, world.chars[q.id])) return null;
    return contact(p, fp.throw, q, fq.throwHurt);
  };

  // Throws first: they beat strikes on the same frame. Two throws at once = a tech.
  const tA = throwOf(a, b);
  const tB = throwOf(b, a);
  if (tA && tB) { throwTech(game, world, a, b); return; }
  if (tA) { startThrow(game, world, a, b); return; }
  if (tB) { startThrow(game, world, b, a); return; }

  const sA = strikeOf(a, b);
  const sB = strikeOf(b, a);
  if (!sA && !sB) {
    // Clash: both hitboxes meet but neither reaches a hurtbox.
    const fa = snap[a.id].fr;
    const fb = snap[b.id].fr;
    const boxed = (p) => { const mv = world.chars[p.id].states[snap[p.id].state].move; return !(mv?.remote || (mv?.hitRequires && !meets(p, mv.hitRequires))); };
    const fresh = (p, f) => live(p) && f.hit.length && f.hitId && !(p.hitsDone & (1 << f.hitId)) && p.hitsDone !== -1 && boxed(p);
    if (fresh(a, fa) && fresh(b, fb)) {
      const rect = contact(a, fa.hit, b, fb.hit);
      if (rect) {
        a.hitsDone |= 1 << fa.hitId;
        b.hitsDone |= 1 << fb.hitId;
        a.contact = b.contact = CONTACT.CLASH;
        a.hitstop = b.hitstop = world.battle.clash.hitstop;
        cue(game, 'clash', a, rect);
      }
    }
    return;
  }
  // Decide both outcomes from the same snapshot, then apply: a trade hits both.
  const results = [];
  if (sA) results.push(resolveStrike(game, world, a, b, sA, snap));
  if (sB) results.push(resolveStrike(game, world, b, a, sB, snap));
  for (const r of results) applyStrike(game, world, r);
  if (results.length === 2) {
    // In a trade each fighter gets the larger hitstop of the two, so both freeze together.
    const hs = Math.max(a.hitstop, b.hitstop);
    a.hitstop = b.hitstop = hs;
  }
}
