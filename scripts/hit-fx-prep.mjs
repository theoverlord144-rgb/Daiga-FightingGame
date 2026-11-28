// Cuts the universal hit-effect sheets (data/UniversalEffects/Game_HitEffect_*.png: light on black, one row of
// drawings that are not on an even grid) into game-ready strips in data/effects/hit-<name>.png.
//
//   node scripts/hit-fx-prep.mjs [preview-folder]
//
// For each sheet: brightness becomes opacity (so the glow keeps its soft edge over any stage); the row is split into
// its drawings at the darkest columns between them; every drawing is centred on the same point, the middle of its
// bright core, so the effect does not wander as it plays; each strip is sized by the table below (game px across its
// largest drawing), because the sheets were not drawn to one scale (the heavy burst is drawn smaller than the light
// one). Prints the "sprite" block of each strip for effects.json.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { decodePng, encodePng } from './png.mjs';

const SRC = 'data/UniversalEffects/', OUT = 'data/effects/';
const PREVIEW = process.argv[2] || null;
const RES = 2; // sheet px per game px
// name, file, how many drawings, size (game px across the largest drawing), and the cuts by hand where the emptiest
// columns are not between drawings (the projectile burst: its first two glows touch, its last ones scatter; the heavy).
const SHEETS = [
  ['light', 'Game_HitEffect_Light.png', 5, 130],
  ['medium', 'Game_HitEffect_Medium.png', 6, 170],
  ['heavy', 'Game_HitEffect_Heavy.png', 8, 210, [393, 747, 1104, 1440, 1747, 2064, 2375]], // redrawn Nov 27: the big first glows touch
  ['slash', 'Game_HitEffect_Slash.png', 6, 190],
  ['counter', 'Game_HitEffect_Counter.png', 6, 220],
  ['witness', 'Game_HitEffect_WitnessCounter.png', 6, 230],
  ['projectile', 'Game_HitEffect_Projectile.png', 6, 150, [457, 902, 1397, 1836, 2281]],
];

