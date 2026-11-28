// Avner (the Lampbearer): turns the drawn sheets (data/characters/avner/Avner_*.png) into game-ready sheets,
// previews and a manifest.
//
//   node scripts/avner-prep.mjs                 every sheet in the table below
//   node scripts/avner-prep.mjs --only 5H,jump  just those
//   node scripts/avner-prep.mjs --analyze       print what was found in each sheet, write nothing
//   node scripts/avner-prep.mjs --char malik    another character: the table is scripts/malik-sheets.mjs (SHEETS, and
//                                               MEASURE = 'area': no lantern, so a drawing's size is read from how
//                                               much of the sheet its body covers). JPEG sheets are read through ffmpeg.
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

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const optv = (n) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : null);
const CHAR = optv('char') ?? 'avner';
const OTHER = CHAR === 'avner' ? null : await import(`./${CHAR}-sheets.mjs`);
const BY_AREA = OTHER?.MEASURE === 'area';
const DIR = `data/characters/${CHAR}/`;
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
// bb: true = the newer sheets (owner, Nov 24, BlazBlue style): sized from their own idle (scaleRef + bb, stand = its
// height in game px). anchor upper = the centre of the top 40% of the body. measureOnly: read for its size, never cut.
// A ground part's air: [drawings] = those drawings are in the air (cut about the body; the game supplies the height).
// fx variants: [{ name, flip: 'v' | turn: true }]: the same effect stored upside down, or laid flat (a quarter turn).
// fx sheets: feather: px (a dark drawing on white: fade its pale rim away); arc: 'right' (see processEffect).
// fx sheets: anchor = centre | ground (bottom centre) | bright (the brightest point); size = game px of the
// largest drawing's longer side.
const GUARD_H = 170; // the empty-hand idle's height, game px (its median drawn height 480 x its head-size scale 0.709 / 2)
// The empty-hand set (set: 'E', one stance for the whole sheet) came out about 8% too big: his head, forehead under the
// locs to chin, is 27.5 px in the empty-hand idle against 25.4 in the lantern idle (owner, Nov 27: match the heads).
// Every such sheet's own size is multiplied by this one factor. Sheets that mix stances (sets: '...') are sized by
// their lantern drawings and keep their size; only their swapped-in last drawing (e-base) shrinks with it.
const E_FIX = 0.92;
const AVNER_SHEETS = [
  // The older idle: only measured. It sets the size of the older sheets further down (specials, throws, hit reactions).
  { name: 'idle-old', file: 'Avner_Idle.png', n: 6, scaleRef: true, measureOnly: true },
  // ---- The newer sheets (owner, Nov 24, BlazBlue style). The holds are the owner's, drawing by drawing. Most are
  // already cut out (real transparency); a few are on magenta. He stands 190 px. ----
  { name: 'idle', bb: true, scaleRef: true, stand: 190, file: 'Avner_Test_Idle.png', n: 12, rows: 3, anchor: 'upper', holds: [8, 6, 5, 5, 6, 8, 5, 5, 5, 8, 6, 6] },
  { ref: [3, 190], name: 'walk', bb: true, file: 'Avner_Test_Walk_Forward.png', n: 10, rows: 2, anchor: 'upper', holds: [5, 6, 5, 5, 5, 5, 6, 5, 5, 5] },
  { ref: [4, 190], name: 'walk-back', bb: true, file: 'Avner_Back_Walk.png', n: 8, rows: 2, anchor: 'upper', holds: [6, 6, 6, 6, 6, 6, 6, 6] },
  // Crouch: 5 drawings (the owner's list says 6: 4, 4, then loop 2-6). Wired as 1 going down for 4, then 2-5 looped
  // at 10, 8, 8, 10; standing up plays 2 then 1, 4 each (art.exit in his file).
  { ref: [2, 138], name: 'crouch', bb: true, file: 'Avner_Crouch.png', n: 5, rows: 2, anchor: 'upper', holds: [4, 10, 8, 8, 10] },
  // Jump: 1 the squat, 2-7 in the air (the game picks one by vertical speed), 8-9 the landing.
  { ref: [9, 190], bb: true, file: 'Avner_Jump.png', n: 9, rows: 3, parts: [
    { name: 'jumpsquat', frames: [1], anchor: 'upper', lineFrom: [1], holds: [3] },
    { name: 'jump', frames: [2, 3, 4, 5, 6, 7], mode: 'air', holds: [3, 4, 5, 6, 5, 7] },
    { name: 'land', frames: [8, 9], anchor: 'upper', lineFrom: [8, 9], holds: [4, 4] },
  ] },
  { ref: [7, 190], bb: true, file: 'Avner_Forward_Dash.png', n: 7, rows: 2, parts: [
    { name: 'dash', frames: [1, 2, 3, 4, 5], anchor: 'upper', holds: [3, 3, 2, 2, 2] },
    { name: 'dash-stop', frames: [6, 7], anchor: 'upper', holds: [5, 5] },
  ] },
  { ref: [6, 190], bb: true, file: 'Avner_Back_Dash.png', n: 6, rows: 2, parts: [
    { name: 'backdash', frames: [1, 2, 3, 4], anchor: 'upper', holds: [3, 3, 5, 3] },
    { name: 'backdash-stop', frames: [5, 6], anchor: 'upper', holds: [5, 5] },
  ] },
  { name: 'airdash', bb: true, file: 'Avner_Forward_AirDash.png', n: 5, rows: 2, mode: 'air', holds: [2, 3, 3, 3, 3] },
  { name: 'airdash-back', bb: true, file: 'Avner_Back_AirDash.png', n: 4, mode: 'air', holds: [2, 4, 3, 3] },
  { ref: [1, 190], name: 'turnaround', bb: true, file: 'Avner_Turnaround.png', n: 3, anchor: 'upper', holds: [2, 2, 2] }, // cut, not used: the engine has no turnaround state
  // 5L: 7 drawings where the owner's list says 6, so his holds are not applied; these are the earlier ones.
  { ref: [7, 190], name: '5L', bb: true, file: 'Avner_Test_LightPunch.png', n: 7, rows: 2, anchor: 'upper', holds: [2, 2, 2, 3, 2, 2, 2] },
  { ref: [8, 190], name: '5M', bb: true, file: 'Avner_MediumPunch.png', n: 8, rows: 2, anchor: 'upper', holds: [2, 3, 2, 3, 3, 4, 3, 4] },
  // 5H Pendulum (redrawn Nov 25: 10 drawings, an overhead swing). No holds came with it: 1-4 are the 11 frames before the
  // hit, 5 is held for the 4 hitting frames, 6 follows through, 7-10 are the recovery (35 frames in all). Its arc is the effect 'pendulum-arc', below.
  { ref: [10, 190], name: '5H', bb: true, file: 'Avner_HeavyPunch.png', n: 10, rows: 3, anchor: 'upper', holds: [3, 3, 3, 2, 4, 4, 5, 4, 4, 3], shift: [0, -18, -61, -49, 45, 32, -4, -6, 3, -4] },
  // The arc is one circle drawn in stages, so every drawing is placed by the circle's middle (`centres`, sheet px, read off the sheet by eye).
  // It plays as 5H's layer, in step with the move (so it freezes in hitstop with him): 12 cells spread over the move's 35 frames, the arc from frame 6, its second drawing (the leading edge out past the lantern) on the hit frame.
  { name: 'pendulum-arc', file: 'Avner_HeavyPunch_Effect.png', n: 7, rows: 2, perRow: [4, 3], mode: 'fx', anchor: 'centre', size: 230, centres: [[269, 358], [896, 358], [1577, 358], [2285, 358], [475, 1111], [1254, 1120], [2016, 1111]], blank: [2, 3], holds: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3] },
  { ref: [8, 190], name: '5S', bb: true, file: 'Avner_SLauncher.png', n: 8, rows: 2, anchor: 'upper', holds: [3, 3, 3, 4, 4, 6, 6, 6] },
  // 4H Crescent Withdraw: a hop back. Drawings 2-6 are off the ground and keep their drawn height.
  { ref: [8, 190], bb: true, file: 'Avner_Back_HeavyPunch.png', n: 8, rows: 2, parts: [
    { name: '4H', frames: [1, 2, 3, 4, 5, 6, 7, 8], anchor: 'upper', lineFrom: [1, 7, 8], holds: [4, 4, 3, 4, 4, 6, 6, 4] },
  ] },
  { ref: [8, 190], bb: true, file: 'Avner_WaningHop.png', n: 8, rows: 2, parts: [
    { name: 'waning-hop', frames: [1, 2, 3, 4, 5, 6, 7, 8], anchor: 'upper', lineFrom: [1, 5, 6, 7, 8], holds: [7, 7, 7, 3, 4, 4, 4, 4] },
  ] },
  // Crouching attacks: cut at the crouch sheet's scale (0.49 sheet px per drawn px, from the lantern's size), given here as drawing 1's height.
  { ref: [1, 137], name: '2L', bb: true, file: 'Avner_Crouching_LightPunch.png', n: 6, rows: 2, anchor: 'upper', holds: [2, 2, 2, 2, 3, 4] },
  { ref: [1, 124], name: '2M', bb: true, file: 'Avner_Crouching_MediumPunch.png', n: 7, rows: 2, anchor: 'upper', holds: [2, 3, 2, 3, 4, 5, 6] },
  { ref: [1, 127], name: '2H', bb: true, file: 'Avner_Crouching_HeavyPunch.png', n: 8, rows: 2, anchor: 'upper', holds: [4, 4, 3, 3, 4, 7, 7, 6] },
  { ref: [8, 190], name: 'lantern-drag', bb: true, file: 'Avner_LanternDrag.png', n: 8, rows: 2, anchor: 'upper', holds: [6, 5, 4, 3, 3, 8, 8, 8] },
  // Rebound move (j.2H; owner, Nov 25: his air down sheet, a downward lantern swing): 1-2 the wind-up, 3-4 the dive
  // (looped), 5-6 the rebound after it touches. A miss lands in the Lantern Crash landing drawings.
  { bb: true, file: 'Avner_Air_DownMedium.png', n: 6, rows: 2, perRow: [4, 2], parts: [
    { name: 'j2H', frames: [1, 2, 3, 4], mode: 'air', holds: [6, 5, 3, 3] },
    { name: 'j2H-rebound', frames: [5, 6], mode: 'air', holds: [6, 6] },
  ] },
  // Moon Phase Assault (j.236, a three-part air rekka; owner, Nov 25, his holds). Full Moon: 1-6 the swing, 7 held
  // until he lands, 8 the landing. Moonfall Smash (the EX finish): 1-4 the smash, 5 held until he lands, 6-7 the landing.
  { name: 'waxing', bb: true, file: 'Avner_SpecialMove_WaxingCrescent.png', n: 8, rows: 2, mode: 'air', holds: [7, 3, 2, 3, 2, 3, 6, 8] },
  { name: 'half-moon', bb: true, file: 'Avner_SpecialMove_HalfMoon.png', n: 9, rows: 3, mode: 'air', holds: [7, 2, 2, 2, 3, 3, 5, 6, 6] },
  { bb: true, file: 'Avner_SpecialMove_FullMoon.png', n: 8, rows: 2, parts: [
    { name: 'full-moon-swing', frames: [1, 2, 3, 4, 5, 6, 7], mode: 'air', holds: [4, 5, 3, 3, 4, 6, 90] },
    { name: 'full-moon-land', frames: [8], anchor: 'upper', lineFrom: [8], holds: [10] },
  ] },
  { bb: true, file: 'Avner_SpecialMove_MoonFallSmash.png', n: 7, rows: 2, parts: [
    { name: 'moon-smash', frames: [1, 2, 3, 4, 5], mode: 'air', holds: [4, 3, 4, 3, 90] },
    { name: 'moon-smash-land', frames: [6, 7], anchor: 'upper', lineFrom: [6, 7], holds: [10, 8] },
  ] },
  { name: 'three-crescents', file: 'Avner_SpecialMove_WaxingCrescent_Effect.png', n: 8, rows: 2, mode: 'fx', anchor: 'centre', feather: 26, size: 190, holds: [2, 3, 2, 3, 2, 3, 4, 4] },
  { name: 'half-moon-arc', file: 'Avner_SpecialMove_HalfMoon_Effect.png', n: 7, mode: 'fx', anchor: 'centre', arc: 'right', size: 250, holds: [4, 3, 2, 3, 3, 4, 4] },
  { name: 'full-moon-burst', file: 'Avner_SpecialMove_FullMoon_Effect.png', n: 10, rows: 2, mode: 'fx', anchor: 'centre', size: 280, holds: [2, 2, 2, 3, 3, 3, 1, 2, 3, 4] },
  { name: 'moon-crash', file: 'Avner_SpecialMove_MoonFallSmash_Effect.png', n: 7, rows: 2, perRow: [4, 3], mode: 'fx', anchor: 'ground', size: 330, holds: [2, 1, 2, 3, 3, 4, 4] },
  { name: 'drag-sparks', file: 'Avner_LanternDrag_Effect.png', n: 6, mode: 'fx', anchor: 'bright', size: 150, cuts: [[365, 745, 1325, 1820, 2290]], holds: [3, 3, 3, 3, 3, 3] },
  { name: 'drag-dust', file: 'Avner_LanternDrag_Effect2.png', n: 6, mode: 'fx', anchor: 'ground', size: 160, holds: [4, 4, 4, 4, 4, 4] },
  { name: 'hop-crescent', file: 'Avner_WaningHop_Effect.png', n: 5, mode: 'fx', anchor: 'centre', size: 190, holds: [2, 2, 2, 2, 2], variants: [{ name: 'hop-crescent-up', flip: 'v' }, { name: 'hop-crescent-flat', turn: true }] },
  { name: 'j2H-trail', file: 'Avner_MoonFall_Effect.png', n: 4, mode: 'fx', anchor: 'bright', size: 230, cuts: [[698, 1384, 2019]], holds: [3, 3, 3, 3] },
  // Air normals (owner, Nov 24, the newer style; his holds). j.S: 1-4 the slam, 5 held until he lands, 6-7 its own landing.
  { name: 'jL', bb: true, file: 'Avner_Air_LightPunch.png', n: 6, rows: 2, mode: 'air', holds: [2, 2, 3, 3, 3, 4] },
  { name: 'jM', bb: true, file: 'Avner_Air_MediumPunch.png', n: 6, rows: 2, mode: 'air', holds: [3, 3, 4, 4, 4, 6] },
  { ref: [1, 162], name: 'jH', bb: true, file: 'Avner_Air_HeavyPunch.png', n: 8, rows: 2, mode: 'air', holds: [3, 3, 3, 4, 4, 5, 5, 4] },
  { bb: true, file: 'Avner_Air_S.png', n: 7, rows: 2, parts: [
    { name: 'jS', frames: [1, 2, 3, 4, 5], mode: 'air', holds: [4, 4, 3, 4, 90] },
    { name: 'jS-land', frames: [6, 7], anchor: 'upper', lineFrom: [6, 7], holds: [8, 6] },
  ] },
  // ---- Specials (owner, Nov 25): the newer drawings with his holds. ----
  { ref: [8, 190], name: 'rising-moon', bb: true, file: 'Avner_SpecialMove_RisingMoon.png', n: 8, rows: 2, anchor: 'upper', holds: [5, 4, 4, 4, 5, 8, 7, 6] },
  // Lunar Halo: 1 crouched on the ground, 2-6 in the air (the game lifts him, so those are cut about his body, not the
  // ground line), 7-8 the landing.
  { ref: [8, 190], bb: true, file: 'Avner_SpecialMove_LunarHalo.png', n: 8, rows: 2, parts: [
    { name: 'lunar-halo', frames: [1, 2, 3, 4, 5, 6], anchor: 'upper', lineFrom: [1], air: [2, 3, 4, 5, 6], holds: [2, 2, 3, 3, 6, 90] },
    { name: 'lunar-halo-land', frames: [7, 8], anchor: 'upper', lineFrom: [7, 8], holds: [8, 6] },
  ] },
  { ref: [8, 190], name: 'tide', bb: true, file: 'Avner_SpecialMove_Tide.png', n: 8, rows: 2, anchor: 'upper', holds: [5, 5, 5, 4, 5, 6, 7, 6] },
  // Rite: Moonlit. Row 1 in front and far (R, 6R), row 2 over himself (2R), row 3 from the air (j.R).
  { ref: [1, 190], bb: true, file: 'Avner_SpecialMove_Moonlit_InFrontAndFar_Overhimself_Air.png', n: 14, rows: 3, parts: [
    { name: 'moonlit-5', frames: [1, 2, 3, 4, 5], anchor: 'upper', holds: [4, 4, 4, 10, 8] },
    { name: 'moonlit-2', frames: [6, 7, 8, 9, 10], anchor: 'upper', holds: [4, 4, 4, 10, 8] },
    { name: 'moonlit-j', frames: [11, 12, 13], mode: 'air', holds: [4, 4, 8] }, // drawing 14 is not used: the jump's falling drawing follows
  ] },
  { ref: [7, 190], name: 'moon-snap', bb: true, file: 'Avner_SpecialMove_Moonlit_Snap.png', n: 7, rows: 2, anchor: 'upper', holds: [4, 4, 3, 10, 6, 6, 6] },
  // Their effects, light on black. The orb: 1-3 appearing, 4-7 flying (looped), 8-10 bursting.
  { name: 'moon', file: 'Avner_SpecialMove_RisingMoon_Projectile.png', n: 10, rows: 2, mode: 'fx', anchor: 'bright', size: 150, holds: [3, 3, 3, 3, 3, 3, 3, 2, 3, 4] },
  { name: 'lantern-flare', file: 'Avner_SpecialMove_RisingMoon_Projectile_Effect1.png', n: 6, mode: 'fx', anchor: 'bright', size: 150, holds: [2, 2, 3, 4, 5, 6] },
  { name: 'halo-burst', file: 'Avner_SpecialMove_LunarHalo_Effect1.png', n: 8, rows: 2, mode: 'fx', anchor: 'centre', size: 300, holds: [2, 2, 3, 3, 3, 4, 4, 4] },
  // The wave: 1-3 rising, 4-7 rolling (looped), 8-10 drawn back when he pulls.
  { name: 'tide-wave', file: 'Avner_SpecialMove_Tide_Effect1.png', n: 10, rows: 3, perRow: [4, 4, 2], mode: 'fx', anchor: 'ground', size: 230, holds: [3, 3, 3, 3, 3, 3, 3, 3, 3, 4] },
  // The moonlit zone: 1-3 appearing, 4-7 while it lasts (looped), 8-10 fading.
  { name: 'crescent', file: 'Avner_SpecialMove_Moonlit_Effect.png', n: 10, rows: 2, mode: 'fx', anchor: 'ground', size: 330, holds: [4, 4, 4, 6, 6, 6, 6, 4, 4, 4] },
  { name: 'moonbeam', file: 'Avner_SpecialMove_Moonlit_Snap_Effect.png', n: 8, rows: 2, mode: 'fx', anchor: 'ground', size: 360, holds: [3, 2, 3, 3, 3, 3, 4, 4] },
  { name: 'moonmark', file: 'Avner_SpecialMove_Moonlit_Mark.png', n: 6, rows: 2, mode: 'fx', anchor: 'centre', size: 70, holds: [6, 6, 6, 6, 6, 6] },
  // Supers. New Moon's sheet has two rows of the same 15 drawings with timing numbers written under them: the top row is read.
  { ref: [1, 186], name: 'new-moon', file: 'Avner_SuperMove_NewMoon.png', n: 15, crop: [0, 150, 2687, 650], holds: [3, 3, 3, 3, 3, 3, 4, 3, 3, 4, 5, 5, 5, 5, 8] },
  { file: 'Avner_SuperMove_NewMoon_Effect.png', n: 10, rows: 2, mode: 'fx', parts: [
    { name: 'eclipse', use: [1, 5], anchor: 'centre', size: 300, holds: [4, 4, 4, 8, 8] },
    { name: 'moon-slash', use: [6, 10], anchor: 'centre', size: 240, holds: [2, 2, 3, 3, 4] },
  ] },
  // Throws: the grab is the move's own sheet (drawings 1, 2 and the idle for a miss); the hold (the drawings shown
  // while the throw can still be broken) and the finish are the shared throw states, per throw (art.throws). The back
  // throw turns him round, so its first two finish drawings are stored mirrored.
  // ---- The newer drawings for blocks, hit reactions, throws and the universal systems (owner, Nov 25). No holds
  // came with these: each keeps the length the rules give its state, and the holds below are fitted to that. ----
  // Blocks: 1 the impact, 2 the guard, 3 coming out of it (4 is the plain stance, not used).
  { ref: [4, 190], bb: true, file: 'Avner_Block_Standing_Pushback.png', n: 4, parts: [{ name: 'block-stand', frames: [1, 2, 3], anchor: 'upper', lineFrom: [1, 2, 3, 4], holds: [4, 8, 3] }] },
  { ref: [4, 138], bb: true, file: 'Avner_Crouch_Block.png', n: 4, parts: [{ name: 'block-crouch', frames: [1, 2, 3], anchor: 'upper', lineFrom: [1, 2, 3, 4], holds: [4, 8, 3] }] },
  { name: 'block-air', bb: true, file: 'Avner_Block_Air_Pushback.png', n: 3, mode: 'air', holds: [4, 8, 4] },
  // Hit reactions, one row each: a hit high, a hit to the body, a hit while crouching (the third of each row is the plain stance).
  { ref: [3, 190], bb: true, file: 'Avner_Ground_HitReactions_Crouch_HitReactions.png', n: 9, rows: 3, parts: [
    { name: 'hit-stand', frames: [1, 2], anchor: 'upper', holds: [6, 1] },
    { name: 'hit-stand-gut', frames: [4, 5], anchor: 'upper', holds: [6, 1] },
    { name: 'hit-crouch', frames: [7, 8], anchor: 'upper', holds: [6, 1] },
  ] },
  // In the air: 1-2 the hit, 3-4 falling (not used: the tumble has its own sheet), 5-6 landing on his back and lying.
  { bb: true, file: 'Avner_Being_Launched_Air_HitReaction.png', n: 6, rows: 2, parts: [
    { name: 'hit-air', frames: [1, 2], mode: 'air', holds: [5, 1] },
    { name: 'knockdown', frames: [5, 6], lineFrom: [5, 6], holds: [6, 34] },
  ] },
  { name: 'spin', bb: true, file: 'Avner_Spin.png', n: 4, mode: 'air', holds: [3, 3, 3, 3] },
  { ref: [1, 180], name: 'tumble', bb: true, file: 'Avner_Tumble.png', n: 4, mode: 'air', holds: [6, 6, 6, 6] },
  { ref: [5, 58], name: 'slide', bb: true, file: 'Avner_Slide.png', n: 5, rows: 2, holds: [4, 8, 8, 8, 1] },
  { ref: [1, 190], name: 'crumple', bb: true, file: 'Avner_Crumple.png', n: 6, rows: 2, holds: [5, 6, 7, 8, 9, 10] },
  // Getting up, a row each: on the spot (the wake-up), rolling forward (no state for it yet), rolling back (the ground tech).
  { ref: [4, 190], bb: true, file: 'Avner_Getup_Neutral_Forward_Back.png', n: 12, rows: 3, parts: [
    { name: 'wakeup', frames: [1, 2, 3, 4], holds: [3, 3, 3, 3] },
    { name: 'getup-forward', frames: [5, 6, 7, 8], holds: [4, 4, 4, 4] },
    { name: 'ground-tech', frames: [9, 10, 11, 12], holds: [4, 4, 4, 4] },
  ] },
  { name: 'air-tech', bb: true, file: 'Avner_Forward_And_Back_AirTech.png', n: 4, mode: 'air', holds: [3, 3, 3, 3] },
  // Thrown: 1-2 grabbed, 3 lifted, 4 flung (5, lying, is not used: the knockdown follows).
  { bb: true, file: 'Avner_Being_Thrown.png', n: 5, rows: 2, parts: [{ name: 'thrown', frames: [1, 2, 3, 4], lineFrom: [1, 2], holds: [7, 7, 6, 40] }] },
  // Throws: the grab is the move's own sheet (drawings 1, 2 and the stance for a miss); the hold (shown while the throw
  // can still be broken) and the finish are the shared throw states, per throw (art.throws). The back throw turns him
  // round, so its first two finish drawings are stored mirrored.
  { ref: [7, 190], bb: true, file: 'Avner_Forward_Throw.png', n: 7, rows: 2, parts: [
    { name: 'throw-forward', frames: [1, 2, 7], anchor: 'upper', holds: [4, 10, 11] },
    { name: 'throw-forward-hold', frames: [1, 2, 3], anchor: 'upper', holds: [4, 4, 6] },
    { name: 'throw-forward-finish', frames: [4, 5, 6, 7], anchor: 'upper', holds: [6, 6, 10, 8] },
  ] },
  { ref: [7, 190], bb: true, file: 'Avner_Back_Throw.png', n: 7, rows: 2, parts: [
    { name: 'throw-back', frames: [1, 2, 7], anchor: 'upper', holds: [4, 10, 11] },
    { name: 'throw-back-hold', frames: [1, 2, 3], anchor: 'upper', holds: [4, 4, 6] },
    { name: 'throw-back-finish', frames: [4, 5, 6, 7], anchor: 'upper', holds: [8, 8, 7, 7], mirror: [1, 2] },
  ] },
  // Vow: 1 the guard coming up, 2-4 holding it, 5 a hit absorbed, 6 settling.
  { bb: true, file: 'Avner_Vow_Guard.png', n: 6, rows: 2, parts: [
    { name: 'vow-start', frames: [1, 2], anchor: 'upper', holds: [2, 2] },
    { name: 'vow-hold', frames: [2, 3, 4, 3], anchor: 'upper', holds: [9, 9, 9, 9] },
    { name: 'vow-absorb', frames: [5, 6], anchor: 'upper', holds: [8, 6] },
  ] },
  // The Vow strike: only the full one was drawn; the quick and the middle strike play the same drawings faster.
  { ref: [7, 190], bb: true, file: 'Avner_Vow_Strike_Full.png', n: 7, rows: 2, parts: [
    { name: 'vow-quick', frames: [1, 2, 3, 4, 5, 6, 7], anchor: 'upper', holds: [5, 4, 3, 5, 5, 5, 5] },
    { name: 'vow-strike', frames: [1, 2, 3, 4, 5, 6, 7], anchor: 'upper', holds: [7, 6, 3, 6, 6, 5, 5] },
    { name: 'vow-full', frames: [1, 2, 3, 4, 5, 6, 7], anchor: 'upper', holds: [8, 7, 4, 6, 6, 6, 6] },
  ] },
  { ref: [5, 190], name: 'repel', bb: true, file: 'Avner_Repel.png', n: 5, rows: 2, anchor: 'upper', holds: [2, 3, 9, 4, 4] },
  { ref: [6, 138], name: 'draw', bb: true, file: 'Avner_Draw.png', n: 6, rows: 2, anchor: 'upper', holds: [2, 3, 3, 3, 3, 3] },
  // Absolve: 1-5 the burst (3-5 off the ground), 6-7 coming down from it.
  { ref: [7, 190], bb: true, file: 'Avner_Absolve.png', n: 7, rows: 2, parts: [
    { name: 'absolve', frames: [1, 2, 3, 4, 5], anchor: 'upper', lineFrom: [1, 2, 6, 7], holds: [4, 4, 4, 4, 4] },
    { name: 'absolve-recovery', frames: [6, 7], anchor: 'upper', lineFrom: [6, 7], holds: [20, 20] },
  ] },
  // Not used by the game yet (there is no intro or win state): cut so they are ready.
  { ref: [1, 190], name: 'win-pose', bb: true, file: 'Avner_WinPose.png', n: 8, rows: 2, anchor: 'upper', holds: [6, 6, 6, 8, 8, 6, 6, 30] },
  { ref: [8, 190], name: 'intro', bb: true, file: 'Avner_Intro.png', n: 8, rows: 2, anchor: 'upper', holds: [8, 8, 6, 8, 8, 8, 6, 20] },
  { ref: [5, 186], name: 'throw-tech', file: 'Avner_Throw_Tech.png', n: 5, holds: [3, 4, 5, 4, 4] },
  // Universal systems.
  // ---- The Lantern-Bearer kit (owner, Nov 27). Sized by his HEAD (by: 'hair': no lantern in half of them, and the
  // low stances are shorter), feet planted (anchor: 'foot'). set: 'E' = the empty-hand set, placed by its own idle. ----
  { name: 'e-idle', by: 'hair', set: 'E', footRef: true, file: 'Avner_NoLantern_Idle.png', n: 12, rows: 3, anchor: 'foot', holds: [7, 6, 5, 5, 6, 7, 6, 5, 7, 6, 5, 5] },
  { ref: [1, GUARD_H], name: 'e-base', set: 'E', file: 'Avner_NoLantern_BaseSprite.png', n: 1, anchor: 'foot', holds: [10] }, // his empty-hand base sprite: replaces a move's last drawing where it does not match (endWith)
  { by: 'hair', set: 'E', file: 'Avner_NoLantern_Jump.png', n: 12, rows: 3, parts: [
    { name: 'e-jumpsquat', frames: [1, 2, 3, 4], anchor: 'foot', lineFrom: [1, 2, 3], holds: [1, 1, 1, 1] },
    { name: 'e-jump', frames: [5, 6, 7, 8, 9, 10], mode: 'air', holds: [3, 4, 5, 6, 5, 7] },
    { name: 'e-land', frames: [11, 12], anchor: 'foot', lineFrom: [11, 12], holds: [2, 2] },
  ] },
  { ref: [12, GUARD_H], name: 'e5L', set: 'E', file: 'Avner_NoLantern_Light.png', n: 12, rows: 3, anchor: 'foot', holds: [1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 2] },
  { ref: [12, GUARD_H], name: 'e5M', set: 'E', file: 'Avner_NoLantern_Medium.png', n: 12, rows: 3, anchor: 'foot', holds: [1, 2, 2, 2, 1, 1, 1, 2, 2, 3, 3, 4] },
  { ref: [12, GUARD_H], name: 'e5H', set: 'E', file: 'Avner_NoLantern_Heavy.png', n: 12, rows: 3, anchor: 'foot', holds: [2, 2, 2, 2, 2, 2, 2, 3, 3, 4, 4, 5] },
  { ref: [12, GUARD_H], name: 'e4H', set: 'E', file: 'Avner_NoLantern_BackHeavy.png', n: 12, rows: 3, anchor: 'foot', holds: [2, 2, 2, 2, 2, 2, 2, 2, 4, 4, 5, 7] },
  { ref: [14, GUARD_H], name: 'e6H', set: 'E', file: 'Avner_NoLantern_ForwardHeavy.png', n: 14, rows: 2, anchor: 'foot', holds: [3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 4, 5, 6, 7] },
  { ref: [12, GUARD_H], name: 'e5S', set: 'E', file: 'Avner_NoLantern_SLauncher.png', n: 12, rows: 3, anchor: 'foot', holds: [2, 2, 2, 2, 1, 2, 2, 3, 4, 4, 5, 6] },
  { name: 'e2L', by: 'hair', set: 'E', file: 'Avner_NoLantern_Crouch_Light.png', n: 12, rows: 3, anchor: 'foot', holds: [1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 2] },
  { name: 'e2M', by: 'hair', set: 'E', file: 'Avner_NoLantern_Crouch_Medium.png', n: 12, rows: 3, anchor: 'foot', holds: [1, 2, 2, 2, 1, 1, 1, 2, 3, 3, 3, 4] },
  { name: 'e2H', by: 'hair', set: 'E', file: 'Avner_NoLantern_Crouch_Heavy.png', n: 12, rows: 3, anchor: 'foot', holds: [2, 2, 2, 2, 1, 2, 2, 1, 4, 5, 6, 7] },
  { name: 'e3H', by: 'hair', set: 'E', file: 'Avner_NoLantern_Crouch_DownforwardHeavy.png', n: 12, rows: 3, anchor: 'foot', holds: [2, 2, 2, 2, 3, 1, 1, 1, 4, 5, 6, 7] },
  { name: 'ejL', by: 'hair', set: 'E', file: 'Avner_NoLantern_Air_Light.png', n: 12, rows: 3, mode: 'air', holds: [1, 1, 2, 1, 1, 1, 1, 1, 2, 2, 2, 2] },
  { name: 'ejM', by: 'hair', set: 'E', file: 'Avner_NoLantern_Air_Medium.png', n: 12, rows: 3, mode: 'air', holds: [1, 1, 2, 2, 1, 1, 2, 2, 2, 3, 3, 4] },
  { name: 'ejH', by: 'hair', set: 'E', file: 'Avner_NoLantern_Air_Heavy.png', n: 12, rows: 3, mode: 'air', holds: [2, 2, 2, 2, 1, 2, 2, 1, 3, 4, 5, 6] },
  // Commands to a lantern that is already set: empty-handed from the first drawing.
  { ref: [12, GUARD_H], name: 'rite-recall', set: 'E', file: 'Avner_NoLantern_Rite_Recall.png', n: 12, rows: 3, anchor: 'foot', holds: [1, 1, 1, 2, 2, 1, 1, 1, 2, 2, 2, 2] },
  { ref: [12, GUARD_H], name: 'rite-pendulum', set: 'E', file: 'Avner_NoLantern_Rite_Pendulum.png', n: 12, rows: 3, anchor: 'foot', holds: [1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2] },
  { ref: [12, GUARD_H], name: 'pulse', set: 'E', file: 'Avner_NoLantern_Rite_Pulse.png', n: 12, rows: 3, anchor: 'foot', holds: [1, 1, 1, 2, 2, 2, 2, 2, 2, 3, 3, 3] },
  // The catch: 6 drawings (the brief's holds list 8), refitted. It ends in the lantern stance.
  { ref: [6, 190], name: 'rite-catch', set: 'E', sets: 'LLLLLL', file: 'Avner_NoLantern_Rite_Catch.png', n: 6, rows: 2, anchor: 'foot', holds: [1, 2, 2, 2, 2, 3] },
  // Setting the lantern: these start in the lantern stance (set: 'L', placed by the lantern idle).
  { ref: [1, 190], name: 'rite-hang', set: 'L', sets: 'LLLLLEEEEEEE', endWith: ['e-base', 0], file: 'Avner_Rite_Neutral.png', n: 12, rows: 3, anchor: 'foot', holds: [2, 2, 2, 1, 2, 1, 1, 1, 2, 2, 2, 2] },
  { ref: [1, 190], name: 'rite-lob', set: 'L', sets: 'LLLLLEEEEEEE', endWith: ['e-base', 0], file: 'Avner_Rite_Forward.png', n: 12, rows: 3, anchor: 'foot', holds: [1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 4] },
  { ref: [12, 190], name: 'rite-slide', set: 'L', sets: 'LLLLLEEEEEEE', endWith: ['e-base', 0], file: 'Avner_Rite_Down.png', n: 12, rows: 3, anchor: 'foot', holds: [1, 2, 2, 2, 2, 2, 2, 3, 3, 3, 4, 4] },
  { name: 'rite-leave', bb: true, set: 'L', file: 'Avner_Air_Rite_Neutral.png', n: 12, rows: 3, mode: 'air', holds: [1, 1, 1, 2, 2, 1, 1, 1, 2, 2, 2, 2] },
  // Moonstruck: the owner's GIF (Nov 27; Avner_SpecialMove_Moonstruck.png is a GIF under that name, 12 frames at 0.2 s,
  // 288 px), laid out 6 x 2 into Avner_SpecialMove_Moonstruck_Gif.png by ffmpeg. The holds stay fitted to the move.
  { ref: [12, 190], name: 'moonstruck', set: 'L', file: 'Avner_SpecialMove_Moonstruck_Gif.png', n: 12, rows: 2, anchor: 'foot', holds: [2, 2, 2, 2, 2, 1, 2, 2, 4, 5, 5, 6] },
  // The Sliver (236 with the lantern set or coming home; owner, Nov 27): his GIF Avner_SpecialMove_Silver.gif, 9 frames,
  // laid out 9 x 1 into Avner_SpecialMove_Silver_Gif.png by ffmpeg. His holds list 12; fitted to the 9 drawings with the
  // same timing: the push (7) on frames 13-14, the shot on 13, free on 36.
  { name: 'sliver', by: 'hair', set: 'E', file: 'Avner_SpecialMove_Silver_Gif.png', n: 9, anchor: 'foot', holds: [2, 2, 2, 2, 2, 2, 2, 10, 12] },
  { ref: [1, 190], name: '6H', set: 'L', file: 'Avner_ForwardHeavy.png', n: 14, rows: 2, anchor: 'foot', holds: [2, 2, 2, 2, 3, 3, 3, 4, 2, 2, 4, 5, 6, 7] },
  // The lantern as its own object: front, 3/4, side, 3/4 the other way, dark, struck. Placed by the middle of its ring.
  { name: 'lantern-object', bb: true, file: 'Lantern_Idle.png', n: 6, anchor: 'ring', holds: [2, 2, 2, 2, 2, 6] },
  // Effects, light on black, cut on a grid.
  { file: 'Lantern_LightLevelsEffect.png', n: 9, rows: 3, mode: 'fx', parts: [
    { name: 'lantern-light-3', use: [1, 3], anchor: 'centre', size: 96, holds: [6, 6, 6] },
    { name: 'lantern-light-2', use: [4, 6], anchor: 'centre', size: 48, holds: [6, 6, 6] },
    { name: 'lantern-light-1', use: [7, 9], anchor: 'centre', size: 30, holds: [6, 6, 6] },
  ] },
  { file: 'Lantern_SnuffAndRelight.png', n: 8, rows: 2, mode: 'fx', parts: [
    { name: 'flame-snuff', use: [1, 4], anchor: 'ground', size: 64, holds: [2, 2, 3, 4] },
    { name: 'flame-relight', use: [5, 8], anchor: 'ground', size: 64, holds: [1, 2, 2, 3] },
  ] },
  { name: 'moonstruck-mark', file: 'MoonstruckMark.png', n: 10, rows: 2, mode: 'fx', anchor: 'centre', size: 74, holds: [1, 2, 6, 6, 6, 6, 2, 2, 3, 4] },
  { name: 'pulse-fx', file: 'Avner_NoLantern_Rite_Pulse_Effect.png', n: 9, rows: 3, mode: 'fx', anchor: 'centre', size: 300, holds: [1, 1, 2, 2, 2, 3, 3, 3, 4] },
  { name: 'full-crescent', file: 'Lantern_FullCrescent.png', n: 10, rows: 2, mode: 'fx', anchor: 'centre', size: 210, holds: [2, 2, 3, 3, 3, 3, 2, 3, 3, 4] },
  // Moonstruck's arc (owner, Nov 27): 6 drawings evenly spaced in one row, each placed by its cell's middle so the swing
  // does not drift. Played as the move's layer (spread over its 36 frames): 18 cells of 2 frames, the arc from frame
  // 10, its second drawing on frame 12, the hit.
  // The Sliver's shot: 1 the spark, 2-6 the thin crescent flying, 7-8 the hit, 9 the fade. Placed by its brightest point.
  { name: 'sliver-fx', file: 'Avner_SpecialMove_Silver_effect.png', n: 9, mode: 'fx', anchor: 'bright', size: 90, holds: [2, 2, 3, 3, 3, 3, 2, 3, 4] },
  // The pendulum (owner, Nov 27). Trail: one pass of the swing, 6 drawings that are pieces of one circle, each cell
  // centred on that circle (read off the sheet), so the arc stays put; played once a pass, flipped on the way back.
  { name: 'pendulum-trail', file: 'Avner_NoLantern_Rite_Pendulum_Effect1.png', n: 6, mode: 'fx', anchor: 'centre', size: 90, centres: [[224, 745], [672, 745], [1120, 745], [1568, 745], [2016, 745], [2464, 745]], holds: [5, 5, 5, 5, 5, 5] },
  // Its hit: spark, burst, fade. Played where each swing hits.
  { name: 'pendulum-hit', file: 'Avner_NoLantern_Rite_Pendulum_Effect2.png', n: 5, mode: 'fx', anchor: 'bright', size: 110, holds: [2, 2, 3, 3, 4] },
  { name: 'moonstruck-arc', file: 'Avner_SpecialMove_Moonstruck_Effect.png', n: 6, mode: 'fx', anchor: 'centre', size: 200, centres: [[224, 760], [672, 760], [1120, 760], [1568, 760], [2016, 760], [2464, 760]], blank: [5, 7], holds: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2] },
];

