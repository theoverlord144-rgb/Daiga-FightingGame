// The sprite cleanup pass:  node scripts/sprite-clean.mjs <character> [--only idle,5H] [--palette] [--thicken]
//
// Takes every BODY sheet of a character (the sheets its states, moves and art rules draw him with; never effect,
// projectile or lantern sheets) from data/characters/<id>/sheets/ and writes a cleaned copy to
// data/characters/<id>/sheets-clean/. The originals are never written to. The game draws the cleaned sheet when one
// exists and the "clean sprites" switch is on, else the original.
//
//   data/palettes/<id>.json                    the character's colours, named, editable by hand (made on the first run
//                                              from the turnaround, or the base sprite when there is no turnaround;
//                                              --palette makes it again). "extra": colours of painted smears and
//                                              lights that are not on the turnaround. "head": the colours whose
//                                              biggest patch is measured as the head. "skip": sheets, or
//                                              { sheet: [drawings] }, left exactly as they are.
//   data/characters/<id>/previews/palette.png  the swatches
//   data/characters/<id>/sheets-clean/<sheet>.png + manifest.json (the sprite block of each cleaned sheet) + report.json
//   data/characters/<id>/previews/clean/<sheet>-compare.png   one drawing, original | cleaned, at 2x game size
//   data/characters/<id>/previews/clean/<sheet>.gif           the cleaned drawings played with their holds
//
// Per drawing, in this order: same scale (the head measured against the idle's; scale: "frame" | "sheet" | "off" in
// the palette file) -> at sheet size (2x the game's): palette lock, fringe removal, stray pixels, one outline colour,
// optional outline thickening -> one sharp shrink to game size, which leaves a 1 px soft rim. The cell keeps its place:
// the fighter's point (feet, or body centre in the air) is where it was, so effects and boxes still line up.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { decodePng, encodePng } from './png.mjs';

