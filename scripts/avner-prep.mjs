// Avner (the Lampbearer): turns the drawn sheets (data/characters/avner/Avner_*.png) into game-ready sheets,
// previews and a manifest.
//
//   node scripts/avner-prep.mjs                 every sheet in the table below
//   node scripts/avner-prep.mjs --only 5H,jump  just those
//   node scripts/avner-prep.mjs --analyze       print what was found in each sheet, write nothing
//
// For every sheet it writes:
//   data/characters/avner/sheets/<name>.png          the sheet the game draws (2 sheet px per game px)
//   data/characters/avner/previews/<name>.png        a contact sheet: every drawing, the ground line and the anchor
//   data/characters/avner/previews/<name>.gif        the drawings played with their holds (needs ffmpeg)
//   data/characters/avner/sheets/manifest.json       the "sprite" block of every sheet, the holds, and where the
//                                                    lantern is in each drawing (for effects pinned to it)
//
// Body sheets come on magenta (not perfectly flat), on white, or already transparent. The background is removed
// with a soft edge and the magenta / pink tint is taken back out of the outline pixels. Drawings are split by
// connected shapes and read in rows, left to right. Ground drawings stand on one ground line; air drawings are
// lined up on the body's centre (the middle of head and torso). Every drawing of the character is brought to one
// body size, measured by the lantern (the one thing that is in every drawing).
//
// Effect sheets are light on black, drawn additive. Whatever is outside the effect (white, or see-through with a
// black blob around each drawing) becomes pure black first; brightness then becomes opacity.
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { decodePng, encodePng } from './png.mjs';

const DIR = 'data/characters/avner/';
const OUT = `${DIR}sheets/`;
const PREVIEWS = `${DIR}previews/`;
const RES = 2; // sheet px per game px
const STAND = 186; // game px: how tall he stands in his idle (the same body size as Malik)
const AIR_CENTRE = 92; // game px above the fighter's position where an air drawing's body centre sits

