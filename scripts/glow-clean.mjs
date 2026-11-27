// Takes a painted glow off a body sheet drawn on black, leaving the drawings on a see-through background.
//
//   node scripts/glow-clean.mjs <sheet.png> <out.png> [edge] [gap]
//
// For sheets that come with a soft coloured glow round each drawing instead of a flat magenta background (Khai'ro's
// Back Heavy, Nov 26): no single colour can be keyed out. The background and the glow are smooth, and a drawing is
// closed in by its ink outline, so everything reachable from the sheet's border through smooth pixels is background.
// "Smooth" = no colour channel differs from a neighbour by `edge` or more (default 26). Always look at the result: a wide gap in an outline still leaks.
import { readFileSync, writeFileSync } from 'node:fs';
import { decodePng, encodePng } from './png.mjs';

const [src, out, edgeArg] = process.argv.slice(2);
const EDGE = Number(edgeArg ?? 26);
const GAP = Number(process.argv[5] ?? 4);
const { width: W, height: H, data } = decodePng(readFileSync(src));
const N = W * H;
// how sharply each pixel differs from its four neighbours
const rough = new Uint8Array(N);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * 4; let d = 0;
  for (const j of [x > 0 ? i - 4 : i, x < W - 1 ? i + 4 : i, y > 0 ? i - W * 4 : i, y < H - 1 ? i + W * 4 : i]) {
    d = Math.max(d, Math.abs(data[i] - data[j]), Math.abs(data[i + 1] - data[j + 1]), Math.abs(data[i + 2] - data[j + 2]));
  }
  rough[y * W + x] = Math.min(255, d);
}
// Ink lines have small gaps, so the edges are first thickened by GAP px (which closes gaps up to twice that wide);
// the flood runs outside the thickened edges and is then grown back by the same amount, up to the real edge.
const wall = new Uint8Array(N);
{
  const row = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let on = 0; for (let k = Math.max(0, x - GAP); k <= Math.min(W - 1, x + GAP) && !on; k++) on = rough[y * W + k] >= EDGE ? 1 : 0; row[y * W + x] = on; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let on = 0; for (let k = Math.max(0, y - GAP); k <= Math.min(H - 1, y + GAP) && !on; k++) on = row[k * W + x]; wall[y * W + x] = on; }
}
const bg = new Uint8Array(N); let stack = [];
const push = (p) => { if (!bg[p] && !wall[p]) { bg[p] = 1; stack.push(p); } };
for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
while (stack.length) {
  const p = stack.pop(), x = p % W;
  if (x > 0) push(p - 1);
  if (x < W - 1) push(p + 1);
  if (p >= W) push(p - W);
  if (p < N - W) push(p + W);
}
// grow back toward the real edge, GAP + 1 steps, through smooth pixels only (the last step takes the glow-side fringe)
let cleared = 0;
for (let step = 0; step <= GAP; step++) {
  const add = [];
  for (let p = 0; p < N; p++) {
    if (bg[p] || (step < GAP && rough[p] >= EDGE)) continue;
    const x = p % W;
    if ((x > 0 && bg[p - 1]) || (x < W - 1 && bg[p + 1]) || (p >= W && bg[p - W]) || (p < N - W && bg[p + W])) add.push(p);
  }
  for (const p of add) bg[p] = 1;
}
for (let p = 0; p < N; p++) if (bg[p]) { data[p * 4 + 3] = 0; cleared++; }
writeFileSync(out, encodePng({ width: W, height: H, data }));
console.log(`${src}: ${Math.round((cleared / N) * 100)}% cleared -> ${out}`);
