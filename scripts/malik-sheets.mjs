// Malik: the table of drawn sheets for the cutting tool.
//
//   node scripts/avner-prep.mjs --char malik [--only 5L,jump] [--analyze]
//
// The redesign (owner, Nov 26: the long coat, the blue sash, the staff on his back; his spirit limbs are painted into
// the body drawings). Every earlier sheet's source is gone; the moves he sent no new drawings for (2L, the stomp, the
// throws, Lariat, Pillar, the Rites, the Vow strike, the install, knockdown and wake-up, and the system moves) still
// use their earlier cut in sheets/, in his old look, until the owner decides what becomes of them.
// He stands 186 px in his idle. Every sheet is drawn at its own size, so each names a drawing whose height is known
// (ref: [drawing, game px]). No holds came with these: every state keeps the length the rules give it and the holds
// below are fitted to that (which drawing the hit lands on is written beside each attack).
// The fields are explained at the top of the table in avner-prep.mjs.
export const MEASURE = 'area';

const S = 186; // standing height in game px (the idle, hands together)
const STANCE = 164; // the wide fighting stance that starts and ends his attacks
const CROUCH = 130; // the crouch the crouching attacks start and end in
const AIR = 150; // the tucked pose that starts and ends his air attacks
export const SHEETS = [
  { name: 'idle', bb: true, scaleRef: true, stand: S, file: 'clean/Malik_Idle.png', n: 8, rows: 2, anchor: 'upper', holds: [8, 8, 7, 7, 8, 8, 7, 7] },
  // One walk sheet: the back walk is the same eight drawings played the other way round.
  { ref: [1, S], bb: true, file: 'clean/Malik_walk.png', n: 8, rows: 2, parts: [
    { name: 'walk', frames: [1, 2, 3, 4, 5, 6, 7, 8], anchor: 'upper', holds: [6, 6, 6, 6, 6, 6, 6, 6] },
    { name: 'walk-back', frames: [8, 7, 6, 5, 4, 3, 2, 1], anchor: 'upper', holds: [6, 6, 6, 6, 6, 6, 6, 6] },
  ] },
  { ref: [1, STANCE], name: 'crouch', bb: true, file: 'clean/Malik_crouching.png', n: 6, rows: 2, anchor: 'upper', holds: [3, 12, 12, 12, 12, 12] },
  // Dashes. Forward: 1-2 the push off, 3-6 the run, 7 the stop, 8 the stance. Back: 1 the stance, 2 the push, 3-5 the hop, 6-8 settling.
  { ref: [8, STANCE], fix: 0.9, bb: true, file: 'clean/Malik_forward_dash.png', n: 8, rows: 2, parts: [
    { name: 'dash', frames: [1, 2, 3, 4, 5, 6], anchor: 'upper', lineFrom: [1, 7, 8], holds: [2, 2, 2, 2, 2, 2] },
    { name: 'dash-stop', frames: [7, 8], anchor: 'upper', lineFrom: [7, 8], holds: [2, 1] },
  ] },
  { ref: [8, STANCE], bb: true, file: 'clean/malik_back_dash.png', n: 8, rows: 2, parts: [
    { name: 'backdash', frames: [1, 2, 3, 4, 5], anchor: 'upper', lineFrom: [1, 2, 6, 7, 8], holds: [2, 3, 3, 3, 3] },
    { name: 'backdash-stop', frames: [6, 7, 8], anchor: 'upper', lineFrom: [6, 7, 8], holds: [2, 2, 2] },
  ] },
  // Jump: 1 the squat, 2-6 rising to the top, 7-8 falling, 9 the landing.
  { ref: [1, STANCE], fix: 0.8, bb: true, file: 'clean/malik_jump.png', n: 9, rows: 3, parts: [
    { name: 'jumpsquat', frames: [1], anchor: 'upper', lineFrom: [1, 9], holds: [3] },
    { name: 'jump', frames: [2, 3, 4, 5, 6], mode: 'air', holds: [5, 9, 9, 9, 28] },
    { name: 'fall', frames: [7, 8], mode: 'air', holds: [8, 52] },
    { name: 'land', frames: [9], anchor: 'upper', lineFrom: [1, 9], holds: [3] },
  ] },
  // Air dashes. Forward: 1-5 the dash, 6-8 coming out of it. Back: all six.
  { ref: [8, AIR], fix: 1.15, bb: true, file: 'clean/Malik_forward_air_dash.png', n: 8, rows: 2, parts: [
    { name: 'airdash', frames: [1, 2, 3, 4, 5], mode: 'air', holds: [2, 3, 3, 3, 3] },
    { name: 'airdash-end', frames: [6, 7, 8], mode: 'air', holds: [4, 4, 52] },
  ] },
  { ref: [6, AIR], fix: 1.15, name: 'airdash-back', bb: true, file: 'clean/Malik_air_back_dash.png', n: 6, mode: 'air', holds: [2, 2, 2, 2, 2, 2] },
  { ref: [6, AIR], name: 'air-tech', bb: true, file: 'clean/Malik_air_recovery.png', n: 6, rows: 2, mode: 'air', holds: [2, 2, 2, 2, 2, 2] },
  // Blocks: two drawings each (the impact, then the guard): standing, crouching, in the air.
  { ref: [2, STANCE], bb: true, file: 'clean/malik_block.png', n: 6, parts: [
    { name: 'block-stand', frames: [1, 2], anchor: 'upper', lineFrom: [1, 2, 3, 4], holds: [4, 1] },
    { name: 'block-crouch', frames: [3, 4], anchor: 'upper', lineFrom: [1, 2, 3, 4], holds: [4, 1] },
    { name: 'block-air', frames: [5, 6], mode: 'air', holds: [4, 1] },
  ] },
  // Hit reactions: 1-2 standing, 3-4 crouching, 5-6 hit in the air, 7-8 tumbling.
  { ref: [2, STANCE], fix: 0.87, bb: true, file: 'clean/Malik_hitreaction_Standing_crouching_air.png', n: 8, rows: 2, parts: [
    { name: 'hit-stand', frames: [1, 2], anchor: 'upper', lineFrom: [1, 2, 3, 4], holds: [6, 1] },
    { name: 'hit-crouch', frames: [3, 4], anchor: 'upper', lineFrom: [1, 2, 3, 4], holds: [6, 1] },
    { name: 'hit-air', frames: [5, 6], mode: 'air', holds: [5, 1] },
    { name: 'tumble', frames: [7, 8], mode: 'air', holds: [6, 6] },
  ] },
  { ref: [1, STANCE], name: 'crumple', bb: true, file: 'clean/Malik_crumple.png', n: 6, rows: 2, anchor: 'upper', holds: [5, 5, 6, 8, 8, 1] },
  // ---- Normals: eight drawings each, ending in the stance. The hit lands on: 5L 4, 5M 3 then 4 (its two hits), 5H 4, 2M 4, 2H 4, 5S 4, Back Heavy 4. ----
  { ref: [8, STANCE], name: '5L', bb: true, file: 'clean/malik_light.png', n: 8, rows: 2, anchor: 'upper', holds: [1, 1, 1, 2, 2, 2, 2, 1] },
  { ref: [8, STANCE], name: '5M', bb: true, file: 'clean/malik_medium.png', n: 8, rows: 2, anchor: 'upper', holds: [2, 3, 2, 3, 3, 3, 3, 3] },
  { ref: [8, STANCE], name: '5H', bb: true, file: 'clean/Malik_heavy.png', n: 8, rows: 2, anchor: 'upper', holds: [3, 3, 2, 3, 4, 5, 5, 4] },
  { ref: [8, CROUCH], name: '2M', bb: true, file: 'clean/malik_crouching_medium.png', n: 8, rows: 2, anchor: 'upper', holds: [2, 2, 2, 3, 3, 4, 3, 3] },
  { ref: [8, CROUCH], fix: 0.93, name: '2H', bb: true, file: 'clean/malik_crouching_heavy.png', n: 8, rows: 2, anchor: 'upper', holds: [3, 3, 2, 3, 4, 6, 6, 6] },
  { ref: [8, STANCE], name: '5S', bb: true, file: 'clean/malik_Slauncher.png', n: 8, rows: 2, anchor: 'upper', holds: [3, 3, 2, 3, 6, 6, 6, 6] },
  { ref: [8, STANCE], name: '4H', bb: true, file: 'clean/malik_back_heavy.png', n: 8, rows: 2, anchor: 'upper', holds: [3, 4, 3, 4, 5, 6, 5, 5] },
  // Air normals: eight drawings, the hit on drawing 4 (j.L, j.M, j.H). j.S: twelve; 1-6 gathering the orb overhead, 7 the
  // throw down (the hit); 8 and 9 are drawn landed, with the burst on the floor, and are left out (the move has no landing).
  { ref: [8, AIR], name: 'jL', bb: true, file: 'clean/malik_air_light.png', n: 8, rows: 2, mode: 'air', holds: [1, 1, 1, 4, 2, 2, 2, 2] },
  { ref: [8, AIR], name: 'jM', bb: true, file: 'clean/malik_air_medium.png', n: 8, rows: 2, mode: 'air', holds: [2, 2, 1, 4, 3, 3, 3, 3] },
  { ref: [8, AIR], name: 'jH', bb: true, file: 'clean/malik_air_heavy.png', n: 8, rows: 2, mode: 'air', holds: [3, 3, 3, 3, 3, 2, 2, 2] },
  { ref: [1, AIR], bb: true, file: 'clean/malik_air_S.png', n: 12, rows: 3, parts: [{ name: 'jS', frames: [1, 2, 3, 4, 5, 6, 7, 10, 11, 12], mode: 'air', holds: [1, 1, 2, 2, 1, 1, 4, 6, 6, 6] }] },
  // ---- Spirit Orb: a sheet for each button. L: the palm strikes on drawing 4 and the orb leaves with it. M: he punches the
  // floor (3-5) and a spout comes up in front of him (6-7, painted in; the game's spout is drawn over it). H: the orb forms
  // between his spirit hands (2-4), is pushed out on 5, and the game's orb takes over on 6. ----
  { ref: [8, STANCE], name: 'fireball', bb: true, file: 'clean/Malik_specialmove_spiritorb.png', n: 8, rows: 2, anchor: 'upper', holds: [4, 4, 3, 3, 5, 5, 6, 6] },
  { ref: [8, STANCE], name: 'fireball-M', bb: true, file: 'clean/Malik_specialmove_spiritorbM.png', n: 8, rows: 2, anchor: 'upper', holds: [4, 5, 4, 2, 3, 7, 7, 8] },
  { ref: [8, STANCE], name: 'fireball-H', bb: true, grid: true, cuts: [[672, 1344, 2016], [773, 1380, 2063]], file: 'clean/Malik_ specialmove_spiritorbH.png', n: 8, rows: 2, anchor: 'upper', holds: [5, 5, 6, 4, 3, 7, 7, 8] },
  // ---- Throws (owner, late Nov 26). Forward: 1 the reach (the grab), 2-4 he has them (a jab, then drawing back), 5 the spirit
  // arm gathers, 6 its punch (the hit), 7 it fades, 8 the stance. A miss plays 1, 2, 8.
  { ref: [8, STANCE], bb: true, file: 'clean/malik_forwardthrow.png', n: 8, rows: 2, parts: [
    { name: 'throw-forward', frames: [1, 2, 8], anchor: 'upper', holds: [2, 12, 11] },
    { name: 'throw-hold', frames: [2, 3, 4], anchor: 'upper', holds: [4, 4, 6] },
    { name: 'throw-finish', frames: [5, 6, 7, 8], anchor: 'upper', holds: [6, 8, 8, 8] },
  ] },
  // Back: 1 the stance, 2 the grab (low), 3 the knee comes up, 4 the spirit foot comes down, 5 it lands (the hit), 6 the
  // stance. Painted on black with a glow: glow-clean.mjs, then malik-clean.mjs with MALIK_SRC (see that file). He is
  // already turned round when the finish plays, so nothing is mirrored any more.
  { ref: [1, STANCE], bb: true, file: 'clean/malik_backthrow.png', n: 6, rows: 2, parts: [
    { name: 'throw-back', frames: [1, 2, 6], anchor: 'upper', holds: [2, 12, 11] },
    { name: 'throw-back-hold', frames: [2, 3], anchor: 'upper', holds: [8, 6] },
    { name: 'throw-back-finish', frames: [4, 5, 6], anchor: 'upper', holds: [8, 10, 12] },
  ] },
  // ---- Rites. 5R Guardian Palm: the guardian forms behind him (2-5) and its palm strikes on 6; the ring that flies is
  // palm-5. 2R Ancestor's Seal: it forms (2-3), raises its arms (4), swings (5) and slams the floor on 6; the seal is palm-2.
  { ref: [8, STANCE], name: 'rite-5', bb: true, file: 'clean/malik_rite_neutral.png', n: 8, rows: 2, anchor: 'upper', holds: [2, 2, 3, 3, 2, 6, 7, 8] },
  { ref: [8, STANCE], name: 'rite-2', bb: true, file: 'clean/malik_rite_down.png', n: 8, rows: 2, anchor: 'upper', holds: [2, 2, 3, 3, 3, 7, 8, 8] },
  // The palm's ring: 1 the flash, 2-4 flying (looped), 5-7 dying away. The seal: 1-2 forming, 3-6 the orb (looped), 7-8 it charges, 9-11 it bursts.
  { name: 'palm-5', file: 'malik_rite_neutral_effect.png', n: 7, mode: 'fx', anchor: 'centre', size: 190, holds: [2, 2, 2, 2, 3, 3, 4] },
  { name: 'palm-2', file: 'malik_rite_down_effect.png', n: 11, rows: 3, perRow: [4, 4, 3], mode: 'fx', anchor: 'centre', size: 120, holds: [2, 2, 3, 3, 3, 3, 2, 2, 3, 3, 4] },
  // ---- Spirit Spear (owner, late Nov 26; no rules came with it: see his file). L: he draws the staff (1-3), thrusts and the
  // spear head shoots out (4-5), it scatters (6), the staff goes back (7-8). H: he leaps (2), raises it (3-4), dives with the
  // spear head down (5), drives it into the floor (6), pulls it out (7), the stance (8).
  { ref: [8, STANCE], name: 'spear', bb: true, file: 'clean/Malik_specialmove_ spiritspear_light.png', n: 8, rows: 2, anchor: 'upper', holds: [4, 4, 5, 3, 3, 6, 6, 6] },
  { ref: [8, STANCE], bb: true, file: 'clean/malik_specialmove_spiritspear_heavy.png', n: 8, rows: 2, parts: [
    { name: 'spear-H', frames: [1, 2, 3, 4, 5, 6, 7, 8], lineFrom: [1, 7, 8], holds: [3, 5, 5, 5, 3, 3, 8, 8] },
  ] },
  // The light orb: 1-2 forming, 3-4 flying (looped), 5-7 bursting.
  { name: 'orb', file: 'Malik_specialmove_spiritorb_effect.png', n: 7, mode: 'fx', anchor: 'centre', size: 100, holds: [3, 3, 3, 3, 3, 4, 5] },
  // The medium one is a spout from the floor: 1-3 the ring forming (not used: his hand paints it), 4-6 the spout, 7-8 dying away.
  { name: 'orb-M', file: 'Malik_specialmove_spiritorbM_effect.png', n: 8, rows: 2, mode: 'fx', anchor: 'ground', size: 230, use: [4, 8], holds: [3, 3, 3, 4, 5] },
  // The heavy orb: 1-3 forming (not used: it forms in his hands), 4-6 flying (looped), 7-9 bursting.
  { name: 'orb-H', file: 'Malik_ specialmove_spiritorbH_effect.png', n: 9, rows: 3, mode: 'fx', anchor: 'centre', size: 170, use: [4, 9], holds: [3, 3, 3, 3, 4, 5] },
];
