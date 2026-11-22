// Turns drawn art into a game-ready sprite sheet.
//
// Fighter animation (a strip of drawings, left to right, facing right):
//   node scripts/sprite-prep.mjs <in.png> <out.png> --frames 6 [--order 1,4,3,5,2,6] [--height 180] [--res 2]
//        [--anchor front|rear|center] [--floor frame|common] [--key auto|flat|black] [--haze 0.1]
// Effect (a grid of frames, e.g. 4 across and 2 down, read left to right, top to bottom):
//   node scripts/sprite-prep.mjs <in.png> <out.png> --grid 4x2 [--count 7] --size 110 [--res 2] [--key black] [--center drawing|cell]
//
// Background (--key):
// - auto (default): art that already has transparency keeps it (a faint halo under --haze is dropped); otherwise
//   like flat.
// - flat: removes the flat background colour (read from the top-left corner, e.g. magenta), with soft edges: partly
//   covered edge pixels get the background's tint taken back out, so there is no coloured fringe.
// - black: glow drawn on black. Brightness becomes opacity, so the glow keeps its soft falloff over any stage.
// Fighter strips:
// - Splits the strip into --frames drawings (drawings may touch: each connected piece stays with the drawing it
//   mostly belongs to) and puts them in --order (numbers as drawn, counted from 1, left to right).
// - Stands every frame on the floor: its own lowest point (--floor frame, default) or the strip's shared floor line
//   (--floor common: for jumps and leaps drawn in the air). Keeps one anchor still: the planted foot (--anchor
//   front, default; rear) or the body's centre (center, for moves that travel). The fighter's centre is placed
//   over the last frame's body centre.
// - Scales so the last frame's figure is --height game pixels tall.
// Effects: each frame is centred on its own drawing (--center drawing, default) or on its grid cell (--center
// cell, keeps drawn drift); --size is the largest frame's width or height in game pixels.
// Sheets are stored at --res pixels per game pixel (sharper on big screens; the renderer draws them at 1/res).
// Prints the "sprite" block to paste into the character file (add "holds").
import { readFileSync, writeFileSync } from 'node:fs';
import { decodePng, encodePng } from './png.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? def : args[i + 1];
};
const [inPath, outPath] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!inPath || !outPath) {
  console.error('usage: see the top of scripts/sprite-prep.mjs');
  process.exit(1);
}
const res = Number(opt('res', 2));
const GRID = opt('grid', null);

const img = decodePng(readFileSync(inPath));
const { width: W, height: H, data } = img;

// ---------- Background ----------
const alpha = new Float32Array(W * H);
const rgb = new Float32Array(W * H * 3);
let key = opt('key', 'auto');
if (key === 'auto') {
  let seeThrough = false;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) { seeThrough = true; break; }
  key = seeThrough ? 'alpha' : 'flat';
}
if (key === 'alpha') {
  const haze = Number(opt('haze', 0.1));
  for (let i = 0; i < W * H; i++) {
    const a = data[i * 4 + 3] / 255;
    alpha[i] = a <= haze ? 0 : Math.min(1, (a - haze) / (0.99 - haze));
    rgb[i * 3] = data[i * 4]; rgb[i * 3 + 1] = data[i * 4 + 1]; rgb[i * 3 + 2] = data[i * 4 + 2];
  }
} else if (key === 'black') {
  for (let i = 0; i < W * H; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const m = Math.max(r, g, b);
    const a = m < 6 ? 0 : m / 255; // over black, a colour c at opacity a looks like c * a
    alpha[i] = a;
    if (a > 0) { rgb[i * 3] = Math.min(255, r / a); rgb[i * 3 + 1] = Math.min(255, g / a); rgb[i * 3 + 2] = Math.min(255, b / a); }
  }
} else {
  const bg = [data[0], data[1], data[2]];
  const LO = 70; // colour distance below this: background
  const HI = 170; // above this: fully the drawing
  for (let i = 0; i < W * H; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const d = Math.hypot(r - bg[0], g - bg[1], b - bg[2]);
    const a = Math.min(1, Math.max(0, (d - LO) / (HI - LO))) * (data[i * 4 + 3] / 255);
    alpha[i] = a;
    if (a > 0) {
      // observed = a * colour + (1 - a) * background  →  colour = (observed - (1 - a) * background) / a
      rgb[i * 3] = Math.min(255, Math.max(0, (r - (1 - a) * bg[0]) / a));
      rgb[i * 3 + 1] = Math.min(255, Math.max(0, (g - (1 - a) * bg[1]) / a));
      rgb[i * 3 + 2] = Math.min(255, Math.max(0, (b - (1 - a) * bg[2]) / a));
    }
  }
}

