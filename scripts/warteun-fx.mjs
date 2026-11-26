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
function strip(name, img, regions, centres, holds, scale = SCALE, floor = false) {
  let hw = 0, hh = 0;
  const boxes = regions.map((r) => boxIn(img, r));
  boxes.forEach((b, i) => { if (!b) return; const [cx, cy] = centres[i]; hw = Math.max(hw, cx - b[0], b[2] - cx); hh = Math.max(hh, cy - b[1], b[3] - cy); });
  hw = Math.ceil(hw) + 2; hh = Math.ceil(hh) + 2;
  if (floor) return floorStrip(name, img, regions, centres, holds, scale);
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
  return { image: `sheets/${name}.png`, columns: n, rows: 1, count: n, frameW: W, frameH: H, originX: hw, originY: hh, scale, holds };
}
/** The same for drawings that stand on a floor and reach forward: the given point is the cell's bottom-left origin. */
function floorStrip(name, img, regions, points, holds, scale) {
  let left = 0, right = 0, up = 0, down = 0;
  regions.forEach((r, i) => { const b = boxIn(img, r); if (!b) return; const [px, py] = points[i]; left = Math.max(left, px - b[0]); right = Math.max(right, b[2] - px); up = Math.max(up, py - b[1]); down = Math.max(down, b[3] - py); });
  left = Math.ceil(left) + 2; right = Math.ceil(right) + 2; up = Math.ceil(up) + 2; down = Math.ceil(down) + 2;
  const W = left + right, H = up + down, n = regions.length;
  const data = Buffer.alloc(W * n * H * 4);
  regions.forEach((r, i) => {
    const [px, py] = points[i].map(Math.round);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const sx = px - left + x, sy = py - up + y;
      if (sx < r[0] || sx >= r[2] || sy < r[1] || sy >= r[3]) continue;
      const s = (sy * img.width + sx) * 4, d = (y * W * n + i * W + x) * 4;
      data[d] = img.data[s]; data[d + 1] = img.data[s + 1]; data[d + 2] = img.data[s + 2]; data[d + 3] = img.data[s + 3];
    }
  });
  fs.writeFileSync(`${OUT}${name}.png`, encodePng({ width: W * n, height: H, data }));
  return { image: `sheets/${name}.png`, columns: n, rows: 1, count: n, frameW: W, frameH: H, originX: left, originY: up, scale, holds };
}
/** Fade a strip's cells out toward a circle about each cell's origin (a painted glow would otherwise end in a square). */
function round(name, sprite, from) {
  const img = decodePng(fs.readFileSync(`${OUT}${name}.png`));
  const R1 = Math.min(sprite.originX, sprite.originY) - 1, R0 = R1 * from;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const r = Math.hypot((x % sprite.frameW) - sprite.originX, y - sprite.originY);
    if (r <= R0) continue;
    const p = (y * img.width + x) * 4 + 3;
    img.data[p] = r >= R1 ? 0 : Math.round(img.data[p] * (R1 - r) / (R1 - R0));
  }
  fs.writeFileSync(`${OUT}${name}.png`, encodePng(img));
  return sprite;
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
// 2M's floor ripple (light, so the game draws it additive): eight drawings on an even grid. Each grows from the point
// where the fork taps the floor, at the left end of the drawing; that point is the origin. (avner-prep's shape
// finding split the thin arcs of drawings 4-8 into pieces.)
{
  const img = load('Warteun_Crouch_Medium_Effect.png');
  const cells = grid(img, 8, 1);
  const first = cells.slice(0, 4).map((r) => boxIn(img, r, 60));
  const dx = first.reduce((a, b, i) => a + (b[0] - cells[i][0]) / 4, 0); // the tap point sits the same way into every cell
  const floorY = Math.max(...first.map((b) => b[3]));
  sprites.ripple = { ...strip('ripple', img, cells, cells.map((r) => [r[0] + dx + 6, floorY - 3]), [2, 2, 3, 3, 3, 3, 4, 4], 0.667, true), additive: true };
}
// The Wiretap mark (see-through, normal blending): 5 x 2. Every drawing shares the centre of its circle, which sits
// the same way into every cell (measured on the three full rings of the top row).
{
  const img = load('Warteun_SpecialMove_Wiretap_Mark.png');
  const cells = grid(img, 5, 2);
  const offOf = (list) => list.reduce((a, i) => { const c = mid(boxIn(img, cells[i], 200)); return [a[0] + (c[0] - cells[i][0]) / list.length, a[1] + (c[1] - cells[i][1]) / list.length]; }, [0, 0]);
  const top = offOf([2, 3, 4]), bottom = offOf([5, 6, 7]); // each row sits its own way into its cells
  const centres = cells.map((r, i) => { const o = i < 5 ? top : bottom; return [r[0] + o[0], r[1] + o[1]]; });
  const R = 204;
  sprites['wiretap-mark'] = round('wiretap-mark', strip('wiretap-mark', img, centres.map(([cx, cy]) => [Math.round(cx - R), Math.round(cy - R), Math.round(cx + R), Math.round(cy + R)]), centres, [3, 3, 3, 8, 8, 8, 8, 4, 4, 4], 0.27), 0.86);
}
// The mark shattering: seven drawings in a row, not on an even grid: the first circle's centre is measured and the
// rest follow at the drawn spacing.
{
  const img = load('Warteun_SpecialMove_Wiretap_Mark_Used.png');
  const all = boxIn(img, [0, 0, img.width, img.height], 200);
  const cy = (all[1] + all[3]) / 2;
  const step = 379.5 * SHRINK, x0 = 228 * SHRINK, half = 189 * SHRINK;
  const centres = Array.from({ length: 7 }, (_, i) => [x0 + i * step, cy]);
  sprites['wiretap-shatter'] = strip('wiretap-shatter', img, centres.map(([cx]) => [Math.round(cx - half), 0, Math.round(cx + half), img.height]), centres, [2, 2, 1, 2, 3, 4, 4], 0.27);
  round('wiretap-shatter', sprites['wiretap-shatter'], 0.8);
}
const MF = OUT + 'manifest.json';
const manifest = JSON.parse(fs.readFileSync(MF, 'utf8'));
delete manifest['vacuum-dark'];
for (const [k, sprite] of Object.entries(sprites)) { manifest[k] = { sprite, from: 'scripts/warteun-fx.mjs' }; console.log(k.padEnd(12), JSON.stringify(sprite)); }
fs.writeFileSync(MF, `${JSON.stringify(manifest, null, 1)}\n`);
fs.rmSync(tmp, { recursive: true, force: true });
