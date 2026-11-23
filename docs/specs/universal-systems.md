# Universal systems: the owner's spec (kept word for word)

Pasted by the owner on Nov 22, 2026 with the words "yes and this ... system mechanics". Nothing below is edited.

---

Read CLAUDE.md and the existing core, character and move data first. This task adds Toska's universal systems: the button layout, the Devotion meter with archetypes, EX moves, the combo rules, Vow, Perfect Link, Absolve, the Rite button, Repel/Draw and Witness counters. Every number below is a first guess: put each in data, never in code, so it can be tuned in the training mode.

## Rules that apply to everything
- All of this lives in the deterministic 60 Hz core (integer/fixed-point math, no floats in rules) and runs with no screen. Rollback and sync tests must still pass with every system active.
- Numbers live in data: a universal systems file (e.g. data/systems.json) plus per-character fields. Document every new field.
- Don't weaken existing tests. If a test is wrong, say so in your report and leave it failing.
- Where art doesn't exist yet, use clearly marked placeholders (`placeholder` in the file name) so every mechanic can be played and tested now.

## 1. Buttons and inputs
Five buttons: L, M, H, S, R (Rite). Rebindable like the others; gamepad defaults included.

| Input | Result |
|---|---|
| motion + attack button (L/M/H) | normal special |
| motion + attack button + S | EX special (costs 1 bar); the attack button still picks the strength version |
| S alone | launcher (5S, 2S, j.S) |
| L/M/H + S with no motion | just the attack button's normal (S ignored) |
| M + H (no motion, not blocking) | Vow |
| R + S while in hitstun | Absolve |
| two attack buttons while in blockstun | Repel (holding back) or Draw (holding forward) |
| R / 2R / 6R / j.R | the character's Rite moves |

Simultaneous presses use a small window (start: 3 frames). Inputs only count in their own situation: EX needs a motion, Absolve needs hitstun, Repel/Draw need blockstun, so nothing overlaps. Write a test for every row, including the overlaps (e.g. M+H with a motion is EX or a special, never Vow).

## 2. Devotion meter (4 bars) with Give/Take archetypes
- 1 bar = 100 Devotion, max 400. Shown with the existing Devotion meter art if present (else a placeholder bar).
- Each character has `meter: { archetype, give, take, extras }`.
- Base gains (before multipliers):
  - dealing damage on hit: 3 per 1% of the opponent's max health (× give)
  - your attack blocked: 1 per 1% of the damage it would have done (× give)
  - doing a special move: +5 (× give)
  - Perfect Link: +2 (× give)
  - taking damage: 2 per 1% of your max health lost (× take)
  - a hit absorbed by Vow: half of what taking that damage would give (× take)
  - whiffs: nothing
- Take is capped at 150 Devotion per combo received.
- Archetypes (data presets; each character picks one and may override):
  - balanced: give 1.0, take 1.0, no extras. Avner.
  - martyr: give 0.5, take 2.0; Vow absorbs at full take instead of half.
  - zealot: give 1.5, take 0.5; Perfect Link gives +5 instead of +2; Witness counters +25.
  - penitent: give 0.6, take 1.0; blocking a hit gives 1 per 1% blocked; Repel +10; a successful Draw punish refunds half its cost; Vow absorbs at full take. Malik.
  - trickster: give 1.0, take 1.0, plus variety: each move new to the current combo ×1.5 gain, a repeated move ×0.2, switching between high / low / throw / side between hits +10. Uses the same per-combo move list as the repeat penalty.
- EX moves cost 100. Supers cost 100 (level 1) or 300 (level 3). Each move's cost lives in its data.
- Tests: each source for each archetype; the take cap; spending; never above 400 or below 0.

## 3. EX moves
- Any special can have an EX version in data: `ex: { ...overrides }` laid over the normal move (more hits, invincibility, armor, a second projectile, etc.).
- Motion + attack button + S with at least 100 Devotion does the EX version of that strength; without enough meter it does the normal version.
- Tests: EX with and without meter, strength selection, overrides applied.

## 4. Combo rules
- Chains: L → M → H → S on hit or block, plus each character's own cancel routes in data. Any normal cancels into a special; specials cancel into supers (data flags).
- Hard launch: moves with `launch: "hard"` (the S launchers) launch high and allow a jump cancel on hit. One hard launch per combo.
- Soft launch: moves with `launch: "soft"` pop the opponent up a short height. The attacker can link a grounded move as they land, or jump cancel into a short air string. Soft launches can happen any number of times but each one uses a juggle limit (below).
- Bounces: one ground bounce and one wall bounce per combo (`groundBounce`, `wallBounce` flags).
- Hitstun decay: a per-combo timer; each hit's hitstun is reduced as the combo ages, and after 480 frames (8 s) the opponent can tech out no matter what (BBCF-style).
- Damage scaling: each hit in a combo scales the next; starters set the starting scale (a light starter scales hard, a counter-hit heavy barely). Values per move in data.
- Repeat penalty: a move used again in the same combo does 50% damage and 50% hitstun.
- Juggle limit: each airborne hit adds its `juggleCost` to a combo total; past the limit the opponent falls out.
- Tests: every rule, including a long combo that must end by itself.

