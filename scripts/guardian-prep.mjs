// Cuts Malik's Spirit Guardian sheets (a ghost drawn as light on black) into game sheets:
//   node scripts/guardian-prep.mjs
// sprite-prep's strip mode cannot do these: the drawings overlap, each sheet is drawn at its own size, and a ghost has
// no feet to anchor on. Here every sheet gets its dividing lines by hand (CUTS), is scaled so its resting pose (the
// last drawing) is as tall as the idle's, and every drawing is anchored on its body: the densest upright column
// (head, chest and tail stacked), which an outstretched arm, a shockwave or an orb does not move.
// The sources are JPEGs (two of them named .png): convert them first, e.g.
//   ffmpeg -f mjpeg -i Malik_Install_SpiritGuardian_Idle.png guardian-src/idle.png
// Prints each sheet's sprite block and, per drawing, how far it reaches ([left, bottom, right, top] in game px from
// the anchor), which is where the attack boxes come from.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { decodePng, encodePng } from './png.mjs';

const DIR = 'data/characters/malik/';
const TMP = process.argv[2] || `${DIR}guardian-src/`;
const HEIGHT = 228; // game px: the resting guardian, top of the flame to the tip of the tail
const RES = 2;
const SHEETS = [
  { out: 'guardian-idle', src: 'Malik_Install_SpiritGuardian_Idle.png', cuts: [225, 433, 641, 849, 1057] },
  { out: 'guardian-L', src: 'Malik_Install_SpiritGuardian_LightPunch.jpg', cuts: [205, 440, 800, 1060] },
  { out: 'guardian-M', src: 'Malik_Install_SpiritGuardian_MediumPunch.jpg', cuts: [152, 328, 497, 800, 962, 1125] },
  { out: 'guardian-H', src: 'Malik_Install_SpiritGuardian_HeavyPunch.jpg', cuts: [148, 292, 486, 783, 975, 1130] },
];

function load(src) {
  const png = `${TMP}${src.replace(/\.\w+$/, '')}.png`;
  if (!existsSync(png)) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'mjpeg', '-i', DIR + src, png]);
  return decodePng(readFileSync(png));
}

const report = {};
for (const sheet of SHEETS) {
  const { width: W, height: H, data } = load(sheet.src);
  // Light on black: brightness is opacity. Faint JPEG noise goes clear.
  const alpha = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const a = Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) / 255;
    alpha[i] = a < 0.2 ? 0 : a;
  }
  // Connected pieces; each goes to the slot (between the cuts) that holds most of it. Small loose specks are dropped.
  const edges = [0, ...sheet.cuts, W];
  const n = edges.length - 1;
  const slotOf = new Int8Array(W * H).fill(-1);
  const seen = new Uint8Array(W * H);
  const stack = new Int32Array(W * H);
  for (let s = 0; s < W * H; s++) {
    if (seen[s] || !alpha[s]) continue;
    const blob = [];
    const count = new Array(n).fill(0);
    let top = 0;
    stack[top++] = s; seen[s] = 1;
    while (top) {
      const i = stack[--top]; blob.push(i);
      const x = i % W, y = (i - x) / W;
      count[edges.findIndex((e, k) => k < n && x >= e && x < edges[k + 1])]++;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (!seen[j] && alpha[j]) { seen[j] = 1; stack[top++] = j; }
      }
    }
    if (blob.length < 40) continue;
    const slot = count.indexOf(Math.max(...count));
    for (const i of blob) slotOf[i] = slot;
  }
  // Each drawing: its box, and its body column (the 60 px wide band holding the most light).
  const draws = [];
  for (let k = 0; k < n; k++) {
    let x0 = W, x1 = -1, y0 = H, y1 = -1;
    const col = new Float64Array(W);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (slotOf[y * W + x] !== k) continue;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      col[x] += alpha[y * W + x];
    }
    if (x1 < 0) throw new Error(`${sheet.out}: drawing ${k + 1} is empty (check the cuts)`);
    let best = -1, ax = x0;
    for (let x = x0; x + 60 <= x1 + 1; x++) {
      let m = 0;
      for (let i = 0; i < 60; i++) m += col[x + i];
      if (m > best) { best = m; ax = x + 30; }
    }
    draws.push({ x0, x1, y0, y1, ax, ay: y1 + 1 });
  }
  const last = draws[n - 1];
  const k = (HEIGHT * RES) / (last.y1 - last.y0 + 1);
  let left = 0, right = 0, up = 0;
  for (const d of draws) { left = Math.max(left, (d.ax - d.x0) * k); right = Math.max(right, (d.x1 + 1 - d.ax) * k); up = Math.max(up, (d.ay - d.y0) * k); }
  const originX = Math.ceil(left) + 2, originY = Math.ceil(up) + 2;
  const fw = originX + Math.ceil(right) + 2, fh = originY + 2;
  const out = new Uint8Array(fw * n * fh * 4);
  draws.forEach((d, c) => {
    for (let oy = 0; oy < fh; oy++) for (let ox = 0; ox < fw; ox++) {
      // Back to the drawing (bilinear).
      const sx = d.ax + (ox + 0.5 - originX) / k - 0.5, sy = d.ay + (oy + 0.5 - originY) / k - 0.5;
      const ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy;
      let a = 0, r = 0, g = 0, b = 0;
      for (const [xx, yy, w] of [[ix, iy, (1 - fx) * (1 - fy)], [ix + 1, iy, fx * (1 - fy)], [ix, iy + 1, (1 - fx) * fy], [ix + 1, iy + 1, fx * fy]]) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H || slotOf[yy * W + xx] !== c) continue;
        const i = yy * W + xx, wa = w * alpha[i];
        a += wa; r += wa * data[i * 4]; g += wa * data[i * 4 + 1]; b += wa * data[i * 4 + 2];
      }
      if (a <= 0.02) continue;
      // The light's own colour at full strength (the black it was drawn on taken back out).
      const o = (oy * fw * n + c * fw + ox) * 4;
      const peak = Math.max(r, g, b) / a || 1;
      out[o] = Math.min(255, (r / a) * (255 / peak)); out[o + 1] = Math.min(255, (g / a) * (255 / peak)); out[o + 2] = Math.min(255, (b / a) * (255 / peak));
      out[o + 3] = Math.round(Math.min(1, a) * 255);
    }
  });
  writeFileSync(`${DIR}sheets/${sheet.out}.png`, encodePng({ width: fw * n, height: fh, data: out }));
  const sprite = { image: `sheets/${sheet.out}.png`, columns: n, rows: 1, count: n, frameW: fw, frameH: fh, originX, originY, scale: 1 / RES };
  const reach = draws.map((d) => [Math.round(((d.x0 - d.ax) * k) / RES), Math.round(((d.ay - 1 - d.y1) * k) / RES), Math.round(((d.x1 - d.ax) * k) / RES), Math.round(((d.ay - d.y0) * k) / RES)]);
  report[sheet.out] = { sprite, reach };
  console.log(sheet.out, JSON.stringify(sprite));
  console.log('  reach', JSON.stringify(reach));
}
writeFileSync(`${TMP}report.json`, JSON.stringify(report, null, 1));