// ---------- colour ----------
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
/** sRGB 0..255 -> OKLab (a perceptual space: equal distances look equally different). */
export function oklab(r, g, b) {
  const R = lin(r), G = lin(g), B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
export const hexRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgbHex = (r, g, b) => `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
const dist2 = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;

/** A palette ready for matching: { rgb: [[r,g,b]], lab, names, outline (index), nearest(r,g,b) -> [index, distance] }. */
export function makePalette(file) {
  const all = [...file.colors, ...(file.extra ?? [])];
  const rgb = all.map((c) => hexRgb(c.hex)), lab = rgb.map((c) => oklab(...c));
  const names = all.map((c) => c.name);
  const outline = Math.max(0, names.indexOf(file.outline ?? 'outline'));
  const cache = new Map();
  const nearest = (r, g, b) => {
    const key = (r << 16) | (g << 8) | b;
    let hit = cache.get(key);
    if (!hit) {
      const p = oklab(r, g, b);
      let best = 0, bd = Infinity;
      for (let i = 0; i < lab.length; i++) { const d = dist2(p, lab[i]); if (d < bd) { bd = d; best = i; } }
      hit = [best, Math.sqrt(bd)];
      cache.set(key, hit);
    }
    return hit;
  };
  return { rgb, lab, names, outline, nearest, head: (file.head ?? []).map((n) => names.indexOf(n)).filter((i) => i >= 0) };
}

// ---------- palette extraction ----------
const magentaness = (r, g, b) => Math.min(r, b) - g;
function nameOf(L, a, b) {
  const C = Math.hypot(a, b), h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  const tone = L < 0.3 ? 'dark' : L < 0.55 ? 'mid' : L < 0.8 ? 'light' : 'pale';
  if (C < 0.03) return L < 0.22 ? 'black' : L > 0.9 ? 'white' : `${tone}-grey`;
  const hue = h < 15 ? 'rose' : h < 38 ? 'red' : h < 85 ? (C < 0.05 && L > 0.75 ? 'cream' : L < 0.62 ? 'brown' : C > 0.11 ? 'orange' : 'tan') : h < 115 ? (C < 0.07 ? 'cream' : 'gold') : h < 160 ? 'green' : h < 215 ? 'teal' : h < 265 ? 'blue' : h < 300 ? 'indigo' : h < 340 ? 'purple' : 'rose';
  return `${tone}-${hue}`;
}
/** k-means in OKLab over [r, g, b] samples; deterministic (farthest-point start). Returns [{ rgb, n }] by size. */
export function cluster(samples, k) {
  if (!samples.length) return [];
  const labs = samples.map((s) => oklab(...s));
  const cents = [labs[0].slice()];
  const far = new Float64Array(labs.length).fill(Infinity);
  while (cents.length < Math.min(k, labs.length)) {
    let best = 0;
    for (let i = 0; i < labs.length; i++) { far[i] = Math.min(far[i], dist2(labs[i], cents[cents.length - 1])); if (far[i] > far[best]) best = i; }
    if (far[best] < 1e-6) break;
    cents.push(labs[best].slice());
  }
  const own = new Int32Array(labs.length);
  for (let it = 0; it < 24; it++) {
    const sum = cents.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < labs.length; i++) {
      let b = 0, bd = Infinity;
      for (let c = 0; c < cents.length; c++) { const d = dist2(labs[i], cents[c]); if (d < bd) { bd = d; b = c; } }
      own[i] = b; const s = sum[b]; s[0] += labs[i][0]; s[1] += labs[i][1]; s[2] += labs[i][2]; s[3]++;
    }
    sum.forEach((s, c) => { if (s[3]) cents[c] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
  }
  // Each cluster's colour: the real sample nearest its centre (a colour that is actually in the art, not a blend).
  const out = cents.map(() => ({ rgb: null, n: 0, d: Infinity }));
  for (let i = 0; i < labs.length; i++) { const o = out[own[i]]; o.n++; const d = dist2(labs[i], cents[own[i]]); if (d < o.d) { o.d = d; o.rgb = samples[i]; } }
  return out.filter((o) => o.n).sort((p, q) => q.n - p.n);
}
/** Flat-coloured pixels of a picture (not edge blends), background keyed out: [[r, g, b]], thinned to at most `max`. */
function flatSamples(img, max, opaque) {
  const { width: W, height: H, data } = img, out = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const p = (y * W + x) * 4;
    if (!opaque(data, p)) continue;
    let flat = true;
    for (const q of [p - 4, p + 4, p - W * 4, p + W * 4]) if (!opaque(data, q) || Math.abs(data[q] - data[p]) + Math.abs(data[q + 1] - data[p + 1]) + Math.abs(data[q + 2] - data[p + 2]) > 18) { flat = false; break; }
    if (flat) out.push([data[p], data[p + 1], data[p + 2]]);
  }
  const step = Math.max(1, Math.floor(out.length / max));
  return out.filter((_, i) => i % step === 0);
}
export function extractPalette(img, k = 20) {
  const found = cluster(flatSamples(img, 60000, (d, p) => d[p + 3] > 200 && magentaness(d[p], d[p + 1], d[p + 2]) < 90), k);
  // Merge near-twins, keep 12 to 20.
  const kept = [];
  for (const c of found) { const l = oklab(...c.rgb); if (!kept.some((o) => dist2(o.lab, l) < 0.03 ** 2 || (o.lab[0] < 0.2 && l[0] < 0.2))) kept.push({ ...c, lab: l }); }
  kept.sort((p, q) => p.lab[0] - q.lab[0]);
  const used = new Map();
  return kept.slice(0, 20).map((c, i) => {
    let name = i === 0 ? 'outline' : nameOf(...c.lab);
    const n = (used.get(name) ?? 0) + 1; used.set(name, n);
    if (n > 1) name += `-${n}`;
    return { name, hex: rgbHex(...c.rgb) };
  });
}

// ---------- one drawing ----------
/** Biggest connected patch of the head colours: its size as a length (sqrt of its area), 0 if none. */
export function headSize(idx, a, w, h, headSet) {
  const seen = new Uint8Array(w * h), stack = [];
  let best = 0;
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || a[s] < 0.5 || !headSet.has(idx[s])) continue;
    let n = 0; stack.push(s); seen[s] = 1;
    while (stack.length) {
      const i = stack.pop(); n++;
      const x = i % w, y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx;
        if (!seen[j] && a[j] >= 0.5 && headSet.has(idx[j])) { seen[j] = 1; stack.push(j); }
      }
    }
    if (n > best) best = n;
  }
  return Math.sqrt(best);
}
/** Scale a cell by s about (cx, cy), bilinear on premultiplied colour. Returns { a, rgb, clipped }. */
export function scaleCell(a, rgb, w, h, s, cx, cy) {
  const na = new Float32Array(w * h), nc = new Float32Array(w * h * 3);
  let clipped = false;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = cx + (x + 0.5 - cx) / s - 0.5, sy = cy + (y + 0.5 - cy) / s - 0.5;
    const ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy;
    let A = 0, R = 0, G = 0, B = 0;
    for (const [xx, yy, wt] of [[ix, iy, (1 - fx) * (1 - fy)], [ix + 1, iy, fx * (1 - fy)], [ix, iy + 1, (1 - fx) * fy], [ix + 1, iy + 1, fx * fy]]) {
      if (xx < 0 || yy < 0 || xx >= w || yy >= h || wt <= 0) continue;
      const k = yy * w + xx, wa = a[k] * wt;
      A += wa; R += rgb[k * 3] * wa; G += rgb[k * 3 + 1] * wa; B += rgb[k * 3 + 2] * wa;
    }
    const o = y * w + x;
    na[o] = A;
    if (A > 0) { nc[o * 3] = R / A; nc[o * 3 + 1] = G / A; nc[o * 3 + 2] = B / A; }
    if (A > 0.5 && (x === 0 || y === 0 || x === w - 1)) clipped = true;
  }
  return { a: na, rgb: nc, clipped };
}
/**
 * The lock: every pixel at least half opaque becomes fully opaque in its nearest palette colour (idx), the rest go
 * clear (-1). Then, in this order: fringe (edge pixels pinker than anything in the palette, or far from every palette
 * colour, or a bright rim outside a dark outline) takes the colour of the drawing just inside it; single stray pixels
 * inside a colour region take their neighbours' colour (outline pixels are never removed and never spread);
 * optionally thin outline is thickened. Returns { idx (Int16Array), changed (share of pixels whose colour moved
 * visibly), fringe, strays }.
 */
export function lockCell(a, rgb, w, h, pal, { thicken = 0, changedAt = 0.06, smooth = 0.07, island = 6 } = {}) {
  const N = w * h, idx = new Int16Array(N).fill(-1), far = new Uint8Array(N);
  let opaque = 0, changed = 0;
  // The colour is chosen from a smoothed copy: each pixel averaged with the pixels around it (5 x 5) that are nearly
  // its own shade. Painted shading then splits along one clean line instead of speckling; an outline, an eye or a
  // glint is a different shade from what is around it, so it is not blended away.
  const lab = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) if (a[i] >= 0.5) { const c = oklab(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]); lab[i * 3] = c[0]; lab[i * 3 + 1] = c[1]; lab[i * 3 + 2] = c[2]; }
  const NEAR = smooth * smooth;
  for (let i = 0; i < N; i++) {
    if (a[i] < 0.5) continue;
    const r = Math.round(rgb[i * 3]), g = Math.round(rgb[i * 3 + 1]), b = Math.round(rgb[i * 3 + 2]);
    let sr = r, sg = g, sb = b;
    if (smooth > 0) {
      const x = i % w, y = (i - x) / w, L0 = lab[i * 3], A0 = lab[i * 3 + 1], B0 = lab[i * 3 + 2];
      let n = 0; sr = sg = sb = 0;
      for (let dy = -2; dy <= 2; dy++) { const yy = y + dy; if (yy < 0 || yy >= h) continue;
        for (let dx = -2; dx <= 2; dx++) { const xx = x + dx; if (xx < 0 || xx >= w) continue;
          const j = yy * w + xx; if (a[j] < 0.5) continue;
          const dL = lab[j * 3] - L0, dA = lab[j * 3 + 1] - A0, dB = lab[j * 3 + 2] - B0;
          if (dL * dL + dA * dA + dB * dB > NEAR) continue;
          sr += rgb[j * 3]; sg += rgb[j * 3 + 1]; sb += rgb[j * 3 + 2]; n++; } }
      sr = Math.round(sr / n); sg = Math.round(sg / n); sb = Math.round(sb / n);
    }
    const k = pal.nearest(sr, sg, sb)[0];
    const pk = pal.lab[k], d = Math.hypot(pk[0] - lab[i * 3], pk[1] - lab[i * 3 + 1], pk[2] - lab[i * 3 + 2]);
    idx[i] = k; opaque++;
    if (d > changedAt) changed++;
    const pc = pal.rgb[k];
    if (d > 0.12 || (magentaness(r, g, b) > 24 && magentaness(...pc) < magentaness(r, g, b) - 16)) far[i] = 1;
  }
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : idx[y * w + x]);
  // Edge band: within 2 px of clear.
  const band = new Uint8Array(N);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (idx[y * w + x] < 0) continue;
    search: for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (at(x + dx, y + dy) < 0) { band[y * w + x] = 1; break search; }
  }
  let fringe = 0;
  const fix = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!band[i]) continue;
    let touchesClear = false, dark = 0, solid = 0;
    const votes = new Map();
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const v = at(x + dx, y + dy);
      if (v < 0) { if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) touchesClear = true; continue; }
      const j = (y + dy) * w + x + dx;
      if (j === i || far[j]) continue;
      solid++; if (v === pal.outline) dark++;
      votes.set(v, (votes.get(v) ?? 0) + 1);
    }
    const rim = touchesClear && idx[i] !== pal.outline && solid > 0 && dark / solid > 0.6 && pal.lab[idx[i]][0] > 0.6;
    if (!far[i] && !rim) continue;
    let to = -1, n = 0;
    if (dark > 0) to = pal.outline; else for (const [v, c] of votes) if (c > n) { n = c; to = v; }
    fix.push([i, to]); fringe++;
  }
  for (const [i, to] of fix) idx[i] = to;
  // Small islands: a patch of up to `island` pixels of one colour, sitting in a colour close to its own, joins that
  // colour (speckle left by shading). A patch that stands out from what is around it (an eye, a freckle, a glint, an
  // earring) is a detail and stays; outline pixels are never removed and never spread.
  let strays = 0;
  const seen = new Uint8Array(N), stack = [], patch = [];
  for (let s0 = 0; s0 < N; s0++) {
    const v = idx[s0];
    if (seen[s0] || v < 0 || v === pal.outline) continue;
    stack.length = 0; patch.length = 0; stack.push(s0); seen[s0] = 1;
    const votes = new Map();
    let big = false, clear = false;
    while (stack.length) {
      const i = stack.pop(), x = i % w, y = (i - x) / w;
      if (patch.length <= island) patch.push(i); else big = true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx, u = idx[j];
        if (u === v) { if (!seen[j]) { seen[j] = 1; stack.push(j); } } else if (u < 0) clear = true; else if (u !== pal.outline && !big) votes.set(u, (votes.get(u) ?? 0) + 1);
      }
    }
    if (big || clear) continue;
    let to = -1, n = 0;
    for (const [u, c] of votes) if (c > n) { n = c; to = u; }
    if (to < 0) continue;
    const p = pal.lab[v], q = pal.lab[to];
    if (Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) > 0.14) continue;
    for (const i of patch) idx[i] = to;
    strays += patch.length;
  }
  // Thickening (off unless asked): outline thinner than `thicken` px grows one pixel into the drawing.
  if (thicken > 0) {
    const grow = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (idx[i] !== pal.outline) continue;
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        let run = 1;
        for (let s = 1; s < thicken && at(x + dx * s, y + dy * s) === pal.outline; s++) run++;
        for (let s = 1; s < thicken && at(x - dx * s, y - dy * s) === pal.outline; s++) run++;
        if (run >= thicken) continue;
        const j = i + dy * w + dx;
        if (idx[j] >= 0 && idx[j] !== pal.outline) grow.push(j);
      }
    }
    for (const j of grow) idx[j] = pal.outline;
  }
  return { idx, changed: opaque ? changed / opaque : 0, fringe, strays, opaque };
}
/**
 * The one shrink: an indexed cell (sheet size) down by `k` to game size, each game pixel the average of the k x k
 * sheet pixels it covers (so the edge keeps a 1 px soft rim and no halo: clear pixels add no colour), offset so the
 * fighter's point lands exactly on a pixel. Inner pixels are then sharpened a little.
 */
export function shrinkCell(idx, w, h, pal, k, ox, oy) {
  const px0 = (k - (ox % k)) % k, py0 = (k - (oy % k)) % k;
  const ow = Math.ceil((w + px0) / k), oh = Math.ceil((h + py0) / k);
  const out = new Float32Array(ow * oh * 4);
  for (let Y = 0; Y < oh; Y++) for (let X = 0; X < ow; X++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) {
      const x = X * k - px0 + i, y = Y * k - py0 + j;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const v = idx[y * w + x];
      if (v < 0) continue;
      const c = pal.rgb[v]; r += c[0]; g += c[1]; b += c[2]; n++;
    }
    const o = (Y * ow + X) * 4;
    if (n) { out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = n / (k * k); }
  }
  const data = new Uint8Array(ow * oh * 4);
  for (let Y = 0; Y < oh; Y++) for (let X = 0; X < ow; X++) {
    const o = (Y * ow + X) * 4;
    if (out[o + 3] <= 0) continue;
    let c = [out[o], out[o + 1], out[o + 2]];
    if (k > 1 && out[o + 3] >= 1 && X > 0 && Y > 0 && X < ow - 1 && Y < oh - 1) {
      let r = 0, g = 0, b = 0, n = 0;
      for (const q of [o - 4, o + 4, o - ow * 4, o + ow * 4]) if (out[q + 3] >= 1) { r += out[q]; g += out[q + 1]; b += out[q + 2]; n++; }
      if (n === 4) c = [c[0] + 0.25 * (c[0] - r / 4), c[1] + 0.25 * (c[1] - g / 4), c[2] + 0.25 * (c[2] - b / 4)];
    }
    for (let ch = 0; ch < 3; ch++) data[o + ch] = Math.max(0, Math.min(255, Math.round(c[ch])));
    data[o + 3] = Math.round(out[o + 3] * 255);
  }
  return { data, width: ow, height: oh, originX: (ox + px0) / k, originY: (oy + py0) / k };
}

/**
 * Clean every drawing of one sheet. img: decoded PNG; sheet: its sprite block; opts: { pal, target (head size to
 * match, or 0), scaleMode, deadband, skipFrames, thicken }. Returns { png, sprite, frames: [per-drawing report] }.
 */
export function cleanSheet(img, sheet, opts) {
  const { pal } = opts;
  const cols = sheet.columns ?? 1, count = sheet.count ?? cols * (sheet.rows ?? 1);
  const fw = sheet.frameW ?? img.width / cols, fh = sheet.frameH ?? img.height / (sheet.rows ?? 1);
  const k = Math.max(1, Math.round(1 / (sheet.scale ?? 1)));
  const ox = sheet.originX ?? Math.round(fw / 2), oy = sheet.originY ?? fh;
  const headSet = new Set(pal.head);
  const cells = [];
  for (let n = 0; n < count; n++) {
    const sx = (n % cols) * fw, sy = Math.floor(n / cols) * fh;
    const a = new Float32Array(fw * fh), rgb = new Float32Array(fw * fh * 3);
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      const p = ((sy + y) * img.width + sx + x) * 4, o = y * fw + x;
      a[o] = img.data[p + 3] / 255; rgb[o * 3] = img.data[p]; rgb[o * 3 + 1] = img.data[p + 1]; rgb[o * 3 + 2] = img.data[p + 2];
    }
    const first = lockCell(a, rgb, fw, fh, pal);
    cells.push({ a, rgb, head: headSet.size ? headSize(first.idx, a, fw, fh, headSet) : 0 });
  }
  const heads = cells.map((c) => c.head).filter((v) => v > 0).sort((p, q) => p - q);
  const median = heads.length ? heads[heads.length >> 1] : 0;
  const frames = [], outs = [];
  cells.forEach((c, n) => {
    const rep = { head: +c.head.toFixed(1), scale: 1, flagged: false, skipped: !!opts.skipFrames?.includes(n) };
    let { a, rgb } = c;
    const mode = opts.scaleMode ?? 'off';
    if (opts.target && mode !== 'off' && !rep.skipped) {
      const measure = mode === 'sheet' ? median : c.head;
      if (c.head > 0 && median > 0) rep.flagged = Math.abs(c.head / opts.target - 1) > 0.1;
      const s = measure > 0 ? opts.target / measure : 1;
      // A measure wildly off is a head that could not be found (hidden, turned away): never scaled on that.
      if (Math.abs(s - 1) > (opts.deadband ?? 0.03) && s > 0.8 && s < 1.25) {
        // Ground drawings grow from the feet; drawings with the fighter's point inside the cell from their own centre.
        let cx = ox, cy = oy;
        if (oy < fh - 4) {
          let x0 = fw, x1 = 0, y0 = fh, y1 = 0;
          for (let i = 0; i < fw * fh; i++) if (a[i] >= 0.5) { const x = i % fw, y = (i - x) / fw; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
          cx = (x0 + x1 + 1) / 2; cy = (y0 + y1 + 1) / 2;
        }
        const sc = scaleCell(a, rgb, fw, fh, s, cx, cy);
        a = sc.a; rgb = sc.rgb; rep.scale = +s.toFixed(4); rep.clipped = sc.clipped;
      }
    }
    const L = lockCell(a, rgb, fw, fh, pal, { thicken: opts.thicken ?? 0 });
    rep.changed = +L.changed.toFixed(4); rep.fringe = L.fringe; rep.strays = L.strays; rep.pixels = L.opaque;
    outs.push(shrinkCell(L.idx, fw, fh, pal, k, ox, oy));
    frames.push(rep);
  });
  const cw = outs[0].width, ch = outs[0].height;
  const data = new Uint8Array(cw * count * ch * 4);
  outs.forEach((o, n) => { for (let y = 0; y < ch; y++) data.set(o.data.subarray(y * cw * 4, (y + 1) * cw * 4), (y * cw * count + n * cw) * 4); });
  const sprite = { columns: count, rows: 1, count, frameW: cw, frameH: ch, originX: outs[0].originX, originY: outs[0].originY, scale: (sheet.scale ?? 1) * k };
  return { png: { width: cw * count, height: ch, data }, sprite, frames, median };
}

// ---------- a character ----------
/** Every body sheet a character file draws its fighter with: Map(image -> { sheet (sprite block), holds }). */
export function bodySheets(file) {
  const out = new Map();
  const add = (s, holds) => { if (s?.image && !s.additive && !out.has(s.image)) out.set(s.image, { sheet: s, holds: holds ?? s.holds ?? null }); };
  for (const m of file.moves ?? []) { add(m.sprite); add(m.ex?.sprite); }
  for (const st of Object.values(file.states ?? {})) add(st.sprite);
  for (const r of file.art?.exit ?? []) add(r.sprite, r.holds);
  for (const g of Object.values(file.art?.guard ?? {})) add(g?.sprite);
  for (const t of Object.values(file.art?.throws ?? {})) for (const part of Object.values(t)) add(part.sprite, part.holds);
  return out;
}
const findSource = (dir) => {
  const names = fs.readdirSync(dir).filter((n) => !/install|guardian/i.test(n));
  return names.find((n) => /turnaround/i.test(n)) ?? names.find((n) => /basesprite/i.test(n)) ?? null;
};

function swatch(file, to) {
  const all = [...file.colors, ...(file.extra ?? [])], S = 48, W = all.length * S, H = S + 10;
  const data = new Uint8Array(W * H * 4).fill(255);
  all.forEach((c, i) => {
    const [r, g, b] = hexRgb(c.hex), extra = i >= file.colors.length;
    for (let y = 0; y < H; y++) for (let x = 0; x < S; x++) {
      const o = (y * W + i * S + x) * 4, edge = x === 0 || y >= S;
      data[o] = edge ? (extra && y >= S ? 255 : 30) : r; data[o + 1] = edge ? (extra && y >= S ? 200 : 30) : g; data[o + 2] = edge ? 30 : b;
    }
  });
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, encodePng({ width: W, height: H, data }));
}

function main() {
  const args = process.argv.slice(2);
  const id = args.find((a) => !a.startsWith('--'));
  const optv = (n) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : null);
  if (!id) { console.error('usage: node scripts/sprite-clean.mjs <character> [--only a,b] [--palette] [--thicken]'); process.exit(1); }
  const DIR = `data/characters/${id}/`, OUT = `${DIR}sheets-clean/`, PRE = `${DIR}previews/clean/`;
  const file = JSON.parse(fs.readFileSync(`${DIR}${id}.toska.json`, 'utf8'));
  const sheets = bodySheets(file);
  const only = optv('only')?.split(',').map((n) => `sheets/${n}.png`) ?? null;
  const load = (image) => decodePng(fs.readFileSync(DIR + image));

  // The palette file: made once, then yours to edit.
  const palPath = `data/palettes/${id}.json`;
  if (!fs.existsSync(palPath) || args.includes('--palette')) {
    const src = findSource(DIR);
    if (!src) throw new Error(`no turnaround or base sprite in ${DIR}`);
    const colors = extractPalette(decodePng(fs.readFileSync(DIR + src)));
    // Extra colours: what the body sheets hold that is far from every turnaround colour (smears, lights, glints).
    const base = makePalette({ colors });
    const odd = [];
    for (const [image] of sheets) {
      if (!fs.existsSync(DIR + image)) continue;
      for (const s of flatSamples(load(image), 4000, (d, p) => d[p + 3] > 240)) if (base.nearest(...s)[1] > 0.05 && oklab(...s)[0] > 0.2) odd.push(s);
    }
    const extra = cluster(odd, 12).filter((c) => c.n >= Math.max(40, odd.length * 0.015)).map((c, i) => ({ name: `extra-${i + 1}-${nameOf(...oklab(...c.rgb))}`, hex: rgbHex(...c.rgb) }));
    const old = fs.existsSync(palPath) ? JSON.parse(fs.readFileSync(palPath, 'utf8')) : {};
    const made = { notes: 'Colours for scripts/sprite-clean.mjs. Rename and edit freely; --palette makes the colours again (head, scale, skip and options are kept).', source: src, outline: 'outline', colors, extra, head: old.head ?? [], scale: old.scale ?? 'off', deadband: old.deadband ?? 0.03, thicken: old.thicken ?? 0, skip: old.skip ?? {} };
    fs.mkdirSync('data/palettes', { recursive: true });
    fs.writeFileSync(palPath, `${JSON.stringify(made, null, 1)}\n`);
    console.log(`palette: ${colors.length} colours from ${src}, ${extra.length} extra -> ${palPath}`);
  }
  const palFile = JSON.parse(fs.readFileSync(palPath, 'utf8'));
  swatch(palFile, `${DIR}previews/palette.png`);
  const pal = makePalette(palFile);
  const thicken = args.includes('--thicken') ? palFile.thicken || 3 : palFile.thicken ?? 0;

  // The head to match: the idle's.
  const idle = file.moves.find((m) => m.id === 'idle')?.sprite;
  let target = 0;
  if (idle && pal.head.length) target = cleanSheet(load(idle.image), idle, { pal }).median;

  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(PRE, { recursive: true });
  const manPath = `${OUT}manifest.json`, repPath = `${OUT}report.json`;
  const manifest = fs.existsSync(manPath) ? JSON.parse(fs.readFileSync(manPath, 'utf8')) : {};
  const report = fs.existsSync(repPath) ? JSON.parse(fs.readFileSync(repPath, 'utf8')) : {};
  let ff = true;
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch { ff = false; }
  for (const [image, { sheet, holds }] of sheets) {
    if (only && !only.includes(image)) continue;
    if (!fs.existsSync(DIR + image)) { console.log(`${image}: not there (skipped)`); continue; }
    const name = path.basename(image, '.png');
    const skip = palFile.skip?.[name];
    if (skip === true) { delete manifest[image]; delete report[image]; fs.rmSync(`${OUT}${name}.png`, { force: true }); console.log(`${name}: skipped (palette file)`); continue; }
    const img = load(image);
    const res = cleanSheet(img, sheet, { pal, target, scaleMode: palFile.scale, deadband: palFile.deadband, skipFrames: Array.isArray(skip) ? skip : [], thicken });
    fs.writeFileSync(`${OUT}${name}.png`, encodePng(res.png));
    manifest[image] = { ...res.sprite, image: `sheets-clean/${name}.png`, ...(Array.isArray(skip) && skip.length ? { skipFrames: skip } : {}) };
    report[image] = { head: +res.median.toFixed(1), target: +target.toFixed(1), frames: res.frames };
    // Before | after: the drawing the lock changed most, at 2x game size.
    const worst = res.frames.reduce((b, f, i) => (f.changed > res.frames[b].changed ? i : b), 0);
    const fw = sheet.frameW ?? img.width / sheet.columns, fh = sheet.frameH ?? img.height / (sheet.rows ?? 1);
    const z = 2, cw = res.sprite.frameW, ch = res.sprite.frameH, kk = Math.max(1, Math.round(1 / (sheet.scale ?? 1))), lw = Math.floor(fw / kk), lh = Math.floor(fh / kk), PW = lw * z + cw * z + 12, PH = Math.max(lh, ch) * z + 8;
    const cmp = new Uint8Array(PW * PH * 4);
    for (let i = 0; i < PW * PH; i++) { const v = (((i % PW) >> 4) + (Math.floor(i / PW) >> 4)) & 1 ? 96 : 122; cmp[i * 4] = cmp[i * 4 + 1] = cmp[i * 4 + 2] = v; cmp[i * 4 + 3] = 255; }
    const put = (o, r, g, b, al) => { cmp[o] = r * al + cmp[o] * (1 - al); cmp[o + 1] = g * al + cmp[o + 1] * (1 - al); cmp[o + 2] = b * al + cmp[o + 2] * (1 - al); };
    const sx0 = (worst % sheet.columns) * fw, sy0 = Math.floor(worst / sheet.columns) * fh;
    // Left: the original brought to game size the plain way (as the screen does), then zoomed like the cleaned one.
    for (let y = 0; y < lh * z; y++) for (let x = 0; x < lw * z; x++) {
      let r = 0, g = 0, b = 0, al = 0;
      for (let v = 0; v < kk; v++) for (let u = 0; u < kk; u++) { const p = ((sy0 + Math.floor(y / z) * kk + v) * img.width + sx0 + Math.floor(x / z) * kk + u) * 4, q = img.data[p + 3] / 255; r += img.data[p] * q; g += img.data[p + 1] * q; b += img.data[p + 2] * q; al += q; }
      if (al > 0) put(((y + 4) * PW + 4 + x) * 4, r / al, g / al, b / al, al / (kk * kk));
    }
    for (let y = 0; y < ch * z; y++) for (let x = 0; x < cw * z; x++) { const p = (Math.floor(y / z) * res.png.width + worst * cw + Math.floor(x / z)) * 4; put(((y + 4) * PW + lw * z + 8 + x) * 4, res.png.data[p], res.png.data[p + 1], res.png.data[p + 2], res.png.data[p + 3] / 255); }
    fs.writeFileSync(`${PRE}${name}-compare.png`, encodePng({ width: PW, height: PH, data: cmp }));
    if (ff) {
      const tmp = `${PRE}.tmp-${name}/`;
      fs.mkdirSync(tmp, { recursive: true });
      const ew = (cw + 1) & ~1, eh = (ch + 1) & ~1;
      let list = '';
      for (let n = 0; n < res.sprite.count; n++) {
        const one = new Uint8Array(ew * eh * 4);
        for (let y = 0; y < eh; y++) for (let x = 0; x < ew; x++) {
          const q = (y * ew + x) * 4, inside = x < cw && y < ch, p = (y * res.png.width + n * cw + x) * 4, al = inside ? res.png.data[p + 3] / 255 : 0;
          for (let c = 0; c < 3; c++) one[q + c] = (inside ? res.png.data[p + c] : 0) * al + [112, 116, 124][c] * (1 - al);
          one[q + 3] = 255;
        }
        fs.writeFileSync(`${tmp}${n}.png`, encodePng({ width: ew, height: eh, data: one }));
        const hold = holds?.length === res.sprite.count ? holds[n] : 6;
        list += `file '${n}.png'\nduration ${(Math.min(hold, 40) / 60).toFixed(4)}\n`;
      }
      list += `file '${res.sprite.count - 1}.png'\n`;
      fs.writeFileSync(`${tmp}list.txt`, list);
      try { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-i', `${tmp}list.txt`, '-vf', 'scale=iw*2:ih*2:flags=neighbor,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=none', '-loop', '0', `${PRE}${name}.gif`]); } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
    }
    const ch25 = res.frames.filter((f) => f.changed > 0.25).length, fl = res.frames.filter((f) => f.flagged).length;
    console.log(`${name.padEnd(26)} ${String(res.sprite.count).padStart(2)} drawings  changed ${res.frames.map((f) => Math.round(f.changed * 100)).join(' ')}%${ch25 ? `  (${ch25} over 25%)` : ''}${fl ? `  head off >10%: ${res.frames.map((f, i) => (f.flagged ? i + 1 : 0)).filter(Boolean).join(',')}` : ''}`);
  }
  fs.writeFileSync(manPath, `${JSON.stringify(manifest, null, 1)}\n`);
  fs.writeFileSync(repPath, `${JSON.stringify(report, null, 1)}\n`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