const SHEETS = OTHER?.SHEETS ?? AVNER_SHEETS;
const ONLY = optv('only')?.split(',') ?? null;
const ANALYZE = flag('analyze');

/** A drawn sheet as pixels. A JPEG (whatever its file name says) is converted by ffmpeg first. */
function readSheet(path) {
  const raw = readFileSync(path);
  if (raw[0] === 0x89 && raw[1] === 0x50) return decodePng(raw);
  return decodePng(execFileSync('ffmpeg', ['-loglevel', 'error', '-i', path, '-f', 'image2pipe', '-vcodec', 'png', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1 << 28 }));
}

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
function keyEffect(img, feather = 0) {
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
    // feather: a dark drawing on white fades to the paper through pale pixels, which would be left as a bright rim.
    // Dim everything by its distance from the outside, to nothing at the edge and untouched `feather` px in.
    if (feather > 0) {
      const dist = new Float32Array(N).fill(feather + 1);
      let ring = [];
      for (let i = 0; i < N; i++) if (outside[i]) { dist[i] = 0; ring.push(i); }
      for (let d = 1; d <= feather && ring.length; d++) {
        const next = [];
        for (const i of ring) {
          const x = i % W;
          for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < N && dist[j] > d) { dist[j] = d; next.push(j); }
        }
        ring = next;
      }
      for (let i = 0; i < N; i++) if (!outside[i] && dist[i] <= feather) { const t = dist[i] / feather, k = t * t * (3 - 2 * t); for (let c = 0; c < 3; c++) src[i * 3 + c] *= k; }
    }
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
function gridDrawings(K, n, rows, hand = null, perRow = null) {
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
  const label = new Int32Array(W * H);
  const boxes = [];
  for (let r = 0; r < rows; r++) {
    const per = perRow?.[r] ?? n / rows; // perRow: [drawings in each row] when the rows are not equally full
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

const isHair = (r, g, b) => r >= 44 && r <= 112 && r >= g + 10 && g >= b && b >= 16 && b <= 64 && g <= 78; // his dark brown locks
const isGold = (r, g, b) => r > 170 && g > 120 && b < 110 && r > b + 80; // the lantern's ring and cap
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
  let lan = 0, lx = 0, ly = 0, bottom = 0, hair = 0;
  const ring = { x0: W, y0: K.H, x1: 0, y1: 0 }, ringTo = box.y0 + (box.y1 - box.y0) * 0.24, hairTo = box.y0 + (box.y1 - box.y0) * 0.55;
  for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) {
    const p = y * W + x;
    if (!inside(p)) continue;
    if (y > bottom) bottom = y;
    if (y <= hairTo && isHair(rgb[p * 3], rgb[p * 3 + 1], rgb[p * 3 + 2])) hair++;
    if (y <= ringTo && isGold(rgb[p * 3], rgb[p * 3 + 1], rgb[p * 3 + 2])) { if (x < ring.x0) ring.x0 = x; if (x > ring.x1) ring.x1 = x; if (y < ring.y0) ring.y0 = y; if (y > ring.y1) ring.y1 = y; }
    if (BY_AREA || isLantern(rgb[p * 3], rgb[p * 3 + 1], rgb[p * 3 + 2])) { lan++; lx += x; ly += y; }
  }
  // The body's core: the thickest part (head, torso, hips), limbs and streaks eroded away.
  const cap = 60;
  const T = thickness(W, K.H, inside, box, cap);
  let max = 0;
  for (let k = 0; k < T.d.length; k++) if (T.d[k] > max) max = T.d[k];
  const cut = max * 0.55;
  let cx = 0, cy = 0, cn = 0;
  for (let y = 0; y < T.h; y++) for (let x = 0; x < T.w; x++) if (T.d[y * T.w + x] >= cut) { cx += x; cy += y; cn++; }
  // The upper body: the centre of the top 40% of the drawing (head and chest), which stays put while limbs move.
  let ux = 0, un = 0;
  const upTo = box.y0 + (bottom - box.y0) * 0.4;
  for (let y = box.y0; y <= upTo; y++) for (let x = box.x0; x <= box.x1; x++) if (inside(y * W + x)) { ux += x; un++; }
  // Feet: what touches the lowest band of the drawing.
  const band = bottom - 14;
  let fx0 = W, fx1 = 0;
  for (let y = band; y <= bottom; y++) for (let x = box.x0; x <= box.x1; x++) if (inside(y * W + x)) { if (x < fx0) fx0 = x; if (x > fx1) fx1 = x; }
  return { hair, ring: ring.x1 > ring.x0 ? [(ring.x0 + ring.x1) / 2, (ring.y0 + ring.y1) / 2] : [(box.x0 + box.x1) / 2, box.y0], box, bottom, lantern: lan, lanternAt: lan > 40 ? [lx / lan, ly / lan] : null, core: [box.x0 - 1 + cx / cn, box.y0 - 1 + cy / cn], upper: un ? ux / un : (box.x0 + box.x1) / 2, thick: max, feet: [fx0, fx1], height: bottom - box.y0 + 1 };
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

let BB_LANTERN = 0, BB_SCALE = 0; // the same two measures for the newer sheets (bb: true), taken from their own idle
function bodyScale(ms, bb = false) {
  if (bb) {
    const sizes = ms.map((m) => m.lantern).filter((n) => n > 200);
    return sizes.length && BB_LANTERN ? BB_SCALE * Math.sqrt(BB_LANTERN / median(sizes)) : BB_SCALE || null;
  }
  // The lantern's area says how big the drawing was made; the idle sets what that should be.
  const sizes = ms.map((m) => m.lantern).filter((n) => n > 200);
  if (!sizes.length || !IDLE_LANTERN) return null;
  return SCALE * Math.sqrt(IDLE_LANTERN / median(sizes));
}

/** A scaleRef sheet sets how big its family of sheets is drawn: its lantern's size and its standing height. */
// by: 'hair': the empty-hand sheets have no lantern and no upright drawing, so they are sized by his head: the area of
// his hair, which must come to E_HAIR sheet px. That number is read off the Catch sheet, the one sheet with both
// stances at one size: its last drawing stands 190 px, and the hair of its five empty-hand drawings (median 12786
// drawn px) is then 3098 sheet px.
// Checked against the three sheets that show both stances in one picture (Catch, Hang, Lob/Slide): the guard there
// stands 7% taller than 3098 gave, so the figure is raised by that (area: x 1.15).
const E_HAIR = 3563;
// The moves that end back in his empty-hand guard are sized by that last drawing instead: it stands as tall as the
// empty-hand idle (game px). Head-size readings swing with the head's angle; a matching end pose does not.

const hairScale = (ms) => Math.sqrt(E_HAIR / median(ms.map((m) => m.hair).filter((n) => n > 50)));
// foot anchor: how far in front of his rear foot the fighter's position is, game px, per stance: L read off the
// lantern idle, E off the empty-hand idle (its wide guard puts his middle further forward). A drawing is placed by its
// own stance (spec.set, or per drawing: sets: 'LLEE...'). Where a move changes stance, its data moves him by the
// difference (warp) on the frame the stance changes, so his rear foot stays put and his boxes follow his body.
const FOOT = {};
function setScale(spec, ms) {
  if (spec.bb) { FOOT.L = (median(ms.map((m) => m.upper - m.feet[0])) * (((spec.stand ?? STAND) * RES) / median(ms.map((m) => m.height)))) / RES; }
  if (spec.bb) { BB_LANTERN = median(ms.map((m) => m.lantern)); BB_SCALE = ((spec.stand ?? STAND) * RES) / median(ms.map((m) => m.height)); return; }
  IDLE_LANTERN = median(ms.map((m) => m.lantern));
  SCALE = (STAND * RES) / median(ms.map((m) => m.height));
}

// even: the owner's sheets are not drawn at one size from drawing to drawing (the action drawings of a move are often
// bigger than the pose it ends in). A body's area changes little with the pose, so each drawing's area (sash left out:
// it flaps) is compared with the table's target for its stance (EVEN.stand / crouch / air, sheet px, square root of
// the area); smoothed over neighbours so a run of drawings moves together, and only what falls outside EVEN.band is
// corrected, back to the band's edge (a lunge really does show more body than a stance).
const isSash = (r, g, b) => r > 140 && g < 85 && b < 95 && r > 2.2 * g;
function evenScales(spec, K, D, ms, k) {
  const E = OTHER?.EVEN, T = E?.[spec.even];
  if (!T) return ms.map(() => k);
  const q = ms.map((m, i) => {
    let n = 0;
    for (let y = m.box.y0; y <= m.box.y1; y++) for (let x = m.box.x0; x <= m.box.x1; x++) {
      const p = y * K.W + x;
      if (K.a[p] > 0.5 && D.owner[D.label[p]] === i && !isSash(K.rgb[p * 3], K.rgb[p * 3 + 1], K.rgb[p * 3 + 2])) n++;
    }
    return (Math.sqrt(n) * k) / T;
  });
  return q.map((_, i) => {
    const v = median([q[Math.max(0, i - 1)], q[i], q[Math.min(q.length - 1, i + 1)]]);
    const c = Math.min(E.band[1], Math.max(E.band[0], v)) / v;
    return k * Math.min(E.cap?.[1] ?? 9, Math.max(E.cap?.[0] ?? 0, c));
  });
}

// tone: his colours drift from sheet to sheet (pants from maroon to purple, skin lighter or darker). Each class of
// colour is measured over the sheet (a drawing that strays from its sheet is measured by itself) and multiplied to the
// table's PALETTE. Classes blend into each other, so no hard edge appears. Outline, gi, wraps, gold and painted
// light are left alone. pantsBand: [from, to] (shares of the cell's height): dark brown inside it is pants too, for a
// sheet whose pants are painted so brown the colour rule reads them as hair.
function tone(out, OW, cell, count, spec) {
  const P = OTHER.PALETTE, NAMES = ['pants', 'skin', 'hair', 'sash'];
  const band = spec.pantsBand ? [cell.h * spec.pantsBand[0], cell.h * spec.pantsBand[1]] : null;
  const sm = (t) => { const v = Math.min(1, Math.max(0, t)); return v * v * (3 - 2 * v); };
  // weights [pants, skin, hair, sash] of one pixel, or null when it is none of them
  const weights = (r, g, b, y) => {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx <= 24 || g > r || b > r) return null;
    if (mx > 185 && mx - mn < 70) return null;
    if (r > 190 && g > 150 && b < 130) return null;
    if (isSash(r, g, b)) return [0, 0, 0, 1];
    let wp = sm((b - g - 1) / 7);
    if (band && y >= band[0] && y <= band[1] && mx <= 105) wp = 1;
    const ws = sm((mx - 90) / 30);
    return [wp, (1 - wp) * ws, (1 - wp) * (1 - ws), 0];
  };
  const sums = Array.from({ length: count + 1 }, () => NAMES.map(() => [0, 0, 0, 0])); // per drawing, then the sheet
  for (let n = 0; n < count; n++) for (let y = 0; y < cell.h; y++) for (let x = 0; x < cell.w; x++) {
    const p = (y * OW + n * cell.w + x) * 4;
    if (out[p + 3] < 200) continue;
    const w = weights(out[p], out[p + 1], out[p + 2], y);
    if (!w) continue;
    const c = w.indexOf(Math.max(...w));
    if (w[c] < 0.75) continue; // only clear members set the measure
    for (const a of [sums[n][c], sums[count][c]]) { a[0]++; a[1] += out[p]; a[2] += out[p + 1]; a[3] += out[p + 2]; }
  }
  const mean = (a) => (a[0] >= 300 ? [a[1] / a[0], a[2] / a[0], a[3] / a[0]] : null);
  const sheet = sums[count].map(mean);
  for (let n = 0; n < count; n++) {
    const gain = NAMES.map((name, c) => {
      let m = sheet[c];
      const own = mean(sums[n][c]);
      if (own && m && own.some((v, ch) => Math.abs(v - m[ch]) > 0.06 * Math.max(m[ch], 40))) m = own;
      m ??= own;
      return m ? P[name].map((t, ch) => Math.min(1.7, Math.max(0.65, t / m[ch]))) : [1, 1, 1];
    });
    for (let y = 0; y < cell.h; y++) for (let x = 0; x < cell.w; x++) {
      const p = (y * OW + n * cell.w + x) * 4;
      if (out[p + 3] === 0) continue;
      const w = weights(out[p], out[p + 1], out[p + 2], y);
      if (!w) continue;
      for (let ch = 0; ch < 3; ch++) {
        let g = 0;
        for (let c = 0; c < 4; c++) g += w[c] * gain[c][ch];
        out[p + ch] = Math.min(255, Math.round(out[p + ch] * g));
      }
    }
  }
}

