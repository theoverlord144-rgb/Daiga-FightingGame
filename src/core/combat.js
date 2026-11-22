// Collision and hit resolution: pushboxes and walls, strikes, blocks, counter hits, clashes, trades, armor,
// throws and throw techs, hitstop, hitstun/blockstun, pushback (and corner pushback), damage with guts.

import { frameOf } from './character.js';
import { CONTACT, enterState, isAirborne, startSlide, applyResources, meets } from './fighter.js';
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
  const blocking = st.free || st.name.startsWith('block');
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
  const out = { a, d, move, block, away, rect, moveId: snap[a.id].state, firstOfUse };

  if (!block && fd.armor > d.armorUsed) {
    out.kind = 'armor';
  } else if (block) {
    out.kind = 'block';
  } else {
    out.kind = fd.counter ? 'counter' : 'hit';
  }
  return out;
}

/** Meter and mechanic gains when a strike connects: attacker by the move, defender by the damage taken. */
function gains(world, a, d, move, kind, dmg) {
  const adef = world.chars[a.id];
  const ddef = world.chars[d.id];
  const g = adef.mechanic.gauge;
  if (kind === 'block') {
    applyResources(a, adef, { meter: move.meterGain.block, gauge: g ? g.onBlock : 0 });
    applyResources(a, adef, move.onBlock);
    return;
  }
  applyResources(a, adef, { meter: move.meterGain.hit, gauge: g ? g.onHit : 0 });
  applyResources(a, adef, move.onHit);
  const M = world.meter;
  if (M && dmg > 0) applyResources(d, ddef, { meter: pct(dmg, M.victimGainPct) });
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

  if (r.kind === 'armor') {
    d.armorUsed++;
    a.contact = CONTACT.HIT;
    gains(world, a, d, move, 'hit', 0);
    applyDamage(d, ddef, gutsDamage(pct(move.damage, battle.armorDamagePct), d.health, maxHp, battle));
    a.hitstop = d.hitstop = move.hitstop;
    cue(game, 'armor', a, rect, { move: a.state });
    return;
  }

  // Face the attacker (cross-ups turn the defender around).
  d.facing = -away;

  if (r.kind === 'block') {
    a.contact = CONTACT.BLOCK;
    gains(world, a, d, move, 'block', 0);
    applyDamage(d, ddef, move.chip);
    a.hitstop = d.hitstop = move.blockHitstop;
    enterState(d, ddef, r.block === 'air' ? 'blockAir' : r.block === 'crouch' ? 'blockCrouch' : 'blockStand');
    d.stun = move.blockstun;
    pushback(world, a, d, away, move.pushbackBlock, move.selfPushback);
    cue(game, 'block', a, rect, { move: a.state });
    return;
  }

  const counter = r.kind === 'counter';
  const ch = battle.counterHit;
  const C = world.combo;
  a.contact = CONTACT.HIT;

  // The combo this hit belongs to (a new one if the defender wasn't already being comboed).
  const starter = !d.combo;
  if (starter) d.combo = { hits: 0, damage: 0, time: 0, scale: 10000, used: {}, wb: 0, gb: 0 };
  const combo = d.combo;
  const moveId = r.moveId;
  // Earlier uses of this move in the combo (a multi-hit move's own later hits don't count as a new use).
  const used = combo.used[moveId] || 0;
  const uses = r.firstOfUse ? used : Math.max(0, used - 1);

  // Damage: base (counter bonus) x combo scaling x same-move penalty, then guts.
  let base = counter ? pct(move.damage, ch.damagePct) : move.damage;
  base = pct(base, damageMod(world, a));
  base = pct(base, combo.scale);
  for (let i = 0; i < uses; i++) base = pct(base, C.repeatPenalty);
  const dmg = gutsDamage(base, d.health, maxHp, battle);
  applyDamage(d, ddef, dmg);

  // Proration for the hits that follow: the starter's own proration once, then every hit's combo proration.
  let scale = combo.scale;
  if (starter) scale = pct(scale, move.starterProration ?? C.starterProration);
  scale = pct(scale, move.comboProration ?? C.comboProration);
  combo.scale = Math.max(C.minScale, scale);
  combo.hits++;
  combo.damage += dmg;
  if (r.firstOfUse) combo.used[moveId] = used + 1;
  gains(world, a, d, move, 'hit', dmg);

  a.hitstop = d.hitstop = move.hitstop + (counter ? ch.hitstopAdd : 0);
  // Combo time: the longer the combo has run, the shorter the hitstun and untechable time.
  const airborne = isAirborne(ddef, d);
  const inAir = !!(move.launch || airborne);
  const rawStun = (inAir ? move.untech ?? move.hitstun : move.hitstun) + (counter ? ch.hitstunAdd : 0);
  const stun = Math.max(C.minHitstun, pct(rawStun, decayAt(inAir ? C.untechDecay : C.hitstunDecay, combo.time)));

  // Bounces: armed by the move, each kind limited per combo.
  const limit = move.bounceLimit ?? C.bounceLimit;
  if (move.wallBounce && combo.wb < limit) { d.wbX = move.wallBounce.x; d.wbY = move.wallBounce.y; }
  if (move.groundBounce && combo.gb < limit) d.gbY = move.groundBounce.y;

  if (inAir) {
    const v = move.launch || move.airHit || { x: battle.airHitUnits.x, y: battle.airHitUnits.y };
    enterState(d, ddef, 'hitAir');
    d.vx = v.x * away; // x is authored as "away from the attacker"
    d.vy = v.y;
    if (d.y === 0 && d.vy > 0) d.y = 1; // leave the ground this frame
  } else if (move.knockdown) {
    enterState(d, ddef, 'knockdown');
  } else {
    enterState(d, ddef, ddef.states[d.state].stance === 'crouch' ? 'hitCrouch' : 'hitStand');
  }
  d.stun = stun;
  if (move.pull) {
    // Pull-in: the defender slides toward the attacker (instead of pushback), ending pull.to in front of them.
    if (inAir) d.vx = 0;
    const gap = Math.abs(d.x - a.x) - move.pull.to;
    startSlide(d, gap > 0 ? -away * gap : 0, move.pull.frames);
  } else if (!airborne && !move.launch) pushback(world, a, d, away, move.pushbackHit, move.selfPushback);
  cue(game, counter ? 'counter' : 'hit', a, rect, { move: moveId, damage: dmg, hits: combo.hits, scale: combo.scale });
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
    gains(world, a, d, move, 'hit', dmg);
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
    const fresh = (p, f) => live(p) && f.hit.length && f.hitId && !(p.hitsDone & (1 << f.hitId)) && p.hitsDone !== -1;
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
