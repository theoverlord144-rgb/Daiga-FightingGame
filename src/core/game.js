// The simulation. step() advances the game exactly one 60 Hz frame from two raw inputs.
// It mutates the state it is given; callers that need the old state clone first (rollback does).

import { createInputState, pushInput } from './input.js';

export const FPS = 60;

/** A new game. `rules` is data/system/input.json (plus more system data in later phases). */
export function createGame(rules) {
  return {
    frame: 0,
    players: [0, 1].map((i) => ({ id: i, input: createInputState(rules.bufferFrames) })),
  };
}

/** Advance one frame. rawInputs: [p1Raw, p2Raw] bitmasks (see RAW in input.js). */
export function step(state, rawInputs, rules) {
  for (let i = 0; i < 2; i++) pushInput(state.players[i].input, rawInputs[i] | 0, rules);
  state.frame++;
  return state;
}
