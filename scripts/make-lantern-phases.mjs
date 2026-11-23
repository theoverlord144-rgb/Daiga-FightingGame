// Placeholder art for the moon in Avner's lantern: five drawings, one per full bar of Devotion
// (new moon = dark, crescent, half, gibbous, full). Run from the project folder:
//   node scripts/make-lantern-phases.mjs
// Real art replaces data/characters/avner/sheets/lantern-phase-placeholder.png and its entry in art.lantern.
import fs from 'node:fs';
import { encodePng } from './png.mjs';

const S = 48, N = 5, R = 15;
const data = new Uint8Array(S * N * S * 4);
for (let f = 0; f < N; f++) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const dx = x - S / 2 + 0.5, dy = y - S / 2 + 0.5, d = Math.hypot(dx, dy);
  if (d > R + 1) continue;
  const edge = Math.max(0, Math.min(1, R + 1 - d));
  // The lit part is right of a line that moves left as the phase grows: 0 nothing lit, 2 half, 4 all.
  const half = Math.sqrt(Math.max(0, R * R - dy * dy));
  const lit = f > 0 && dx >= half * (1 - f / 2) - 0.5;
  const i = (y * S * N + f * S + x) * 4;
  const c = lit ? [232, 228, 255] : [34, 30, 58];
  data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = Math.round(255 * edge);
}
fs.writeFileSync('data/characters/avner/sheets/lantern-phase-placeholder.png', encodePng({ width: S * N, height: S, data }));
console.log('lantern-phase-placeholder.png written');
