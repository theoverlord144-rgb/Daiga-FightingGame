// Cuts the universal block effect (owner's brief, Nov 27: two layers on one timeline, used by every character) into
// game-ready strips in data/effects/:
//
//   node scripts/block-fx-prep.mjs
//
//   block-body.png        data/UniversalEffects/Game_Block_Effect.png  (FX_Block_Body: the shield, 8 drawings in a
//                         4 x 2 grid on magenta; the magenta is keyed out from the edges of each cell inward)
//   block-light.png       Game_Block_Effect2.png  (FX_Block_Light: its glow, 8 drawings, 4 x 2, on black)
//   block-heavy-light.png Game_Block_Effect3.png  (FX_BlockHeavy_Light: the heavy glow, 10 drawings, 5 x 2)
//   (FX_BlockHeavy_Body has not been drawn yet: heavy blocks play their light layer alone until it is.)
//
// Every sheet is sliced on its fixed grid, and each drawing is placed by the oval's centre in its cell: the white
// diamond in the shield drawings, the bright star in the glow drawings (a drawing where it has faded out keeps the
// drawing before it's spot). Each strip's cells are centred on that point, so body and light line up drawing for
// drawing. All three are cut at one scale (sheet px to strip px), so the layers match in size.
// Prints the sprite blocks for effects.json and lightOffset: the light's centre minus the body's, per drawing, in
// sheet px, as measured (it is corrected by the cut).
import { readFileSync, writeFileSync } from 'node:fs';
import { decodePng, encodePng } from './png.mjs';

const SRC = 'data/UniversalEffects/', OUT = 'data/effects/';
const BODY = 300; // strip px for the height of the whole shield (drawing 4)
const MARGIN = 8; // sheet px kept around what is drawn
const NEAR = 70; // sheet px around a first guess where the centre mark is looked for

function load(file) {
  const im = decodePng(readFileSync(SRC + file));
  return { W: im.width, H: im.height, D: im.data };
}
const cellsOf = (im, cols, rows, n) => Array.from({ length: n }, (_, i) => ({
  x0: Math.round((i % cols) * (im.W / cols)), x1: Math.round(((i % cols) + 1) * (im.W / cols)),
  y0: Math.round(Math.floor(i / cols) * (im.H / rows)), y1: Math.round((Math.floor(i / cols) + 1) * (im.H / rows)),
}));

/** Magenta out, from the cell edges inward; the antialiased rim gets partial opacity with the magenta taken out. */
function keyMagenta(im, cells) {
  const { W, D } = im;
  const isKey = (j) => D[j] > 150 && D[j + 2] > 150 && D[j + 1] < 110 && D[j] - D[j + 1] > 90 && D[j + 2] - D[j + 1] > 90;
  const keyed = new Uint8Array(im.W * im.H);
  for (const c of cells) {
    const stack = [];
    for (let x = c.x0; x < c.x1; x++) stack.push([x, c.y0], [x, c.y1 - 1]);
    for (let y = c.y0; y < c.y1; y++) stack.push([c.x0, y], [c.x1 - 1, y]);
    while (stack.length) {
      const [x, y] = stack.pop();
      if (x < c.x0 || x >= c.x1 || y < c.y0 || y >= c.y1) continue;
      const k = y * W + x;
      if (keyed[k] || !isKey(k * 4)) continue;
      keyed[k] = 1;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
  }
  const out = new Uint8Array(D.length);
  for (let k = 0; k < im.W * im.H; k++) {
    const j = k * 4;
    if (keyed[k]) continue;
    let a = 1;
    const edge = (keyed[k - 1] || keyed[k + 1] || keyed[k - W] || keyed[k + W]);
    if (edge) a = Math.max(0, Math.min(1, 1 - (Math.min(D[j], D[j + 2]) - D[j + 1]) / 255));
    if (a <= 0.02) continue;
    // P = a F + (1 - a) magenta  →  F
    out[j] = Math.max(0, Math.min(255, (D[j] - (1 - a) * 255) / a));
    out[j + 1] = Math.max(0, Math.min(255, D[j + 1] / a));
    out[j + 2] = Math.max(0, Math.min(255, (D[j + 2] - (1 - a) * 255) / a));
    out[j + 3] = Math.round(a * 255);
  }
  return { ...im, D: out };
}

const lum = (D, j) => (D[j + 3] ? Math.max(D[j], D[j + 1], D[j + 2]) * (D[j + 3] / 255) : 0);
function bbox(im, c, test) {
  let bx0 = c.x1, bx1 = c.x0, by0 = c.y1, by1 = c.y0;
  for (let y = c.y0; y < c.y1; y++) for (let x = c.x0; x < c.x1; x++) if (test((y * im.W + x) * 4)) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y); }
  return bx1 < bx0 ? null : { x0: bx0, x1: bx1 + 1, y0: by0, y1: by1 + 1, cx: (bx0 + bx1 + 1) / 2, cy: (by0 + by1 + 1) / 2 };
}
/** The centroid of the marks passing `test` within NEAR of (gx, gy), or null. */
function centreNear(im, c, gx, gy, test) {
  let sx = 0, sy = 0, n = 0;
  for (let y = Math.max(c.y0, Math.round(gy - NEAR)); y < Math.min(c.y1, gy + NEAR); y++) for (let x = Math.max(c.x0, Math.round(gx - NEAR)); x < Math.min(c.x1, gx + NEAR); x++) if (test((y * im.W + x) * 4)) { sx += x; sy += y; n++; }
  return n >= 4 ? [sx / n + 0.5, sy / n + 0.5] : null;
}

