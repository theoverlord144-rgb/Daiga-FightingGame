// Best-frame assembly: build one sheet from the best drawings of several versions of a move.
//
//   node scripts/sprite-assemble.mjs <character> <move>            reads data/assembly/<character>_<move>.json
//   node scripts/sprite-assemble.mjs <character> --versions <move> <sheet> <sheet> ...
//        a numbered contact sheet of every version side by side (previews/assembly/<move>-versions.png), to pick from
//
// The manifest is a list of drawings, in the order they play, each naming a source sheet and a drawing number
// (counted from 1, as the contact sheet numbers them):
//   [{ "sheet": "Avner_5H_v1.png", "frame": 1 }, { "sheet": "Avner_5H_v2.png", "frame": 2 }]
// or, with its own timing:  { "drawings": [...], "holds": [3, 2, ...] }
// A sheet is looked for in the character's folder, then its sheets/ folder. It must be a game-ready strip: one the
// character file or sheets/manifest.json already describes, or any strip with the same cell as the move's current
// sheet (a new version cut by the usual prep tool under a new name). Drawings are cut by their cells and laid in by
// the fighter's point, so nothing shifts. A raw drawn sheet (off-grid drawings on a flat background) has to go
// through the prep tool first: this tool does not cut those.
// Writes sheets/<move>-assembled.png (never over an existing original), previews/assembly/<move>.gif and prints the
// "sprite" block to paste into the move. Nothing in the game changes until a move points at the new sheet.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { decodePng, encodePng } from './png.mjs';

const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
/** Draw a number (3 x 5 digits, scaled) into an RGBA image. */
export function drawNumber(img, n, x, y, s = 3, col = [255, 235, 90]) {
  for (const ch of String(n)) {
    const g = DIGITS[+ch];
    for (let i = 0; i < 15; i++) if (g[i] === '1') for (let v = 0; v < s; v++) for (let u = 0; u < s; u++) {
      const px = x + (i % 3) * s + u, py = y + Math.floor(i / 3) * s + v;
      if (px < 0 || py < 0 || px >= img.width || py >= img.height) continue;
      const o = (py * img.width + px) * 4;
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
    }
    x += 4 * s;
  }
}

/** One cell of a sheet as its own image: { width, height, data, originX, originY }. cell = { columns, frameW, frameH, originX, originY }. */
export function cutCell(img, cell, n) {
  const { frameW: w, frameH: h } = cell, sx = (n % cell.columns) * w, sy = Math.floor(n / cell.columns) * h;
  if (sx + w > img.width || sy + h > img.height) throw new Error(`drawing ${n + 1} is outside the sheet (${img.width} x ${img.height}, cells ${w} x ${h})`);
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) data.set(img.data.subarray(((sy + y) * img.width + sx) * 4, ((sy + y) * img.width + sx + w) * 4), y * w * 4);
  return { width: w, height: h, data, originX: cell.originX ?? Math.round(w / 2), originY: cell.originY ?? h };
}
const bbox = (c) => {
  let x0 = c.width, x1 = -1, y0 = c.height, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (c.data[(y * c.width + x) * 4 + 3] > 127) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x0, x1, y0, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
};
/**
 * Lay cut drawings into one strip. cells: [{ width, height, data, originX, originY }] in play order; out = the cell
 * of the finished sheet { frameW, frameH, originX, originY }. Each drawing goes in by its fighter point.
 */
export function layStrip(cells, out) {
  const W = out.frameW, H = out.frameH, data = new Uint8Array(W * cells.length * H * 4);
  let clipped = 0;
  cells.forEach((c, n) => {
    const dx = out.originX - c.originX, dy = out.originY - c.originY;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const o = (y * c.width + x) * 4;
      if (!c.data[o + 3]) continue;
      const tx = x + dx, ty = y + dy;
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) { clipped++; continue; }
      data.set(c.data.subarray(o, o + 4), (ty * W * cells.length + n * W + tx) * 4);
    }
  });
  return { png: { width: W * cells.length, height: H, data }, clipped };
}