// name: the sheet's file name. file: the drawn sheet. n: drawings on it. rows: how many rows they are drawn in.
// ref: [drawing, game px]: a drawing whose height is known (a standing one is 186), which sets the sheet's size;
// without it the lantern's size does. fix: a last multiplier, set by eye.
// crop: [x0, y0, x1, y1] the part of the drawn sheet to read. lineFrom (a part): the drawings that stand on the ground
// (when most of the row is in the air). fx parts: use: [first, last] drawing.
// mode: ground | air | fx. anchor (ground): core = body centre, rear = the back foot. holds: game frames per
// drawing (also written into the character file). parts: several game sheets cut from one drawn sheet.
// fx sheets: anchor = centre | ground (bottom centre) | bright (the brightest point); size = game px of the
// largest drawing's longer side.
const SHEETS = [
  { name: 'idle', file: 'Avner_Idle.png', n: 6, holds: [8, 8, 8, 8, 8, 8], scaleRef: true },
  { ref: [1, 186], name: 'walk', file: 'Avner_Forward_Walk.png', n: 6, holds: [5, 5, 5, 5, 5, 5] },
  { ref: [1, 186], name: 'walk-back', file: 'Avner_Back_Walk.png', n: 6, holds: [6, 6, 6, 6, 6, 6] },
  { name: 'crouch', file: 'Avner_Crouch.png', n: 10, rows: 2, holds: [2, 3, 5, 6, 14, 10, 16, 10, 2, 2] },
  { file: 'Avner_Jump.png', n: 8, parts: [
    { name: 'jumpsquat', frames: [1], holds: [4] },
    { name: 'jump', frames: [2, 3, 4, 5, 6], mode: 'air', holds: [8, 8, 8, 8, 8] },
    { name: 'land', frames: [7, 8], holds: [5, 6] },
  ] },
  { ref: [6, 186], file: 'Avner_Forward_Dash.png', n: 6, parts: [
    { name: 'dash', frames: [1, 2, 3, 4], holds: [3, 3, 3, 3] },
    { name: 'dash-stop', frames: [5, 6], holds: [6, 4] },
  ] },
  { ref: [1, 186], file: 'Avner_Back_Dash.png', n: 5, parts: [
    { name: 'backdash', frames: [1, 2, 3], holds: [3, 5, 6] },
    { name: 'backdash-stop', frames: [4, 5], holds: [4, 4] },
  ] },
  { name: 'airdash', file: 'Avner_Forward_AirDash.png', n: 4, mode: 'air', holds: [3, 6, 6, 5] },
  { name: 'airdash-back', file: 'Avner_Back_AirDash.png', n: 4, mode: 'air', holds: [3, 6, 6, 5] },
  { ref: [1, 196], file: 'Avner_Blocks_And_Pushback.png', n: 6, rows: 3, parts: [
    { name: 'block-stand', frames: [1, 2], holds: [8, 8] },
    { name: 'block-crouch', frames: [3, 4], holds: [8, 8] },
    { name: 'block-air', frames: [5, 6], mode: 'air', holds: [8, 8] },
  ] },
  { ref: [1, 186], name: '5L', file: 'Avner_LightPunch.png', n: 5, anchor: 'rear', holds: [2, 2, 2, 4, 5] },
  { ref: [1, 186], name: '5M', file: 'Avner_MediumPunch.png', n: 6, anchor: 'rear', holds: [3, 4, 1, 3, 7, 7] },
  // 5H: row 1, plus row 2's fourth drawing (11) after drawing 4: it sits on the frame the hit lands, so it is the
  // drawing held through hitstop (owner, Nov 23). The rest of row 2 is not used. Its arc is drawn apart from the body
  // (shape 12), so it is joined on.
  { ref: [1, 186], file: 'Avner_HeavyPunch_SecondRowFourthFrameOnlyAfterFourthFrameOfFirstRow.png', n: 14, rows: 2, join: [[11, 12]], parts: [
    { name: '5H', frames: [1, 2, 3, 4, 11, 5, 6, 7], anchor: 'rear', holds: [3, 5, 4, 1, 1, 3, 8, 14] },
  ] },
  { ref: [1, 150], name: '2H', file: 'Avner_Crouching_HeavyPunch_Slide.png', n: 5, holds: [5, 6, 4, 10, 14] },
  { ref: [1, 186], name: '4H', file: 'Avner_Back_HeavyPunch.png', n: 7, holds: [2, 5, 5, 1, 5, 10, 12] },
  { ref: [1, 186], name: '5S', file: 'Avner_SLauncher.png', n: 7, anchor: 'rear', holds: [3, 6, 2, 5, 8, 8, 6] },
  { ref: [1, 150], name: '2M', file: 'Avner_Crouching_MediumPunch.png', n: 6, holds: [3, 4, 1, 3, 7, 8] },
  { name: 'jL', file: 'Avner_Air_LightPunch.png', n: 5, mode: 'air', holds: [3, 1, 3, 4, 6] },
  { name: 'jM', file: 'Avner_Air_MediumPunch.png', n: 6, mode: 'air', holds: [3, 4, 1, 3, 2, 14] },
  { name: 'jH', file: 'Avner_Air_HeavyPunch.png', n: 7, mode: 'air', holds: [3, 7, 1, 5, 6, 6, 6] },
  { name: 'jS', file: 'Avner_Air_S.png', n: 7, mode: 'air', holds: [3, 4, 5, 1, 5, 8, 10] },
  { ref: [1, 186], name: 'rising-moon', file: 'Avner_SpecialMove_RisingMoon.png', n: 7, anchor: 'rear', holds: [2, 6, 1, 4, 10, 6, 6] },
  { ref: [1, 186], name: 'lunar-halo', file: 'Avner_SpecialMove_LunarHalo.png', n: 7, holds: [2, 5, 1, 4, 12, 8, 6] },
  { ref: [1, 186], name: 'tide', file: 'Avner_SpecialMove_Tide.png', n: 8, rows: 2, holds: [2, 4, 4, 6, 3, 3, 4, 6] },
  { name: 'moon', file: 'Avner_SpecialMove_RisingMoon_Projectile.png', n: 10, rows: 2, mode: 'fx', anchor: 'ground', size: 230, holds: [3, 3, 2, 2, 3, 3, 4, 4, 4, 5] },
  { name: 'lantern-flare', file: 'Avner_SpecialMove_RisingMoon_Projectile_Effect1.png', n: 6, mode: 'fx', anchor: 'bright', size: 150, holds: [2, 2, 3, 4, 5, 6] },
  { name: 'halo-burst', file: 'Avner_SpecialMove_LunarHalo_Effect1.png', n: 10, rows: 2, mode: 'fx', anchor: 'centre', size: 300, cuts: [[320, 690, 1113, 1563], null], holds: [1, 2, 2, 3, 3, 4, 4, 4, 5, 6] },
  { name: 'tide-wave', file: 'Avner_SpecialMove_Tide_Effect1.png', n: 10, rows: 2, mode: 'fx', anchor: 'ground', size: 230, holds: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3] },
  // Rite: Moonlit. One row per version: R (in front), 6R (far), 2R (over himself), j.R (from the air).
  { ref: [4, 172], file: 'Avner_SpecialMove_Moonlit.png', n: 16, rows: 4, parts: [
    { name: 'moonlit-5', frames: [1, 2, 3, 4], holds: [4, 4, 10, 8] },
    { name: 'moonlit-6', frames: [5, 6, 7, 8], holds: [4, 4, 12, 8] },
    { name: 'moonlit-2', frames: [9, 10, 11, 12], holds: [4, 4, 10, 8] },
    { name: 'moonlit-j', frames: [13, 14, 15, 16], mode: 'air', holds: [4, 4, 10, 8] },
  ] },
  { ref: [1, 186], name: 'moon-snap', file: 'Avner_SpecialMove_Moonlit_Snap.png', n: 6, holds: [3, 4, 2, 5, 8, 6] },
  { name: 'crescent', file: 'Avner_SpecialMove_Moonlit_Effect.png', n: 10, rows: 2, mode: 'fx', anchor: 'ground', size: 330, holds: [3, 3, 4, 4, 8, 8, 8, 4, 4, 4] },
  { name: 'moonbeam', file: 'Avner_SpecialMove_Moonlit_Snap_Effect.png', n: 8, rows: 2, mode: 'fx', anchor: 'ground', size: 360, holds: [2, 2, 3, 4, 3, 3, 3, 4] },
  // Supers. New Moon's sheet has two rows of the same 15 drawings with timing numbers written under them: the top row is read.
  { ref: [1, 186], name: 'new-moon', file: 'Avner_SuperMove_NewMoon.png', n: 15, crop: [0, 150, 2687, 650], holds: [3, 3, 3, 3, 3, 3, 4, 3, 3, 4, 5, 5, 5, 5, 8] },
  { file: 'Avner_SuperMove_NewMoon_Effect.png', n: 10, rows: 2, mode: 'fx', parts: [
    { name: 'eclipse', use: [1, 5], anchor: 'centre', size: 300, holds: [4, 4, 4, 8, 8] },
    { name: 'moon-slash', use: [6, 10], anchor: 'centre', size: 240, holds: [2, 2, 3, 3, 4] },
  ] },
  // Hit reactions. Standing / crouching sheet: drawings 1-2 standing, 5-6 crouching (3-4 a gut hit and 7-8 a heavy
  // hit wait for per-strength reactions in the engine). Air sheet: 1-2 the hit, 3-5 the tumble, 6-7 down, 8-10 up.
  { ref: [2, 190], file: 'Avner_HitReaction_Standing_And_Crouching.png', n: 8, rows: 2, parts: [
    { name: 'hit-stand', frames: [1, 2], holds: [6, 1] },
    { name: 'hit-crouch', frames: [5, 6], holds: [6, 1] },
    { name: 'hit-stand-gut', frames: [3, 4], holds: [6, 1] },
    { name: 'hit-stand-heavy', frames: [7, 8], holds: [8, 1] },
  ] },
  { ref: [10, 186], file: 'Avner_HitReaction_Air_And_Wakeup.png', n: 10, rows: 2, parts: [
    { name: 'hit-air', frames: [1, 2], mode: 'air', holds: [5, 1] },
    { name: 'tumble', frames: [3, 4, 5], mode: 'air', holds: [8, 8, 8] },
    { name: 'knockdown', frames: [6, 7], holds: [6, 34] },
    { name: 'wakeup', frames: [8, 9, 10], holds: [4, 4, 4] },
  ] },
  // Universal systems.
  { ref: [2, 186], file: 'Avner_Vow_And_Absorb.png', n: 9, rows: 2, parts: [
    { name: 'vow-start', frames: [1, 2], holds: [2, 2] },
    { name: 'vow-hold', frames: [2, 3, 4, 5], holds: [9, 9, 9, 9] },
    { name: 'vow-absorb', frames: [6, 7, 8, 9], holds: [2, 5, 4, 3] },
  ] },
  { ref: [1, 186], file: 'Avner_Vow_Quick_Strike_Full.png', n: 15, rows: 3, parts: [
    { name: 'vow-quick', frames: [1, 2, 3, 4, 5], holds: [4, 4, 4, 4, 4] },
    { name: 'vow-strike', frames: [6, 7, 8, 9, 10], holds: [4, 4, 4, 4, 4] },
    { name: 'vow-full', frames: [11, 12, 13, 14, 15], holds: [4, 4, 4, 4, 4] },
  ] },
  { ref: [1, 190], name: 'crumple', file: 'Avner_Crumple.png', n: 6, holds: [5, 6, 7, 8, 9, 10] },
  { ref: [5, 180], file: 'Avner_Absolve_Recovery.png', n: 8, rows: 2, parts: [
    { name: 'absolve', frames: [1, 2, 3, 4, 5], lineFrom: [4, 5], holds: [4, 4, 4, 4, 4] },
    { name: 'absolve-recovery', frames: [6, 7, 8], holds: [14, 13, 13] },
  ] },
];

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const optv = (n) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : null);
const ONLY = optv('only')?.split(',') ?? null;
const ANALYZE = flag('analyze');

