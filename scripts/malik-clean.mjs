// Malik: the redesign's body sheets (owner, Nov 26) have a thin black ground line drawn under every row, from one
// edge of the sheet to the other. It joins the drawings into one shape, so the cutting tool cannot tell them apart,
// and it would be drawn under his feet in the game. It is taken out here before the cutting tool reads the sheets.
//
//   node scripts/malik-clean.mjs [part of a file name]
//
// A ground line is a row with a dark run far longer than any part of him (LONG px). Along it, the line and its soft
// edge become background wherever there is background just above it; under a foot (or a coat hem) it is kept, since
// there it is the drawing's own outline. Written to data/characters/malik/clean/ (not shipped: only sheets/ is),
// which is where the cutting table reads the body sheets from.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { decodePng, encodePng } from './png.mjs';

// MALIK_SRC=data/characters/malik/clean/ reads a sheet already made see-through there (by glow-clean.mjs, for the ones painted
// on black with a glow: the back throw and 2R) and takes its ground lines out in place.
const RAW = process.env.MALIK_SRC || 'data/characters/malik/';
const OUT = 'data/characters/malik/clean/';
const LONG = 300; // px: a dark run this long in one row is the ground line
const SKIP = /_effect/i; // effect sheets have no ground line
// Hand splits: two drawings that share columns, so no straight cut parts them. In rows y0 to y1, between x0 and x1,
// what is above yCut (a sloped line: its height at x0, then at x1) belongs to the drawing on the left and what is below to the one on the right; everything from
// x0 on is moved right by pad px (the sheet grows that much wider), leaving each drawing whole on its own side.
// Heavy orb, row 2: drawing 5's orb hangs over the sash and back foot of drawing 6.
const SPLIT = { 'Malik_ specialmove_spiritorbH.png': { y0: 760, y1: 1520, x0: 700, x1: 767, yCut: [1232, 1165], pad: 80 } };
const ONLY = process.argv[2];

mkdirSync(OUT, { recursive: true });
for (const file of readdirSync(RAW).filter((f) => /\.png$/i.test(f) && !SKIP.test(f) && (!ONLY || f.includes(ONLY)))) {
  const { width: W, height: H, data } = decodePng(readFileSync(RAW + file));
  const at = (x, y) => (y * W + x) * 4;
  const keyed = data[3] < 128; // already see-through; otherwise the corner's colour is the background
  const bg = [data[0], data[1], data[2]];
  const isBg = (x, y) => { const i = at(x, y); return keyed ? data[i + 3] < 40 : Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) < 90; };
  const dark = (x, y) => { const i = at(x, y); return data[i + 3] > 128 && data[i] < 90 && data[i + 1] < 90 && data[i + 2] < 90; };
  // rows holding a long dark run, grouped into bands (a line is 2-4 rows thick)
  const rows = [];
  for (let y = 0; y < H; y++) {
    let run = 0, best = 0;
    for (let x = 0; x < W; x++) { if (dark(x, y)) { run++; if (run > best) best = run; } else run = 0; }
    if (best >= LONG) rows.push(y);
  }
  const bands = [];
  for (const y of rows) { if (bands.length && y - bands.at(-1)[1] <= 2) bands.at(-1)[1] = y; else bands.push([y, y]); }
  let cleared = 0;
  for (const [top, bottom] of bands) {
    for (let x = 0; x < W; x++) {
      if (top < 4 || !isBg(x, top - 3)) continue; // something stands on the line here: it is that drawing's outline
      for (let y = top - 2; y <= Math.min(H - 1, bottom + 2); y++) {
        if (isBg(x, y)) continue;
        const i = at(x, y);
        if (keyed) data[i + 3] = 0; else { data[i] = bg[0]; data[i + 1] = bg[1]; data[i + 2] = bg[2]; }
        cleared++;
      }
    }
  }
  const sp = SPLIT[file];
  if (sp) {
    const W2 = W + sp.pad, out = new Uint8Array(W2 * H * 4);
    for (let i = 0; i < out.length; i += 4) { out[i] = bg[0]; out[i + 1] = bg[1]; out[i + 2] = bg[2]; out[i + 3] = keyed ? 0 : 255; }
    const put = (x, y, nx) => { const i = at(x, y), o = (y * W2 + nx) * 4; out[o] = data[i]; out[o + 1] = data[i + 1]; out[o + 2] = data[i + 2]; out[o + 3] = data[i + 3]; };
    const cut = (x) => sp.yCut[0] + ((sp.yCut[1] - sp.yCut[0]) * (x - sp.x0)) / (sp.x1 - sp.x0);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (y < sp.y0 || y >= sp.y1) { put(x, y, x); continue; }
      if (x < sp.x1 && !(x >= sp.x0 && y >= cut(x))) put(x, y, x);
      if (x >= sp.x0 && !(x < sp.x1 && y < cut(x))) put(x, y, x + sp.pad);
    }
    writeFileSync(OUT + file, encodePng({ width: W2, height: H, data: out }));
    console.log(file + ': split, now ' + W2 + ' px wide');
    continue;
  }
  writeFileSync(OUT + file, encodePng({ width: W, height: H, data }));
  console.log(`${file}: ${bands.length} ground line(s) at y ${bands.map((b) => b[0]).join(', ') || '-'}, ${cleared} px cleared`);
}
