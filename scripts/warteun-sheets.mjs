// War'Teun: the table of drawn sheets for the cutting tool.
//
//   node scripts/avner-prep.mjs --char warteun [--only 5L,jump] [--analyze]
//
// The owner's drawings (Nov 26) are in data/characters/War'Teun/ (2688 x 1520, rows on an even grid, see-through or
// on magenta; effects are light on a see-through ground). The game's files are written to data/characters/warteun/.
// He stands 190 px. The holds are the owner's, drawing by drawing (his brief of Nov 26). Every body sheet is cut on
// its grid: the dissolving drawings of his warps are loose strips that cannot be found as one shape.
// The fields are explained at the top of the table in avner-prep.mjs.
export const MEASURE = 'area';
const R = "../War'Teun/Warteun_";
const S = 190; // standing
const C = 126; // his deep squat
const G = { bb: true };
const D = { bb: true, grid: true }; // sheets with dissolving drawings: cut on the grid
// scales: [..] on a sheet = a hand-given size factor per drawing. The owner's drawings are not all one size inside a
// sheet (the action drawings are often bigger than the upright pose the sheet ends in, which sets its size); the
// factors come from measuring his head in each drawing and were checked by eye.
export const SHEETS = [
  { ...G, name: 'idle', scaleRef: true, stand: S, file: `${R}Idle.png`, n: 12, rows: 3, anchor: 'upper', holds: [10, 8, 7, 7, 4, 12, 7, 7, 7, 8, 10, 8] },
  { ...G, ref: [1, S], name: 'walk', file: `${R}Forward_Walk.png`, n: 10, rows: 3, perRow: [4, 4, 2], anchor: 'upper', holds: [7, 7, 6, 6, 6, 7, 7, 6, 6, 6] },
  { ...G, ref: [1, S], name: 'walk-back', file: `${R}Back_Walk.png`, n: 8, rows: 2, anchor: 'upper', holds: [7, 7, 7, 7, 7, 7, 7, 7] },
  // Crouch: 5 drawings (the brief lists 6): 1 going down, 2-5 the loop.
  { ...G, ref: [3, C], name: 'crouch', file: `${R}Crouch.png`, n: 5, rows: 2, perRow: [4, 1], anchor: 'upper', holds: [8, 12, 10, 10, 12] },
  // Jump: 1 the squat, 2-4 rising, 5 the top, 6 turning over, 7 falling, 8-9 landing.
  { ...G, ref: [9, S], file: `${R}Jump.png`, n: 9, rows: 3, perRow: [4, 4, 1], parts: [
    { name: 'jumpsquat', frames: [1], anchor: 'upper', lineFrom: [1, 8, 9], holds: [3] },
    { name: 'jump', frames: [2, 3, 4, 5, 6, 7], mode: 'air', holds: [3, 4, 5, 7, 5, 36] },
    { name: 'fall', frames: [7], mode: 'air', holds: [60] },
    { name: 'land', frames: [8, 9], anchor: 'upper', lineFrom: [1, 8, 9], holds: [4, 4] },
  ] },
  // Dashes are teleports: forward 3 is the dissolve; back 3 the dissolve, 4 the re-forming.
  { ...D, ref: [6, S], name: 'dash', file: `${R}Forward_Dash.png`, n: 6, rows: 2, anchor: 'upper', holds: [3, 2, 3, 3, 4, 5] },
  { ...D, ref: [6, S], name: 'backdash', file: `${R}Back_Dash.png`, n: 6, rows: 2, anchor: 'upper', holds: [3, 2, 3, 3, 4, 6] },
  { ...D, file: `${R}Forward_And_Back_AirDash.png`, n: 8, rows: 2, parts: [
    { name: 'airdash', frames: [1, 2, 3, 4], mode: 'air', holds: [2, 3, 3, 4] },
    { name: 'airdash-back', frames: [5, 6, 7, 8], mode: 'air', holds: [2, 3, 3, 4] },
  ] },
  { ...D, name: 'air-tech', file: `${R}Air_Tech.png`, n: 4, mode: 'air', holds: [2, 3, 3, 4] },
  { ...G, ref: [4, 186], name: 'block-stand', file: `${R}Block.png`, n: 4, anchor: 'upper', holds: [3, 1, 3, 3] },
  { ...G, ref: [2, C], name: 'block-crouch', file: `${R}Crouch_Block.png`, n: 4, anchor: 'upper', holds: [3, 1, 3, 3] },
  { ...G, name: 'block-air', file: `${R}Air_Block.png`, n: 3, mode: 'air', holds: [3, 1, 4] },
  // Ground hits: three rows of three (high, gut, crouching): the first drawing is held for the hitstun, then 3, 4.
  { ...G, ref: [3, 186], file: `${R}HitReaction_Standing_And_Crouch.png`, n: 9, rows: 3, parts: [
    { name: 'hit-stand', frames: [1, 2, 3], anchor: 'upper', lineFrom: [1, 2, 3], holds: [8, 3, 4] },
    { name: 'hit-stand-gut', frames: [4, 5, 6], anchor: 'upper', lineFrom: [4, 5, 6], holds: [8, 3, 4] },
    { name: 'hit-crouch', frames: [7, 8, 9], anchor: 'upper', lineFrom: [7, 8, 9], holds: [8, 3, 4] },
  ] },
  // In the air and down: 1 launched, 2 hit in the air, 3 curled (the tumble), 4 falling, 5 the impact, 6 lying.
  { ...G, file: `${R}HitReaction_Air_And_Knockdown.png`, n: 6, rows: 2, parts: [
    { name: 'hit-air', frames: [1, 2, 4], mode: 'air', holds: [6, 3, 1] },
    { name: 'tumble', frames: [3, 4], mode: 'air', holds: [3, 3] },
    { name: 'knockdown', frames: [5, 6], anchor: 'upper', lineFrom: [5, 6], holds: [4, 36] },
  ] },
  { ...G, ref: [1, S], name: 'crumple', file: `${R}HitReaction_Crumple.png`, n: 6, rows: 2, perRow: [4, 2], anchor: 'upper', holds: [10, 10, 12, 6, 4, 6] },
  { ...G, name: 'otg', file: `${R}HitReaction_OTG.png`, n: 8, rows: 2, mode: 'air', holds: [3, 3, 3, 3, 3, 3, 3, 3] },
  // Get-ups: rows = neutral, forward, back; four drawings each.
  { ...G, ref: [4, S], file: `${R}Neutral_Forward_And_Back_Getup.png`, n: 12, rows: 3, parts: [
    { name: 'wakeup', frames: [1, 2, 3, 4], anchor: 'upper', lineFrom: [1, 2, 3, 4], holds: [6, 6, 6, 6] },
    { name: 'getup-forward', frames: [5, 6, 7, 8], anchor: 'upper', lineFrom: [5, 6, 7, 8], holds: [4, 4, 4, 6] },
    { name: 'getup-back', frames: [9, 10, 11, 12], anchor: 'upper', lineFrom: [9, 10, 11, 12], holds: [4, 4, 4, 6] },
  ] },
  // ---- Normals: the owner's holds; the hit drawing is 5L 3, 5M 4, 5H 5, 5S 4, 6M 5, 4H 5, 6H 5, 2L 3, 2M 3, 2H 4. ----
  { ...G, ref: [6, S], name: '5L', file: `${R}Light.png`, n: 6, rows: 2, perRow: [4, 2], anchor: 'upper', holds: [2, 2, 2, 2, 3, 4] },
  { ...G, ref: [7, S], name: '5M', file: `${R}Medium.png`, n: 7, rows: 2, perRow: [4, 3], anchor: 'upper', holds: [2, 2, 2, 3, 7, 4, 3] },
  { ...D, ref: [8, S], name: '5H', file: `${R}Heavy.png`, n: 8, rows: 4, anchor: 'upper', scales: [0.87,0.86,0.86,0.86,0.86,0.86,0.86,1], holds: [4, 2, 3, 3, 4, 5, 6, 7] },
  { ...G, ref: [8, S], name: '5S', file: `${R}SLauncher.png`, n: 8, rows: 2, anchor: 'upper', scales: [0.92,0.87,0.87,0.9,0.9,0.95,1,1], holds: [4, 3, 3, 4, 5, 6, 5, 6] },
  { ...G, ref: [8, S], name: '6M', file: `${R}ForwardMedium.png`, n: 8, rows: 2, anchor: 'upper', scales: [0.94,0.94,0.94,0.94,0.94,1,1,1], holds: [5, 5, 5, 4, 3, 5, 5, 6] },
  { ...G, ref: [8, S], name: '4H', file: `${R}BackHeavy.png`, n: 8, rows: 2, anchor: 'upper', scales: [0.84,0.84,1,1,1,1,1,1], holds: [4, 3, 5, 3, 3, 6, 7, 7] },
  { ...G, ref: [8, S], name: '6H', file: `${R}ForwardHeavy.png`, n: 8, rows: 2, anchor: 'upper', scales: [0.94,0.94,1,1,0.88,0.88,1,1], holds: [4, 3, 4, 3, 3, 6, 9, 9] },
  { ...G, ref: [6, C], name: '2L', file: `${R}Crouch_Light.png`, n: 6, rows: 2, perRow: [4, 2], anchor: 'upper', holds: [2, 2, 2, 2, 3, 4] },
  { ...G, ref: [6, C], name: '2M', file: `${R}Crouch_Medium.png`, n: 6, rows: 2, perRow: [4, 2], anchor: 'upper', holds: [4, 4, 4, 6, 5, 5] },
  { ...G, ref: [7, C], name: '2H', file: `${R}Crouch_Heavy.png`, n: 7, rows: 2, perRow: [4, 3], anchor: 'upper', holds: [4, 4, 3, 3, 8, 8, 8] },
  { ...G, name: 'jL', file: `${R}Air_Light.png`, n: 6, rows: 2, perRow: [4, 2], mode: 'air', holds: [2, 2, 3, 3, 3, 4] },
  { ...G, name: 'jM', file: `${R}Air_Medium.png`, n: 6, rows: 2, perRow: [4, 2], mode: 'air', holds: [3, 3, 4, 4, 4, 6] },
  { ...G, name: 'jH', file: `${R}Air_Heavy.png`, n: 8, rows: 2, mode: 'air', holds: [3, 3, 3, 4, 4, 5, 5, 4] },
  // j.S: 1-4 in the air (3 the warp, 4 the hit), 5 the dive held to the floor, 6-7 the landing.
  { ...D, ref: [7, S], file: `${R}Air_S.png`, n: 7, rows: 2, perRow: [4, 3], scales: [1, 1, 1, 0.88, 1, 1, 1], parts: [
    { name: 'jS', frames: [1, 2, 3, 4, 5], mode: 'air', holds: [4, 4, 3, 4, 30] },
    { name: 'jS-land', frames: [6, 7], anchor: 'upper', lineFrom: [6, 7], holds: [8, 6] },
  ] },
  // ---- Specials ----
  { ...D, ref: [9, S], name: 'warp-step', file: `${R}SpecialMove_WarpStep.png`, n: 9, rows: 3, perRow: [4, 4, 1], anchor: 'upper', scales: [0.86,0.86,0.86,0.86,0.88,0.88,0.89,1,1], holds: [4, 3, 2, 3, 2, 4, 6, 6, 6] },
  { ...D, ref: [8, S], name: 'displacement', file: `${R}SpecialMove_Displacement.png`, n: 8, rows: 2, anchor: 'upper', holds: [4, 4, 6, 3, 3, 6, 6, 6] },
  // Listen: 1 raising the fork, 2-3 listening, 4-5 the whiff, 6-8 triggered (the warp).
  { ...D, ref: [5, S], file: `${R}SpecialMove_Listen.png`, n: 8, rows: 2, parts: [
    { name: 'listen', frames: [1, 2, 3, 2, 3, 4, 5], anchor: 'upper', holds: [3, 6, 5, 5, 5, 6, 14] },
    { name: 'listen-warp', frames: [6, 7, 8], anchor: 'upper', holds: [2, 3, 6] },
  ] },
  { ...G, ref: [6, S], name: 'wiretap', file: `${R}SpecialMove_Wiretap.png`, n: 6, rows: 2, perRow: [4, 2], anchor: 'upper', holds: [5, 4, 4, 3, 6, 8] },
  { ...G, ref: [6, S], name: 'tune', file: `${R}Rite_Tune.png`, n: 6, rows: 2, perRow: [4, 2], anchor: 'upper', holds: [9, 5, 3, 12, 6, 6] },
  // The warp tells (owner, Nov 26): two rows of six. Top: stand, raise, spin, catch, point forward, point held (the
  // tell before 236 M / H: drawings 2-6, the point is the fourth shown). Bottom: stand, raise, spin, catch, point up,
  // point held (the tell before 2R; the brief lists three spin drawings, one is drawn, so it is held longer).
  { ...G, ref: [1, S], file: `${R}SpecialMove_WiretapPursuit.png`, n: 12, rows: 2, parts: [
    { name: 'warp-tell', frames: [2, 3, 4, 5, 6], anchor: 'upper', lineFrom: [1, 2, 3, 4, 5, 6], holds: [2, 2, 2, 2, 2] },
    { name: 'pursuit-tell', frames: [7, 8, 9, 10, 11, 12], anchor: 'upper', lineFrom: [7, 8, 9, 10, 11, 12], holds: [2, 2, 4, 1, 2, 3] },
  ] },
  // ---- Effects (light) ----
  // The vacuum, its fire and its smoke are painted pictures: node scripts/warteun-fx.mjs cuts them.
  { name: 'ripple', file: `${R}Crouch_Medium_Effect.png`, n: 8, mode: 'fx', anchor: 'ground', size: 110, holds: [2, 2, 3, 3, 3, 3, 4, 4] },
  { name: 'note', file: `${R}NoteEffect.png`, n: 6, mode: 'fx', anchor: 'centre', size: 120, holds: [2, 3, 4, 4, 4, 4] },
  { name: 'chord', file: `${R}SLauncher_Effect.png`, n: 8, mode: 'fx', anchor: 'ground', size: 330, holds: [1, 2, 3, 3, 3, 4, 4, 4] },
];