// ---------- Background ----------

/** Returns { W, H, a (0..1), rgb (straight colour) } with the background gone. */
function keyBody(img) {
  const { width: W, height: H, data } = img;
  const N = W * H;
  const a = new Float32Array(N);
  const rgb = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { rgb[i * 3] = data[i * 4]; rgb[i * 3 + 1] = data[i * 4 + 1]; rgb[i * 3 + 2] = data[i * 4 + 2]; a[i] = data[i * 4 + 3] / 255; }
  let seeThrough = 0;
  for (let i = 0; i < N; i += 97) if (a[i] < 0.02) seeThrough++;
  const transparent = seeThrough > N / 97 / 4;
  const corner = [data[0], data[1], data[2]];
  const white = !transparent && corner[0] > 235 && corner[1] > 235 && corner[2] > 235;
  const magentaness = (i) => Math.min(rgb[i * 3], rgb[i * 3 + 2]) - rgb[i * 3 + 1]; // high for magenta and pink
  let kind = 'transparent';
  if (transparent) {
    for (let i = 0; i < N; i++) if (a[i] < 0.06) a[i] = 0; // a faint haze left by the cut-out
  } else if (white) {
    kind = 'white';
    // White: only what is joined to the picture's edge through near-white is background (the scarf is white too).
    const isBg = (i) => rgb[i * 3] > 232 && rgb[i * 3 + 1] > 232 && rgb[i * 3 + 2] > 232;
    const bg = floodFromEdges(W, H, isBg);
    for (let i = 0; i < N; i++) if (bg[i]) a[i] = 0;
  } else {
    kind = 'magenta';
    // Magenta: the background's own colour is read from the picture (it is never perfectly flat).
    let br = 0, bgc = 0, bb = 0, n = 0;
    for (let i = 0; i < N; i += 13) if (magentaness(i) > 150) { br += rgb[i * 3]; bgc += rgb[i * 3 + 1]; bb += rgb[i * 3 + 2]; n++; }
    const B = [br / n, bgc / n, bb / n];
    const full = Math.min(B[0], B[2]) - B[1];
    for (let i = 0; i < N; i++) if (magentaness(i) > full * 0.5) a[i] = 0;
    // Edge pixels are a mix of drawing and background: work out how much is drawing, and take the background out.
    const near = dilate(W, H, (i) => a[i] === 0, 3);
    for (let i = 0; i < N; i++) {
      if (a[i] === 0 || !near[i]) continue;
      const m = magentaness(i);
      if (m <= 12) continue;
      const cover = Math.max(0, Math.min(1, 1 - (m - 12) / (full - 12)));
      if (cover < 0.08) { a[i] = 0; continue; }
      a[i] = cover;
      for (let c = 0; c < 3; c++) rgb[i * 3 + c] = Math.max(0, Math.min(255, (rgb[i * 3 + c] - (1 - cover) * B[c]) / cover));
    }
  }
  despill(W, H, a, rgb);
  return { W, H, a, rgb, kind };
}

/** Outline pixels next to the cut edge: no pink or magenta tint, and no bright fringe outside the dark outline. */
function despill(W, H, a, rgb) {
  const N = W * H;
  const edge = dilate(W, H, (i) => a[i] < 0.5, 3);
  let fixed = 0, fringe = 0;
  for (let i = 0; i < N; i++) {
    if (a[i] === 0 || !edge[i]) continue;
    const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2];
    const m = Math.min(r, b) - g;
    if (m > 14) { // pink: pull red and blue down to green
      rgb[i * 3] = r - (m - 6); rgb[i * 3 + 2] = b - (m - 6); fixed++;
    }
  }
  // A bright rim outside the outline: a nearly see-through, bright pixel right at the edge whose inner neighbour is dark.
  const outer = dilate(W, H, (i) => a[i] === 0, 1);
  for (let i = 0; i < N; i++) {
    if (a[i] === 0 || !outer[i] || a[i] > 0.75) continue;
    const lum = (rgb[i * 3] + rgb[i * 3 + 1] + rgb[i * 3 + 2]) / 3;
    if (lum < 150) continue;
    const x = i % W, y = (i / W) | 0;
    let dark = 0, solid = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      if (a[j] > 0.9) { solid++; if ((rgb[j * 3] + rgb[j * 3 + 1] + rgb[j * 3 + 2]) / 3 < 70) dark++; }
    }
    if (solid && dark / solid > 0.6) { rgb[i * 3] = rgb[i * 3 + 1] = rgb[i * 3 + 2] = 20; fringe++; }
  }
  return { fixed, fringe };
}

