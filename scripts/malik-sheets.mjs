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

// One size and one set of colours across the redrawn sheets (owner, Nov 25: "his size is sporadic and sometimes his
// colour changes slightly from frame to frame"). See even / tone in avner-prep.mjs.
// EVEN: the square root of a drawing's body area in sheet px (sash left out) that each stance should show; the idle
// measures 246. A drawing outside the band is brought back to its edge, never by more than cap (a tucked or kneeling
// pose really does show less body, so drawings are enlarged less readily than they are shrunk).
export const EVEN = { stand: 246, crouch: 234, air: 232, band: [0.94, 1.03], cap: [0.88, 1.06] };
// PALETTE: the middle of what the redrawn sheets measured for each colour (mean red, green, blue).
export const PALETTE = { pants: [80, 37, 57], skin: [172, 113, 81], hair: [59, 32, 27], sash: [198, 45, 48] };

const S = 186; // standing height in game px
const CROUCH = 152; // the crouch the redrawn crouching attacks start and end in
// The redrawn air L / M / H have no pose of known height: [drawing, game px] set so their bodies match j.S, which has one.
const AIRREF = { jL: [6, 208], jM: [6, 208], jH: [6, 208] };
const TALL = 219; // the upright pose that ends the redrawn normals (his fighting stance in the same drawings is 186)
export const SHEETS = [
  // The idle, redrawn the night of Nov 25: 12 drawings in 3 rows, the leaner build. 12 x 5 frames = the 60 of before.
  { name: 'idle', bb: true, tone: true, pantsBand: [0.5, 0.92], scaleRef: true, stand: S, file: 'Malik_Idle.PNG', n: 12, rows: 3, anchor: 'upper', holds: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5] },
  // Walks, redrawn the night of Nov 25: a sheet each now, 8 drawings; the first, his walking stance, is 205 px (mine). 8 x 6 = the 48 frames of before.
  { ref: [1, 205], name: 'walk', bb: true, even: 'stand', tone: true, file: 'Malik_Forward_Walk.png', n: 8, rows: 2, anchor: 'upper', holds: [6, 6, 6, 6, 6, 6, 6, 6] },
  { ref: [1, 205], fix: 1.05, name: 'walk-back', bb: true, even: 'stand', tone: true, file: 'Malik_Back_Walk.png', n: 8, rows: 2, anchor: 'upper', holds: [6, 6, 6, 6, 6, 6, 6, 6] },
  // Dashes, redrawn the night of Nov 25. Forward: 1 the push off, 2-5 the run, 6 the stop, 7 upright. Back: 1 the push,
  // 2-4 the hop (off the ground as drawn), 5 landed, 6 upright.
  { ref: [7, TALL], bb: true, even: 'stand', tone: true, file: 'Malik_Forward_Dash.PNG', n: 7, rows: 2, parts: [
    { name: 'dash', frames: [1, 2, 3, 4, 5], anchor: 'upper', holds: [2, 3, 2, 3, 2] },
    { name: 'dash-stop', frames: [6, 7], anchor: 'upper', holds: [2, 1] },
  ] },
  { ref: [6, TALL], bb: true, even: 'stand', tone: true, file: 'Malik_Backdash.png', n: 6, rows: 2, parts: [
    { name: 'backdash', frames: [1, 2, 3, 4], anchor: 'upper', lineFrom: [1, 5, 6], holds: [2, 4, 4, 4] },
    { name: 'backdash-stop', frames: [5, 6], anchor: 'upper', lineFrom: [5, 6], holds: [4, 2] },
  ] },
  // Jump: 1 the squat, 2-6 rising to the top, 7-8 falling, 9 the landing.
  { ref: [9, 150], bb: true, file: 'Malik_Jump.PNG', n: 9, parts: [
    { name: 'jumpsquat', frames: [1], anchor: 'upper', lineFrom: [1, 9], holds: [3] },
    { name: 'jump', frames: [2, 3, 4, 5, 6], mode: 'air', holds: [5, 9, 9, 9, 28] },
    { name: 'fall', frames: [7, 8], mode: 'air', holds: [8, 52] },
    { name: 'land', frames: [9], anchor: 'upper', lineFrom: [1, 9], holds: [3] },
  ] },
  // Air dashes, redrawn the night of Nov 25. Forward: 1-4 the dash, 5 coming out of it (one drawing now). Back: all four.
  // Sized by the falling pose that ends each (the back one is drawn stretched out: 250, set by body area).
  { ref: [5, AIRREF.jL[1]], bb: true, even: 'air', tone: true, file: 'Malik_Forward_AirDash.PNG', n: 5, rows: 2, parts: [
    { name: 'airdash', frames: [1, 2, 3, 4], mode: 'air', holds: [2, 4, 4, 4] },
    { name: 'airdash-end', frames: [5], mode: 'air', holds: [60] },
  ] },
  { ref: [4, 250], name: 'airdash-back', bb: true, even: 'air', tone: true, file: 'Malik_Back_AirDash.png', n: 4, mode: 'air', holds: [2, 4, 4, 2] },
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
  // Redrawn by the owner the night of Nov 25 (2688 x 1520, several rows, a leaner build). Each ends in the same upright
  // pose (TALL), which sizes the sheet. The hit lands on: 5L 3, 5M 2 and 6 of the drawn sheet, 5H 5, Back Heavy 4.
  { ref: [6, TALL], name: '5L', bb: true, even: 'stand', tone: true, file: 'Malik_Light.PNG', n: 6, rows: 2, anchor: 'upper', holds: [1, 2, 2, 2, 3, 2] },
  // 5M: its upright pose is drawn about 12% small beside its own action drawings (fix), so it is left out. Drawings
  // 3 to 5 (pulling back and winding up between the two punches) are left out too: the two hits are 2 frames apart.
  { ref: [9, TALL], fix: 0.88, bb: true, even: 'stand', tone: true, file: 'Malik_Medium.PNG', n: 9, rows: 3, parts: [{ name: '5M', frames: [1, 2, 6, 7, 8], anchor: 'upper', holds: [3, 4, 3, 6, 6] }] },
  { ref: [8, TALL], name: '5H', bb: true, even: 'stand', tone: true, file: 'Malik_Heavy.PNG', n: 8, rows: 2, anchor: 'upper', holds: [2, 2, 2, 2, 3, 7, 6, 5] },
  // Crouching attacks, redrawn the night of Nov 25 (rows, the leaner build, already see-through). CROUCH is the height of
  // the crouch they start and end in. The hit lands on: 2L 3, 2M 4, 2H 4.
  { ref: [6, CROUCH], name: '2L', bb: true, even: 'crouch', tone: true, file: 'Malik_Crouch_light.PNG', n: 6, rows: 2, anchor: 'upper', holds: [1, 2, 2, 3, 3, 2] },
  { ref: [7, CROUCH], name: '2M', bb: true, even: 'crouch', tone: true, file: 'Malik_Crouch_Medium.PNG', n: 7, rows: 2, anchor: 'upper', holds: [2, 2, 2, 3, 5, 4, 4] },
  { ref: [8, CROUCH], name: '2H', bb: true, even: 'crouch', tone: true, file: 'Malik_Crouch_Heavy.PNG', n: 8, rows: 2, anchor: 'upper', holds: [3, 3, 2, 3, 5, 6, 6, 5] },
  { ref: [8, TALL], name: '5S', bb: true, even: 'stand', tone: true, file: 'Malik_SLauncher.PNG', n: 8, rows: 2, anchor: 'upper', holds: [3, 3, 2, 3, 8, 6, 5, 5] }, // redrawn the night of Nov 25; the hit is still on drawing 4
  { ref: [8, TALL], name: '4H', bb: true, even: 'stand', tone: true, file: 'Malik_BackHeavy.PNG', n: 8, rows: 2, anchor: 'upper', holds: [3, 4, 3, 3, 4, 6, 6, 6] },
  // 6M, the stomp that hits a fighter lying down: 2 the knee up, 3 the stomp.
  { ref: [1, S], name: 'stomp', bb: true, file: 'Malik_ForwardMedium.PNG', n: 6, anchor: 'upper', holds: [3, 6, 3, 8, 7, 7] },
  { name: 'stomp-wave', file: 'Malik_ForwardMedium_Effect.PNG', n: 7, mode: 'fx', anchor: 'ground', size: 150, holds: [2, 2, 2, 2, 3, 3, 3] },
  // Air normals, redrawn the night of Nov 25. The hit lands on: j.L 3, j.M 3, j.H 3 (with the spirit hand's drawing 4),
  // j.S 4. j.S ends in a landing crouch and the upright pose (6, 7): left out, the move has no landing state.
  { ref: AIRREF.jL, name: 'jL', bb: true, even: 'air', tone: true, file: 'Malik_Air_Light.PNG', n: 6, rows: 2, mode: 'air', holds: [2, 1, 4, 2, 3, 3] },
  { ref: AIRREF.jM, name: 'jM', bb: true, even: 'air', tone: true, file: 'Malik_Air_Medium.PNG', n: 6, rows: 2, mode: 'air', holds: [3, 2, 4, 4, 4, 4] },
  { ref: AIRREF.jH, name: 'jH', bb: true, even: 'air', tone: true, file: 'Malik_Air_Heavy.PNG', n: 6, rows: 2, mode: 'air', holds: [4, 5, 3, 3, 3, 3] },
  { name: 'jH-hand', file: 'Malik_Air_Heavy_Effect.PNG', n: 7, mode: 'fx', anchor: 'centre', size: 176, holds: [3, 3, 3, 3, 3, 3, 3] },
  { ref: [7, TALL], bb: true, even: 'air', tone: true, file: 'Malik_Air_S.PNG', n: 7, rows: 2, parts: [{ name: 'jS', frames: [1, 2, 3, 4, 5], mode: 'air', holds: [3, 3, 2, 6, 16] }] },
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
  // Redrawn the night of Nov 25 (the leaner build), each ending upright. L: 3 the thrust, 4 the palm. M: 1-4 gathering,
  // 5 the thrust, 6 the palm. H: 1-6 the big gather, 7 the thrust, 8 both palms. The orb leaves on the drawing after the strike.
  { ref: [6, TALL], name: 'fireball', bb: true, even: 'stand', tone: true, file: 'Malik_SpecialMove_Light_EnergySphere.png', n: 6, rows: 2, anchor: 'upper', holds: [4, 4, 3, 3, 12, 10] },
  { ref: [8, TALL], name: 'fireball-M', bb: true, even: 'stand', tone: true, file: 'Malik_SpecialMove_Medium_EnergySphere.PNG', n: 8, rows: 2, anchor: 'upper', holds: [4, 4, 4, 3, 3, 10, 6, 6] },
  { ref: [10, TALL], name: 'fireball-H', bb: true, even: 'stand', tone: true, file: 'Malik_SpecialMove_Heavy_EnergySphere.PNG', n: 10, rows: 3, perRow: [4, 4, 2], anchor: 'upper', holds: [3, 3, 4, 3, 3, 2, 2, 3, 12, 10] },
  // The orbs: 1-2 forming, 3-6 flying (looped), 7-9 bursting.
  { name: 'orb', file: 'Malik_SpecialMove_Light_EnergySphere_Effect.PNG', n: 9, mode: 'fx', anchor: 'centre', size: 100, holds: [3, 3, 3, 3, 3, 3, 3, 4, 5] },
  { name: 'orb-M', file: 'Malik_SpecialMove_Medium_EnergySphere_Effect.PNG', n: 9, mode: 'fx', anchor: 'centre', size: 125, holds: [3, 3, 3, 3, 3, 3, 3, 4, 5] },
  // The heavy orb is light on black like the others since Nov 26 (it was a painted dark-blue cut-out).
  { name: 'orb-H', file: 'Malik_SpecialMove_Heavy_EnergySphere_Effect.png', n: 9, mode: 'fx', anchor: 'centre', size: 150, holds: [3, 3, 3, 3, 3, 3, 3, 4, 5] },
  // Lariat, redrawn the night of Nov 25 (nine drawings now): 1 the charge, 2 the start, 3-4 the run, 5 the arm cocked,
  // 6 the swing, 7-8 recovering, 9 upright. Its effect is six streaks, one to a row, each placed by its head (the right end).
  { ref: [9, TALL], name: 'lariat', bb: true, even: 'stand', tone: true, file: 'Malik_SpecialMove_Lariat.PNG', n: 9, rows: 3, perRow: [4, 4, 1], anchor: 'upper', holds: [4, 2, 3, 2, 2, 4, 9, 8, 7] },
  { name: 'lariat-trail', file: 'Malik_SpecialMove_Lariat_Effect.PNG', n: 6, rows: 6, mode: 'fx', anchor: 'centre', size: 330, centres: [[2670, 119], [2670, 380], [2670, 639], [2670, 892], [2670, 1150], [2670, 1385]], holds: [2, 2, 2, 2, 2, 3] },
  // Resilience Pillar, redrawn the night of Nov 25: the same seven drawings (3 the punch down, 4 the fist in the floor), ending upright-ish.
  { ref: [1, 205], name: 'pillar', bb: true, tone: true, file: 'Malik_SpecialMove_ResilencePillar.PNG', n: 7, anchor: 'upper', holds: [2, 2, 1, 9, 9, 9, 8] },
  { name: 'pillar-fx', file: 'Malik_SpecialMove_ResilencePillar_Effect.PNG', n: 8, mode: 'fx', anchor: 'ground', size: 330, cuts: [[242, 528, 840, 1304, 1688, 2058, 2386]], holds: [3, 3, 3, 3, 3, 3, 3, 3] },
  // The Vow strike: one sheet for the three strikes (the same drawings, held longer for the stronger ones).
  { ref: [1, S], bb: true, file: 'Malik_Vow_Strike_Quick_Normal_Full.png', n: 6, grid: true, parts: [
    { name: 'vow-strike-quick', frames: [1, 2, 3, 4, 5, 6], anchor: 'upper', holds: [3, 3, 3, 3, 10, 10] },
    { name: 'vow-strike', frames: [1, 2, 3, 4, 5, 6], anchor: 'upper', holds: [5, 4, 4, 3, 11, 11] },
    { name: 'vow-strike-full', frames: [1, 2, 3, 4, 5, 6], anchor: 'upper', holds: [5, 5, 5, 4, 12, 12] },
  ] },
  { name: 'vow-blast', file: 'Malik_Vow_Strike_Quick_Normal_Full_Effect.jpg', n: 6, mode: 'fx', anchor: 'centre', size: 190, holds: [2, 2, 3, 3, 3, 3] },
  // Rite. In the air: 1-2 arms wide, 3 the clap, 4-5 after; its effect is two lights closing on each other (1-4), the
  // burst (5) and what is left (6-7). Back + R: 2-3 gathering, 4 the burst; its effect is a ward forming (1-3) and bursting.
  // 5R Guardian Palm, redrawn the night of Nov 25 ("Rite Neutral"): the palm goes out on drawing 3. Its spirit hand is painted,
  // not light on black: cut like a body drawing, about its middle (1-2 leaving, 3-4 flying, 5-7 the impact).
  { ref: [5, TALL], name: 'rite-5', bb: true, even: 'stand', tone: true, file: 'Malik_Rite_Neutral.png', n: 5, anchor: 'upper', holds: [5, 6, 6, 9, 7] },
  { ref: [3, 110], name: 'palm-5', bb: true, file: 'Malik_Rite_Neutral_Effect.png', n: 7, grid: true, mode: 'air', holds: [2, 2, 3, 3, 3, 3, 4] },
  { ref: [5, AIRREF.jL[1]], name: 'rite-j', bb: true, even: 'air', tone: true, file: 'Malik_Rite_Air.png', n: 5, mode: 'air', holds: [5, 6, 4, 7, 6] },
  { name: 'clap', file: 'Malik_Rite_Air_Effect.png', n: 7, mode: 'fx', anchor: 'centre', size: 190, cuts: [[305, 625, 1005, 1373, 1838, 2292]], holds: [3, 3, 3, 2, 3, 3, 4] },
  // The burst under the opponent (owner's new art, Nov 26): 1-2 a ring, 3-5 the orb, 6 the burst, 7-8 shards. The clap at his hands stays the sheet above.
  { name: 'air-burst', file: 'Malik_Air_Rite_Effect.PNG', n: 8, mode: 'fx', anchor: 'centre', size: 190, holds: [2, 2, 2, 2, 3, 3, 4, 5] },
  { ref: [7, TALL], name: 'rite-4', bb: true, even: 'stand', tone: true, file: 'Malik_Rite_Back.png', n: 7, anchor: 'upper', holds: [3, 5, 6, 5, 5, 5, 4] },
  { name: 'ward', file: 'Malik_Back_Rite_Effect.PNG', n: 7, mode: 'fx', anchor: 'centre', size: 260, cuts: [[313, 582, 931, 1445, 1913, 2330]], holds: [2, 3, 3, 3, 3, 3, 4] },
  // 2R ("Rite Down"): 2 the wind-up, 3 the hand slams the ground. Its effect is an orb rolling along the floor: 1-2 forming,
  // 3-4 rolling (looped), 5-7 the burst.
  { ref: [5, CROUCH], name: 'rite-2', bb: true, even: 'crouch', tone: true, file: 'Malik_Rite_Down.png', n: 5, anchor: 'upper', holds: [5, 8, 9, 7, 7] },
  { name: 'palm-2', file: 'Malik_Rite_Down_Effect.png', n: 9, mode: 'fx', anchor: 'ground', size: 120, holds: [2, 2, 3, 3, 3, 3, 3, 3, 4] }, // redrawn Nov 26: 1-2 forming, 3-6 the orb (looped), 7-9 the burst
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
