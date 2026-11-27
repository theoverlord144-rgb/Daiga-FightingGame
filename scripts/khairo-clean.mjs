// Khai'ro: sheets that came on WHITE are cleaned here before the cutting tool reads them.
//
//   node scripts/khairo-clean.mjs
//
// The cutting tool (avner-prep.mjs) keys white by a flood from the picture's edges, which is right, but this sheet
// needs two more things it has no switch for:
//   - pockets of background closed in by the drawing (between an arm and the body) that the flood cannot reach:
//     any patch of pure, colourless white bigger than POCKET px is background too. His cream wraps, bead highlights
//     and the pale smears are warmer than that (blue well under red) or far smaller, so they survive;
//   - two drawings that touch (5M: drawing 3's front foot and drawing 4's back foot): a see-through line is drawn
//     between them (SPLIT), so the tool sees two shapes.
// Specks of paper noise left floating in the background are removed. Written to data/characters/khairo/clean/
// (not shipped: only sheets/ is), which is where the cutting table reads it from.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { decodePng, encodePng } from './png.mjs';

const RAW = "data/characters/Khai'ro/";
const OUT = 'data/characters/khairo/clean/';
const POCKET = 150; // px: a closed-in patch of pure white at least this big is background
const SPECK = 300; // px: anything smaller left floating in the background is paper noise
// split: [x, y0, y1] a vertical see-through line, sheet px
const JOBS = [{ file: 'Khairo_Medium.png', split: [[992, 300, 400]] }];

function read(path) {
  const raw = readFileSync(path);
  if (raw[0] === 0x89 && raw[1] === 0x50) return decodePng(raw);
  return decodePng(execFileSync('ffmpeg', ['-loglevel', 'error', '-i', path, '-f', 'image2pipe', '-vcodec', 'png', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1 << 28 }));
}

/** Connected patches of `is`: calls each(pixels) once per patch. */
function patches(W, H, is, each) {
  const seen = new Uint8Array(W * H);
  for (let s = 0; s < W * H; s++) {
    if (seen[s] || !is(s)) continue;
    const list = [s];
    seen[s] = 1;
    for (let k = 0; k < list.length; k++) {
      const i = list[k], x = i % W;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < W * H && !seen[j] && is(j)) { seen[j] = 1; list.push(j); }
    }
    each(list);
  }
}

mkdirSync(OUT, { recursive: true });
for (const job of JOBS) {
  const { width: W, height: H, data } = read(RAW + job.file);
  const ch = (i, c) => data[i * 4 + c];
  const spread = (i) => Math.max(ch(i, 0), ch(i, 1), ch(i, 2)) - Math.min(ch(i, 0), ch(i, 1), ch(i, 2));
  const paper = (i) => ch(i, 0) > 218 && ch(i, 1) > 218 && ch(i, 2) > 218;
  const pure = (i) => ch(i, 0) > 240 && ch(i, 1) > 240 && ch(i, 2) > 240 && spread(i) < 10;
  const gone = new Uint8Array(W * H);
  // 1. the flood from the edges
  const stack = [];
  const push = (i) => { if (!gone[i] && paper(i)) { gone[i] = 1; stack.push(i); } };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  while (stack.length) { const i = stack.pop(), x = i % W, y = (i / W) | 0; if (x > 0) push(i - 1); if (x < W - 1) push(i + 1); if (y > 0) push(i - W); if (y < H - 1) push(i + W); }
  // 2. closed-in pockets of pure white
  let pockets = 0;
  patches(W, H, (i) => !gone[i] && pure(i), (list) => { if (list.length >= POCKET) { pockets++; for (const i of list) gone[i] = 1; } });
  // 3. the line between drawings that touch
  for (const [x, y0, y1] of job.split ?? []) for (let y = y0; y <= y1; y++) for (let dx = -1; dx <= 1; dx++) gone[y * W + x + dx] = 1;
  // 4. floating specks
  let specks = 0;
  patches(W, H, (i) => !gone[i], (list) => { if (list.length < SPECK) { specks++; for (const i of list) gone[i] = 1; } });
  const out = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) { out[i * 4] = ch(i, 0); out[i * 4 + 1] = ch(i, 1); out[i * 4 + 2] = ch(i, 2); out[i * 4 + 3] = gone[i] ? 0 : 255; }
  // The outline's outer pixel is a mix of ink and paper: where a kept pixel touches the background and is pale, fade it.
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (gone[i] || !(gone[i - 1] || gone[i + 1] || gone[i - W] || gone[i + W])) continue;
    const light = Math.min(ch(i, 0), ch(i, 1), ch(i, 2));
    if (light > 150 && spread(i) < 40) out[i * 4 + 3] = Math.round(255 * Math.max(0, (218 - light) / 68));
  }
  writeFileSync(OUT + job.file, encodePng({ width: W, height: H, data: out }));
  console.log(`${job.file}: ${W}x${H}, ${pockets} closed-in pockets, ${specks} specks removed -> ${OUT}${job.file}`);
}