const blocks = {};
for (const [name, file, n, size, byHand] of SHEETS) {
  const im = decodePng(readFileSync(SRC + file));
  const { width: W, height: H, data: D } = im;
  const lum = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) { const m = Math.max(D[i * 4], D[i * 4 + 1], D[i * 4 + 2]) * (D[i * 4 + 3] / 255); lum[i] = m < 6 ? 0 : m; }
  // The band of rows the drawings live in.
  let y0 = H, y1 = 0;
  for (let y = 0; y < H; y++) { let s = 0; for (let x = 0; x < W; x++) s += lum[y * W + x]; if (s > 0) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }
  // How much of each column is lit (faint debris counts as much as a bright core), smoothed. The cuts are the n - 1
  // columns with the least in them, no two closer than a little over half an even share of the row.
  const col = new Float32Array(W);
  for (let x = 0; x < W; x++) { let s = 0; for (let y = y0; y <= y1; y++) if (lum[y * W + x] > 10) s++; col[x] = s; }
  const sm = new Float32Array(W);
  for (let x = 0; x < W; x++) { let s = 0, c = 0; for (let k = -10; k <= 10; k++) if (x + k >= 0 && x + k < W) { s += col[x + k]; c++; } sm[x] = s / c; }
  const minW = Math.floor((W / n) * 0.55);
  // best[j][x] = the least total with cut j at column x.
  let prev = new Float64Array(W).fill(Infinity);
  const from = [];
  for (let x = minW; x < W - minW; x++) prev[x] = sm[x];
  for (let j = 1; j < n - 1; j++) {
    const cur = new Float64Array(W).fill(Infinity), back = new Int32Array(W).fill(-1);
    let bestV = Infinity, bestX = -1;
    for (let x = minW; x < W - minW; x++) {
      const p = x - minW;
      if (p >= 0 && prev[p] < bestV) { bestV = prev[p]; bestX = p; }
      if (bestX >= 0) { cur[x] = bestV + sm[x]; back[x] = bestX; }
    }
    from.push(back);
    prev = cur;
  }
  let end = -1, endV = Infinity;
  for (let x = 0; x < W - minW; x++) if (prev[x] < endV) { endV = prev[x]; end = x; }
  if (end < 0) throw new Error(`${file}: could not place ${n - 1} cuts`);
  const mid = [end];
  for (let j = from.length - 1; j >= 0; j--) mid.unshift(from[j][mid[0]]);
  const cuts = [0, ...(byHand ?? mid), W];
  // Each drawing: its lit box and the middle of its bright core (weighted by brightness squared).
  const frames = [];
  for (let i = 0; i < n; i++) {
    let sx = 0, sy = 0, sw = 0, bx0 = W, bx1 = 0, by0 = H, by1 = 0;
    for (let y = y0; y <= y1; y++) for (let x = cuts[i]; x < cuts[i + 1]; x++) {
      const l = lum[y * W + x];
      if (!l) continue;
      const w = l * l; sx += x * w; sy += y * w; sw += w;
      bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y);
    }
    frames.push({ cx: sx / sw, cy: sy / sw, bx0, bx1, by0, by1, x0: cuts[i], x1: cuts[i + 1] });
  }
  // The sparks fly from one point of impact: every drawing shares the height of the first (the flash).
  const cy = frames[0].cy;
  // One cell size for the strip: big enough for the widest reach from the centre.
  let half = 0;
  for (const f of frames) half = Math.max(half, f.cx - f.bx0, f.bx1 - f.cx, cy - f.by0, f.by1 - cy);
  const cell = size * RES + 4;
  const k = (size * RES) / (2 * half); // sheet px per drawn px
  const out = new Uint8Array(cell * n * cell * 4);
  frames.forEach((f, i) => {
    for (let oy = 0; oy < cell; oy++) for (let ox = 0; ox < cell; ox++) {
      // The drawn area this sheet pixel covers, averaged (colour weighted by brightness).
      const ax = f.cx + (ox - cell / 2) / k, ay = cy + (oy - cell / 2) / k;
      let r = 0, g = 0, b = 0, a = 0, c = 0;
      for (let yy = Math.floor(ay); yy < ay + 1 / k; yy++) for (let xx = Math.floor(ax); xx < ax + 1 / k; xx++) {
        c++;
        if (xx < f.x0 || xx >= f.x1 || yy < 0 || yy >= H) continue;
        const l = lum[yy * W + xx];
        if (!l) continue;
        const j = (yy * W + xx) * 4, al = l / 255;
        // Over black a colour c at opacity a looks like c * a: take the opacity back out of the colour.
        r += D[j] * (D[j + 3] / 255); g += D[j + 1] * (D[j + 3] / 255); b += D[j + 2] * (D[j + 3] / 255); a += al;
      }
      if (!a) continue;
      const o = (oy * cell * n + i * cell + ox) * 4, al = a / c;
      out[o] = Math.min(255, r / c / al); out[o + 1] = Math.min(255, g / c / al); out[o + 2] = Math.min(255, b / c / al); out[o + 3] = Math.round(al * 255);
    }
  });
  writeFileSync(`${OUT}hit-${name}.png`, encodePng({ width: cell * n, height: cell, data: Buffer.from(out) }));
  blocks[name] = { image: `hit-${name}.png`, columns: n, rows: 1, count: n, frameW: cell, frameH: cell, originX: cell / 2, originY: cell / 2, scale: 1 / RES };
  console.log(`${name}: ${n} drawings, ${size} game px, cuts at ${cuts.slice(1, -1).join(', ')}${byHand ? ' (by hand)' : ''}`);
  if (PREVIEW) {
    // The strip over a dark stage colour, as the game shows it (light added on top).
    mkdirSync(PREVIEW, { recursive: true });
    const p = new Uint8Array(cell * n * cell * 4);
    for (let i = 0; i < cell * n * cell; i++) { const al = out[i * 4 + 3] / 255; p[i * 4] = Math.min(255, 34 + out[i * 4] * al); p[i * 4 + 1] = Math.min(255, 30 + out[i * 4 + 1] * al); p[i * 4 + 2] = Math.min(255, 44 + out[i * 4 + 2] * al); p[i * 4 + 3] = 255; }
    writeFileSync(`${PREVIEW}/hit-${name}.png`, encodePng({ width: cell * n, height: cell, data: Buffer.from(p) }));
  }
}
console.log(JSON.stringify(blocks));
