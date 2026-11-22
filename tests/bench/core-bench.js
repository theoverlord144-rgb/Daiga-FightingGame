// Core speed benchmark: how many simulation steps per second the core manages on this machine.
// 60 are needed for real time; rollback needs about 9x that at worst (8 resimulated frames + 1).
import { readFileSync } from 'node:fs';
import { createGame, step } from '../../src/core/game.js';
import { cloneState } from '../../src/core/state.js';

const rules = JSON.parse(readFileSync(new URL('../../data/system/input.json', import.meta.url), 'utf8'));
const g = createGame(rules);
let s = 1;
const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0);

const N = 200000;
let t = process.hrtime.bigint();
for (let i = 0; i < N; i++) step(g, [rnd() & 255, rnd() & 255], rules);
const stepUs = Number(process.hrtime.bigint() - t) / 1000 / N;

t = process.hrtime.bigint();
for (let i = 0; i < 20000; i++) cloneState(g);
const cloneUs = Number(process.hrtime.bigint() - t) / 1000 / 20000;

console.log(`step: ${stepUs.toFixed(2)} µs  (${Math.round(1e6 / stepUs).toLocaleString()} steps/s)`);
console.log(`clone state: ${cloneUs.toFixed(2)} µs`);
console.log(`rollback worst case per frame (9 steps + 9 clones): ${((stepUs + cloneUs) * 9 / 1000).toFixed(3)} ms of a 16.7 ms frame`);