// ---------- Which frame owns each pixel ----------
const SOLID = 0.5;
const owner = new Int8Array(W * H).fill(-1);
let count;
if (GRID) {
  const [gc, gr] = GRID.split('x').map(Number);
  count = Number(opt('count', gc * gr));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x;
    if (alpha[k] <= 0.01) continue;
    const cell = Math.floor((y * gr) / H) * gc + Math.floor((x * gc) / W);
    if (cell < count) owner[k] = cell;
  }
} else {
  // Drawings on a strip often touch (a scarf or chain crossing into the next frame), so: cut the strip at the
  // emptiest columns between frames, then keep each connected piece of a drawing whole, with the frame holding
  // most of it. Pieces that really run across a cut are split at the cut.
  const colCount = new Int32Array(W);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (alpha[y * W + x] > SOLID) colCount[x]++;
  let first = 0, last = W - 1;
  while (first < W && colCount[first] <= 2) first++;
  while (last > 0 && colCount[last] <= 2) last--;
  count = Number(opt('frames', String(opt('order', '').split(',').filter(Boolean).length || 0)));
  if (!count) throw new Error('give --frames N (or an --order listing every frame)');
  const span = (last - first + 1) / count;
  const cuts = []; // cut i lies between frame i and i+1: the emptiest column within a third of a frame of the even split
  for (let i = 1; i < count; i++) {
    const mid = Math.round(first + span * i);
    let best = mid;
    for (let x = Math.round(mid - span / 3); x <= Math.round(mid + span / 3); x++) if (colCount[x] < colCount[best]) best = x;
    cuts.push(best);
  }
  const region = (x) => { let r = 0; while (r < cuts.length && x >= cuts[r]) r++; return r; };
  const label = new Int32Array(W * H).fill(-1);
  const stack = new Int32Array(W * H);
  let next = 0;
  for (let i0 = 0; i0 < W * H; i0++) {
    if (label[i0] >= 0 || alpha[i0] <= 0.02) continue;
    const id = next++;
    const massBy = new Float64Array(count);
    let sp = 0, total = 0;
    const members = [];
    stack[sp++] = i0; label[i0] = id;
    while (sp) {
      const k = stack[--sp];
      members.push(k);
      massBy[region(k % W)] += alpha[k];
      total += alpha[k];
      const x = k % W, y = (k - x) / W;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (label[n] < 0 && alpha[n] > 0.02) { label[n] = id; stack[sp++] = n; }
      }
    }
    let top = 0;
    for (let r = 1; r < count; r++) if (massBy[r] > massBy[top]) top = r;
    const whole = massBy[top] >= total * 0.9;
    for (const k of members) owner[k] = whole ? top : region(k % W);
  }
  console.error(`${count} frames, cut at x = ${cuts.join(', ')}`);
}

const order = opt('order', Array.from({ length: count }, (_, i) => i + 1).join(',')).split(',').map(Number);
for (const n of order) if (!(n >= 1 && n <= count)) throw new Error(`--order names frame ${n}, but the sheet has ${count}`);

function box(fi) {
  let top = H, bottom = -1, left = W, right = -1;
  for (let k = 0; k < W * H; k++) {
    if (owner[k] !== fi || alpha[k] <= 0.02) continue;
    const x = k % W, y = (k - x) / W;
    if (y < top) top = y;
    if (y > bottom) bottom = y;
    if (x < left) left = x;
    if (x > right) right = x;
  }
  if (bottom < 0) throw new Error(`frame ${fi + 1} is empty`);
  // The planted foot: the leftmost (rear) or rightmost (front) solid pixel in the lowest 40 px.
  let rear = W, front = -1;
  for (let y = Math.max(0, bottom - 40); y <= bottom; y++) for (let x = left; x <= right; x++) {
    const k = y * W + x;
    if (owner[k] === fi && alpha[k] > SOLID) { if (x < rear) rear = x; if (x > front) front = x; }
  }
  return { fi, top, bottom, left, right, rear, front };
}
const boxes = Array.from({ length: count }, (_, i) => box(i));