/** Each drawing's centre, cell-relative where a drawing has none of its own. */
function anchors(im, cells, guess, mark) {
  const out = [];
  cells.forEach((c, i) => {
    const g = guess(i, c);
    const at = g && centreNear(im, c, g[0], g[1], mark);
    if (at) out.push(at);
    else { const p = out[i - 1], pc = cells[i - 1]; out.push([p[0] - pc.x0 + c.x0, p[1] - pc.y0 + c.y0]); } // faded: the drawing before's spot
  });
  return out;
}

/** A strip: each drawing's cell centred on its anchor, scaled by k (strip px per sheet px). */
function strip(im, cells, at, k, name) {
  const n = cells.length;
  let hx = 0, hy = 0;
  cells.forEach((c, i) => {
    const b = bbox(im, c, (j) => im.D[j + 3] > 8);
    if (!b) return;
    hx = Math.max(hx, at[i][0] - b.x0, b.x1 - at[i][0]); hy = Math.max(hy, at[i][1] - b.y0, b.y1 - at[i][1]);
  });
  const ow = 2 * Math.ceil((hx + MARGIN) * k) + 2, oh = 2 * Math.ceil((hy + MARGIN) * k) + 2;
  const o = new Uint8Array(ow * n * oh * 4);
  cells.forEach((c, i) => {
    for (let oy = 0; oy < oh; oy++) for (let ox = 0; ox < ow; ox++) {
      const ax = at[i][0] + (ox - ow / 2) / k, ay = at[i][1] + (oy - oh / 2) / k;
      let r = 0, g = 0, b = 0, a = 0, cnt = 0;
      for (let yy = Math.floor(ay); yy < ay + 1 / k; yy++) for (let xx = Math.floor(ax); xx < ax + 1 / k; xx++) {
        cnt++;
        if (xx < c.x0 || xx >= c.x1 || yy < c.y0 || yy >= c.y1) continue;
        const j = (yy * im.W + xx) * 4, al = im.D[j + 3] / 255;
        if (!al) continue;
        r += im.D[j] * al; g += im.D[j + 1] * al; b += im.D[j + 2] * al; a += al;
      }
      if (!a) continue;
      const q = (oy * ow * n + i * ow + ox) * 4;
      o[q] = r / a; o[q + 1] = g / a; o[q + 2] = b / a; o[q + 3] = Math.round((a / cnt) * 255);
    }
  });
  writeFileSync(`${OUT}${name}.png`, encodePng({ width: ow * n, height: oh, data: Buffer.from(o) }));
  return { image: `${name}.png`, columns: n, rows: 1, count: n, frameW: ow, frameH: oh, originX: ow / 2, originY: oh / 2, scale: 0.5 };
}

// The shield.
const rawBody = load('Game_Block_Effect.png');
const bodyCells = cellsOf(rawBody, 4, 2, 8);
const body = keyMagenta(rawBody, bodyCells);
const white = (j) => body.D[j + 3] > 200 && body.D[j] > 235 && body.D[j + 1] > 235 && body.D[j + 2] > 235;
const bodyAt = anchors(body, bodyCells, (i, c) => { const b = bbox(body, c, (j) => body.D[j + 3] > 100); return i < 6 && b ? [b.cx, b.cy] : null; }, white);
const oval = bbox(body, bodyCells[3], (j) => body.D[j + 3] > 100);
const k = BODY / (oval.y1 - oval.y0);

// Its glow, looked for where the shield's centre is in the same cell.
const light = load('Game_Block_Effect2.png');
const lightCells = cellsOf(light, 4, 2, 8);
const bright = (im) => (j) => lum(im.D, j) >= 245;
const lightAt = anchors(light, lightCells, (i, c) => [bodyAt[i][0] - bodyCells[i].x0 + c.x0, bodyAt[i][1] - bodyCells[i].y0 + c.y0], bright(light));

// The heavy glow (no shield of its own yet): first guess, the middle of what is clearly lit.
const heavy = load('Game_Block_Effect3.png');
const heavyCells = cellsOf(heavy, 5, 2, 10);
const heavyAt = anchors(heavy, heavyCells, (i, c) => { const b = bbox(heavy, c, (j) => lum(heavy.D, j) > 120); return b ? [b.cx, b.cy] : null; }, bright(heavy));

const sprites = {
  body: { ...strip(body, bodyCells, bodyAt, k, 'block-body'), bodyH: BODY },
  light: { ...strip(light, lightCells, lightAt, k, 'block-light'), additive: true },
  heavyLight: { ...strip(heavy, heavyCells, heavyAt, k, 'block-heavy-light'), additive: true },
};
const rel = (at, cells) => at.map((p, i) => [p[0] - cells[i].x0, p[1] - cells[i].y0]);
const lightOffset = rel(lightAt, lightCells).map((p, i) => { const b = rel(bodyAt, bodyCells)[i]; return [Math.round(p[0] - b[0]), Math.round(p[1] - b[1])]; });
console.log(`scale ${(k * 100).toFixed(1)}% (shield ${oval.y1 - oval.y0} sheet px tall → ${BODY})`);
console.log('body centres (in cell):', JSON.stringify(rel(bodyAt, bodyCells).map((p) => p.map(Math.round))));
console.log('light centres (in cell):', JSON.stringify(rel(lightAt, lightCells).map((p) => p.map(Math.round))));
console.log('heavy light centres (in cell):', JSON.stringify(rel(heavyAt, heavyCells).map((p) => p.map(Math.round))));
console.log('"lightOffset":', JSON.stringify(lightOffset));
console.log(JSON.stringify(sprites));
