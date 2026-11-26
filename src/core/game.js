// The simulation. step() advances the game exactly one 60 Hz frame from two raw inputs.
// It mutates the state it is given; callers that need the old state clone first (rollback does).
//
// `world` is the static, read-only context: { input, battle, chars: [def1, def2] }. Build it with createWorld().
// The game state holds only plain data and refers to characters by id.

import { createInputState, pushInput, BTN } from './input.js';
import { compileMatch, createMatch, matchBefore, matchAfter, controlsLive } from './match.js';
import { createFighter, advanceAndDecide, move, land, resolveGuardActions, tickRite, tickDrains } from './fighter.js';
import { separate, holdTogether, resolveHits, checkThrowBreaks, throwLands, throwTurns, moveProjectiles, resolveProjectiles } from './combat.js';
import { px } from './fixed.js';
import { compileSystems, compileHitStates } from './systems.js';

export const FPS = 60;

/** States a fighter can be in while still being comboed. */
export const COMBO_STATES = new Set(['hitStand', 'hitCrouch', 'hitAir', 'hitSpin', 'hitTumble', 'slide', 'tumble', 'knockdown', 'knockdownSoft', 'thrown', 'crumple']);

/** Bundle the system data and two compiled characters into the read-only world. */
export function createWorld({ input, battle, combo, meter = null, burst = null, match = null, systems = null, chars }) {
  return {
    input,
    sys: compileSystems(systems), // counters, Witness, Perfect Link, ... (data/system/systems.json)
    match: compileMatch(match),
    combo: {
      ...combo,
      hardLaunchUnits: { x: px(combo.hardLaunch?.x ?? 0), y: px(combo.hardLaunch?.y ?? 24) },
      softLaunchUnits: { x: px(combo.softLaunch?.x ?? 0), y: px(combo.softLaunch?.y ?? 13) },
      hit: compileHitStates(combo.hitStates), // hit states: reactions, knockdowns, OTG
    },
    meter,
    burst: burst && {
      ...burst,
      buttons: [...burst.buttons],
      bits: [...burst.buttons].map((b) => BTN[b]),
      stateSet: new Set(burst.states),
    },
    battle: {
      ...battle,
      halfWidthUnits: px(battle.stage.halfWidth),
      startXUnits: px(battle.stage.startX),
      maxGapUnits: battle.stage.maxGap ? px(battle.stage.maxGap) : 0, // the most the two fighters can be apart (0 = no limit)
      cornerZoneUnits: px(battle.cornerZone),
      airHitUnits: { x: px(battle.airHit.x), y: px(battle.airHit.y) },
      throwTechPushUnits: px(battle.throwTech.push),
    },
    chars,
  };
}

/** A new game: both fighters at their start positions, facing each other. */
export function createGame(world) {
  return {
    frame: 0,
    cues: [],
    flash: 0, // super flash: frames the whole game stays frozen
    flashBy: -1,
    projectiles: [], // live projectiles: { owner, kind, x, y, facing, age } (their definitions stay in the character)
    match: world.match ? createMatch(world) : null, // rounds and timer (null in training)
    players: [0, 1].map((i) => ({
      id: i,
      input: createInputState(world.input.bufferFrames),
      ...createFighter(world.chars[i], i, i === 0 ? -world.battle.startXUnits : world.battle.startXUnits),
      burst: world.burst ? world.burst.start : 0,
    })),
  };
}

/**
 * Advance one frame. rawInputs: [p1Raw, p2Raw] bitmasks (see RAW in input.js).
 * Stages run for both fighters before the next stage starts, so neither player acts first.
 */
export function step(state, rawInputs, world) {
  state.frame++;
  state.cues.length = 0;
  const ps = state.players;
  // Between rounds (KO, time up, match over) nobody can act.
  const live = controlsLive(state);
  pushInput(ps[0].input, live ? rawInputs[0] | 0 : 0, world.input);
  pushInput(ps[1].input, live ? rawInputs[1] | 0 : 0, world.input);
  if (state.match && matchBefore(state, world)) return state; // round intro: fighters stand still

  // Super flash: everything stands still; presses made now stay buffered for when it ends.
  if (state.flash > 0) {
    state.flash--;
    for (const p of ps) p.freezeAge++;
    return state;
  }

  // Per-frame resources: the mechanic's gauge and vars, and the burst gauge.
  for (const p of ps) {
    const def = world.chars[p.id];
    const mech = def.mechanic;
    if (mech.gauge && mech.gauge.perFrame) p.gauge = Math.max(0, Math.min(mech.gauge.max, p.gauge + mech.gauge.perFrame));
    for (const [k, v] of Object.entries(mech.vars)) {
      if (v.perFrame) p.vars[k] = Math.max(v.min, Math.min(v.max, p.vars[k] + v.perFrame));
    }
    const B = world.burst;
    if (B && B.enabled && B.perFrame) p.burst = Math.min(B.gaugeMax, p.burst + B.perFrame);
    tickRite(p, def);
    tickDrains(p, def);
    // Debt drains away once Vow is over (not while guarding or striking: landing the strike forgives it; and not
    // while held in a throw: the throw makes all of it come due).
    if (p.debt > 0) {
      const st = def.states[p.state];
      if (!st.vow && st.kind !== 'vow' && p.state !== 'thrown') p.debt = Math.max(0, p.debt - p.debtRate);
    }
  }

  // Hitstop: a frozen fighter skips everything this frame.
  const frozen = [false, false];
  for (const p of ps) {
    if (p.hitstop > 0) { p.hitstop--; p.freezeAge++; frozen[p.id] = true; }
  }

  // Combo time runs while a combo is alive, not during hitstop (the hit frame itself is time 0).
  for (const p of ps) if (p.combo && !frozen[p.id]) p.combo.time++;

  checkThrowBreaks(state, world, frozen);

  const hooks = { throwLands: (p) => throwLands(state, world, p), throwTurns: (p) => throwTurns(state, world, p) };
  for (const p of ps) if (!frozen[p.id]) advanceAndDecide(state, p, ps[1 - p.id], world.chars[p.id], world, hooks);
  resolveGuardActions(state, world);
  // Remember when each fighter was last in an attack's active or recovery frames ("mid-string", for Vow's strike).
  for (const p of ps) {
    const mv = world.chars[p.id].states[p.state].move;
    if (mv && mv.active > 0 && mv.kind !== 'vow' && p.frame >= mv.startup - 1) p.atkFrame = state.frame;
  }
  moveProjectiles(state, world);
  const before = [ps[0].x, ps[1].x]; // where each fighter stood before this frame's movement (for the distance limit)
  for (const p of ps) if (!frozen[p.id]) move(state, p, world.chars[p.id], world);
  separate(state, world);
  holdTogether(state, world, before);
  for (const p of ps) if (!frozen[p.id]) land(state, p, world.chars[p.id], world);
  // A combo ends the moment its victim gets free, before this frame's hits: a hit on a fighter who has just
  // recovered starts a new combo (and they could have blocked it).
  for (const p of ps) {
    if (p.combo && p.hitstop === 0 && !COMBO_STATES.has(p.state)) {
      p.lastCombo = p.combo;
      p.combo = null;
      p.wbX = p.wbY = p.gbY = 0;
    }
  }
  resolveHits(state, world, frozen);
  resolveProjectiles(state, world);
  if (state.match) matchAfter(state, world);
  return state;
}