/** Effect sheets: everything outside the effect becomes black; then brightness is the opacity (drawn additive). */
function keyEffect(img) {
  const { width: W, height: H, data } = img;
  const N = W * H;
  const a = new Float32Array(N);
  const rgb = new Float32Array(N * 3);
  const src = new Float32Array(N * 3);
  let seeThrough = 0;
  for (let i = 0; i < N; i++) {
    const al = data[i * 4 + 3] / 255;
    if (al < 0.5) seeThrough++;
    for (let c = 0; c < 3; c++) src[i * 3 + c] = data[i * 4 + c] * al; // see-through = black
  }
  let kind = seeThrough > N / 4 ? 'black blobs on transparent' : 'black';
  const sat = (i) => Math.max(src[i * 3], src[i * 3 + 1], src[i * 3 + 2]) - Math.min(src[i * 3], src[i * 3 + 1], src[i * 3 + 2]);
  if (data[0] > 200 && data[1] > 200 && data[2] > 200 && data[3] > 200) {
    // On white: flood from the edges through bright, colourless pixels; all of that is outside the effect.
    kind = 'white';
    const outside = floodFromEdges(W, H, (i) => sat(i) < 28 && src[i * 3 + 1] > 90);
    for (let i = 0; i < N; i++) if (outside[i]) src[i * 3] = src[i * 3 + 1] = src[i * 3 + 2] = 0;
  }
  // The blob each drawing sits in (for splitting): where the source was opaque, or lit.
  const blob = new Uint8Array(N);
  for (let i = 0; i < N; i++) blob[i] = seeThrough > N / 4 ? (data[i * 4 + 3] > 40 ? 1 : 0) : Math.max(src[i * 3], src[i * 3 + 1], src[i * 3 + 2]) > 10 ? 1 : 0;
  for (let i = 0; i < N; i++) {
    const m = Math.max(src[i * 3], src[i * 3 + 1], src[i * 3 + 2]);
    const al = m < 12 ? 0 : Math.min(1, (m - 9) / 246); // the faint dark surround of each drawing is dropped
    a[i] = al;
    if (al > 0) for (let c = 0; c < 3; c++) rgb[i * 3 + c] = Math.min(255, src[i * 3 + c] / al);
  }
  return { W, H, a, rgb, kind, blob };
}

function floodFromEdges(W, H, pass) {
  const out = new Uint8Array(W * H);
  const stack = [];
  const push = (i) => { if (!out[i] && pass(i)) { out[i] = 1; stack.push(i); } };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  while (stack.length) {
    const i = stack.pop();
    const x = i % W;
    if (x > 0) push(i - 1);
    if (x < W - 1) push(i + 1);
    if (i >= W) push(i - W);
    if (i < W * (H - 1)) push(i + W);
  }
  return out;
}

/** Pixels within r of a pixel where `is` holds (a square neighbourhood, two passes). */
function dilate(W, H, is, r) {
  const N = W * H;
  const row = new Uint8Array(N);
  const out = new Uint8Array(N);
  for (let y = 0; y < H; y++) {
    let last = -1e9;
    for (let x = 0; x < W; x++) { if (is(y * W + x)) last = x; if (x - last <= r) row[y * W + x] = 1; }
    last = 1e9;
    for (let x = W - 1; x >= 0; x--) { if (is(y * W + x)) last = x; if (last - x <= r) row[y * W + x] = 1; }
  }
  for (let x = 0; x < W; x++) {
    let last = -1e9;
    for (let y = 0; y < H; y++) { if (row[y * W + x]) last = y; if (y - last <= r) out[y * W + x] = 1; }
    last = 1e9;
    for (let y = H - 1; y >= 0; y--) { if (row[y * W + x]) last = y; if (last - y <= r) out[y * W + x] = 1; }
  }
  return out;
}

// ---------- Splitting into drawings ----------

/** Connected shapes of a mask: [{ id, n, x0, y0, x1, y1 }], and the label of every pixel. */
function components(W, H, mask) {
  const label = new Int32Array(W * H);
  const list = [];
  const stack = new Int32Array(W * H);
  for (let s = 0; s < W * H; s++) {
    if (!mask[s] || label[s]) continue;
    const id = list.length + 1;
    const c = { id, n: 0, x0: W, y0: H, x1: 0, y1: 0 };
    let top = 0;
    stack[top++] = s; label[s] = id;
    while (top) {
      const i = stack[--top];
      const x = i % W, y = (i / W) | 0;
      c.n++;
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (mask[j] && !label[j]) { label[j] = id; stack[top++] = j; }
      }
    }
    list.push(c);
  }
  return { label, list };
}

/**
 * The n drawings on a sheet: the n biggest shapes; every smaller shape (a spark, a loose streak) joins the drawing
 * it is nearest to. Read in rows, top to bottom, left to right. Returns [{ x0, y0, x1, y1, owner (label -> index) }].
 */
