// Side-by-side timing previews:  node scripts/snap-gifs.mjs [avner malik] [--only 5H,5L]
// For every move the snap pass re-timed (data/snap/<id>.json), writes
// data/characters/<id>/previews/snap/<move>.gif: the original holds on the left, the snap holds on the right, one
// picture per game frame (played at 50 a second, GIF's fastest, so a touch slower than the game), with a short
// pause before it loops. Timing only: the overshoot, lean and hit effects are drawn by the game, not here.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { decodePng, encodePng } from './png.mjs';

const args = process.argv.slice(2), ids = args.filter((a) => !a.startsWith('--') && a !== args[args.indexOf('--only') + 1]);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
for (const id of ids.length ? ids : ['avner', 'malik']) {
  const dir = `data/characters/${id}/`, out = `${dir}previews/snap/`;
  const file = JSON.parse(fs.readFileSync(`${dir}${id}.toska.json`, 'utf8'));
  const snap = JSON.parse(fs.readFileSync(`data/snap/${id}.json`, 'utf8')).moves;
  fs.mkdirSync(out, { recursive: true });
  const images = new Map();
  let made = 0;
  for (const [name, e] of Object.entries(snap)) {
    if (only ? !only.includes(name) : e.snap.join() === e.holds.join()) continue;
    const ex = name.endsWith('_ex'), m = file.moves.find((x) => x.id === (ex ? name.slice(0, -3) : name));
    const s = (ex && m?.ex?.sprite) || m?.sprite;
    if (!s?.image || !fs.existsSync(dir + s.image)) { console.log(`${name}: no sheet found (skipped)`); continue; }
    if (!images.has(s.image)) images.set(s.image, decodePng(fs.readFileSync(dir + s.image)));
    const img = images.get(s.image), fw = s.frameW ?? img.width / s.columns, fh = s.frameH ?? img.height / (s.rows ?? 1);
    const k = Math.max(1, Math.round(1 / (s.scale ?? 1))), w = Math.floor(fw / k) & ~1, h = Math.floor(fh / k) & ~1, W = w * 2 + 6;
    const seq = (holds) => holds.flatMap((n, i) => new Array(n).fill(i));
    const A = seq(e.holds), B = seq(e.snap), tmp = `${out}.tmp-${name.replace(/[^\w.-]/g, '_')}/`;
    fs.mkdirSync(tmp, { recursive: true });
    const cell = new Map();
    const small = (n) => {
      if (cell.has(n)) return cell.get(n);
      const d = new Uint8Array(w * h * 3), sx = (n % s.columns) * fw, sy = Math.floor(n / s.columns) * fh;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        for (let v = 0; v < k; v++) for (let u = 0; u < k; u++) { const p = ((sy + y * k + v) * img.width + sx + x * k + u) * 4, q = img.data[p + 3] / 255; r += img.data[p] * q; g += img.data[p + 1] * q; b += img.data[p + 2] * q; a += q; }
        const al = a / (k * k), o = (y * w + x) * 3;
        d[o] = (a ? r / a : 0) * al + 58 * (1 - al); d[o + 1] = (a ? g / a : 0) * al + 60 * (1 - al); d[o + 2] = (a ? b / a : 0) * al + 70 * (1 - al);
      }
      cell.set(n, d);
      return d;
    };
    const total = A.length, PAUSE = 20;
    for (let t = 0; t < total + PAUSE; t++) {
      const f = Math.min(t, total - 1), one = new Uint8Array(W * (h + 6) * 4).fill(255);
      for (let i = 0; i < W * (h + 6); i++) { one[i * 4] = 30; one[i * 4 + 1] = 31; one[i * 4 + 2] = 38; }
      [small(A[f]), small(B[f])].forEach((d, side) => {
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = (y * W + side * (w + 6) + x) * 4, p = (y * w + x) * 3; one[o] = d[p]; one[o + 1] = d[p + 1]; one[o + 2] = d[p + 2]; }
        // A bar under each side: where the move is, and a tick where the drawing changes.
        const seqs = side ? B : A;
        for (let x = 0; x < w; x++) { const g = Math.floor((x / w) * total), on = g <= f, edge = g > 0 && seqs[g] !== seqs[g - 1] && Math.floor(((x - 1) / w) * total) !== g; for (let y = h + 1; y < h + 5; y++) { const o = (y * W + side * (w + 6) + x) * 4; one[o] = edge ? 255 : on ? (side ? 255 : 120) : 70; one[o + 1] = edge ? 255 : on ? (side ? 200 : 180) : 72; one[o + 2] = edge ? 255 : on ? (side ? 80 : 255) : 80; } }
      });
      fs.writeFileSync(`${tmp}${String(t).padStart(4, '0')}.png`, encodePng({ width: W, height: h + 6, data: one }));
    }
    try { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '50', '-i', `${tmp}%04d.png`, '-vf', 'split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=none', '-loop', '0', `${out}${name.replace(/[^\w.-]/g, '_')}.gif`]); made++; } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  console.log(`${id}: ${made} side-by-side GIFs in ${out} (left = original timing, blue bar; right = snap, gold bar; white ticks = a new drawing)`);
}
