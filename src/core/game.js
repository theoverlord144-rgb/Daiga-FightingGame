// The simulation. step() advances the game exactly one 60 Hz frame from two raw inputs.
// It mutates the state it is given; callers that need the old state clone first (rollback does).
//
// `world` is the static, read-only context: { input, battle, chars: [def1, def2] }. Build it with createWorld().
// The game state holds only plain data and refers to characters by id.

import { createInputState, pushInput } from './input.js';
import { createFighter, stepFighter } from './fighter.js';
import { px } from './fixed.js';

export const FPS = 60;

/** Bundle the system data and two compiled characters into the read-only world. */
export function createWorld({ input, battle, chars }) {
  return {
    input,
    battle: { ...battle, halfWidthUnits: px(battle.stage.halfWidth), startXUnits: px(battle.stage.startX) },
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

/** Advance one frame. rawInputs: [p1Raw, p2Raw] bitmasks (see RAW in input.js). */
export function step(state, rawInputs, world) {
  state.frame++;
  state.cues.length = 0;
  const [a, b] = state.players;
  pushInput(a.input, rawInputs[0] | 0, world.input);
  pushInput(b.input, rawInputs[1] | 0, world.input);
  stepFighter(state, a, b, world.chars[0], world);
  stepFighter(state, b, a, world.chars[1], world);
  return state;
}