function drawings(W, H, mask, n, rows) {
  const { label, list } = components(W, H, mask);
  const big = [...list].sort((p, q) => q.n - p.n).slice(0, n);
  if (big.length < n) throw new Error(`found ${big.length} drawings, expected ${n}`);
  // Rows: cut the vertical centres into `rows` groups at the widest gaps.
  const byY = [...big].sort((p, q) => (p.y0 + p.y1) - (q.y0 + q.y1));
  const gaps = byY.slice(1).map((c, i) => ({ i: i + 1, gap: (c.y0 + c.y1) - (byY[i].y0 + byY[i].y1) })).sort((p, q) => q.gap - p.gap).slice(0, rows - 1).map((g) => g.i).sort((p, q) => p - q);
  const ordered = [];
  let start = 0;
  for (const cut of [...gaps, byY.length]) { ordered.push(...byY.slice(start, cut).sort((p, q) => (p.x0 + p.x1) - (q.x0 + q.x1))); start = cut; }
  const owner = new Int32Array(list.length + 1).fill(-1);
  ordered.forEach((c, i) => { owner[c.id] = i; });
  const boxes = ordered.map((c) => ({ x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1 }));
  const dist = (c, b) => Math.hypot(Math.max(0, b.x0 - c.x1, c.x0 - b.x1), Math.max(0, b.y0 - c.y1, c.y0 - b.y1));
  for (const c of list) {
    if (owner[c.id] >= 0 || c.n < 6) continue; // specks under 6 px are dropped
    let best = 0;
    for (let i = 1; i < ordered.length; i++) if (dist(c, ordered[i]) < dist(c, ordered[best])) best = i;
    if (dist(c, ordered[best]) > 140) continue; // too far from any drawing: stray
    owner[c.id] = best;
    const b = boxes[best];
    b.x0 = Math.min(b.x0, c.x0); b.y0 = Math.min(b.y0, c.y0); b.x1 = Math.max(b.x1, c.x1); b.y1 = Math.max(b.y1, c.y1);
  }
  return { label, owner, boxes };
}

/** Effect sheets: cut the sheet into rows and each row into drawings along its darkest lines. */
function gridDrawings(K, n, rows, hand = null) {
  const { W, H, a } = K;
  const cuts = (profile, parts, near = null) => {
    // Smooth, then take the parts-1 darkest places that are far enough apart; lit ends are trimmed first.
    let lo = 0, hi = profile.length - 1;
    while (lo < hi && profile[lo] < 0.5) lo++;
    while (hi > lo && profile[hi] < 0.5) hi--;
    const span = hi - lo + 1, r = Math.max(2, Math.round(span / parts / 14));
    const sm = new Float64Array(profile.length);
    for (let i = lo; i <= hi; i++) { let t = 0, c = 0; for (let j = Math.max(lo, i - r); j <= Math.min(hi, i + r); j++) { t += profile[j]; c++; } sm[i] = t / c; }
    // Drawings are laid out evenly: each cut is the darkest place near where an even split would put it.
    const out = [];
    const step = span / parts;
    for (let c = 1; c < parts; c++) {
      const mid = near ? near[c - 1] : lo + step * c;
      const reach = near ? 30 : step * 0.3; // near = where the cuts are, by hand (drawings of very different sizes)
      let best = Math.round(mid);
      for (let i = Math.round(mid - reach); i <= Math.round(mid + reach); i++) if (sm[i] < sm[best]) best = i;
      out.push(best);
    }
    return [lo, ...out, hi + 1];
  };
  const rowP = new Float64Array(H);
  for (let y = 0; y < H; y++) { let t = 0; for (let x = 0; x < W; x++) t += a[y * W + x]; rowP[y] = t; }
  const ys = cuts(rowP, rows);
  const per = n / rows;
  const label = new Int32Array(W * H);
  const boxes = [];
  for (let r = 0; r < rows; r++) {
    const colP = new Float64Array(W);
    for (let x = 0; x < W; x++) { let t = 0; for (let y = ys[r]; y < ys[r + 1]; y++) t += a[y * W + x]; colP[x] = t; }
    const xs = cuts(colP, per, hand?.[r] ?? null);
    for (let c = 0; c < per; c++) {
      const id = boxes.length + 1;
      const box = { x0: W, y0: H, x1: 0, y1: 0 };
      for (let y = ys[r]; y < ys[r + 1]; y++) for (let x = xs[c]; x < xs[c + 1]; x++) {
        label[y * W + x] = id;
        if (a[y * W + x] >= 0.05) { if (x < box.x0) box.x0 = x; if (x > box.x1) box.x1 = x; if (y < box.y0) box.y0 = y; if (y > box.y1) box.y1 = y; }
      }
      boxes.push(box);
    }
  }
  const owner = new Int32Array(n + 1).fill(-1);
  for (let i = 0; i < n; i++) owner[i + 1] = i;
  return { label, owner, boxes };
}

// ---------- Measuring a body drawing ----------

const isLantern = (r, g, b) => b > r + 18 && b > g + 22 && b > 62 && b < 135 && r > 30 && r < 95; // the lantern's indigo glass

/** Distance (px, capped) from every drawing pixel to the nearest pixel outside the drawing: thick parts score high. */
function thickness(W, H, inside, box, cap) {
  const w = box.x1 - box.x0 + 3, h = box.y1 - box.y0 + 3;
  const d = new Float32Array(w * h);
  const at = (x, y) => inside((y + box.y0 - 1) * W + (x + box.x0 - 1), x + box.x0 - 1, y + box.y0 - 1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !at(x, y)) { d[y * w + x] = 0; continue; }
    d[y * w + x] = Math.min(cap, d[y * w + x - 1] + 1, d[(y - 1) * w + x] + 1, d[(y - 1) * w + x - 1] + 1.4, d[(y - 1) * w + x + 1] + 1.4);
  }
  for (let y = h - 2; y > 0; y--) for (let x = w - 2; x > 0; x--) {
    const i = y * w + x;
    if (!d[i]) continue;
    d[i] = Math.min(d[i], d[i + 1] + 1, d[i + w] + 1, d[i + w + 1] + 1.4, d[i + w - 1] + 1.4);
  }
  return { d, w, h };
}

