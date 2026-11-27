// Khai'ro: the table of drawn sheets for the cutting tool.
//
//   node scripts/avner-prep.mjs --char khairo [--only idle] [--analyze]
//
// The owner's drawings (Nov 26) are in data/characters/Khai'ro/ (2688 x 1520, on magenta). The game's files are
// written to data/characters/khairo/. Only the idle exists so far: a low, wide stance, one hand on the floor. It is
// drawn 122 px tall (owner: 150 was too big; at 122 his head sits between Avner's and Malik's), to be set when he has a standing
// drawing. No holds came with it. The fields are explained at the top of the table in avner-prep.mjs.
export const MEASURE = 'area';
export const SHEETS = [
  { name: 'idle', bb: true, scaleRef: true, stand: 122, file: "../Khai'ro/Khairo_Idle.png", n: 10, rows: 2, anchor: 'upper', holds: [8, 8, 8, 8, 8, 8, 8, 8, 8, 8] },
  // Walk forward (Nov 26): ten drawings, the low stance creeping forward. No holds came with it.
  { ref: [1, 122], name: 'walk', bb: true, file: "../Khai'ro/Khairo_Forward_Walk.png", n: 10, rows: 2, anchor: 'upper', holds: [6, 6, 6, 6, 6, 6, 6, 6, 6, 6] },
  // Forward dash (Nov 26): 1 the stance, 2 coiling, 3 pushing off, 4 flying flat, 5 coming down; 6-8 landing on his
  // hands, 9-10 back to the stance. The first five are the dash (12 frames), the rest the stop.
  { ref: [1, 122], bb: true, file: "../Khai'ro/Khairo_Forward_Dash.png", n: 10, rows: 2, parts: [
    { name: 'dash', frames: [1, 2, 3, 4, 5], anchor: 'upper', lineFrom: [1, 2, 3], holds: [1, 2, 3, 3, 3] },
    { name: 'dash-stop', frames: [6, 7, 8, 9, 10], anchor: 'upper', holds: [2, 2, 2, 2, 2] },
  ] },
  // Walk back (Nov 26): ten drawings.
  { ref: [1, 122], name: 'walk-back', bb: true, file: "../Khai'ro/Khairo_Back_Walk.png", n: 10, rows: 2, anchor: 'upper', holds: [6, 6, 6, 6, 6, 6, 6, 6, 6, 6] },
  // Back dash (Nov 26, the owner's second version: eleven drawings), a backward roll: 1 the stance dropping, 2 crouching,
  // 3 sitting back, 4 rolling, 5 over on his hands, 6 coming over; 7-8 landing low, 9-10 rising, 11 the stance.
  // The first six are the back dash (14 frames), the rest the stop (10 frames for him).
  { ref: [11, 122], bb: true, file: "../Khai'ro/Khairo_Back_Dash.png", n: 11, rows: 2, perRow: [6, 5], parts: [
    { name: 'backdash', frames: [1, 2, 3, 4, 5, 6], anchor: 'upper', holds: [2, 2, 2, 3, 3, 2], shift: [3, 6, 45, -3, -4, -4] },
    { name: 'backdash-stop', frames: [7, 8, 9, 10, 11], anchor: 'upper', holds: [2, 2, 2, 2, 2] },
  ] },
  // ---- Crouch, jump and the normals (owner's brief, Nov 26; his holds). ----
  // Sizes: a sheet that ends in the stance is sized by that drawing (122 px, like the idle); the others by how much
  // body each drawing shows (MEASURE area). File names differ from the brief's: matched by move.
  // shift (game px per drawing, + = forward) is where each drawing sits on the fighter, worked out from where his
  // back foot and planted hand touch the floor in the cut drawings:
  //   5L: the planted hand stays where it is.   5M: the middle of his two feet stays where it is.
  //   2L, 2H: the back foot stays where it is (2H ends in the stance, centred).
  //   5H, 5S step forward (the game moves him, see his file): the back foot stays where it is ON HIM, so it travels
  //   with the step (the brief: "align on his starting back foot; the engine moves him forward").
  //   2M lunges 42 px: each drawing sits further BACK on him by what he has travelled so far, so the back foot stays
  //   planted on the screen while he stretches out, and he ends centred. Change its speed and work this out again.
  { name: 'crouch', bb: true, file: "../Khai'ro/Khairo_Crouch.png", n: 8, rows: 2, anchor: 'upper', holds: [8, 8, 8, 8, 8, 8, 8, 8] },
  { ref: [10, 122], bb: true, file: "../Khai'ro/Khairo_Jump.png", n: 10, rows: 2, parts: [
    { name: 'jumpsquat', frames: [1], anchor: 'upper', lineFrom: [1], holds: [3] },
    { name: 'jump', frames: [2, 3, 4, 5, 6, 7, 8], mode: 'air', holds: [3, 4, 5, 6, 5, 7, 7] },
    { name: 'land', frames: [9, 10], anchor: 'upper', lineFrom: [9, 10], holds: [2, 2] },
  ] },
  { ref: [6, 122], name: '5L', bb: true, file: "../Khai'ro/Khairo_Light.png", n: 6, rows: 2, anchor: 'upper', holds: [2, 2, 2, 3, 3, 2], shift: [3, 6, 45, -3, -4, -4] },
  // 5M came on white at half size: scripts/khairo-clean.mjs cleans it first (run that before this). Owner: drawing 2
  // (the extreme wind-up) is deleted, so the move is six drawings.
  { ref: [7, 122], bb: true, file: 'clean/Khairo_Medium.png', n: 7, rows: 2, parts: [
    { name: '5M', frames: [1, 3, 4, 5, 6, 7], anchor: 'upper', holds: [7, 2, 1, 4, 5, 6], shift: [-2, 0, -18, -5, 13, 11, -2] },
  ] },
  { ref: [8, 122], name: '5H', bb: true, file: "../Khai'ro/Khairo_Heavy.png", n: 8, rows: 2, anchor: 'upper', holds: [3, 4, 4, 3, 1, 5, 7, 8], shift: [2, 8, 10, 15, 21, 12, 2, 1] },
  { name: '5S', bb: true, file: "../Khai'ro/Khairo_SLauncher.png", n: 8, rows: 2, anchor: 'upper', holds: [3, 3, 4, 3, 1, 6, 8, 10], shift: [-2, 5, 0, 2, -23, -16, -1, 0] },
  { name: '2L', bb: true, file: "../Khai'ro/Khairo_Crouch_Light.png", n: 6, rows: 2, anchor: 'upper', holds: [2, 2, 2, 3, 3, 3], shift: [-2, -6, -9, -8, -4, 1] },
  { name: '2M', bb: true, file: "../Khai'ro/Khairo_Crouch_Medium.png", n: 7, rows: 2, perRow: [4, 3], anchor: 'upper', holds: [3, 3, 2, 2, 1, 7, 10], shift: [2, 24, 26, -1, -1, -1, -6] },
  // Back Heavy (4H; owner, Nov 26): three kicks. 1-2 the turn with a hand on the floor, 3 the mid kick, 4 the kick straight
  // up, 5 the leg cut down to the floor (the hit that reaches a downed opponent), 6-9 back to the stance. 46 frames; the
  // hits start on frames 11, 17 and 23. The sheet came on black with a painted glow: node scripts/glow-clean.mjs
  // "data/characters/Khai'ro/Khairo_BackHeavy.png" data/characters/khairo/clean/Khairo_BackHeavy.png 22 5   first.
  { ref: [1, 122], name: 'backheavy', bb: true, file: 'clean/Khairo_BackHeavy.png', n: 9, rows: 2, perRow: [5, 4], anchor: 'upper', holds: [4, 6, 6, 6, 5, 5, 5, 5, 4] },
  { ref: [8, 122], name: '2H', bb: true, file: "../Khai'ro/Khairo_Crouch_Heavy.png", n: 8, rows: 2, anchor: 'upper', holds: [3, 3, 3, 3, 2, 6, 8, 10], shift: [23, 30, 14, 11, -19, -6, -4, 3] },
  { name: 'jL', bb: true, file: "../Khai'ro/Khairo_Air_Light.png", n: 5, mode: 'air', holds: [2, 2, 3, 4, 6] },
  { name: 'jM', bb: true, file: "../Khai'ro/Khairo_Air_Medium.png", n: 6, rows: 2, mode: 'air', holds: [3, 3, 3, 1, 6, 8] },
  { name: 'jH', bb: true, file: "../Khai'ro/Khairo_Air_Heavy.png", n: 7, mode: 'air', holds: [3, 3, 3, 3, 2, 8, 10] },
  { name: 'jS', bb: true, file: "../Khai'ro/Khairo_Air_S.png", n: 7, mode: 'air', holds: [4, 4, 4, 3, 1, 8, 12] },
  // Sky Maul (j.214, the air command grab; owner's brief, Nov 26). Fourteen drawings, the opponent not drawn: 1 the reach,
  // 2 the lunge (the grab), 3 the clamp, 4 rearing back, 5-8 the four rakes, 9 the flip, 10 on top, 11 the ride down
  // (looped); then on the floor 12 the slam, 13 the pin and leap off, 14 the stance. Sized by drawing 14 (the stance).
  // The holds here are only for the preview: each strength's states in his file time the drawings themselves.
  { ref: [14, 122], bb: true, file: "../Khai'ro/Khairo_SpecialMove_SkyMaul_Maul.png", n: 14, rows: 2, parts: [
    { name: 'skymaul', frames: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], mode: 'air', holds: [4, 3, 3, 4, 3, 3, 3, 5, 3, 3, 6] },
    { name: 'skymaul-slam', frames: [12, 13, 14], anchor: 'upper', lineFrom: [12, 13, 14], holds: [4, 8, 6] },
  ] },
  // ---- 236 Bracelet Slam (owner's brief, Nov 26; his files are named HellfireDrop). ----
  // The throw: 1 the stance, 2 winding up, 3 the release (frame 6 of the move), 4 following through, 5-7 back to the
  // stance. No holds came with it: 20 frames in all, he is free on frame 21.
  { ref: [12, 122], name: 'bracelet', bb: true, file: "../Khai'ro/Khairo_SpecialMove_HellfireDrop.png", n: 12, rows: 3, anchor: 'upper', holds: [3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2], shift: [0, 0, -9, 23, 19, 15, 10, -6, -11, -5, -9, -6] }, // 27 frames; drawing 4 (the throw) starts on frame 10, the release
  // Its effect layers (all came already cut out). Sizes are first guesses. The gravity lock is placed by the middle of
  // its ring (centres, sheet px, read off the sheet), so the chevrons hang below the bracelet.
  // 214 Low Blade: a spinning floor sweep that sends a blade of light along the ground.
  { ref: [9, 122], name: 'lowblade', bb: true, file: "../Khai'ro/Khairo_SpecialMove_LowBlade.png", n: 9, rows: 2, perRow: [5, 4], anchor: 'upper', holds: [3, 3, 3, 3, 4, 5, 5, 5, 5] },
  { name: 'lb-wave', file: "../Khai'ro/Khairo_SpecialMove_LowBlade_Effect.png", n: 10, rows: 2, mode: 'fx', anchor: 'ground', size: 150, holds: [3, 3, 3, 3, 3, 3, 3, 3, 4, 4] },
  { name: 'br-ring', file: "../Khai'ro/Khairo_SpecialMove_HellfireDrop_Bracelet.png", n: 6, mode: 'fx', anchor: 'centre', size: 46, holds: [2, 2, 2, 2, 2, 2] }, // the bracelet in flight: one turn
  { name: 'br-flash', file: "../Khai'ro/Khairo_SpecialMove_HellfireDrop_Release_Effect.png", n: 5, mode: 'fx', anchor: 'ground', size: 110, holds: [1, 2, 2, 2, 3] },
  { name: 'br-lock', file: "../Khai'ro/Khairo_SpecialMove_HellfireDrop_GravitySlam_DropLock.png", n: 6, mode: 'fx', anchor: 'centre', size: 150, centres: [[258, 660], [698, 660], [1133, 660], [1563, 660], [2003, 660], [2442, 660]], holds: [1, 1, 2, 2, 2, 2] },
  { name: 'br-marker', file: "../Khai'ro/Khairo_SpecialMove_HellfireDrop_GravitySlam_DropMarker.png", n: 6, mode: 'fx', anchor: 'centre', size: 130, holds: [2, 2, 3, 3, 3, 3] },
  { name: 'br-slam', file: "../Khai'ro/Khairo_SpecialMove_HellfireDrop_GravitySlam.png", n: 9, rows: 3, mode: 'fx', anchor: 'ground', size: 260, holds: [2, 2, 1, 3, 3, 3, 4, 4, 5] },
  { name: 'br-dust', file: "../Khai'ro/Khairo_SpecialMove_HellfireDrop_GravitySlam_Effect.png", n: 8, rows: 2, mode: 'fx', anchor: 'ground', size: 200, holds: [2, 2, 3, 3, 4, 4, 4, 5] },
  { name: 'br-streak', file: "../Khai'ro/Khairo_SpecialMove_HellfireDrop_ReturnStreak.png", n: 5, mode: 'fx', anchor: 'centre', size: 150, holds: [2, 2, 2, 2, 2] },
];