/** Every sprite block the character already has, by image path ("sheets/5H.png"). */
function knownCells(dir, file) {
  const known = new Map();
  const add = (s) => { if (s?.image && !known.has(s.image)) known.set(s.image, s); };
  for (const m of file.moves ?? []) { add(m.sprite); add(m.ex?.sprite); }
  for (const st of Object.values(file.states ?? {})) add(st.sprite);
  for (const e of Object.values(file.effects ?? {})) add(e.sprite ?? e);
  if (fs.existsSync(`${dir}sheets/manifest.json`)) for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(`${dir}sheets/manifest.json`, 'utf8')))) add(v.sprite ?? { ...v, image: v.image ?? k });
  return known;
}
const findSheet = (dir, name) => [name, `sheets/${name}`].find((p) => fs.existsSync(dir + p)) ?? null;

function gif(to, png, cell, count, holds) {
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch { return false; }
  const tmp = `${to}.tmp/`;
  fs.mkdirSync(tmp, { recursive: true });
  const w = cell.frameW & ~1, h = cell.frameH & ~1;
  let list = '';
  for (let n = 0; n < count; n++) {
    const one = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = (y * png.width + n * cell.frameW + x) * 4, q = (y * w + x) * 4, al = png.data[p + 3] / 255;
      for (let c = 0; c < 3; c++) one[q + c] = png.data[p + c] * al + [112, 116, 124][c] * (1 - al);
      one[q + 3] = 255;
    }
    fs.writeFileSync(`${tmp}${n}.png`, encodePng({ width: w, height: h, data: one }));
    list += `file '${n}.png'\nduration ${((holds?.[n] ?? 6) / 60).toFixed(4)}\n`;
  }
  fs.writeFileSync(`${tmp}list.txt`, `${list}file '${count - 1}.png'\n`);
  try { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-i', `${tmp}list.txt`, '-vf', 'split[a][b];[a]palettegen[p];[b][p]paletteuse', '-loop', '0', to]); } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  return true;
}

/** The cut drawings of one source sheet: [{ width, height, data, originX, originY }]. */
function sourceCells(dir, name, known, ref) {
  const p = findSheet(dir, name);
  if (!p) throw new Error(`${name}: not found in ${dir} or ${dir}sheets/`);
  const img = decodePng(fs.readFileSync(dir + p));
  const block = known.get(p) ?? (img.height === ref.cell.frameH && img.width % ref.cell.frameW === 0 ? { ...ref.cell, columns: img.width / ref.cell.frameW } : null);
  if (!block) throw new Error(`${name}: not a sheet the character already uses and not the move's cell size; cut it with the prep tool first`);
  const cell = { columns: block.columns, frameW: block.frameW ?? img.width / block.columns, frameH: block.frameH ?? img.height / (block.rows ?? 1), originX: block.originX, originY: block.originY };
  const count = block.count ?? block.columns * (block.rows ?? 1);
  return Array.from({ length: count }, (_, n) => cutCell(img, cell, n));
}

