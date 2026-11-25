// Malik: the table of drawn sheets for the cutting tool.
//
//   node scripts/avner-prep.mjs --char malik [--only 5L,jump] [--analyze]
//
// The newer drawings (owner, Nov 25; replaced the same evening by full-size PNGs, 2172 px wide, same drawings): one
// row each on magenta; effects are light on black. Sheets he did not send again (the light Spirit Orb motion, the Vow
// strike, install jump, the second half of the change) keep their earlier cut; their source files are gone. He stands 186 px. Every sheet is drawn at its own size, so each names a drawing whose height is
// known (ref: [drawing, game px]); sheets with no standing drawing are sized by how much body they hold (MEASURE).
// No holds came with these: every state keeps the length the rules give it and the holds below are fitted to that
// (which drawing the hit lands on is written beside each attack).
// The fields are explained at the top of the table in avner-prep.mjs.
export const MEASURE = 'area';

const S = 186; // standing height in game px
export const SHEETS = [
  { name: 'idle', bb: true, scaleRef: true, stand: S, file: 'Malik_Idle.PNG', n: 6, anchor: 'upper', holds: [10, 10, 10, 10, 10, 10] },
  // One sheet for both walks: the back walk plays the same drawings in reverse.
  { ref: [1, S], bb: true, file: 'Malik_Walk.PNG', n: 6, parts: [
    { name: 'walk', frames: [1, 2, 3, 4, 5, 6], anchor: 'upper', holds: [8, 8, 8, 8, 8, 8] },
    { name: 'walk-back', frames: [6, 5, 4, 3, 2, 1], anchor: 'upper', holds: [8, 8, 8, 8, 8, 8] },
  ] },
  // Dash: 1-4 the run (1-2 with the burst of wind), 5-6 the stop.
  { ref: [6, S], bb: true, file: 'Malik_Forward_Dash.PNG', n: 6, parts: [
    { name: 'dash', frames: [1, 2, 3, 4], anchor: 'upper', lineFrom: [1, 5, 6], holds: [3, 3, 3, 3] },
    { name: 'dash-stop', frames: [5, 6], anchor: 'upper', lineFrom: [5, 6], holds: [2, 1] },
  ] },
  { ref: [5, S], bb: true, file: 'Malik_Backdash.png', n: 5, parts: [
    { name: 'backdash', frames: [1, 2, 3], anchor: 'upper', lineFrom: [1, 4, 5], holds: [3, 6, 5] },
    { name: 'backdash-stop', frames: [4, 5], anchor: 'upper', lineFrom: [4, 5], holds: [3, 3] },
  ] },
  // Jump: 1 the squat, 2-6 rising to the top, 7-8 falling, 9 the landing.
  { ref: [9, 150], bb: true, file: 'Malik_Jump.PNG', n: 9, parts: [
    { name: 'jumpsquat', frames: [1], anchor: 'upper', lineFrom: [1, 9], holds: [3] },
    { name: 'jump', frames: [2, 3, 4, 5, 6], mode: 'air', holds: [5, 9, 9, 9, 28] },
    { name: 'fall', frames: [7, 8], mode: 'air', holds: [8, 52] },
    { name: 'land', frames: [9], anchor: 'upper', lineFrom: [1, 9], holds: [3] },
  ] },
  // Air dash: 1-4 the dash, 5-6 coming out of it.
  { bb: true, file: 'Malik_Forward_AirDash.PNG', n: 6, parts: [
    { name: 'airdash', frames: [1, 2, 3, 4], mode: 'air', holds: [2, 5, 5, 2] },
    { name: 'airdash-end', frames: [5, 6], mode: 'air', holds: [8, 52] },
  ] },
  // Blocks: two drawings each (the impact, then the guard): standing, crouching, in the air.
  { ref: [1, 178], bb: true, file: 'Malik_Standing_Crouching_Air_Block.PNG', n: 6, parts: [
    { name: 'block-stand', frames: [1, 2], anchor: 'upper', lineFrom: [1, 2, 3, 4], holds: [4, 1] },
    { name: 'block-crouch', frames: [3, 4], anchor: 'upper', lineFrom: [1, 2, 3, 4], holds: [4, 1] },
    { name: 'block-air', frames: [5, 6], mode: 'air', holds: [4, 1] },
  ] },
  // Hit reactions: 1-2 standing, 3-4 crouching, 5-6 hit in the air, 7-8 tumbling.
  { ref: [2, 178], bb: true, file: 'Malik_HitReaction_Ground_And_Air.PNG', n: 8, parts: [
    { name: 'hit-stand', frames: [1, 2], anchor: 'upper', lineFrom: [1, 2, 3, 4], holds: [6, 1] },
    { name: 'hit-crouch', frames: [3, 4], anchor: 'upper', lineFrom: [1, 2, 3, 4], holds: [6, 1] },
    { name: 'hit-air', frames: [5, 6], mode: 'air', holds: [5, 1] },
    { name: 'tumble', frames: [7, 8], mode: 'air', holds: [6, 6] },
  ] },
  { ref: [1, 190], name: 'crumple', bb: true, file: 'Malik_HitReaction_Crumple.PNG', n: 6, holds: [5, 5, 6, 8, 8, 1] },
  // ---- Normals. The hit lands on: 5L 3, 5M 3 and 4, 5H 4, 2L 4, 2M 4, 2H 5, 5S 4, 4H 4, 6M 3. ----
  { ref: [1, S], name: '5L', bb: true, file: 'Malik_Light.PNG', n: 7, anchor: 'upper', holds: [2, 1, 2, 2, 2, 2, 1] },
  { ref: [1, S], name: '5M', bb: true, file: 'Malik_Medium.PNG', n: 8, anchor: 'upper', holds: [3, 2, 2, 3, 3, 3, 3, 3] },
  { ref: [1, S], name: '5H', bb: true, file: 'Malik_Heavy.PNG', n: 7, anchor: 'upper', holds: [3, 3, 2, 3, 7, 6, 5] },
  { ref: [7, 132], bb: true, file: 'Malik_Crouch_light.PNG', n: 7, parts: [{ name: '2L', frames: [2, 3, 4, 5, 6, 7], anchor: 'upper', holds: [2, 1, 2, 3, 3, 2] }] },
  { ref: [1, 132], name: '2M', bb: true, file: 'Malik_Crouch_Medium.PNG', n: 8, anchor: 'upper', holds: [2, 2, 2, 3, 4, 3, 3, 3] },
  { ref: [1, 132], name: '2H', bb: true, file: 'Malik_Crouch_Heavy.PNG', n: 8, anchor: 'upper', holds: [2, 2, 2, 2, 3, 8, 7, 7] },
  { ref: [1, S], name: '5S', bb: true, file: 'Malik_SLauncher.PNG', n: 8, anchor: 'upper', holds: [3, 3, 2, 3, 8, 6, 5, 5] },
  { ref: [1, S], name: '4H', bb: true, file: 'Malik_BackHeavy.PNG', n: 7, anchor: 'upper', holds: [4, 3, 3, 3, 8, 7, 7] },
  // 6M, the stomp that hits a fighter lying down: 2 the knee up, 3 the stomp.
  { ref: [1, S], name: 'stomp', bb: true, file: 'Malik_ForwardMedium.PNG', n: 6, anchor: 'upper', holds: [3, 6, 3, 8, 7, 7] },
  { name: 'stomp-wave', file: 'Malik_ForwardMedium_Effect.PNG', n: 7, mode: 'fx', anchor: 'ground', size: 150, holds: [2, 2, 2, 2, 3, 3, 3] },
  // Air normals. The hit lands on: j.L 3, j.M 4, j.H 3 (with the spirit hand's drawing 4), j.S 4.
  { name: 'jL', bb: true, file: 'Malik_Air_Light.PNG', n: 6, mode: 'air', holds: [2, 1, 4, 2, 3, 3] },
  { name: 'jM', bb: true, file: 'Malik_Air_Medium.PNG', n: 7, mode: 'air', holds: [2, 2, 1, 4, 4, 4, 4] },
  { name: 'jH', bb: true, file: 'Malik_Air_Heavy.PNG', n: 6, mode: 'air', holds: [4, 5, 3, 3, 3, 3] },
  { name: 'jH-hand', file: 'Malik_Air_Heavy_Effect.PNG', n: 7, mode: 'fx', anchor: 'centre', size: 176, holds: [3, 3, 3, 3, 3, 3, 3] },
  { name: 'jS', bb: true, file: 'Malik_Air_S.PNG', n: 7, mode: 'air', holds: [3, 3, 2, 4, 6, 6, 6] },
  { name: 'jS-arc', file: 'Malik_Air_S_Effect.PNG', n: 7, mode: 'fx', anchor: 'centre', size: 150, holds: [2, 2, 2, 2, 3, 3, 3] },
  // Throws: the grab is the move's own sheet; the hold and the finish are the shared throw states (art.throws for the
  // back throw). The back throw turns him round: its first finish drawing is from before the turn, stored mirrored.
  { ref: [8, S], bb: true, file: 'Malik_Forward_Throw.PNG', n: 8, parts: [
    { name: 'throw-forward', frames: [1, 3, 8], anchor: 'upper', holds: [4, 10, 11] },
    { name: 'throw-hold', frames: [3, 2, 4], anchor: 'upper', holds: [4, 4, 6] },
    { name: 'throw-finish', frames: [5, 6, 7, 8], anchor: 'upper', holds: [6, 8, 8, 8] },
  ] },
  { ref: [1, S], bb: true, file: 'Malik_Back_Throw.PNG', n: 6, parts: [
    { name: 'throw-back', frames: [1, 2, 6], anchor: 'upper', holds: [4, 10, 11] },
    { name: 'throw-back-hold', frames: [1, 2, 2], anchor: 'upper', holds: [4, 4, 6] },
    { name: 'throw-back-finish', frames: [3, 4, 5, 6], anchor: 'upper', holds: [6, 8, 8, 8], mirror: [1] },
  ] },
  // ---- Specials. Spirit Orb has a sheet for each button now; the palm strikes on drawing 4 (L, M) or 5 (H) and the
  // orb leaves on the next. ----
  { ref: [1, S], name: 'fireball', bb: true, file: 'Malik_ProjectileMotion.jpg', n: 8, anchor: 'upper', holds: [4, 4, 3, 3, 8, 6, 4, 4] },
  { ref: [1, S], name: 'fireball-M', bb: true, file: 'Malik_SpecialMove_Medium_EnergySphere.PNG', n: 6, anchor: 'upper', holds: [7, 5, 3, 9, 8, 8] }, // the full-size sheet has six drawings: 3 the thrust, 4 the palm
  { ref: [9, S], name: 'fireball-H', bb: true, file: 'Malik_SpecialMove_Heavy_EnergySphere.PNG', n: 9, grid: true, cuts: [[217, 428, 653, 882, 1162, 1473, 1739, 1955]], anchor: 'upper', holds: [5, 5, 5, 5, 3, 8, 6, 4, 4] },
  // The orbs: 1-2 forming, 3-6 flying (looped), 7-9 bursting.
  { name: 'orb', file: 'Malik_SpecialMove_Light_EnergySphere_Effect.PNG', n: 9, mode: 'fx', anchor: 'centre', size: 100, holds: [3, 3, 3, 3, 3, 3, 3, 4, 5] },
  { name: 'orb-M', file: 'Malik_SpecialMove_Medium_EnergySphere_Effect.PNG', n: 9, mode: 'fx', anchor: 'centre', size: 125, holds: [3, 3, 3, 3, 3, 3, 3, 4, 5] },
  // The heavy orb is painted (dark blue), on magenta: cut like a body drawing, about its middle.
  { ref: [3, 120], name: 'orb-H', bb: true, file: 'Malik_SpecialMove_EnergySphere_Effect.PNG', n: 9, mode: 'air', holds: [3, 3, 3, 3, 3, 3, 3, 4, 5] },
  // Lariat: 1 the charge, 2 the start, 3-5 the run, 6 the swing, 7-8 recovering. The same eight drawings as before.
  { ref: [8, S], name: 'lariat', bb: true, file: 'Malik_SpecialMove_Lariat.PNG', n: 8, anchor: 'upper', holds: [4, 3, 2, 2, 2, 4, 12, 12] },
  { name: 'lariat-trail', file: 'Malik_SpecialMove_Lariat_Effect.PNG', n: 4, mode: 'fx', anchor: 'centre', size: 220, holds: [2, 2, 2, 4] },
  { ref: [1, 205], name: 'pillar', bb: true, file: 'Malik_SpecialMove_ResilencePillar.PNG', n: 7, anchor: 'upper', holds: [2, 2, 1, 9, 9, 9, 8] },
  { name: 'pillar-fx', file: 'Malik_SpecialMove_ResilencePillar_Effect.PNG', n: 8, mode: 'fx', anchor: 'ground', size: 330, holds: [3, 3, 3, 3, 3, 3, 3, 3] },
  // The Vow strike: one sheet for the three strikes (the same drawings, held longer for the stronger ones).
  { ref: [1, S], bb: true, file: 'Malik_Vow_Strike_Quick_Normal_Full.png', n: 6, grid: true, parts: [
    { name: 'vow-strike-quick', frames: [1, 2, 3, 4, 5, 6], anchor: 'upper', holds: [3, 3, 3, 3, 10, 10] },
    { name: 'vow-strike', frames: [1, 2, 3, 4, 5, 6], anchor: 'upper', holds: [5, 4, 4, 3, 11, 11] },
    { name: 'vow-strike-full', frames: [1, 2, 3, 4, 5, 6], anchor: 'upper', holds: [5, 5, 5, 4, 12, 12] },
  ] },
  { name: 'vow-blast', file: 'Malik_Vow_Strike_Quick_Normal_Full_Effect.jpg', n: 6, mode: 'fx', anchor: 'centre', size: 190, holds: [2, 2, 3, 3, 3, 3] },
  // Rite. In the air: 1-2 arms wide, 3 the clap, 4-5 after; its effect is two lights closing on each other (1-4), the
  // burst (5) and what is left (6-7). Back + R: 2-3 gathering, 4 the burst; its effect is a ward forming (1-3) and bursting.
  { name: 'rite-j', bb: true, file: 'Malik_Air_Rite.PNG', n: 5, mode: 'air', holds: [5, 6, 4, 7, 6] },
  { name: 'clap', file: 'Malik_Air_Rite_Effect.PNG', n: 7, mode: 'fx', anchor: 'centre', size: 190, cuts: [[238, 509, 865, 1222, 1561, 1884]], holds: [3, 3, 3, 2, 3, 3, 4] },
  { ref: [1, S], name: 'rite-4', bb: true, file: 'Malik_Back_Rite.PNG', n: 7, anchor: 'upper', holds: [3, 5, 6, 5, 5, 5, 4] },
  { name: 'ward', file: 'Malik_Back_Rite_Effect.PNG', n: 7, mode: 'fx', anchor: 'centre', size: 260, cuts: [[255, 484, 781, 1188, 1527, 1867]], holds: [2, 3, 3, 3, 3, 3, 4] },
  // ---- Spirit Install: the guardian is drawn with him in these. The drawings stand close: cut on a grid. ----
  { ref: [1, 285], name: 'install-idle', bb: true, file: 'Malik_Install_Idle.PNG', n: 6, grid: true, anchor: 'upper', holds: [10, 10, 10, 10, 10, 10] },
  { ref: [1, 285], name: 'install-walk', bb: true, file: 'Malik_Install_Forward_Walk.PNG', n: 6, grid: true, anchor: 'upper', holds: [8, 8, 8, 8, 8, 8] },
  { bb: true, file: 'Malik_Install_Forward_Dash.PNG', n: 6, grid: true, ref: [6, 285], parts: [
    { name: 'install-dash', frames: [1, 2, 3, 4], anchor: 'upper', lineFrom: [5, 6], air: [1, 2, 3, 4], holds: [3, 3, 3, 3] },
    { name: 'install-dash-stop', frames: [5, 6], anchor: 'upper', lineFrom: [5, 6], holds: [2, 1] },
  ] },
  { bb: true, file: 'Malik_Install_Jump.jpg', n: 9, grid: true, ref: [9, 285], parts: [
    { name: 'install-jumpsquat', frames: [1], anchor: 'upper', lineFrom: [1, 9], holds: [3] },
    { name: 'install-jump', frames: [2, 3, 4, 5, 6], mode: 'air', holds: [5, 9, 9, 9, 28] },
    { name: 'install-fall', frames: [7, 8], mode: 'air', holds: [8, 52] },
    { name: 'install-land', frames: [9], anchor: 'upper', lineFrom: [1, 9], holds: [3] },
  ] },
  // The change itself, two sheets of six: the guardian rises behind him, then the blaze.
  { ref: [1, 196], name: 'install-1', bb: true, file: 'Malik_Install_Transformation_Part1.jpg', n: 6, grid: true, anchor: 'upper', holds: [3, 3, 3, 3, 4, 4] },
  { ref: [6, 285], name: 'install-2', bb: true, file: 'Malik_Install_Transformation_Part2.jpg', n: 6, grid: true, anchor: 'upper', holds: [4, 4, 3, 3, 3, 3] },
];
