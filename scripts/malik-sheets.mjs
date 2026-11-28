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
// His Specter sheets draw his own body smaller than his normal self (the spirit takes the room): SP grows them until his
// own head and body are his normal size inside the spirit (owner, Nov 28: "grow Malik to match"; was 1.08). Every Specter sheet uses it.
const SP = 1.08 * 1.18;
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
  { ref: [8, CROUCH], fix: 1.1, name: '2M', bb: true, file: 'clean/malik_crouching_medium.png', n: 8, rows: 2, anchor: 'upper', holds: [2, 2, 2, 3, 3, 4, 3, 3] },
  { ref: [8, CROUCH], fix: 1.02, name: '2H', bb: true, file: 'clean/malik_crouching_heavy.png', n: 8, rows: 2, anchor: 'upper', holds: [3, 3, 2, 3, 4, 6, 6, 6] },
  // 5S redrawn Nov 27 (twelve drawings: the stomp, then the spirit fist erupts from the ground; the hit on drawing 6).
  { ref: [12, STANCE], name: '5S', bb: true, file: 'clean/Malik_SLauncher.PNG', n: 12, rows: 3, anchor: 'upper', holds: [1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5, 5] },
  { ref: [8, STANCE], name: '4H', bb: true, file: 'clean/malik_back_heavy.png', n: 8, rows: 2, anchor: 'upper', holds: [3, 4, 3, 4, 5, 6, 5, 5] },
  // Air normals: eight drawings, the hit on drawing 4 (j.L, j.M, j.H). j.S: twelve; 1-6 gathering the orb overhead, 7 the
  // throw down (the hit); 8 and 9 are drawn landed, with the burst on the floor, and are left out (the move has no landing).
  { ref: [8, AIR], name: 'jL', bb: true, file: 'clean/malik_air_light.png', n: 8, rows: 2, mode: 'air', holds: [1, 1, 1, 4, 2, 2, 2, 2] },
  { ref: [8, AIR], name: 'jM', bb: true, file: 'clean/malik_air_medium.png', n: 8, rows: 2, mode: 'air', holds: [2, 2, 1, 4, 3, 3, 3, 3] },
  { ref: [8, AIR], name: 'jH', bb: true, file: 'clean/malik_air_heavy.png', n: 8, rows: 2, mode: 'air', holds: [3, 3, 3, 3, 3, 2, 2, 2] },
  // Owner, Nov 27 (uploaded in chat, on white): 2L, a crouching low snap kick, hit on drawing 3; sized on its last drawing
  // (the crouch) to the crouch sheet's own crouch (142 px). j.R Guardian's Shell, twelve drawings in three rows, sized
  // on drawing 1 (tucked, arms crossed) like the air normals' tuck. 2L is not evened: its white paper reads as less body than
  // there is, so it is sized by its crouch's height and then by eye against the crouch sheet's head (fix 0.96).
  { ref: [6, 142], fix: 0.96, name: '2L', bb: true, file: 'clean/Malik_Crouch_Light.png', n: 6, anchor: 'upper', holds: [2, 1, 2, 2, 3, 3] },
  { ref: [1, AIR], name: 'rite-j', bb: true, file: 'clean/Malik_Air_Rite.png', n: 16, rows: 4, mode: 'air', holds: [1, 1, 2, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 5], scales: [1.05, 1.15, 1.25, 1.25, 1.2, 1.15, 1.15, 1.15, 1.2, 1.2, 1.2, 1.2, 1.2, 1.15, 1.1, 1.05] },
  // j.S redrawn Nov 27 (owner): ten drawings on white; he gathers the orb, his spirit arms stretch out extra far and drive it
  // down, and it bursts on drawing 7 (the hit).
  // j.S redrawn Nov 28 (owner): the guardian's arm shot straight out sideways (16 drawings, full reach on 8-10).
  { ref: [1, AIR], name: 'jS', bb: true, file: 'Malik_Air_S_Arm.png', n: 16, rows: 4, mode: 'air', holds: [1, 1, 2, 2, 2, 2, 1, 2, 3, 3, 3, 3, 3, 3, 4, 5] },
  // ---- Spirit Orb: a sheet for each button. L: the palm strikes on drawing 4 and the orb leaves with it. M: he punches the
  // floor (3-5) and a spout comes up in front of him (6-7, painted in; the game's spout is drawn over it). H: the orb forms
  // between his spirit hands (2-4), is pushed out on 5, and the game's orb takes over on 6. ----
  // L redrawn Nov 27 (owner): twelve drawings; the palm strike on 8, the orb leaves on 9.
  { ref: [12, STANCE], name: 'fireball', bb: true, file: 'clean/Malik_specialmove_spiritorb.png', n: 12, rows: 3, anchor: 'upper', holds: [1, 2, 2, 2, 1, 2, 1, 3, 4, 5, 6, 7] },
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
  // As 4R: he is drawn smaller under the guardian (drawings 2-7) and a little small in 1 and 8; scales bring him back.
  { ref: [8, STANCE], name: 'rite-5', bb: true, file: 'clean/malik_rite_neutral.png', n: 8, rows: 2, anchor: 'upper', holds: [2, 2, 3, 3, 2, 6, 7, 8], scales: [1.15, 1.28, 1.28, 1.28, 1.28, 1.28, 1.28, 1.1] },
  // 2R redrawn Nov 27 (owner): twelve drawings on magenta; the guardian's slam on 9, the frame the seal rises. j.S, j.R and 2R
  // draw him smaller wherever the guardian, the orb or the long spirit arms are: scales (set by eye against 5L / j.L) undo it.
  { ref: [1, STANCE], name: 'rite-2', bb: true, file: 'clean/Malik_Rite_Down.png', n: 12, rows: 3, anchor: 'upper', holds: [1, 1, 2, 2, 2, 2, 1, 2, 4, 5, 6, 8], scales: [1, 1, 1, 1.1, 1.15, 1.15, 1.15, 1.15, 1.15, 1.15, 1.15, 1] },
  // 4R Colossus Clap (Nov 27): the guardian swells to giant size behind him and claps overhead on drawing 8.
  // The sheet draws him smaller wherever the giant guardian is (drawings 3-11); scales bring him back to his own size (owner:
  // "the size of Avner"), the guardian growing with him. Set by eye against 5L.
  { ref: [1, STANCE], name: 'rite-4', bb: true, file: 'clean/Malik_Rite_Back.png', n: 12, rows: 3, anchor: 'upper', holds: [1, 1, 1, 1, 1, 1, 2, 4, 5, 6, 8, 9], scales: [1, 1.05, 1.3, 1.3, 1.3, 1.3, 1.3, 1.3, 1.3, 1.3, 1.2, 1] },
  // The palm's ring: 1 the flash, 2-4 flying (looped), 5-7 dying away. The seal: 1-2 forming, 3-6 the orb (looped), 7-8 it charges, 9-11 it bursts.
  { name: 'palm-5', file: 'malik_rite_neutral_effect.png', n: 7, mode: 'fx', anchor: 'centre', size: 190, holds: [2, 2, 2, 2, 3, 3, 4] },
  { name: 'palm-2', file: 'malik_rite_down_effect.png', n: 11, rows: 3, perRow: [4, 4, 3], mode: 'fx', anchor: 'centre', size: 120, holds: [2, 2, 3, 3, 3, 3, 2, 2, 3, 3, 4] },
  // ---- Spirit Spear (owner, late Nov 26; no rules came with it: see his file). L: he draws the staff (1-3), thrusts and the
  // spear head shoots out (4-5), it scatters (6), the staff goes back (7-8). H: he leaps (2), raises it (3-4), dives with the
  // spear head down (5), drives it into the floor (6), pulls it out (7), the stance (8).
  { ref: [8, STANCE], name: 'spear', bb: true, file: 'clean/Malik_specialmove_ spiritspear_light.png', n: 8, rows: 2, anchor: 'upper', holds: [4, 4, 5, 3, 3, 6, 6, 6] },
  // H redrawn Nov 27: twelve drawings, a higher leap and a steeper dive; the rows' ground lines are drawn on the sheet
  // (the middle row is all in the air), so they are given as lines. The strike is on drawing 8.
  { ref: [12, STANCE], name: 'spear-H', bb: true, file: 'clean/malik_specialmove_spiritspear_heavy.png', n: 12, rows: 3, lines: [370, 738, 1101], anchor: 'upper', holds: [2, 3, 3, 3, 2, 2, 3, 3, 3, 4, 5, 7] },
  // The light orb: 1-2 forming, 3-4 flying (looped), 5-7 bursting.
  // The light orb redrawn Nov 27 (owner): twelve drawings with two twisting rings: 1-3 forming, 4-8 flying (looped), 9-12 bursting.
  { name: 'orb', file: 'Malik_specialmove_spiritorb_effect.png', n: 12, rows: 3, mode: 'fx', anchor: 'centre', size: 150, holds: [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 4] },
  // Ancestral Specter's trap orb (Nov 27): 1-3 forming, 4-8 the vortex (looped while it waits and pulls), 9-12 implode and burst.
  { name: 'specter-orb', file: 'Malik_Specter_Trap_Effect.png', n: 12, rows: 3, mode: 'fx', anchor: 'centre', size: 160, holds: [1, 2, 2, 3, 3, 3, 3, 3, 2, 2, 3, 4] },
  // Air Spirit Orb (j.236L, Nov 27): twelve air drawings, the thrust on 8, the orb leaves on 9.
  { ref: [1, AIR], name: 'air-orb', bb: true, file: 'Malik_Air_SpecialMove_SpiritOrb_Light.png', n: 12, rows: 3, mode: 'air', holds: [1, 1, 2, 2, 1, 2, 2, 3, 4, 5, 6, 5] },
  // Ancestral Specter (level 3, Nov 27): the transformation (18 drawings; the sheet's frame numbers erased into
  // Malik_Specter_Transform.png, replaced by the second batch below) and the finished form, one drawing, as his idle in the mode.
  // ---- Ancestral Specter, the full set (owner, Nov 27, second batch). The transformation is redrawn (18 drawings from
  // base Malik; Nov 28: the owner's clean copy without numbers, Malik_Specter_Transform3.png). Every body sheet starts in his
  // Specter stance (drawing 1), sized like the idle; scales (by eye against the idle) keep his own body one size.
  // 5L: the palm shoves on 4. 5M: hands clench, rip apart (4), the blast (5). 5H: the palm wall rises on 6.
  // 2L: the low claw on 4. 2M: the floor sweep on 5. Traps: the orb leaves his hand on 8 (5R at chest height, 2R
  // sealed into the floor). 4R Warden's Toll: the clap on 7. Walk: 8 heavy steps. Dashes: 6 drawings each.
  // Crouch: 1 the drop, 2-6 the guard. Blocks: standing 1-2, crouching 3-4.
  { ref: [1, STANCE], name: 'specter-transform', density: 0.6, bb: true, file: 'Malik_Specter_Transform3.png', n: 18, rows: 3, anchor: 'upper', scales: [1, 1, 1, 1.08, 1.3, 1.3, 1.22, 1.12, 1.05, 1.12, 1.12, 1.14, 1.15, 1.16, 1.17, 1.17, 1.17, 1.17], holds: [2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 3, 3, 3, 3, 3, 4, 4, 5] },
  { ref: [1, STANCE], fix: SP * 1.04, name: 'specter-5L', density: 0.6, bb: true, file: 'Malik_Specter_5L.png', n: 8, rows: 2, anchor: 'upper', holds: [1, 1, 1, 2, 2, 2, 2, 1] },
  { ref: [1, STANCE], fix: SP, name: 'specter-5M', density: 0.6, bb: true, file: 'Malik_Specter_5M.png', n: 10, rows: 2, anchor: 'upper', holds: [2, 2, 1, 2, 3, 3, 3, 2, 2, 2] },
  { ref: [1, STANCE], fix: SP, name: 'specter-5H', density: 0.6, bb: true, file: 'Malik_Specter_5H.png', n: 12, rows: 3, anchor: 'upper', holds: [2, 2, 2, 1, 1, 3, 3, 3, 3, 3, 3, 3] },
  // 2H (Nov 28): the giant fist slams down (5) and a wall of spirit crystal bursts up ahead (6-8), then shatters (9-10).
  { ref: [1, STANCE], fix: SP, name: 'specter-2H', density: 0.6, bb: true, file: 'Malik_Specter_2H.png', n: 12, rows: 3, anchor: 'upper', holds: [2, 2, 2, 3, 2, 3, 3, 3, 4, 4, 4, 2] },
  { ref: [1, STANCE], fix: SP * 0.92, name: 'specter-2L', bb: true, file: 'Malik_Specter_2L.png', n: 8, rows: 2, anchor: 'upper', holds: [1, 1, 1, 2, 2, 2, 2, 2] },
  { ref: [1, STANCE], fix: SP * 0.97, name: 'specter-2M', bb: true, file: 'Malik_Specter_2M.png', n: 10, rows: 2, anchor: 'upper', holds: [2, 2, 1, 1, 3, 3, 3, 3, 2, 2] },
  { ref: [1, STANCE], fix: SP, name: 'specter-trap5', density: 0.6, bb: true, file: 'Malik_Specter_Trap5.png', n: 12, rows: 3, anchor: 'upper', holds: [1, 1, 2, 2, 2, 2, 2, 3, 4, 4, 4, 5] },
  { ref: [1, STANCE], fix: SP * 0.97, name: 'specter-trap2', density: 0.6, bb: true, file: 'Malik_Specter_Trap2.png', n: 12, rows: 3, anchor: 'upper', holds: [1, 1, 2, 2, 2, 2, 2, 3, 4, 4, 4, 5] },
  { ref: [1, STANCE], fix: SP, name: 'specter-toll', density: 0.6, bb: true, file: 'Malik_Specter_Toll.png', n: 12, rows: 3, anchor: 'upper', holds: [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4] },
  { ref: [1, STANCE], fix: SP * 0.92, bb: true, file: 'Malik_Specter_Walk.png', n: 8, rows: 2, parts: [
    { name: 'specter-walk', frames: [1, 2, 3, 4, 5, 6, 7, 8], anchor: 'upper', holds: [7, 7, 7, 7, 7, 7, 7, 7] },
    { name: 'specter-walk-back', frames: [8, 7, 6, 5, 4, 3, 2, 1], anchor: 'upper', holds: [7, 7, 7, 7, 7, 7, 7, 7] },
  ] },
  { ref: [1, STANCE], fix: SP * 0.97, name: 'specter-dash', bb: true, file: 'Malik_Specter_Dash.png', n: 6, anchor: 'upper', holds: [3, 3, 4, 4, 4, 4] },
  { ref: [1, STANCE], fix: SP, name: 'specter-backdash', bb: true, grid: true, cuts: [[344, 612, 957, 1268, 1604]], file: 'Malik_Specter_BackDash.png', n: 6, anchor: 'upper', holds: [3, 4, 4, 4, 4, 3] },
  { ref: [1, STANCE], fix: SP, name: 'specter-crouch', bb: true, file: 'Malik_Specter_Crouch.png', n: 6, rows: 2, anchor: 'upper', scales: [1, 0.92, 0.92, 0.92, 0.92, 0.92], holds: [3, 12, 12, 12, 12, 12] },
  { ref: [1, STANCE], fix: SP * 1.18, bb: true, file: 'Malik_Specter_Block.png', n: 4, parts: [
    { name: 'specter-block-stand', frames: [1, 2], anchor: 'upper', lineFrom: [1, 2, 3, 4], holds: [4, 56] },
    { name: 'specter-block-crouch', frames: [3, 4], anchor: 'upper', lineFrom: [1, 2, 3, 4], holds: [4, 56] },
  ] },
  // j.R Ancestral Roar (owner, Nov 27; replaces Guardian's Thrust): the guardian wraps him into a roaring head (2-5)
  // that charges (6-7) and fires the stalking orb on 8.
  { ref: [1, AIR], fix: 1.25, scales: [1, 1.05, 1.12, 1.12, 1.12, 1.12, 1.12, 1.12, 1.1, 1.05, 1.05, 1], name: 'rite-j-roar', bb: true, file: 'Malik_Air_Rite_Cannon.png', n: 12, rows: 3, mode: 'air', holds: [1, 1, 2, 2, 2, 2, 3, 3, 4, 4, 4, 5] },
  // Their effects (light on black, or on see-through with a dark halo). Trap orb: 1-4 waiting, 5-8 the vortex, 9-12 the
  // burst. Floor seal: 1-4 the rune circle waiting, 5-9 the dome rising, 10-12 it shatters. The Roar's orb: 1-2
  // forming, 3-8 swirling, 9-12 the burst. 5M's blast, 5H's wall, the block shield.
  { name: 'specter-orb', file: 'Malik_Specter_Trap_Effect.png', n: 12, rows: 3, mode: 'fx', anchor: 'centre', size: 160, holds: [3, 3, 3, 3, 4, 5, 4, 5, 2, 3, 4, 4] },
  { name: 'specter-seal', file: 'Malik_Specter_Seal_Effect.png', n: 12, rows: 3, mode: 'fx', anchor: 'ground', size: 210, holds: [3, 3, 3, 3, 2, 2, 2, 4, 6, 3, 3, 4] },
  { name: 'roar-orb', file: 'Malik_Air_Rite_Cannon_Effect.png', n: 12, rows: 3, mode: 'fx', anchor: 'centre', size: 120, holds: [2, 3, 3, 3, 3, 3, 3, 3, 2, 3, 4, 4] },
  { name: 'specter-5M-fx', file: 'Malik_Specter_5M_Effect.png', n: 10, rows: 2, mode: 'fx', anchor: 'centre', size: 240, holds: [1, 2, 2, 2, 2, 2, 2, 2, 2, 3] },
  { name: 'specter-5H-fx', file: 'Malik_Specter_5H_Effect.png', n: 10, rows: 2, mode: 'fx', anchor: 'ground', size: 230, holds: [2, 2, 2, 3, 3, 3, 3, 3, 3, 4] },
  { name: 'specter-shield', file: 'Malik_Specter_Block_Effect.png', n: 10, rows: 2, mode: 'fx', anchor: 'centre', size: 170, holds: [2, 2, 2, 2, 3, 3, 3, 3, 3, 4] },
  // density 0.6: these came in small (1125-2000 px sheets), so they are stored at 0.6 of the usual sheet density (see avner-prep).
  // ---- The Specter's specials (owner, Nov 28). Barrage (236H): the armor breaks into 12 glyph pieces that gather above
  // his head into an orb (drawings 4-10), the beam fires on 11 and holds 12-15, and he ends in his normal form (16-18).
  // Grasp (236L/M): the arm sinks into the floor on 5, held 6-8, hauls back 9-11. Stomp (623): the stomp on 7.
  // Judgment (22): fists raised 4-6, the hammer swing on 8-9.
  // Barrage redrawn Nov 28 (owner): the armor breaks off (3), forms a roaring head above him (4-8), gathers in its jaws
  // (9-11), fires on 12 and blasts 13-16; he is himself again from 17. The blast is its own sheet (barrage-blast).
  { ref: [1, STANCE], fix: SP, name: 'specter-barrage', density: 0.6, bb: true, clearBelow: [13], file: 'Malik_Specter_Barrage_Roar.png', n: 20, rows: 4, anchor: 'upper', scales: [1, 1, 1.1, 1.18, 1.22, 1.22, 1.22, 1.22, 1.22, 1.22, 1.22, 1.22, 1.22, 1.22, 1.22, 1.22, 1.2, 1.18, 1.15, 1.04], holds: [2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 9, 9, 9, 9, 4, 4, 4, 5] },
  { name: 'barrage-blast', file: 'Malik_Specter_Barrage_Blast_Even.png', n: 10, rows: 10, mode: 'fx', anchor: 'centre', centres: [[62, 42], [65, 166], [67, 290], [66, 414], [67, 538], [67, 662], [61, 786], [55, 910], [52, 1034], [53, 1158]], size: 640, holds: [2, 2, 9, 9, 9, 7, 4, 4, 4, 5] }, // the owner's rows were unevenly spaced: Malik_Specter_Barrage_Blast_Even.png re-spaces them (84 px a row, 40 apart), each on its starburst
  // j.2H (Nov 28): the tuck (1-5), legs driven down with the spirit legs over them (6), the stomp 7-9.
  { ref: [1, AIR], name: 'j2H', bb: true, file: 'Malik_Air_Down_Heavy.png', n: 12, rows: 3, mode: 'air', holds: [1, 1, 2, 2, 2, 1, 3, 3, 3, 3, 4, 5] },
  // j.236M (Nov 28): an orb in each hand (3-6), slammed together (7), the sphere round him 8-9.
  { ref: [1, AIR], fix: 1.04, name: 'air-orb-M', bb: true, file: 'Malik_Air_Special_Medium.png', n: 12, rows: 3, mode: 'air', holds: [1, 1, 2, 2, 2, 2, 3, 2, 2, 2, 3, 4] },
  { ref: [1, STANCE], fix: SP, name: 'specter-grasp', density: 0.6, bb: true, file: 'Malik_Specter_Grasp.png', n: 12, rows: 3, anchor: 'upper', holds: [2, 2, 2, 3, 3, 4, 4, 4, 3, 3, 3, 3] },
  { ref: [1, STANCE], fix: SP, name: 'specter-stomp', density: 0.6, bb: true, file: 'Malik_Specter_Stomp.png', n: 12, rows: 3, anchor: 'upper', holds: [2, 2, 3, 3, 4, 2, 2, 3, 4, 4, 4, 4] },
  { ref: [1, STANCE], fix: SP, name: 'specter-judgment', density: 0.6, bb: true, file: 'Malik_Specter_Judgment.png', n: 12, rows: 3, anchor: 'upper', holds: [2, 2, 3, 3, 4, 4, 3, 2, 3, 4, 4, 4] },
  { name: 'barrage-beam', file: 'Malik_Specter_Barrage_Effect.png', n: 8, rows: 2, mode: 'fx', anchor: 'bright', size: 300, holds: [2, 9, 9, 9, 9, 4, 4, 5] },
  { name: 'grasp-hand', file: 'Malik_Specter_Grasp_Effect.png', n: 10, rows: 2, mode: 'fx', anchor: 'ground', size: 190, holds: [3, 3, 3, 3, 2, 4, 3, 3, 3, 4] },
  { name: 'specter-stomp-wave', file: 'Malik_Specter_Stomp_Effect.png', n: 10, rows: 2, mode: 'fx', anchor: 'ground', size: 230, holds: [2, 3, 3, 3, 3, 3, 3, 3, 4, 4] },
  { name: 'judgment-wall', file: 'Malik_Specter_Judgment_Effect.png', n: 14, rows: 2, mode: 'fx', anchor: 'ground', size: 380, holds: [4, 4, 4, 2, 2, 2, 3, 3, 4, 4, 3, 3, 4, 4] },
  { ref: [1, STANCE], fix: SP, name: 'specter-idle', bb: true, file: 'clean/Malik_Specter_Idle.png', n: 1, anchor: 'upper', holds: [8] },
  // The medium one is a spout from the floor: 1-3 the ring forming (not used: his hand paints it), 4-6 the spout, 7-8 dying away.
  { name: 'orb-M', file: 'Malik_specialmove_spiritorbM_effect.png', n: 8, rows: 2, mode: 'fx', anchor: 'ground', size: 230, use: [1, 8], holds: [5, 5, 6, 3, 3, 3, 4, 5] }, // Nov 28 (owner): the ring forming on the floor (1-3) is the warning before the spout
  // The heavy orb: 1-3 forming (not used: it forms in his hands), 4-6 flying (looped), 7-9 bursting.
  { name: 'orb-H', file: 'Malik_ specialmove_spiritorbH_effect.png', n: 12, rows: 3, mode: 'fx', anchor: 'centre', size: 210, holds: [2, 2, 3, 3, 3, 3, 3, 3, 2, 3, 4, 5] },
];