## 5. Vow (M+H)
- Vow guard comes up in 4 frames. While in Vow the character can't block, walk or jump: only hold, release, or dash out.
- Every hit that lands on Vow is absorbed: no hitstun, a short hitstop (start: 6 frames), and its damage is added to Debt instead of taken.
- Throws, all supers and moves flagged `pierce` hit through Vow at full damage AND cash in all Debt at once.
- Release (let go, or automatically at 60 frames held). Strike by time held:
  - under 20 frames: quick strike, startup 10, knockback, no crumple
  - 20–44: strike, startup 14, crumple on hit (45 frames of stun, combo-able)
  - 45+: full strike, startup 16, crumple, unblockable
- Debt:
  - landing the strike forgives all Debt;
  - otherwise Debt drains to 0 over 180 frames (3 s);
  - getting hit while any Debt remains costs the remaining Debt plus 20% as damage, immediately.
- Meter: Vow from neutral is free; canceling a normal into Vow costs 100; dashing out of Vow costs 100.
- The strike counts as a Witness counter if the opponent was mid-string when it lands (they were in an attack's active or recovery frames within the last 20 frames).
- Debt is shown on the health bar as a red section.
- Tests: absorb, each strike level, pierce and throw, every Debt outcome, the meter costs, and Vow during rollback.

## 6. Perfect Link
- Pressing the next attack during the last 3 frames of the previous hit's hitstop is a Perfect Link. Earlier presses still execute through the normal buffer but don't count.
- Reward: that hit doesn't add to damage scaling, +2 Devotion (× give; zealot +5), and an event for a white flash and sound.
- Max 3 per combo.
- Training mode shows each press as early / PERFECT / late with the frame count.
- Tests: the window edges, the cap, buffered presses not counting.

## 7. Absolve (R+S in hitstun)
- Once per round. An icon by the health bar shows if it's available.
- Costs 200 Devotion (300 against a Witness combo). Can't be used without enough meter.
- Effect: 20 frames of invincibility, knocks the attacker back half a screen, ends the combo.
- The slate is wiped: the attacker loses all the Devotion they gained from Give during that combo.
- If the attacker is blocking when it comes out (a baited burst), the burster has 40 frames of recovery and can be punished.
- Tests: cost, Witness cost, once per round, the slate wipe, the bait.

## 8. Rite button (per character)
- Each character defines Rite moves (R, 2R, 6R, j.R) in their data and optionally a Rite gauge: `rite: { gauge: { charges, rechargeFrames } | null, moves }`. The HUD draws the gauge under the Devotion meter when present.
- Avner: R enters Vigil (it was 22+S; that input is now free). His Vigil follow-ups and Brand rules are unchanged.
- Malik (if he exists in the project; otherwise add his character data with placeholders): Guardian Palm. A gauge of 3 charges, each refilling in 240 frames. R = the spirit hand strikes straight ahead; 2R = low along the ground; 6R = rising anti-air; j.R = downward. The spirit hand is a core object with its own hitbox, drawn with the spirit hand effect sheet (additive) if present. During his install: unlimited charges.
- Tests: each Rite move, the gauge spending and refilling, Vigil on R.

## 9. Repel and Draw (two attack buttons in blockstun)
- Repel (holding back): pushes the attacker far back (start: 1/3 screen). Free. 20-frame lockout before it can be used again.
- Draw (holding forward): pulls the attacker one step toward the defender and leaves them at -4. Costs 100. A Draw that happens while no attack is being blocked does nothing and still costs.
- Penitent: Repel +10 Devotion; a punish within 30 frames after Draw refunds 50.
- Tests: distances, frame advantage, costs, lockout.

## 10. Counters and Witness
- Counter hit: hitting during an opponent's startup frames adds 20% hitstun; event for a small flash and the word COUNTER.
- Witness counter: hitting during an opponent's recovery frames, or during a whiffed special or super, gives +50% hitstun, softer scaling on the first 3 hits of the combo, a longer hitstun-decay timer for that combo (+120 frames), a 10-frame slow motion (visual only: the core runs normally), and an event for the gold flash and the word WITNESS.
- Zealot: Witness +25 Devotion.
- Absolve against a Witness combo costs 300.
- Tests: startup vs recovery vs whiffed special, all effects.

## 11. HUD and training mode
- HUD: Debt in red on the health bar; Absolve icon; Rite gauge; pop-up words PERFECT / COUNTER / WITNESS.
- Training mode readouts: Devotion gained per source this combo; Debt; hitstun decay timer; juggle total; damage scaling; Perfect Link timing; counter type. A toggle for infinite meter and for "Absolve available".

## 12. Animation slots for the new mechanics
Add animation slots for each character (placeholders until the art comes), so the art can be dropped in by name later:
- `vow_start`, `vow_hold` (loop), `vow_absorb` (played on each absorbed hit), `vow_strike_quick`, `vow_strike`, `vow_strike_full`
- `absolve` (burst), `absolve_recovery` (the baited version)
- `repel`, `draw`
- `crumple` (the reaction to Vow's crumple strike) for every character
- EX versions of specials: `<move>_ex` (falls back to the normal animation with a tint if missing)
- Rite moves: `rite_5`, `rite_2`, `rite_6`, `rite_j`
Effects slots: `vow_guard` aura, `vow_strike` flash, `absolve_burst`, `repel_wave`, `perfect_flash`, `witness_flash`, `ex_flash` (placeholders).

## Report
In plain words: what you built, what you decided and why (anything this spec didn't settle, and any conflict with existing systems), which tests ran, what to play-test first, and a list of every placeholder animation and effect slot that's waiting for art.