function measureBody(K, D, i) {
  const { W, a, rgb } = K;
  const box = D.boxes[i];
  const inside = (p) => a[p] > 0.5 && D.owner[D.label[p]] === i;
  let lan = 0, lx = 0, ly = 0, bottom = 0;
  for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) {
    const p = y * W + x;
    if (!inside(p)) continue;
    if (y > bottom) bottom = y;
    if (isLantern(rgb[p * 3], rgb[p * 3 + 1], rgb[p * 3 + 2])) { lan++; lx += x; ly += y; }
  }
  // The body's core: the thickest part (head, torso, hips), limbs and streaks eroded away.
  const cap = 60;
  const T = thickness(W, K.H, inside, box, cap);
  let max = 0;
  for (let k = 0; k < T.d.length; k++) if (T.d[k] > max) max = T.d[k];
  const cut = max * 0.55;
  let cx = 0, cy = 0, cn = 0;
  for (let y = 0; y < T.h; y++) for (let x = 0; x < T.w; x++) if (T.d[y * T.w + x] >= cut) { cx += x; cy += y; cn++; }
  // Feet: what touches the lowest band of the drawing.
  const band = bottom - 14;
  let fx0 = W, fx1 = 0;
  for (let y = band; y <= bottom; y++) for (let x = box.x0; x <= box.x1; x++) if (inside(y * W + x)) { if (x < fx0) fx0 = x; if (x > fx1) fx1 = x; }
  return { box, bottom, lantern: lan, lanternAt: lan > 40 ? [lx / lan, ly / lan] : null, core: [box.x0 - 1 + cx / cn, box.y0 - 1 + cy / cn], thick: max, feet: [fx0, fx1], height: bottom - box.y0 + 1 };
}

// ---------- Drawing into a sheet ----------

/** Copy one drawing, scaled by k (sheet px per drawn px), so that drawn point (ax, ay) lands on (ox, oy). Area-averaged. */
function blit(K, D, i, out, OW, OH, cell, ax, ay, ox, oy, k) {
  const { W, H, a, rgb } = K;
  const box = D.boxes[i];
  const X0 = Math.max(0, Math.floor(ox + (box.x0 - ax) * k)), X1 = Math.min(cell.w - 1, Math.ceil(ox + (box.x1 + 1 - ax) * k));
  const Y0 = Math.max(0, Math.floor(oy + (box.y0 - ay) * k)), Y1 = Math.min(cell.h - 1, Math.ceil(oy + (box.y1 + 1 - ay) * k));
  for (let Y = Y0; Y <= Y1; Y++) for (let X = X0; X <= X1; X++) {
    // The drawn rectangle this sheet pixel covers.
    const sx0 = ax + (X - ox) / k, sx1 = ax + (X + 1 - ox) / k, sy0 = ay + (Y - oy) / k, sy1 = ay + (Y + 1 - oy) / k;
    let r = 0, g = 0, b = 0, al = 0, wsum = 0;
    for (let y = Math.max(0, Math.floor(sy0)); y < Math.min(H, Math.ceil(sy1)); y++) {
      const wy = Math.min(sy1, y + 1) - Math.max(sy0, y);
      for (let x = Math.max(0, Math.floor(sx0)); x < Math.min(W, Math.ceil(sx1)); x++) {
        const w = wy * (Math.min(sx1, x + 1) - Math.max(sx0, x));
        wsum += w;
        const p = y * W + x;
        if (a[p] === 0 || (D.owner && D.owner[D.label[p]] !== i)) continue;
        const wa = w * a[p];
        r += rgb[p * 3] * wa; g += rgb[p * 3 + 1] * wa; b += rgb[p * 3 + 2] * wa; al += wa;
      }
    }
    if (al <= 0 || wsum <= 0) continue;
    const q = ((cell.y + Y) * OW + cell.x + X) * 4;
    out[q] = Math.round(r / al); out[q + 1] = Math.round(g / al); out[q + 2] = Math.round(b / al); out[q + 3] = Math.round(255 * Math.min(1, al / wsum));
  }
}

const median = (list) => [...list].sort((p, q) => p - q)[list.length >> 1];

// ---------- Previews ----------

function contactSheet(sheet, W, H, cols, cell, origin, fx) {
  const pad = 6;
  const OW = cols * (cell.w + pad) + pad, OH = cell.h + pad * 2;
  const out = new Uint8Array(OW * OH * 4);
  for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
    const v = fx ? 14 : ((x >> 4) + (y >> 4)) & 1 ? 96 : 122;
    const q = (y * OW + x) * 4; out[q] = out[q + 1] = v; out[q + 2] = fx ? 20 : v; out[q + 3] = 255;
  }
  for (let c = 0; c < cols; c++) for (let y = 0; y < cell.h; y++) for (let x = 0; x < cell.w; x++) {
    const p = (y * W + c * cell.w + x) * 4, q = ((y + pad) * OW + pad + c * (cell.w + pad) + x) * 4;
    const al = sheet[p + 3] / 255;
    for (let k = 0; k < 3; k++) out[q + k] = fx ? Math.min(255, out[q + k] + sheet[p + k] * al) : sheet[p + k] * al + out[q + k] * (1 - al);
    if (y === origin.y || (x === origin.x && Math.abs(y - origin.y) < 14)) { out[q] = 255; out[q + 1] = 60; out[q + 2] = 60; }
  }
  return { width: OW, height: OH, data: out };
}

let FFMPEG = null;
function ffmpeg() {
  if (FFMPEG !== null) return FFMPEG;
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); FFMPEG = 'ffmpeg'; } catch { FFMPEG = ''; }
  return FFMPEG;
}

function gif(name, sheet, W, cols, cell, holds, fx) {
  if (!ffmpeg()) return false;
  const tmp = `${PREVIEWS}.tmp-${name}/`;
  mkdirSync(tmp, { recursive: true });
  let list = '';
  for (let c = 0; c < cols; c++) {
    const out = new Uint8Array(cell.w * cell.h * 4);
    for (let y = 0; y < cell.h; y++) for (let x = 0; x < cell.w; x++) {
      const p = (y * W + c * cell.w + x) * 4, q = (y * cell.w + x) * 4;
      const al = sheet[p + 3] / 255, bg = fx ? [14, 14, 20] : [112, 116, 124];
      for (let k = 0; k < 3; k++) out[q + k] = fx ? Math.min(255, bg[k] + sheet[p + k] * al) : sheet[p + k] * al + bg[k] * (1 - al);
      out[q + 3] = 255;
    }
    writeFileSync(`${tmp}${c}.png`, encodePng({ width: cell.w, height: cell.h, data: out }));
    list += `file '${c}.png'\nduration ${((holds[c] ?? 4) / 60).toFixed(4)}\n`;
  }
  list += `file '${cols - 1}.png'\n`;
  writeFileSync(`${tmp}list.txt`, list);
  try {
    execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'concat', '-i', `${tmp}list.txt`, '-vf', 'split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=none', '-loop', '0', `${PREVIEWS}${name}.gif`]);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  return true;
}

