// Collision and hit resolution: pushboxes and walls, strikes, blocks, counter hits, clashes, trades, armor,
// throws and throw techs, hitstop, hitstun/blockstun, pushback (and corner pushback), damage with guts.

import { frameOf } from './character.js';
import { CONTACT, enterState, isAirborne, inZone, startSlide, applyResources, meets, gainDevotion } from './fighter.js';
import { perPercent } from './devotion.js';
import { soften } from './systems.js';
import { BTN, dirOf, frameAt, pressedAt, mirrorDir } from './input.js';
import { pct, sign } from './fixed.js';

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
  if (!blocking || move.guard === 'unblockable') return null;
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
  if (!fd.counter) return 'hit';
  if (fd.counter === 2) return 'witness';
  const mv = world.chars[d.id].states[d.state].move;
  if (mv && (mv.kind === 'special' || mv.kind === 'super') && d.frame >= mv.startup - 1 && d.contact === CONTACT.NONE && d.hitsDone === 0) return 'witness';
  return 'counter';
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
  } else if (!block && fd.armor > d.armorUsed) {
    out.kind = 'armor';
  } else if (block) {
    out.kind = 'block';
  } else {
    out.kind = hitKind(world, d, fd);
  }
  return out;
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
    if (body) pushback(world, a, d, away, move.pushbackBlock, move.selfPushback);
    else if (!cornered(d, ddef, world, away)) startSlide(d, away * move.pushbackBlock, battle.pushbackFrames);
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
  // Hit while standing in the attacker's light (a projectile with a zone): the attacker's mark var goes up.
  for (const pr of game.projectiles) {
    const z = pr.owner === a.id ? world.chars[a.id].projectiles[pr.kind].zone : null;
    if (z?.markVar && !move.noZoneMark && inZone(pr, z, d)) applyResources(a, world.chars[a.id], { vars: { [z.markVar]: 1 } });
  }
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
  if (starter) d.combo = { hits: 0, damage: 0, time: 0, scale: 10000, used: {}, wb: 0, gb: 0, took: 0, gave: 0, by: {}, cls: '', side: 0, hard: 0, juggle: 0, links: 0,
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
  if (uses > 0) base = pct(base, C.repeatDamage); // a move used again in the same combo
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
  const hard = move.launchType === 'hard' && combo.hard < C.hardLaunchLimit;
  const soft = !!move.launchType && !hard;
  if (hard) combo.hard++;
  // Juggle: every hit on an airborne fighter, and every soft launch, adds to the combo's total. Past the limit
  // the fighter falls out: the hit does its damage but gives no untechable time, no launch and no bounce.
  if (airborne || soft) combo.juggle += move.juggleCost ?? (soft && !airborne ? C.softLaunchCost : C.juggleCost);
  const out = (airborne || soft) && combo.juggle > C.juggleLimit;
  const launches = !!move.launchType && !out;
  const inAir = launches || airborne;
  // Combo time: the longer the combo has run, the shorter the hitstun and untechable time.
  let rawStun = (inAir ? move.untech ?? move.hitstun : move.hitstun) + (r.stagger | 0);
  if (special) rawStun = pct(rawStun, ch.hitstunPct);
  if (uses > 0) rawStun = pct(rawStun, C.repeatHitstun);
  const clock = Math.max(0, combo.time - combo.extend); // a Witness combo's decay timer runs late
  const stun = out && airborne ? 0 : Math.max(C.minHitstun, pct(rawStun, decayAt(inAir ? C.untechDecay : C.hitstunDecay, clock)));

  // Bounces: armed by the move, each kind limited per combo.
  const limit = move.bounceLimit ?? C.bounceLimit;
  if (!out && move.wallBounce && combo.wb < limit) { d.wbX = move.wallBounce.x; d.wbY = move.wallBounce.y; }
  if (!out && move.groundBounce && combo.gb < limit) d.gbY = move.groundBounce.y;

  if (inAir) {
    const v = (launches ? (hard || move.launchType === 'soft' ? move.launch : null) ?? (hard ? C.hardLaunchUnits : C.softLaunchUnits) : null)
      || (out ? null : move.airHit) || { x: battle.airHitUnits.x, y: battle.airHitUnits.y };
    enterState(d, ddef, 'hitAir');
    d.vx = v.x * away; // x is authored as "away from the attacker"
    d.vy = v.y;
    if (d.y === 0 && d.vy > 0) d.y = 1; // leave the ground this frame
  } else if (move.knockdown) {
    enterState(d, ddef, 'knockdown');
  } else if (move.crumple && ddef.states.crumple) {
    enterState(d, ddef, 'crumple');
  } else {
    enterState(d, ddef, ddef.states[d.state].stance === 'crouch' ? 'hitCrouch' : 'hitStand');
  }
  d.stun = d.state === 'crumple' ? world.sys.vow.crumpleStun : stun;
  if (move.pull) {
    // Pull-in: the defender slides toward the attacker (instead of pushback), ending pull.to in front of them.
    if (inAir) d.vx = 0;
    const gap = Math.abs(d.x - a.x) - move.pull.to;
    startSlide(d, gap > 0 ? -away * gap : 0, move.pull.frames);
  } else if (!airborne && !launches) {
    if (body) pushback(world, a, d, away, move.pushbackHit, move.selfPushback);
    else if (!cornered(d, ddef, world, away)) startSlide(d, away * move.pushbackHit, battle.pushbackFrames);
  }
  if (body) recoil(world, a, away, move);
  if (body && move.onHitState) {
    // An animation branch on hit (a catch): still the same use of the move, so it keeps its contact.
    enterState(a, world.chars[a.id], move.onHitState);
    a.contact = CONTACT.HIT;
  }
  const extra = { move: moveId, damage: dmg, hits: combo.hits, scale: combo.scale, stagger: r.stagger | 0, fellOut: out, linked };
  if (witness) extra.slow = world.sys.witness.slowFrames;
  cue(game, witness ? 'witness' : counter ? 'counter' : 'hit', a, rect, extra);
}

