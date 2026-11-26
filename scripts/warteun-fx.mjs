// War'Teun's vacuum, fire and smoke (owner, Nov 26):  node scripts/warteun-fx.mjs
//
// The three sheets are painted pictures drawn with NORMAL blending (not light), so they are not cut by avner-prep's
// effect mode (which turns black into nothing). Each drawing is placed by its own centre so all three sheets share
// one centre in the game. Needs ffmpeg (the sheets are shrunk to 75% first; the game draws them at half size).
//   Warteun_SpecialMove_WarpStep_Effect.png   3 x 3, see-through   → sheets/vacuum.png (9)
//   Warteun_SpecialMove_WarpStep_Effect2.png  5 x 2, see-through   → sheets/blast-fire.png (10)
//   Warteun_SpecialMove_WarpStep_Effect3.png  8 in a row, on white → sheets/blast-smoke.png (8; the white is taken out)
// Writes the three sprite blocks into sheets/manifest.json and prints them.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { decodePng, encodePng } from './png.mjs';

const RAW = "data/characters/War'Teun/";
const OUT = 'data/characters/warteun/sheets/';
const SHRINK = 0.75, SCALE = 0.5;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-fx-'));
function load(file) {
  const out = path.join(tmp, 'a.png');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', RAW + file, '-vf', `scale=iw*${SHRINK}:ih*${SHRINK}:flags=lanczos,format=rgba`, '-update', '1', out]);
  return decodePng(fs.readFileSync(out));
}
/** White paper → see-through: solid where it is clearly darker than the paper, a short soft edge between. */
function keyWhite(img) {
  for (let p = 0; p < img.data.length; p += 4) {
    const lum = Math.min(img.data[p], img.data[p + 1], img.data[p + 2]);
    img.data[p + 3] = Math.round(255 * Math.min(1, Math.max(0, (246 - lum) / 22)));
  }
}
/** The box of everything drawn inside a region [x0, y0, x1, y1). */
function boxIn(img, [x0, y0, x1, y1], min = 24) {
  let a = x1, b = y1, c = x0 - 1, d = y0 - 1;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (img.data[(y * img.width + x) * 4 + 3] > min) { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y; }
  return c < a ? null : [a, b, c + 1, d + 1];
}
/** Lay drawings into one strip: every cell the same size, each drawing's centre at the cell's origin. */
function strip(name, img, regions, centres, holds) {
  let hw = 0, hh = 0;
  const boxes = regions.map((r) => boxIn(img, r));
  boxes.forEach((b, i) => { if (!b) return; const [cx, cy] = centres[i]; hw = Math.max(hw, cx - b[0], b[2] - cx); hh = Math.max(hh, cy - b[1], b[3] - cy); });
  hw = Math.ceil(hw) + 2; hh = Math.ceil(hh) + 2;
  const W = hw * 2, H = hh * 2, n = regions.length;
  const data = Buffer.alloc(W * n * H * 4);
  regions.forEach((r, i) => {
    const [cx, cy] = centres[i].map(Math.round);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const sx = cx - hw + x, sy = cy - hh + y;
      if (sx < r[0] || sx >= r[2] || sy < r[1] || sy >= r[3]) continue;
      const s = (sy * img.width + sx) * 4, d = (y * W * n + i * W + x) * 4;
      data[d] = img.data[s]; data[d + 1] = img.data[s + 1]; data[d + 2] = img.data[s + 2]; data[d + 3] = img.data[s + 3];
    }
  });
  fs.writeFileSync(`${OUT}${name}.png`, encodePng({ width: W * n, height: H, data }));
  return { image: `sheets/${name}.png`, columns: n, rows: 1, count: n, frameW: W, frameH: H, originX: hw, originY: hh, scale: SCALE, holds };
}
const grid = (img, cols, rows) => Array.from({ length: cols * rows }, (_, i) => { const w = img.width / cols, h = img.height / rows, c = i % cols, r = Math.floor(i / cols); return [Math.round(c * w), Math.round(r * h), Math.round((c + 1) * w), Math.round((r + 1) * h)]; });
const mid = (b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];

const sprites = {};
// The vacuum: a circle in every drawing, so each drawing's own middle is its centre (the last, sparse ones use the cell's).
{
  const img = load('Warteun_SpecialMove_WarpStep_Effect.png');
  const cells = grid(img, 3, 3);
  const centres = cells.map((r, i) => (i < 7 ? mid(boxIn(img, r, 90)) : mid(r)));
  sprites.vacuum = strip('vacuum', img, cells, centres, [2, 6, 6, 6, 6, 1, 2, 3, 4]);
}
// The fire: the flash and the fireball by their own middle (drawings 1-5); the flames that follow rise from that
// same spot, which sits where it sat in the cell of the drawings above.
{
  const img = load('Warteun_SpecialMove_WarpStep_Effect2.png');
  const cells = grid(img, 5, 2);
  const top = cells.slice(0, 5).map((r) => mid(boxIn(img, r, 90)));
  const off = [1, 2, 3].reduce((a, i) => [a[0] + (top[i][0] - cells[i][0]) / 3, a[1] + (top[i][1] - cells[i][1]) / 3], [0, 0]);
  const centres = cells.map((r, i) => (i < 4 ? top[i] : [r[0] + off[0], r[1] + off[1]]));
  sprites['blast-fire'] = strip('blast-fire', img, cells, centres, [1, 1, 2, 2, 3, 3, 3, 4, 4, 4]);
}
// The smoke: on white paper, eight puffs in a row of uneven widths. Split at the emptiest columns between them.
{
  const img = load('Warteun_SpecialMove_WarpStep_Effect3.png');
  keyWhite(img);
  const col = new Float64Array(img.width);
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) col[x] += img.data[(y * img.width + x) * 4 + 3];
  const all = boxIn(img, [0, 0, img.width, img.height]);
  // gaps: runs of empty columns inside the drawn span; the seven widest are the splits
  const gaps = [];
  for (let x = all[0], start = -1; x <= all[2]; x++) { const empty = x < all[2] && col[x] < 255 * 2; if (empty && start < 0) start = x; if (!empty && start >= 0) { gaps.push([start, x]); start = -1; } }
  const cuts = gaps.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0])).slice(0, 7).map((g) => Math.round((g[0] + g[1]) / 2)).sort((a, b) => a - b);
  if (cuts.length !== 7) throw new Error(`smoke: found ${cuts.length + 1} puffs, expected 8`);
  const xs = [0, ...cuts, img.width];
  const cells = xs.slice(0, -1).map((x, i) => [x, 0, xs[i + 1], img.height]);
  const cy = mid(boxIn(img, cells[3]))[1];
  const centres = cells.map((r) => [mid(boxIn(img, r))[0], cy]);
  sprites['blast-smoke'] = strip('blast-smoke', img, cells, centres, [2, 2, 3, 3, 4, 4, 5, 5]);
}
const MF = OUT + 'manifest.json';
const manifest = JSON.parse(fs.readFileSync(MF, 'utf8'));
delete manifest['vacuum-dark'];
for (const [k, sprite] of Object.entries(sprites)) { manifest[k] = { sprite, from: 'scripts/warteun-fx.mjs' }; console.log(k.padEnd(12), JSON.stringify(sprite)); }
fs.writeFileSync(MF, `${JSON.stringify(manifest, null, 1)}\n`);
fs.rmSync(tmp, { recursive: true, force: true });