// ---------- One sheet ----------

let SCALE = null; // sheet px per drawn px for a drawing whose lantern is as big as the idle's
let IDLE_LANTERN = null;

function bodyScale(ms) {
  // The lantern's area says how big the drawing was made; the idle sets what that should be.
  const sizes = ms.map((m) => m.lantern).filter((n) => n > 200);
  if (!sizes.length || !IDLE_LANTERN) return null;
  return SCALE * Math.sqrt(IDLE_LANTERN / median(sizes));
}

function processBody(spec, manifest) {
  const K = keyBody(decodePng(readFileSync(DIR + spec.file)));
  if (spec.crop) for (let y = 0; y < K.H; y++) for (let x = 0; x < K.W; x++) if (x < spec.crop[0] || y < spec.crop[1] || x > spec.crop[2] || y > spec.crop[3]) K.a[y * K.W + x] = 0;
  const mask = new Uint8Array(K.W * K.H);
  for (let i = 0; i < mask.length; i++) mask[i] = K.a[i] > 0.5 ? 1 : 0;
  const D = spec.grid ? gridDrawings(K, spec.n, spec.rows ?? 1) : drawings(K.W, K.H, mask, spec.n, spec.rows ?? 1); // grid: drawings packed so tight they touch
  // join: [[keep, loose]]: a shape drawn apart from its body (a slash arc) that was counted as a drawing of its own.
  for (const [keep, loose] of spec.join ?? []) {
    for (let i = 0; i < D.owner.length; i++) if (D.owner[i] === loose - 1) D.owner[i] = keep - 1;
    const b = D.boxes[keep - 1], c = D.boxes[loose - 1];
    D.boxes[keep - 1] = { x0: Math.min(b.x0, c.x0), y0: Math.min(b.y0, c.y0), x1: Math.max(b.x1, c.x1), y1: Math.max(b.y1, c.y1) };
  }
  const ms = D.boxes.map((_, i) => measureBody(K, D, i));
  if (spec.scaleRef) {
    IDLE_LANTERN = median(ms.map((m) => m.lantern));
    SCALE = (STAND * RES) / median(ms.map((m) => m.height));
  }
  const k = (spec.ref ? (spec.ref[1] * RES) / ms[spec.ref[0] - 1].height : bodyScale(ms) ?? SCALE) * (spec.fix ?? 1);
  if (ANALYZE) {
    console.log(`${(spec.name ?? spec.file).padEnd(14)} ${K.kind.padEnd(11)} scale ${k.toFixed(3)}  heights ${ms.map((m) => m.height).join(' ')}  lantern ${ms.map((m) => m.lantern).join(' ')}`);
    return;
  }
  // The ground line of each row: drawings whose lowest point is close to it stand exactly on it; the rest are in the air.
  const rowOf = ms.map((m) => m.box.y0 + m.box.y1);
  const parts = spec.parts ?? [{ name: spec.name, frames: ms.map((_, i) => i + 1), mode: spec.mode, holds: spec.holds }];
  for (const part of parts) {
    const mode = part.mode ?? spec.mode ?? 'ground';
    const idx = part.frames.map((f) => f - 1);
    const anchor = part.anchor ?? spec.anchor ?? 'core';
    const pts = idx.map((i) => {
      const m = ms[i];
      if (mode === 'air') return { ax: m.core[0], ay: m.core[1] };
      const mates = part.lineFrom ? part.lineFrom.map((f) => ms[f - 1].bottom) : ms.filter((_, j) => Math.abs(rowOf[j] - rowOf[i]) < 300).map((o) => o.bottom);
      const line = median(mates);
      const ay = Math.abs(m.bottom - line) <= 16 ? m.bottom + 1 : line + 1;
      return { ax: anchor === 'rear' ? m.feet[0] + 60 : m.core[0], ay };
    });
    // One cell that holds every drawing with the anchor in the same place.
    let left = 0, right = 0, up = 0, down = 0;
    idx.forEach((i, n) => {
      const b = ms[i].box, p = pts[n];
      left = Math.max(left, (p.ax - b.x0) * k); right = Math.max(right, (b.x1 + 1 - p.ax) * k);
      up = Math.max(up, (p.ay - b.y0) * k); down = Math.max(down, (b.y1 + 1 - p.ay) * k);
    });
    const originX = Math.ceil(left) + 2, originY = Math.ceil(up) + 2;
    const cell = { w: originX + Math.ceil(right) + 2, h: originY + Math.ceil(down) + 2 };
    const OW = cell.w * idx.length, OH = cell.h;
    const out = new Uint8Array(OW * OH * 4);
    idx.forEach((i, n) => blit(K, D, i, out, OW, OH, { x: n * cell.w, y: 0, w: cell.w, h: cell.h }, pts[n].ax, pts[n].ay, originX, originY, k));
    // In the game the origin is the fighter's position: the ground under him, or (air) AIR_CENTRE below his centre.
    const oy = mode === 'air' ? originY + AIR_CENTRE * RES : originY;
    const lantern = idx.map((i, n) => (ms[i].lanternAt ? [Math.round(((ms[i].lanternAt[0] - pts[n].ax) * k) / RES), Math.round(((pts[n].ay - ms[i].lanternAt[1]) * k) / RES) + (mode === 'air' ? AIR_CENTRE : 0)] : null));
    for (let n = 0; n < lantern.length; n++) if (!lantern[n]) lantern[n] = lantern[n - 1] ?? lantern.find((p) => p) ?? [0, 60];
    // Where each drawing reaches, in game px from the fighter's position (x forward, y up): [x0, y0, x1, y1].
    const up0 = mode === 'air' ? AIR_CENTRE : 0;
    const reach = idx.map((i, n) => { const b = ms[i].box, p = pts[n]; return [Math.round(((b.x0 - p.ax) * k) / RES), Math.round(((p.ay - b.y1) * k) / RES) + up0, Math.round(((b.x1 - p.ax) * k) / RES), Math.round(((p.ay - b.y0) * k) / RES) + up0]; });
    finish(part.name, out, OW, OH, idx.length, cell, { x: originX, y: originY }, { originX, originY: oy }, part.holds, false, manifest, { lantern, reach, from: spec.file, drawings: part.frames });
  }
}