// ---------- Projectiles ----------

/** Every projectile flies one frame forward (before this frame's spawns, so a new one starts where it was put). */
export function moveProjectiles(game, world) {
  for (const pr of game.projectiles) {
    const pd = world.chars[pr.owner].projectiles[pr.kind];
    pr.x += pd.speed * pr.facing;
    pr.y += pd.speedY;
    pr.age++;
  }
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
  const boxOf = (pr, def) => (def.noHit || pr.hit ? null : def.phases ? def.phases.find((ph) => pr.age >= ph.from && pr.age <= ph.to)?.box ?? null : def.hitbox);
  list.forEach((pr, i) => { if (pr.end) gone[i] = 'recall'; });
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      if (gone[i] || gone[j] || list[i].owner === list[j].owner) continue;
      const bi = pdef(list[i]).persist ? null : boxOf(list[i], pdef(list[i])), bj = pdef(list[j]).persist ? null : boxOf(list[j], pdef(list[j]));
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
    const rect = !box || fd.invStrike || (!def.move.hitsAirborne && isAirborne(ddef, d)) ? null : contact(pr, box, d, fd.hurt);
    if (rect) {
      const move = def.move;
      const away = pr.facing; // it pushes the way it flies, and is blocked by holding away from where it came from
      const block = blockKind(d, ddef, { x: d.x - away }, move, world);
      const kind = absorbs(ddef, d.state, move) ? 'absorb' : !block && fd.armor > d.armorUsed ? 'armor' : block ? 'block' : hitKind(world, d, fd);
      const stagger = move.stagger && meets(a, move.stagger.when) ? move.stagger.hitstun : 0;
      applyStrike(game, world, { a, d, move, block, away, rect, moveId: pr.kind, firstOfUse: true, kind, stagger, proj: pr });
      if (def.persist) pr.hit = 1;
      else gone[i] = kind === 'block' || kind === 'absorb' ? 'block' : 'hit';
      // A catch: the owner, still in the move that made it, goes to a follow-up state.
      if (def.ownerOnHit && kind !== 'block' && kind !== 'absorb' && kind !== 'armor' && a.state === pr.from) {
        enterState(a, world.chars[a.id], def.ownerOnHit);
        a.contact = CONTACT.HIT;
      }
      if (def.persist && pr.age >= def.lifetime) gone[i] = 'edge';
    } else if (pr.x < -half || pr.x > half || pr.age >= def.lifetime) gone[i] = 'edge';
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
  enterState(a, adef, 'throwHold');
  a.stun = adef.stats.throwBreak;
  enterState(d, ddef, 'thrown');
  d.stun = adef.stats.throwBreak;
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

/** Called when a thrown fighter's break window ends unbroken: the throw lands. */
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
    if (move.throwSwap) {
      d.x = a.x - a.facing * move.throwDistance;
      a.facing = -a.facing;
    }
    const away = d.x > a.x ? 1 : -1;
    d.facing = -away;
    startSlide(d, away * move.pushbackHit, world.battle.pushbackFrames);
    cue(game, 'hit', a, null, { move: d.throwMove, damage: dmg, throw: true });
  }
  d.throwBy = -1;
}

/** A thrown fighter who presses H in the break window breaks the throw. */
export function checkThrowBreaks(game, world, frozen) {
  for (const d of game.players) {
    if (frozen[d.id] || d.state !== 'thrown' || d.throwBy < 0) continue;
    if (pressedAt(d.input, BTN.H, 0)) throwTech(game, world, game.players[d.throwBy], d);
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
    if (mv?.hitRequires && !meets(p, mv.hitRequires)) return null; // e.g. only a branded opponent can be hit
    if (mv && mv.hitsAirborne === false && isAirborne(world.chars[q.id], q)) return null; // a ground-only hit
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
