// The simulation. step() advances the game exactly one 60 Hz frame from two raw inputs.
// It mutates the state it is given; callers that need the old state clone first (rollback does).
//
// `world` is the static, read-only context: { input, battle, chars: [def1, def2] }. Build it with createWorld().
// The game state holds only plain data and refers to characters by id.

import { createInputState, pushInput } from './input.js';
import { createFighter, advanceAndDecide, move, land } from './fighter.js';
import { separate, resolveHits, checkThrowBreaks, throwLands } from './combat.js';
import { px } from './fixed.js';

export const FPS = 60;

/** Bundle the system data and two compiled characters into the read-only world. */
export function createWorld({ input, battle, chars }) {
  return {
    input,
    battle: {
      ...battle,
      halfWidthUnits: px(battle.stage.halfWidth),
      startXUnits: px(battle.stage.startX),
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
    players: [0, 1].map((i) => ({
      id: i,
      input: createInputState(world.input.bufferFrames),
      ...createFighter(world.chars[i], i, i === 0 ? -world.battle.startXUnits : world.battle.startXUnits),
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
  pushInput(ps[0].input, rawInputs[0] | 0, world.input);
  pushInput(ps[1].input, rawInputs[1] | 0, world.input);

  // Hitstop: a frozen fighter skips everything this frame.
  const frozen = [false, false];
  for (const p of ps) {
    if (p.hitstop > 0) { p.hitstop--; p.freezeAge++; frozen[p.id] = true; }
  }

  checkThrowBreaks(state, world, frozen);

  const hooks = { throwLands: (p) => throwLands(state, world, p) };
  for (const p of ps) if (!frozen[p.id]) advanceAndDecide(state, p, ps[1 - p.id], world.chars[p.id], world, hooks);
  for (const p of ps) if (!frozen[p.id]) move(state, p, world.chars[p.id]);
  separate(state, world);
  for (const p of ps) if (!frozen[p.id]) land(state, p, world.chars[p.id]);
  resolveHits(state, world, frozen);
  return state;
}