function main() {
  const args = process.argv.slice(2), id = args[0];
  if (!id) { console.error('usage: node scripts/sprite-assemble.mjs <character> <move>   |   <character> --versions <move> <sheet> ...'); process.exit(1); }
  const dir = `data/characters/${id}/`, pre = `${dir}previews/assembly/`;
  const file = JSON.parse(fs.readFileSync(`${dir}${id}.toska.json`, 'utf8'));
  const known = knownCells(dir, file);
  fs.mkdirSync(pre, { recursive: true });
  const refOf = (move) => {
    const m = file.moves.find((x) => x.id === move);
    if (!m?.sprite) throw new Error(`${move}: no such move with a sheet in ${id}`);
    const img = decodePng(fs.readFileSync(dir + m.sprite.image)), s = m.sprite;
    const cell = { frameW: s.frameW ?? img.width / s.columns, frameH: s.frameH ?? img.height / (s.rows ?? 1), originX: s.originX ?? Math.round((s.frameW ?? img.width / s.columns) / 2), originY: s.originY ?? (s.frameH ?? img.height / (s.rows ?? 1)), columns: s.columns };
    const boxes = Array.from({ length: s.count ?? s.columns }, (_, n) => bbox(cutCell(img, cell, n))).filter(Boolean);
    const hs = boxes.map((b) => b.h).sort((a, b) => a - b), air = cell.originY < cell.frameH - 4;
    const centreUp = Math.round(boxes.reduce((t, b) => t + (cell.originY - (b.y0 + b.y1 + 1) / 2), 0) / boxes.length);
    return { move: m, cell, height: hs[hs.length >> 1], air, centreUp: air ? -centreUp : 0, scale: s.scale ?? 1 };
  };

  if (args[1] === '--versions') {
    const move = args[2], sheets = args.slice(3), ref = refOf(move);
    const rows = sheets.map((name) => {
      return { name, cells: sourceCells(dir, name, known, ref) };
    });
    const W = ref.cell.frameW, H = ref.cell.frameH, cols = Math.max(...rows.map((r) => r.cells.length));
    const out = { width: W * cols, height: (H + 18) * rows.length, data: new Uint8Array(W * cols * (H + 18) * rows.length * 4) };
    for (let i = 0; i < out.width * out.height; i++) { out.data[i * 4] = 44; out.data[i * 4 + 1] = 46; out.data[i * 4 + 2] = 54; out.data[i * 4 + 3] = 255; }
    rows.forEach((r, ri) => {
      const strip = layStrip(r.cells, ref.cell).png, top = ri * (H + 18) + 18;
      for (let y = 0; y < H; y++) for (let x = 0; x < strip.width; x++) {
        const p = (y * strip.width + x) * 4, al = strip.data[p + 3] / 255, o = ((top + y) * out.width + x) * 4;
        if (al) for (let c = 0; c < 3; c++) out.data[o + c] = strip.data[p + c] * al + out.data[o + c] * (1 - al);
      }
      r.cells.forEach((_, n) => { drawNumber(out, ri + 1, n * W + 4, top + 4, 5, [140, 200, 255]); drawNumber(out, n + 1, n * W + 4 + 20 * String(ri + 1).length + 12, top + 4, 5); });
      console.log(`row ${ri + 1} = ${r.name} (${r.cells.length} drawings)`);
    });
    fs.writeFileSync(`${pre}${move}-versions.png`, encodePng(out));
    console.log(`${pre}${move}-versions.png  (blue number = the row / version, yellow = the drawing number to put in "frame")`);
    return;
  }

  const move = args[1], manPath = `data/assembly/${id}_${move}.json`;
  const raw = JSON.parse(fs.readFileSync(manPath, 'utf8'));
  const man = Array.isArray(raw) ? { drawings: raw } : raw;
  const ref = refOf(move), cache = new Map();
  const cells = man.drawings.map((d, i) => {
    if (!cache.has(d.sheet)) cache.set(d.sheet, sourceCells(dir, d.sheet, known, ref));
    const c = cache.get(d.sheet)[d.frame - 1];
    if (!c) throw new Error(`drawing ${i + 1}: ${d.sheet} has no drawing ${d.frame} (it has ${cache.get(d.sheet).length}; they count from 1)`);
    return c;
  });
  const { png, clipped } = layStrip(cells, ref.cell);
  const to = `${dir}sheets/${move}-assembled.png`;
  if (known.has(`sheets/${move}-assembled.png`) && !args.includes('--force')) throw new Error(`${to} is already used by the character file: run again with --force to rebuild it`);
  fs.writeFileSync(to, encodePng(png));
  const holds = man.holds ?? (ref.move.sprite.holds?.length === cells.length ? ref.move.sprite.holds : null);
  gif(`${pre}${move}.gif`, png, ref.cell, cells.length, holds);
  const sprite = { image: `sheets/${move}-assembled.png`, columns: cells.length, rows: 1, count: cells.length, frameW: ref.cell.frameW, frameH: ref.cell.frameH, originX: ref.cell.originX, originY: ref.cell.originY, scale: ref.scale, ...(holds ? { holds } : {}) };
  console.log(`${to}: ${cells.length} drawings${clipped ? ` (${clipped} pixels fell outside the cell and were cut)` : ''}; preview ${pre}${move}.gif`);
  console.log(`"sprite": ${JSON.stringify(sprite)}`);
  if (!holds) console.log(`The move's holds list has ${ref.move.sprite.holds?.length ?? 0} entries and this sheet ${cells.length} drawings: give "holds" (they must add up to the move's length).`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
