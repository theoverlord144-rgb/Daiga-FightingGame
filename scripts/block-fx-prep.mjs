// Cuts the block effect sheet (data/UniversalEffects/Game_Block_Effect.png: the glass guard, 10 drawings in a
// 5 x 2 grid: the oval with a glint crossing it, then breaking into a swirl of shards) into two game-ready strips
// in data/effects/:
//
//   node scripts/block-fx-prep.mjs
//
//   block-guard.png         the guard as drawn, with the sheet's own opacity (so its faint glow and the mist of
//                           the breaking drawings are kept as the artist made them)
//   block-guard-white.png   the same shapes in plain white (the flash on a heavy block)
//
// Every drawing is placed by the centre of what is solidly drawn in it (the shards keep the oval's outline), so
// the oval stays on one spot as it plays.
// Also cuts Game_Block_Effect_Heavys_PhysicalSpecials.png (one row of 7 drawings on black, no transparency: a swirl
// of shards flying outward) into block-shards.png: brightness becomes opacity, each drawing placed by the middle of
// what is drawn in it, the largest SHARDS game px across.
// Prints the "sprite" blocks for effects.json ("bodyH" = the height of the full oval in strip px).
import { readFileSync, writeFileSync } from 'node:fs';
import { decodePng, encodePng } from './png.mjs';

const SRC = 'data/UniversalEffects/Game_Block_Effect.png', OUT = 'data/effects/';
const COLS = 5, ROWS = 2, N = 10;
const BODY = 300; // strip px for the tallest drawing of the whole oval (drawings 1 to 4)
const GLOW = 44; // sheet px kept around the oval for its glow
const SOLID = 40; // opacity (0-255) above which a pixel belongs to the drawing

const { width: W, height: H, data: D } = decodePng(readFileSync(SRC));
const cw = W / COLS, ch = H / ROWS;
const frames = [];
for (let i = 0; i < N; i++) {
  const x0 = Math.round((i % COLS) * cw), x1 = Math.round((i % COLS + 1) * cw), y0 = Math.round(Math.floor(i / COLS) * ch), y1 = Math.round((Math.floor(i / COLS) + 1) * ch);
  let bx0 = x1, bx1 = x0, by0 = y1, by1 = y0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (D[(y * W + x) * 4 + 3] <= SOLID) continue;
    bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y);
  }
  frames.push({ x0, x1, y0, y1, cx: (bx0 + bx1 + 1) / 2, cy: (by0 + by1 + 1) / 2, w: bx1 - bx0 + 1, h: by1 - by0 + 1 });
}
const tall = Math.max(...frames.slice(0, 4).map((f) => f.h));
const k = BODY / tall; // strip px per sheet px
let halfX = 0, halfY = 0;
for (const f of frames) { halfX = Math.max(halfX, f.w / 2 + GLOW); halfY = Math.max(halfY, f.h / 2 + GLOW); }
const ow = 2 * Math.ceil(halfX * k) + 6, oh = 2 * Math.ceil(halfY * k) + 6;