function processEffect(spec, manifest) {
  const K = keyEffect(decodePng(readFileSync(DIR + spec.file)));
  // Split on the blobs; a lit sheet on plain black has loose sparks, so join what is close first.
  // Split by the dark gaps: rows first, then the darkest columns between the drawings of each row (glows may touch).
  const D = gridDrawings(K, spec.n, spec.rows ?? 1, spec.cuts);
  if (ANALYZE) { console.log(`${(spec.name ?? spec.file).padEnd(14)} ${K.kind}  boxes ${D.boxes.map((b) => `${b.x1 - b.x0}x${b.y1 - b.y0}`).join(' ')}`); return; }
  const pts = D.boxes.map((box, i) => {
    let x0 = K.W, x1 = 0, y0 = K.H, y1 = 0, bx = 0, by = 0, bw = 0, gx0 = K.W, gx1 = 0;
    for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) {
      const p = y * K.W + x;
      if (D.owner[D.label[p]] !== i || K.a[p] < 0.12) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (K.a[p] > 0.85) { bx += x; by += y; bw++; }
    }
    for (let y = y1 - 12; y <= y1; y++) for (let x = x0; x <= x1; x++) if (K.a[y * K.W + x] >= 0.12 && D.owner[D.label[y * K.W + x]] === i) { if (x < gx0) gx0 = x; if (x > gx1) gx1 = x; }
    const lit = { x0, y0, x1, y1 };
    const anchor = (spec.parts?.find((q) => i + 1 >= q.use[0] && i + 1 <= q.use[1]) ?? spec).anchor;
    if (anchor === 'ground') return { lit, ax: (gx0 + gx1) / 2, ay: y1 + 1 };
    if (anchor === 'bright' && bw) return { lit, ax: bx / bw, ay: by / bw };
    return { lit, ax: (x0 + x1) / 2, ay: (y0 + y1) / 2 };
  });
  for (const part of spec.parts ?? [spec]) {
  const use = part.use ? pts.map((_, i) => i).filter((i) => i + 1 >= part.use[0] && i + 1 <= part.use[1]) : pts.map((_, i) => i);
  const biggest = Math.max(...use.map((i) => Math.max(pts[i].lit.x1 - pts[i].lit.x0, pts[i].lit.y1 - pts[i].lit.y0)));
  const k = (part.size * RES) / biggest;
  let left = 0, right = 0, up = 0, down = 0;
  use.forEach((i) => {
    const b = D.boxes[i], p = pts[i];
    left = Math.max(left, (p.ax - b.x0) * k); right = Math.max(right, (b.x1 + 1 - p.ax) * k);
    up = Math.max(up, (p.ay - b.y0) * k); down = Math.max(down, (b.y1 + 1 - p.ay) * k);
  });
  const originX = Math.ceil(left) + 2, originY = Math.ceil(up) + 2;
  const cell = { w: originX + Math.ceil(right) + 2, h: originY + Math.ceil(down) + 2 };
  const OW = cell.w * use.length, OH = cell.h;
  const out = new Uint8Array(OW * OH * 4);
  use.forEach((i, n) => blit(K, D, i, out, OW, OH, { x: n * cell.w, y: 0, w: cell.w, h: cell.h }, pts[i].ax, pts[i].ay, originX, originY, k));
  finish(part.name, out, OW, OH, use.length, cell, { x: originX, y: originY }, { originX, originY }, part.holds, true, manifest, { from: spec.file, additive: true });
  }
}

function finish(name, out, OW, OH, count, cell, mark, origin, holds, fx, manifest, extra) {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(PREVIEWS, { recursive: true });
  writeFileSync(`${OUT}${name}.png`, encodePng({ width: OW, height: OH, data: out }));
  writeFileSync(`${PREVIEWS}${name}.png`, encodePng(contactSheet(out, OW, OH, count, cell, mark, fx)));
  const made = gif(name, out, OW, count, cell, holds, fx);
  const sprite = { image: `sheets/${name}.png`, columns: count, rows: 1, count, frameW: cell.w, frameH: cell.h, originX: origin.originX, originY: origin.originY, scale: 1 / RES, holds };
  if (extra.additive) sprite.additive = true;
  manifest[name] = { sprite, from: extra.from, drawings: extra.drawings ?? null, lantern: extra.lantern ?? null, reach: extra.reach ?? null };
  console.log(`${name.padEnd(14)} ${count} drawings, ${cell.w}x${cell.h}${made ? '' : '  (no gif: ffmpeg not found)'}`);
}

// ---------- Run ----------

const manifestPath = `${OUT}manifest.json`;
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
for (const spec of SHEETS) {
  const names = spec.parts ? spec.parts.map((p) => p.name) : [spec.name];
  const wanted = !ONLY || names.some((n) => ONLY.includes(n));
  if (!wanted && !spec.scaleRef) continue;
  if (!existsSync(DIR + spec.file)) { console.log(`${names.join(', ')}: ${spec.file} is not there (skipped)`); continue; }
  if (spec.mode === 'fx') processEffect(spec, manifest);
  else if (!wanted) { const was = ANALYZE; processBodyQuiet(spec); void was; } else processBody(spec, manifest);
}
if (!ANALYZE) writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 1)}\n`);

/** The idle is always measured (it sets the body size), even when only other sheets are asked for. */
function processBodyQuiet(spec) {
  const K = keyBody(decodePng(readFileSync(DIR + spec.file)));
  const mask = new Uint8Array(K.W * K.H);
  for (let i = 0; i < mask.length; i++) mask[i] = K.a[i] > 0.5 ? 1 : 0;
  const D = drawings(K.W, K.H, mask, spec.n, spec.rows ?? 1);
  const ms = D.boxes.map((_, i) => measureBody(K, D, i));
  IDLE_LANTERN = median(ms.map((m) => m.lantern));
  SCALE = (STAND * RES) / median(ms.map((m) => m.height));
}