/** E_FIX for a sheet of the empty-hand set alone; 1 for everything else. */
const eFix = (spec) => (spec.set === 'E' && !spec.sets ? E_FIX : 1);

function processBody(spec, manifest) {
  const K = keyBody(readSheet(DIR + spec.file));
  if (spec.crop) for (let y = 0; y < K.H; y++) for (let x = 0; x < K.W; x++) if (x < spec.crop[0] || y < spec.crop[1] || x > spec.crop[2] || y > spec.crop[3]) K.a[y * K.W + x] = 0;
  const mask = new Uint8Array(K.W * K.H);
  for (let i = 0; i < mask.length; i++) mask[i] = K.a[i] > 0.5 ? 1 : 0;
  const D = spec.grid ? gridDrawings(K, spec.n, spec.rows ?? 1, spec.cuts, spec.perRow) : drawings(K.W, K.H, mask, spec.n, spec.rows ?? 1); // grid: drawings packed so tight they touch
  // join: [[keep, loose]]: a shape drawn apart from its body (a slash arc) that was counted as a drawing of its own.
  for (const [keep, loose] of spec.join ?? []) {
    for (let i = 0; i < D.owner.length; i++) if (D.owner[i] === loose - 1) D.owner[i] = keep - 1;
    const b = D.boxes[keep - 1], c = D.boxes[loose - 1];
    D.boxes[keep - 1] = { x0: Math.min(b.x0, c.x0), y0: Math.min(b.y0, c.y0), x1: Math.max(b.x1, c.x1), y1: Math.max(b.y1, c.y1) };
  }
  const ms = D.boxes.map((_, i) => measureBody(K, D, i));
  if (spec.scaleRef) setScale(spec, ms);
  const byHair = spec.by === 'hair' ? hairScale(ms) : null;
  const k = (byHair ?? (spec.ref ? (spec.ref[1] * RES) / ms[spec.ref[0] - 1].height : bodyScale(ms, spec.bb) ?? SCALE)) * (spec.fix ?? 1) * eFix(spec);
  if (spec.footRef) FOOT[spec.set] = (median(ms.map((m) => m.upper - m.feet[0])) * k) / RES;
  // one scale per drawing: k, corrected where the drawing was made too big or too small (even), then by the table's
  // own hand-given factor per drawing of the sheet (scales: [..], 1 = leave)
  const ks = evenScales(spec, K, D, ms, k).map((v, i) => v * (spec.scales?.[i] ?? 1));
  if (ANALYZE) {
    console.log(`${(spec.name ?? spec.file).padEnd(14)} ${K.kind.padEnd(11)} scale ${k.toFixed(3)}  hair ${ms.map((m) => m.hair).join(' ')}  heights ${ms.map((m) => m.height).join(' ')}  lantern ${ms.map((m) => m.lantern).join(' ')}${spec.even ? '  even ' + ks.map((v) => (v / k).toFixed(2)).join(' ') : ''}`);
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
      if (anchor === 'ring') return { ax: m.ring[0], ay: m.ring[1] };
      // air: [drawings]: he has left the ground there and the game lifts him, so the drawing hangs from his body.
      if (part.air?.includes(i + 1)) return { ax: anchor === 'upper' ? m.upper : m.core[0], ay: m.core[1] + (AIR_CENTRE * RES) / ks[i] };
      // lineFrom: only its drawings in this drawing's own row count (a sheet of two rows has two ground lines).
      const sameRow = (part.lineFrom ?? []).filter((f) => Math.abs(rowOf[f - 1] - rowOf[i]) < 700);
      const mates = part.lineFrom ? (sameRow.length ? sameRow : part.lineFrom).map((f) => ms[f - 1].bottom) : ms.filter((_, j) => Math.abs(rowOf[j] - rowOf[i]) < 300).map((o) => o.bottom);
      const line = median(mates);
      const ay = Math.abs(m.bottom - line) <= 16 ? m.bottom + 1 : line + 1;
      // shift: [game px per drawing]: moves a drawing forward (+) or back from where its anchor put it, for a move whose feet must stay planted.
      const sh = ((part.shift ?? spec.shift)?.[i] ?? 0) * RES / ks[i];
      // foot: the rear foot stays where it is; the fighter's position is the set's idle offset in front of it.
      const stance = (part.sets ?? spec.sets)?.[i] ?? spec.set ?? 'L';
      const footAt = anchor === 'foot' ? (part.footOf ? ms[part.footOf - 1] : m).feet[0] + ((FOOT[stance] ?? FOOT.L) * RES) / ks[i] : 0;
      return { ax: (anchor === 'foot' ? footAt : anchor === 'rear' ? m.feet[0] + 60 : anchor === 'upper' ? m.upper : m.core[0]) - sh, ay };
    });
    // One cell that holds every drawing with the anchor in the same place.
    let left = 0, right = 0, up = 0, down = 0;
    idx.forEach((i, n) => {
      const b = ms[i].box, p = pts[n];
      left = Math.max(left, (p.ax - b.x0) * ks[i]); right = Math.max(right, (b.x1 + 1 - p.ax) * ks[i]);
      up = Math.max(up, (p.ay - b.y0) * ks[i]); down = Math.max(down, (b.y1 + 1 - p.ay) * ks[i]);
    });
    if (part.mirror) left = right = Math.max(left, right); // mirrored drawings turn about the anchor: keep it in the middle
    const originX = Math.ceil(left) + 2, originY = Math.ceil(up) + 2;
    const cell = { w: originX + Math.ceil(right) + 2, h: originY + Math.ceil(down) + 2 };
    const OW = cell.w * idx.length, OH = cell.h;
    const out = new Uint8Array(OW * OH * 4);
    idx.forEach((i, n) => blit(K, D, i, out, OW, OH, { x: n * cell.w, y: 0, w: cell.w, h: cell.h }, pts[n].ax, pts[n].ay, originX, originY, ks[i]));
    if (spec.tone && OTHER?.PALETTE) tone(out, OW, cell, idx.length, spec);
    // mirror: [drawings of this part, counted from 1] stored flipped left to right (a throw that turns him round: the
    // engine flips his facing when it lands, so the drawings made before the turn are stored already flipped).
    for (const m of part.mirror ?? []) {
      const x0 = (m - 1) * cell.w;
      for (let y = 0; y < OH; y++) for (let x = 0; x < cell.w >> 1; x++) {
        const p = (y * OW + x0 + x) * 4, q = (y * OW + x0 + cell.w - 1 - x) * 4;
        for (let c = 0; c < 4; c++) { const t = out[p + c]; out[p + c] = out[q + c]; out[q + c] = t; }
      }
    }
    // In the game the origin is the fighter's position: the ground under him, or (air) AIR_CENTRE below his centre.
    const oy = mode === 'air' ? originY + AIR_CENTRE * RES : originY;
    const lantern = idx.map((i, n) => (ms[i].lanternAt ? [Math.round(((ms[i].lanternAt[0] - pts[n].ax) * ks[i]) / RES), Math.round(((pts[n].ay - ms[i].lanternAt[1]) * ks[i]) / RES) + (mode === 'air' ? AIR_CENTRE : 0)] : null));
    for (let n = 0; n < lantern.length; n++) if (!lantern[n]) lantern[n] = lantern[n - 1] ?? lantern.find((p) => p) ?? [0, 60];
    for (const m of part.mirror ?? []) lantern[m - 1] = [-lantern[m - 1][0], lantern[m - 1][1]];
    // Where each drawing reaches, in game px from the fighter's position (x forward, y up): [x0, y0, x1, y1].
    const up0 = mode === 'air' ? AIR_CENTRE : 0;
    const reach = idx.map((i, n) => { const b = ms[i].box, p = pts[n]; const kk = ks[i]; return [Math.round(((b.x0 - p.ax) * kk) / RES), Math.round(((p.ay - b.y1) * kk) / RES) + up0, Math.round(((b.x1 - p.ax) * kk) / RES), Math.round(((p.ay - b.y0) * kk) / RES) + up0]; });
    finish(part.name, out, OW, OH, idx.length, cell, { x: originX, y: originY }, { originX, originY: oy }, part.holds, false, manifest, { lantern, reach, from: spec.file, drawings: part.frames });
  }
}

