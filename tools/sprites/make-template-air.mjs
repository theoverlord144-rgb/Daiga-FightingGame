// Builds template_air.png: the drawing template for air poses. Run: node tools/sprites/make-template-air.mjs
// Flat magenta, no ground line, a dashed box the size of Avner's standing body in the upper left quarter with a
// cross at its centre (his body centre). The rest of the image is left empty for the chain.
import fs from 'node:fs';
import { encodePng } from '../../scripts/png.mjs';

const SIZE = 2048;
const BODY_W = 236, BODY_H = 531; // Avner's idle, first drawing, measured in Avner_Idle.png (raw art scale)
const BG = [255, 0, 255], INK = [214, 0, 214];
const LINE = 3, DASH = 18, GAP = 12, CROSS = 16;

const data = new Uint8Array(SIZE * SIZE * 4);
for (let i = 0; i < SIZE * SIZE; i++) data.set([...BG, 255], i * 4);
const dot = (x, y) => { if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) data.set([...INK, 255], (y * SIZE + x) * 4); };
const rect = (x, y, w, h) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) dot(xx, yy); };

const cx = SIZE / 4, cy = SIZE / 4; // centre of the upper left quarter
const x0 = cx - BODY_W / 2, y0 = cy - Math.floor(BODY_H / 2), x1 = x0 + BODY_W, y1 = y0 + BODY_H;
for (let x = x0; x < x1; x += DASH + GAP) { const w = Math.min(DASH, x1 - x); rect(x, y0, w, LINE); rect(x, y1 - LINE, w, LINE); }
for (let y = y0; y < y1; y += DASH + GAP) { const h = Math.min(DASH, y1 - y); rect(x0, y, LINE, h); rect(x1 - LINE, y, LINE, h); }
const bx = (x0 + x1) / 2, by = Math.floor((y0 + y1) / 2);
rect(bx - CROSS, by - 1, CROSS * 2 + 1, LINE);
rect(bx - 1, by - CROSS, LINE, CROSS * 2 + 1);

const out = new URL('./template_air.png', import.meta.url);
fs.writeFileSync(out, encodePng({ width: SIZE, height: SIZE, data }));
console.log(`template_air.png ${SIZE}x${SIZE}, box ${x0},${y0} to ${x1},${y1}, centre ${bx},${by}`);
