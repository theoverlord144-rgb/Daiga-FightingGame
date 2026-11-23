# Avner, the Lampbearer

Branch `avner-lampbearer` (not merged into `main`: play it first). November 23, 2026.

## What was built

Avner's old chain kit is out of the game and his redesign is in: the lantern normals, Rising Moon, Lunar Halo,
Tide, the Moonlit Rite, two supers, and the lantern that shows his Devotion as a moon phase.

- **Nothing was deleted.** The whole old Avner (his character file, the 44 drawn sheets and the 73 game sheets) is
  in `data/characters/_archive/avner_chain/`. The game does not load that folder. The old kit's tests now read the
  archived file, with every check unchanged.
- **Brand, Vigil, Flare, Lumen Hook, Reel, Lightstep and the chain normals are gone from the live Avner.** Devotion,
  Vow, Absolve, Repel / Draw, Witness, Perfect Link and the Rite button work as before. He is Balanced (1.0 / 1.0).
- **Every number is in his data file** (`data/characters/avner/avner.toska.json`), none in code, and all of it shows
  up in the box editor, HIT SETTINGS and CANCELS pages.

### The moves

| Move | Input | What it does |
| --- | --- | --- |
| Lantern Jab | 5L | 5 / 2 / 9. Chains into anything. The lantern flare shows on hit. |
| Push Kick | 5M | 8 / 3 / 14 |
| Lantern Swing | 5H | 14 / 4 / 22. Reaches 225 px (a normal heavy is about 150). Mid. -6 on block. |
| Crescent Kick | 4H | 14 / 5 / 22. He steps back in the startup. The hitbox reaches 380 px (the kick art reaches about 95: the crescent effect that carries the reach is not drawn yet). |
| Rising Lantern | 5S | 11 / 5 / 22. Hard launch, jump cancel on hit, tall box (anti-air). |
| Low Lantern Jab | 2L | 5 / 2 / 9. Low. |
| Shin Kick | 2M | 9 / 3 / 15. Low, 132 px. |
| Lantern Sweep | 2H | 12 / 4 / 24. Low, knockdown. |
| Air Jab / Side Kick / Lantern Arc | j.L / j.M / j.H | 5 / 3 / 10 (overhead), 8 / 5 / 14, 12 / 5 / 18 |
| Lantern Crash | j.S | 14 / 5 / until landing. Ground bounce (once per combo, the engine's rule). |
| Throws | 6H / 4H up close | As before (the old numbers). |
| Rising Moon | 236 + L / M / H | The moon rises 140 / 320 / 520 px in front of him. Its first active frame is frame 16 / 20 / 24 of the move. The glow on the ground shows 6 frames before that. Soft launch. Hits standing, crouching and airborne fighters; it can be blocked. One moon at a time. He recovers on frame 35; the far moon is out until frame 50. |
| Rising Moon EX | 236 + attack + S | One bar. The moon rises under the opponent wherever they are, and its warning is 4 frames longer (10). |
| Lunar Halo | 623 + L / M / H | Startup 6 / 8 / 11. A circle of light around him, sized 0.7 / 1.0 / 1.3, live for 10 frames. Hits behind him too. Launches. H: only his legs can be hit during the startup. About -25 on block. |
| Lunar Halo EX | 623 + attack + S | Startup 5, the big circle, nothing can hit or throw him for frames 1 to 10. |
| Tide | 214 + L / M / H | A wave leaves his hand on frame 7 and runs along the ground: about 230 / 350 / 470 px. If it touches the opponent they are dragged to 85 px in front of him and he recovers first, with them still in hitstun. It passes under a jumping opponent. |
| Tide EX | 214 + attack + S | The longest wave, and it catches airborne opponents too. |
| Moonlit | R, 6R, 2R, j.R | A crescent rises 150 px in front / 420 px away / over himself / 150 px in front from the air, and lights the ground under it (180 px wide). One crescent at a time. |
| Moonmark | (any hit) | A hit he lands on an opponent standing in the light marks them (a ring on them). Opponents in the light fall at 70% gravity. |
| Snap | R with a mark | A moonbeam hits them wherever they are: 300 damage, 26 frames of hitstun, uses up the mark. The crescent stays. |
| Recall | R without a mark | The crescent fades. |
| New Moon | 236236 + S | Super, one bar. Flash, then a dash-through hit on frame 11, 2200 damage, knockdown. Invincible until it hits. |
| Full Moon | 214214 + S | Super. Needs all four bars and spends three. A column of moonlight lands on the opponent wherever they are, 4500 damage. |

The crescent lasts 10 seconds if nothing ends it. When it ends, however it ends, the mark is cleared and Moonlit
cannot be used for 240 frames (a timer shows it).

### Animation rules

- **Jump:** drawing 1 is the squat; drawings 2 to 6 are picked by vertical speed (rising fast, rising, apex,
  falling, falling fast); 7 and 8 are the landing and keep playing after the 3-frame landing state ends.
- **Dash:** drawing 1 for 3 frames, then 2 to 4 at 3 each while it lasts, then 5 and 6 (6 and 4 frames) which keep
  playing into the next state. Back dash and both air dashes the same way with their own holds.
- **Crouch:** the crouch itself is instant, as always. Drawings 1 and 2 are the drop (2 then 3 frames), held on 2.
  After 60 frames he sets the lantern down (3 and 4), then tends it: 5, 6, 7, 6 at 14, 10, 16, 10, looping.
  Standing up from there plays drawings 9 and 10, 2 frames each. Any crouching attack or block cuts straight in.
- **Blocks:** the pushed-back drawing shows for the whole blockstun. The guard drawing shows while he holds back and
  the opponent is attacking within 450 px (drawing only: it changes nothing in the rules).
- **The lantern's moon** is drawn over the lantern in every drawing: dark at 0 bars, crescent, half, gibbous, full
  at 4. The tool that cuts the sheets finds the lantern in every drawing and writes its position into the file.
- **The lantern flare** is pinned to the lantern from Rising Moon's fourth drawing on.

## Which art file went where

`scripts/avner-prep.mjs` turns the drawn sheets into game sheets. Run `node scripts/avner-prep.mjs` after changing
a drawing (or `--only 5H,jump` for some). For every sheet it writes a contact sheet and a GIF into
`data/characters/avner/previews/` (red line = the ground or the anchor). Look there first.

| Drawn sheet | Game sheets made from it |
| --- | --- |
| `Avner_Absolve_Recovery.png` | `absolve` (drawings 1, 2, 3, 4, 5); `absolve-recovery` (drawings 6, 7, 8) |
| `Avner_Air_HeavyPunch.png` | `jH` (drawings 1, 2, 3, 4, 5, 6, 7) |
| `Avner_Air_LightPunch.png` | `jL` (drawings 1, 2, 3, 4, 5) |
| `Avner_Air_MediumPunch.png` | `jM` (drawings 1, 2, 3, 4, 5, 6) |
| `Avner_Air_S.png` | `jS` (drawings 1, 2, 3, 4, 5, 6, 7) |
| `Avner_Back_AirDash.png` | `airdash-back` (drawings 1, 2, 3, 4) |
| `Avner_Back_Dash.png` | `backdash` (drawings 1, 2, 3); `backdash-stop` (drawings 4, 5) |
| `Avner_Back_HeavyPunch.png` | `4H` (drawings 1, 2, 3, 4, 5, 6, 7) |
| `Avner_Back_Walk.png` | `walk-back` (drawings 1, 2, 3, 4, 5, 6) |
| `Avner_Blocks_And_Pushback.png` | `block-stand` (drawings 1, 2); `block-crouch` (drawings 3, 4); `block-air` (drawings 5, 6) |
| `Avner_Crouch.png` | `crouch` (drawings 1, 2, 3, 4, 5, 6, 7, 8, 9, 10) |
| `Avner_Crouching_MediumPunch.png` | `2M` (drawings 1, 2, 3, 4, 5, 6) |
| `Avner_Crumple.png` | `crumple` (drawings 1, 2, 3, 4, 5, 6) |
| `Avner_Forward_AirDash.png` | `airdash` (drawings 1, 2, 3, 4) |
| `Avner_Forward_Dash.png` | `dash` (drawings 1, 2, 3, 4); `dash-stop` (drawings 5, 6) |
| `Avner_Forward_Walk.png` | `walk` (drawings 1, 2, 3, 4, 5, 6) |
| `Avner_HeavyPunch.png` | `5H` (drawings 1, 2, 3, 4, 5, 6, 7) |
| `Avner_Idle.png` | `idle` (drawings 1, 2, 3, 4, 5, 6) |
| `Avner_Jump.png` | `jumpsquat` (drawings 1); `jump` (drawings 2, 3, 4, 5, 6); `land` (drawings 7, 8) |
| `Avner_LightPunch.png` | `5L` (drawings 1, 2, 3, 4, 5) |
| `Avner_MediumPunch.png` | `5M` (drawings 1, 2, 3, 4, 5, 6) |
| `Avner_SLauncher.png` | `5S` (drawings 1, 2, 3, 4, 5, 6, 7) |
| `Avner_SpecialMove_LunarHalo.png` | `lunar-halo` (drawings 1, 2, 3, 4, 5, 6, 7) |
| `Avner_SpecialMove_LunarHalo_Effect1.png` | `halo-burst` |
| `Avner_SpecialMove_Moonlit.png` | `moonlit-5` (drawings 1, 2, 3, 4); `moonlit-6` (drawings 5, 6, 7, 8); `moonlit-2` (drawings 9, 10, 11, 12); `moonlit-j` (drawings 13, 14, 15, 16) |
| `Avner_SpecialMove_Moonlit_Effect.png` | `crescent` |
| `Avner_SpecialMove_Moonlit_Snap.png` | `moon-snap` (drawings 1, 2, 3, 4, 5, 6) |
| `Avner_SpecialMove_Moonlit_Snap_Effect.png` | `moonbeam` |
| `Avner_SpecialMove_RisingMoon.png` | `rising-moon` (drawings 1, 2, 3, 4, 5, 6, 7) |
| `Avner_SpecialMove_RisingMoon_Projectile.png` | `moon` |
| `Avner_SpecialMove_RisingMoon_Projectile_Effect1.png` | `lantern-flare` |
| `Avner_SpecialMove_Tide.png` | `tide` (drawings 1, 2, 3, 4, 5, 6, 7, 8) |
| `Avner_SpecialMove_Tide_Effect1.png` | `tide-wave` |
| `Avner_SuperMove_NewMoon.png` | `new-moon` (drawings 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15) |
| `Avner_SuperMove_NewMoon_Effect.png` | `eclipse`; `moon-slash` |
| `Avner_Vow_And_Absorb.png` | `vow-start` (drawings 1, 2); `vow-hold` (drawings 2, 3, 4, 5); `vow-absorb` (drawings 6, 7, 8, 9) |
| `Avner_Vow_Quick_Strike_Full.png` | `vow-quick` (drawings 1, 2, 3, 4, 5); `vow-strike` (drawings 6, 7, 8, 9, 10); `vow-full` (drawings 11, 12, 13, 14, 15) |

`Avner_BaseSprite.png` is the reference drawing; it is not used in the game.

The two hit-reaction sheets arrived while this was being built and are in: `Avner_HitReaction_Standing_And_Crouching.png`
→ `hit-stand` (drawings 1, 2), `hit-crouch` (5, 6); `Avner_HitReaction_Air_And_Wakeup.png` → `hit-air` (1, 2), `tumble`
(3, 4, 5), `knockdown` (6, 7; the KO pose is drawing 7), `wakeup` (8, 9, 10). Being held in a throw shows the standing
hit. Drawings 3, 4 (a gut hit) and 7, 8 (a heavy hit) of the standing sheet are cut (`hit-stand-gut`,
`hit-stand-heavy`) but not used: the engine has one standing reaction for every strength, as with Malik.

## Still on placeholders

Every one has `placeholder` in its file name (`data/characters/avner/sheets/`).

| Slot | What stands in |
| --- | --- |
| 2L (low lantern jab) | A copy of the 2M drawings |
| Forward throw, back throw | Copies of 5M and of the 2R cast |
| Recall (the crescent returning) | A copy of the 2R cast |
| Full Moon: his animation, the giant moon, the column | Copies of the Rising Moon body, the eclipse moon and the Snap beam (double size) |
| The lantern's moon phases | Five discs drawn by code (`scripts/make-lantern-phases.mjs`) |
| Pulled in by a Draw | A copy of the standing hit |
| Absolve in the air, its recovery in the air | Copies of the ground drawings |
| Repel, Draw | Copies of the standing block |

No art and nothing standing in (the move works, nothing extra is drawn): the crescent arcs for 5H, 4H, 5S, 2H,
j.H and j.S; the lantern flash on 2L; ground bounce and tech roll drawings of his own; New Moon's silver streaks
(the eclipse and the slash burst you drew are used). The 22 special is not built: it is not decided.

## What I decided, and why

1. **The frame data wins over the holds.** A move lasts startup - 1 + active + recovery frames in this engine
   (startup counts the first active frame). Where the holds you gave add up to something else, I kept every hold
   from the start, so the hit lands on the drawing you meant, and let the last drawing take the difference:
   5M last drawing 7 → 6, 5H 8 → 13, 5S 6 → 5, j.M 14 → 13, j.S 10 → 22 (he lands before that). Tell me if you
   would rather change the recovery numbers instead.
2. **Lunar Halo's last two drawings are held 14 and 11 frames, not 8 and 6.** That is what makes it about -25 on
   block with normal blockstun. With your holds it would be about -8.
3. **Rising Moon is not a hit by Avner; the moon is its own object** in the game (position, hitbox, lifetime), like
   Malik's orbs, so it rolls back and syncs like everything else. The engine learned, for any character: a
   projectile can be placed at a distance or under the opponent by the move that calls it, can have its hitbox
   live only for part of its life (and a different size per part), can stay after hitting, can be a light on the
   ground that changes gravity and marks, and can send its owner into a follow-up when it hits (Tide's pull).
4. **The moon is blocked by holding away from Avner**, also when the EX one rises behind the opponent.
5. **Tide's body sheet has 8 drawings, not 7,** so the holds are 2, 4, 4, 6, 3, 3, 4, 6. On a catch he jumps to the
   grip and pull drawings. The pull is one hit (300 damage) that leaves him roughly 20 frames ahead: generous on
   purpose, tune it down.
6. **The Snap can be blocked** if the opponent is free and blocking (it only comes out against a marked opponent,
   who is usually still in hitstun). **R on the ground only** for Snap and Recall: in the air R does nothing while
   the crescent is out. Say if you want an air Snap.
7. **A blocked hit does not mark.** "Any hit he lands" read as hits that connect.
8. **The mark belongs to the crescent:** when the crescent ends, the mark goes too.
9. **Super inputs** are my choice: 236236 + S and 214214 + S.
10. **Jump squat stays 3 frames** (the engine-wide number). Your "drawing 1: 4 frames" would make his jump a frame
    slower than Malik's; it is one number (`prejump`) if you want it.
11. **Body size.** Every sheet is cut so that he stands 186 px tall, the same as Malik. The sheets were drawn at very
    different sizes, so each one is sized from a drawing whose height is known (a standing one) or from the lantern.
    Moonlit, Vow, Absolve and Crumple are sized by eye: check them next to his idle.
12. **Cell size is per sheet, not one size for the whole character.** Every frame of one sheet has the same cell.
    One cell for all 60 sheets would have made every sheet as big as the widest swing and cost several times the
    memory for no visible difference, because every sheet carries its own ground point.
13. **`Avner_Crouch.png` was not a processed 560 × 760 strip.** The file in the folder is a raw 2048 × 2048 sheet on
    magenta, so it went through the same tool as the rest.
14. **The New Moon sheet** has 15 drawings and two rows; the numbers written under them were cropped out and the
    top row is used.
15. **One existing test was changed, not weakened:** "no real move is an EX by accident" now skips the EX versions a
    move makes on purpose (Avner is the first cast character with EX moves). It still checks every other special.
    The editor test that needs a hand-written cancel window (Lightstep) reads the archived Avner.
16. **This task edited code without stopping to ask**, on its own branch, because your message was the instruction.
    Nothing is merged into `main`.

## Added after your first look (same day)

- **Tide and Rising Moon cancel into Moonlit.** From the frame after the wave or the moon is released (Tide frame 8;
  Rising Moon frame 11 / 15 / 19; their EX versions too) until the move ends, R, 6R and 2R place the crescent. If a
  crescent is already out, R is the Snap or the Recall as usual. It works whether anything hit or not. A Tide catch
  (the pull) is not cancellable. These windows are written by hand in his file; the CANCELS page does not show them.
- **"Hits airborne" is a switch on the HIT SETTINGS page** (under the hit settings, for any move or projectile). To
  make Tide catch jumpers: open `proj:tideL` (and M, H), set it to yes, and make the wave's box taller in the box
  editor: it is 70 px tall, so it only reaches someone very low.
- Your editor tuning since the first commit is committed with this (hitboxes, hitstop, 5M jump cancel, 5H air hit,
  the Crescent Kick's box brought back to the drawing). The test no longer pins the Crescent Kick's reach.

- **5H has an extra slash drawing for the hit** (your sheet `Avner_HeavyPunch_SecondRowFourthFrameOnlyAfterFourthFrameOfFirstRow.png`).
  Only the second row's fourth drawing is used. It comes after the first row's fourth drawing and sits on the frame the
  hit lands (frame 14), so it is the drawing held through hitstop. On a miss it shows for that one frame. The first
  row's fourth drawing moved one frame earlier; startup, active and recovery are unchanged. Its arc is drawn apart
  from the body on the sheet, so the sheet tool joins the two (`join` in `scripts/avner-prep.mjs`).
- **2H has its art** (`Avner_Crouching_HeavyPunch_Slide.png`, five drawings, held 5 / 6 / 4 / 10 / 14; the slide is on
  the active frames). Its boxes were tuned on the placeholder and may want another look.

## Tests

`npm test`: 396 tests, 394 pass. The two that fail are old-kit tests (Back Heavy's reach, the Vigil crescent) that
were already failing before this task, since your tuning pass; they now run against the archive.
`npm run build` passes. `node scripts/draw-smoke.mjs` passes (the real renderer, 9000 frames, no crash).

New: `tests/lampbearer.test.js`, 16 tests. Every frame number, distance and cost in the table above that your spec
fixes is checked in the real game, plus: the old kit is gone and archived; every sheet the file names exists;
the rollback sync test over the whole kit (rewinding 8 frames every frame, 2400 frames) and two Avners fighting at
random (3000 frames) never differ.

In-game pictures: `node scripts/shots.mjs <folder> lamp` saves 51 real frames of the new kit.

## What to play-test first

1. **Rising Moon's three distances.** Does 140 / 320 / 520 cover the ranges you want, and is the 6-frame glow
   enough warning to react to at H?
2. **Lunar Halo's four versions.** L at startup 6 is very fast for a move that hits behind him. H's low-only
   hurtbox against jump-ins. EX as a reversal.
3. **Tide into a combo.** After a catch he is far ahead: is it too free?
4. **Moonlit:** juggles inside the light at 70% gravity, and Snap as a combo extender. The light is 180 px wide.
5. **5H and 4H at range.** 4H hits at 380 px with a kick drawn at 95: it will look wrong until the crescent is drawn.
6. **The look:** sizes sheet to sheet (previews folder), the code-drawn moon in the lantern (it is crude, and at
   four bars it is a bright disc over your lantern art), and the new hit reactions and get-up.