const blocks = {};
for (const [suffix, white] of [['', false], ['-white', true]]) {
  const out = new Uint8Array(ow * N * oh * 4);
  frames.forEach((f, i) => {
    for (let oy = 0; oy < oh; oy++) for (let ox = 0; ox < ow; ox++) {
      // the patch of sheet this strip pixel covers, averaged (weighted by opacity)
      const ax = f.cx + (ox - ow / 2) / k, ay = f.cy + (oy - oh / 2) / k;
      let r = 0, g = 0, b = 0, a = 0, c = 0;
      for (let yy = Math.floor(ay); yy < ay + 1 / k; yy++) for (let xx = Math.floor(ax); xx < ax + 1 / k; xx++) {
        c++;
        if (xx < f.x0 || xx >= f.x1 || yy < f.y0 || yy >= f.y1) continue;
        const j = (yy * W + xx) * 4, al = D[j + 3] / 255;
        if (!al) continue;
        r += D[j] * al; g += D[j + 1] * al; b += D[j + 2] * al; a += al;
      }
      if (!a) continue;
      const o = (oy * ow * N + i * ow + ox) * 4;
      out[o] = white ? 255 : r / a; out[o + 1] = white ? 255 : g / a; out[o + 2] = white ? 255 : b / a; out[o + 3] = Math.round((a / c) * 255);
    }
  });
  const name = `block-guard${suffix}`;
  writeFileSync(`${OUT}${name}.png`, encodePng({ width: ow * N, height: oh, data: Buffer.from(out) }));
  blocks[name] = { image: `${name}.png`, columns: N, rows: 1, count: N, frameW: ow, frameH: oh, originX: ow / 2, originY: oh / 2, scale: 0.5, bodyH: BODY };
}
console.log(`block-guard: ${N} drawings, cell ${ow}x${oh}, drawn at ${(k * 100).toFixed(1)}%`);
console.log(`centres against the middle of each sheet cell (sheet px): ${frames.map((f) => `${Math.round(f.cx - (f.x0 + f.x1) / 2)},${Math.round(f.cy - (f.y0 + f.y1) / 2)}`).join('  ')}`);
console.log(`sizes (sheet px): ${frames.map((f) => `${f.w}x${f.h}`).join('  ')}`);
{
  const SHARDS = 150, CUTS = [340, 651, 1012, 1429, 1882, 2292]; // game px across; the cuts between drawings, by hand
  const im = decodePng(readFileSync('data/UniversalEffects/Game_Block_Effect_Heavys_PhysicalSpecials.png'));
  const SW = im.width, SH = im.height, S = im.data;
  const lum = (x, y) => { const j = (y * SW + x) * 4, m = Math.max(S[j], S[j + 1], S[j + 2]); return m < 28 ? 0 : m; };
  const xs = [0, ...CUTS, SW], n = xs.length - 1, fr = [];
  for (let i = 0; i < n; i++) {
    let bx0 = SW, bx1 = 0, by0 = SH, by1 = 0;
    for (let y = 0; y < SH; y++) for (let x = xs[i]; x < xs[i + 1]; x++) if (lum(x, y)) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y); }
    fr.push({ x0: xs[i], x1: xs[i + 1], cx: (bx0 + bx1 + 1) / 2, cy: (by0 + by1 + 1) / 2, w: bx1 - bx0 + 1, h: by1 - by0 + 1 });
  }
  const big = Math.max(...fr.map((f) => Math.max(f.w, f.h)));
  const ks = (SHARDS * 2) / big; // strip px per sheet px
  const sw = 2 * Math.ceil((Math.max(...fr.map((f) => f.w)) / 2) * ks) + 6, sh = 2 * Math.ceil((Math.max(...fr.map((f) => f.h)) / 2) * ks) + 6;
  const o = new Uint8Array(sw * n * sh * 4);
  fr.forEach((f, i) => {
    for (let oy = 0; oy < sh; oy++) for (let ox = 0; ox < sw; ox++) {
      const ax = f.cx + (ox - sw / 2) / ks, ay = f.cy + (oy - sh / 2) / ks;
      let a = 0, c = 0;
      for (let yy = Math.floor(ay); yy < ay + 1 / ks; yy++) for (let xx = Math.floor(ax); xx < ax + 1 / ks; xx++) { c++; if (xx >= f.x0 && xx < f.x1 && yy >= 0 && yy < SH) a += lum(xx, yy) / 255; }
      if (!a) continue;
      const q = (oy * sw * n + i * sw + ox) * 4;
      o[q] = 255; o[q + 1] = 255; o[q + 2] = 255; o[q + 3] = Math.round(Math.min(1, (a / c) * 1.25) * 255);
    }
  });
  writeFileSync(OUT + 'block-shards.png', encodePng({ width: sw * n, height: sh, data: Buffer.from(o) }));
  blocks['block-shards'] = { image: 'block-shards.png', columns: n, rows: 1, count: n, frameW: sw, frameH: sh, originX: sw / 2, originY: sh / 2, scale: 0.5 };
  console.log(`block-shards: ${n} drawings, cell ${sw}x${sh}; sizes (sheet px) ${fr.map((f) => `${f.w}x${f.h}`).join('  ')}; centres ${fr.map((f) => `${Math.round(f.cx)},${Math.round(f.cy)}`).join('  ')}`);
}
console.log(JSON.stringify(blocks));