// Each frame: where its anchor sits in the source (ax, ay), and how far it reaches from it.
let ext, scale;
if (GRID) {
  const [gc, gr] = GRID.split('x').map(Number);
  const cw = W / gc, ch = H / gr;
  const biggest = Math.max(...order.map((n) => { const b = boxes[n - 1]; return Math.max(b.right - b.left, b.bottom - b.top) + 1; }));
  scale = (Number(opt('size', 100)) * res) / biggest;
  ext = order.map((n) => {
    const b = boxes[n - 1];
    // --center drawing (default): each frame centred on its own drawing (rows drawn off-centre don't jump);
    // --center cell: the grid cell's centre (keeps drift that was drawn on purpose).
    const byCell = opt('center', 'drawing') === 'cell';
    const ax = byCell ? ((b.fi % gc) + 0.5) * cw : (b.left + b.right) / 2;
    const ay = byCell ? (Math.floor(b.fi / gc) + 0.5) * ch : (b.top + b.bottom) / 2;
    return { b, ax, ay, l: ax - b.left, r: b.right - ax, u: ay - b.top, d: b.bottom - ay };
  });
  // Centred: the same reach on both sides, so the origin is the middle of the cell.
  const hx = Math.max(...ext.map((e) => Math.max(e.l, e.r)));
  const hy = Math.max(...ext.map((e) => Math.max(e.u, e.d)));
  for (const e of ext) { e.l = e.r = hx; e.u = e.d = hy; }
} else {
  const ANCHOR = opt('anchor', 'front');
  const FLOOR = opt('floor', 'frame');
  const ref = boxes[order.at(-1) - 1]; // the last frame in play order: usually the settled stance
  scale = (Number(opt('height', 180)) * res) / (ref.bottom - ref.top + 1);
  const anchorOf = (b) => (ANCHOR === 'center' ? (b.left + b.right) / 2 : ANCHOR === 'rear' ? b.rear : b.front);
  const centreFromAnchor = (ref.left + ref.right) / 2 - anchorOf(ref);
  const common = Math.max(...boxes.map((b) => b.bottom));
  ext = order.map((n) => {
    const b = boxes[n - 1];
    const ax = anchorOf(b) + centreFromAnchor;
    const ay = FLOOR === 'common' ? common : b.bottom;
    return { b, ax, ay, l: ax - b.left, r: b.right - ax, u: ay - b.top, d: 0 };
  });
}

const pad = 2;
const left = Math.ceil(Math.max(...ext.map((e) => e.l)) * scale) + pad;
const right = Math.ceil(Math.max(...ext.map((e) => e.r)) * scale) + pad;
const up = Math.ceil(Math.max(...ext.map((e) => e.u)) * scale) + pad;
const down = Math.ceil(Math.max(...ext.map((e) => e.d)) * scale) + pad;
const cellW = left + right;
const cellH = up + down;
const outW = cellW * order.length;
const out = new Float32Array(outW * cellH * 4);

// Area-average downscale: each output pixel averages the source pixels it covers (weighted by opacity).
ext.forEach((e, i) => {
  const inv = 1 / scale;
  for (let y = 0; y < cellH; y++) {
    const sy0 = e.ay + (y - up) * inv;
    const sy1 = sy0 + inv;
    for (let x = 0; x < cellW; x++) {
      const sx0 = e.ax + (x - left) * inv;
      const sx1 = sx0 + inv;
      let R = 0, G = 0, B = 0, A = 0, area = 0;
      for (let sy = Math.floor(sy0); sy < sy1; sy++) {
        const wy = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
        if (wy <= 0) continue;
        for (let sx = Math.floor(sx0); sx < sx1; sx++) {
          const wx = Math.min(sx + 1, sx1) - Math.max(sx, sx0);
          if (wx <= 0) continue;
          const w = wx * wy;
          area += w;
          if (sx < 0 || sx >= W || sy < 0 || sy >= H) continue;
          const k = sy * W + sx;
          if (owner[k] !== e.b.fi) continue; // another frame's pixel: empty here
          const a = alpha[k] * w;
          A += a; R += rgb[k * 3] * a; G += rgb[k * 3 + 1] * a; B += rgb[k * 3 + 2] * a;
        }
      }
      const o = (y * outW + i * cellW + x) * 4;
      out[o + 3] = area ? Math.min(1, A / area) : 0;
      if (A > 0) { out[o] = R / A; out[o + 1] = G / A; out[o + 2] = B / A; }
    }
  }
});
const px = new Uint8Array(outW * cellH * 4);
for (let i = 0; i < outW * cellH; i++) {
  const a = out[i * 4 + 3];
  if (a < 0.02) continue;
  px[i * 4] = Math.round(out[i * 4]);
  px[i * 4 + 1] = Math.round(out[i * 4 + 1]);
  px[i * 4 + 2] = Math.round(out[i * 4 + 2]);
  px[i * 4 + 3] = Math.round(a * 255);
}
writeFileSync(outPath, encodePng({ width: outW, height: cellH, data: px }));
const rel = outPath.replace(/\\/g, '/').match(/characters\/[^/]+\/(.*)$/)?.[1] ?? outPath.split(/[\\/]/).pop();
const sprite = { image: rel, columns: order.length, rows: 1, count: order.length, frameW: cellW, frameH: cellH, originX: left, originY: up, scale: +(1 / res).toFixed(4) };
console.log(JSON.stringify(sprite));
