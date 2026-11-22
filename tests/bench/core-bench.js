// Core speed benchmark: how many simulation steps per second the core manages on this machine.
// 60 are needed for real time; rollback needs about 9x that at worst (8 resimulated frames + 1).
import { createGame, step } from '../../src/core/game.js';
import { cloneState } from '../../src/core/state.js';
import { loadWorld, fightInputs } from '../helpers.js';

const world = loadWorld();
const g = createGame(world);
const inputs = fightInputs(1);

// Random inputs biased toward walking in and pressing buttons, so hits and blocks actually happen.
const N = 200000;
let hits = 0;
let t = process.hrtime.bigint();
for (let i = 0; i < N; i++) {
  step(g, inputs(g), world);
  hits += g.cues.length;
}
const stepUs = Number(process.hrtime.bigint() - t) / 1000 / N;

t = process.hrtime.bigint();
for (let i = 0; i < 20000; i++) cloneState(g);
const cloneUs = Number(process.hrtime.bigint() - t) / 1000 / 20000;

console.log(`step: ${stepUs.toFixed(2)} µs  (${Math.round(1e6 / stepUs).toLocaleString()} steps/s, ${hits} cues over ${N} frames)`);
console.log(`clone state: ${cloneUs.toFixed(2)} µs`);
console.log(`rollback worst case per frame (9 steps + 9 clones): ${((stepUs + cloneUs) * 9 / 1000).toFixed(3)} ms of a 16.7 ms frame`);