// ---- One size from drawing to drawing (owner, Nov 27: "he's not changing sizes from move to move"). Every body drawing's
// area (painted spirit light and the flapping sash left out) is held to its stance's target below, so a drawing that came
// out bigger or smaller than the rest is brought back (see even in avner-prep.mjs). Targets are in sheet px, the square
// root of the area, measured from his stance, crouch and air tuck in the sheets that set them (5L's last drawing, the
// crouch's last, j.L's first). Drawings where the guardian covers his body are left out (null): there is too little of
// him to measure.
const s = 'stand', c = 'crouch', a = 'air', _ = null;
export const EVEN = {
  // EVEN_DEBUG=1 node scripts/avner-prep.mjs --char malik --analyze prints each drawing's measure. Stance drawings measured
  // 223-239 (5L 232, Spirit Orb 231, the spear 231), the crouch 240, j.L's tuck 198-203. A drawing more than 5% under or
  // 3% over its target is brought back to that edge, never by more than 10% down or 6% up.
  stand: 231, crouch: 240, air: 200, band: [0.95, 1.03], cap: [0.9, 1.06],
  skip: (r, g, b) => {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mn > 205) return true; // white light, sparks
    if (b > r + 25 && mx > 140) return true; // pale blue and mint spirit light
    if (r > 120 && b > 160 && g < 140) return true; // violet light
    if (g > r + 25 && b > r + 25 && mx < 200) return true; // the teal sash (it flaps)
    return false;
  },
};
const EVEN_OF = {
  idle: s, 'clean/Malik_walk.png': s, crouch: [s, c, c, c, c, c], 'clean/Malik_forward_dash.png': s, 'clean/malik_back_dash.png': s,
  'clean/malik_jump.png': [c, a, a, a, a, a, a, a, c], 'clean/Malik_forward_air_dash.png': a, 'airdash-back': a, 'air-tech': a,
  'clean/malik_block.png': [s, s, c, c, a, a], 'clean/Malik_hitreaction_Standing_crouching_air.png': [s, s, c, c, a, a, a, a],
  crumple: s, '5L': s, '5M': s, '5H': s, '2M': c, '2H': c, '5S': s, '4H': s, jL: a, jM: a, jH: a, jS: [a, a, a, a, _, _, _, _, a, a],
  'rite-j': [a, _, _, _, _, _, _, _, _, _, _, _, _, _, _, a], fireball: s, 'fireball-M': s, 'fireball-H': [s, _, _, _, s, s, s, s],
  'clean/malik_forwardthrow.png': s, 'clean/malik_backthrow.png': s, 'rite-5': [s, _, _, _, _, _, _, s], 'rite-2': [s, s, s, _, _, _, _, _, _, _, _, s],
  spear: s, 'spear-H': [s, c, _, _, _, _, _, _, _, c, c, s], 'air-orb': [a, a, a, a, _, _, _, _, _, _, a, a], 'rite-4': [s, s, _, _, _, _, _, _, _, _, s, s],
};
for (const sh of SHEETS) { const e = EVEN_OF[sh.name ?? sh.file]; if (e !== undefined) sh.even = e; }