function processEffect(spec, manifest) {
  const K = keyEffect(readSheet(DIR + spec.file), spec.feather ?? 0);
  // Split on the blobs; a lit sheet on plain black has loose sparks, so join what is close first.
  // Split by the dark gaps: rows first, then the darkest columns between the drawings of each row (glows may touch).
  const D = gridDrawings(K, spec.n, spec.rows ?? 1, spec.cuts, spec.perRow);
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
    if (spec.centres) return { lit, ax: spec.centres[i][0], ay: spec.centres[i][1] }; // placed by hand: a point that is the same place in every drawing
    const anchor = (spec.parts?.find((q) => i + 1 >= q.use[0] && i + 1 <= q.use[1]) ?? spec).anchor;
    if (anchor === 'ground') return { lit, ax: (gx0 + gx1) / 2, ay: y1 + 1 };
    if (anchor === 'bright' && bw) return { lit, ax: bx / bw, ay: by / bw };
    return { lit, ax: (x0 + x1) / 2, ay: (y0 + y1) / 2 };
  });
  // arc: 'right': every drawing is a piece of the right side of one circle (a crescent growing and fading), so each is
  // placed by that circle's middle: the tallest drawing gives the radius, and the middle is that far in from a
  // drawing's right edge.
  if (spec.arc === 'right') {
    const R = Math.max(...pts.map((p) => (p.lit.y1 - p.lit.y0) / 2));
    for (const p of pts) { p.ax = p.lit.x1 - R; p.ay = (p.lit.y0 + p.lit.y1) / 2; }
  }
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
  // blank: [before, after] adds empty cells, so an effect played as a move's layer (spread evenly over the move) starts and ends when it should.
  const lead = part.blank?.[0] ?? 0, cells = use.length + lead + (part.blank?.[1] ?? 0);
  const OW = cell.w * cells, OH = cell.h;
  const out = new Uint8Array(OW * OH * 4);
  use.forEach((i, n) => blit(K, D, i, out, OW, OH, { x: (n + lead) * cell.w, y: 0, w: cell.w, h: cell.h }, pts[i].ax, pts[i].ay, originX, originY, k));
  finish(part.name, out, OW, OH, cells, cell, { x: originX, y: originY }, { originX, originY }, part.holds, true, manifest, { from: spec.file, additive: true });
  // The same effect stored another way up: upside down (flip: 'v') or laid flat (turn: a quarter turn clockwise).
  for (const v of part.variants ?? []) {
    const c2 = v.turn ? { w: cell.h, h: cell.w } : cell;
    const o2 = v.turn ? { originX: cell.h - 1 - originY, originY: originX } : { originX, originY: cell.h - 1 - originY };
    const W2 = c2.w * use.length, out2 = new Uint8Array(W2 * c2.h * 4);
    for (let n = 0; n < use.length; n++) for (let y = 0; y < cell.h; y++) for (let x = 0; x < cell.w; x++) {
      const [x2, y2] = v.turn ? [cell.h - 1 - y, x] : [x, cell.h - 1 - y];
      const p = (y * OW + n * cell.w + x) * 4, q = (y2 * W2 + n * c2.w + x2) * 4;
      for (let c = 0; c < 4; c++) out2[q + c] = out[p + c];
    }
    finish(v.name, out2, W2, c2.h, use.length, c2, { x: o2.originX, y: o2.originY }, o2, part.holds, true, manifest, { from: spec.file, additive: true });
  }
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
  if (!wanted && !spec.scaleRef && !spec.footRef) continue;
  if (!existsSync(DIR + spec.file)) { console.log(`${names.join(', ')}: ${spec.file} is not there (skipped)`); continue; }
  if (spec.measureOnly) { processBodyQuiet(spec); continue; } // an older sheet kept only because it sets its family's size
  if (spec.mode === 'fx') processEffect(spec, manifest);
  else if (!wanted) { const was = ANALYZE; processBodyQuiet(spec); void was; } else processBody(spec, manifest);
}
// endWith: [sheet, drawing]: the move's last drawing does not match the stance it returns to, so it is replaced by
// that drawing of an already cut sheet (his base sprite), placed by its origin.
for (const spec of SHEETS) {
  if (!spec.endWith || ANALYZE || (ONLY && !ONLY.includes(spec.name))) continue;
  const m = manifest[spec.name].sprite, s = manifest[spec.endWith[0]].sprite;
  const out = decodePng(readFileSync(OUT + spec.name + '.png')), src = decodePng(readFileSync(OUT + spec.endWith[0] + '.png'));
  const x0 = (m.count - 1) * m.frameW;
  for (let y = 0; y < m.frameH; y++) for (let x = 0; x < m.frameW; x++) {
    const q = (y * out.width + x0 + x) * 4, sx = x - m.originX + s.originX, sy = y - m.originY + s.originY;
    const inside = sx >= 0 && sy >= 0 && sx < s.frameW && sy < s.frameH;
    const p = inside ? (sy * src.width + spec.endWith[1] * s.frameW + sx) * 4 : -1;
    for (let c = 0; c < 4; c++) out.data[q + c] = inside ? src.data[p + c] : 0;
  }
  writeFileSync(OUT + spec.name + '.png', encodePng(out));
  writeFileSync(PREVIEWS + spec.name + '.png', encodePng(contactSheet(out.data, out.width, out.height, m.count, { w: m.frameW, h: m.frameH }, { x: m.originX, y: m.originY }, false)));
  manifest[spec.name].swappedLast = spec.endWith;
  console.log(`${spec.name}: last drawing swapped for ${spec.endWith[0]} drawing ${spec.endWith[1] + 1}`);
}
if (FOOT.L && FOOT.E) { manifest._foot = { L: Math.round(FOOT.L), E: Math.round(FOOT.E), note: 'game px from his rear foot to his position, per stance; a move that changes stance moves him by E - L' }; console.log('foot offsets', JSON.stringify(manifest._foot)); }
if (!ANALYZE) writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 1)}\n`);

/** The idle is always measured (it sets the body size), even when only other sheets are asked for. */
function processBodyQuiet(spec) {
  const K = keyBody(readSheet(DIR + spec.file));
  const mask = new Uint8Array(K.W * K.H);
  for (let i = 0; i < mask.length; i++) mask[i] = K.a[i] > 0.5 ? 1 : 0;
  const D = drawings(K.W, K.H, mask, spec.n, spec.rows ?? 1);
  const ms = D.boxes.map((_, i) => measureBody(K, D, i));
  if (spec.scaleRef) setScale(spec, ms);
  if (spec.footRef) FOOT[spec.set] = (median(ms.map((m) => m.upper - m.feet[0])) * hairScale(ms) * eFix(spec)) / RES;
}
