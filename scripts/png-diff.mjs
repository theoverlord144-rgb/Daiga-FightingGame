// node scripts/png-diff.mjs <a.png> <b.png> [out.png]: how many pixels differ (by more than 8 in any channel), and where.
import fs from 'node:fs';
import { decodePng, encodePng } from './png.mjs';
const [a, b, out] = process.argv.slice(2);
const A = decodePng(fs.readFileSync(a)), B = decodePng(fs.readFileSync(b));
if (A.width !== B.width || A.height !== B.height) { console.log(`sizes differ: ${A.width}x${A.height} vs ${B.width}x${B.height}`); process.exit(1); }
let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, max = 0;
const d = new Uint8Array(A.data.length);
for (let i = 0; i < A.width * A.height; i++) {
  const m = Math.max(Math.abs(A.data[i * 4] - B.data[i * 4]), Math.abs(A.data[i * 4 + 1] - B.data[i * 4 + 1]), Math.abs(A.data[i * 4 + 2] - B.data[i * 4 + 2]));
  max = Math.max(max, m);
  d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = A.data[i * 4] >> 2; d[i * 4 + 3] = 255;
  if (m > 8) { n++; const x = i % A.width, y = (i - x) / A.width; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); d[i * 4] = 255; }
}
console.log(`${n} of ${A.width * A.height} pixels differ (largest step ${max})${n ? `, inside x ${x0}-${x1}, y ${y0}-${y1}` : ''}`);
if (out) fs.writeFileSync(out, encodePng({ width: A.width, height: A.height, data: d }));
