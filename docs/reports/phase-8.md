# Phase 8: meter, specials and supers

## What's new, in plain words

- **Super meter.** Three bars. You build it by hitting, by getting blocked, and a little by whiffing. Each move can
  set its own amounts, and if it doesn't, it uses the defaults for its kind (normals build less than specials). The
  player getting hit also builds meter: half the damage they take. Blocking builds nothing for the defender.
- **Specials with motions.** Quarter circles, dragon punches, half circles and so on, all from Phase 1's motion
  reader. The input history now labels each completed motion in purple (for example "236236H").
- **EX moves.** A special done with two buttons pressed together (like 236 + L + M) is the EX version. It costs half
  a bar. Without the meter you get the normal version instead, never nothing. The two buttons can be up to 3 frames
  apart, in either order. If the normal version has already started and the second button lands within those 3
  frames, the move turns into the EX and the normal version's cost is refunded. Sloppy-but-honest inputs still work.
- **Supers.** A double motion (236236, 214214) with a button, for a full bar. A super can freeze the game with a
  **super flash**: the screen goes dark, the user stays lit, the other fighter fades, and nothing moves for as many
  frames as the move says. Buttons pressed during the flash are kept, so the opponent can react the moment it ends.
  Specials cancel into supers on hit, and normals cancel into specials, as in any BlazBlue-style combo.
- **The character mechanic slot** (the "Drive button" hook). Each character can declare its own gauge and up to any
  number of small counters (for example "Charge, 0 to 3"). Moves can **build** them (on hit, on block, on whiff, or
  on any frame of the move), **need** them, **spend** them, and the character can get bonuses while a condition holds
  (for example "+10% damage at 3 Charge"). It's all in the character file; no code per character. A typo in a counter
  name is caught when the file loads, not in the middle of a match.
- **Chain moves (the hook for Avner's specials).** A move can be marked "follow-up only": it only comes out of the
  move before it, never from neutral. So "214L, then L, then L" works without taking L away from the jab. Avner's
  actual chain moves are yours to design; the hooks are ready.
- **Burst** (combo breaker), the same for every character. Press **H + S** together while being comboed with a full
  burst gauge: you're invincible, the attacker is knocked away, and the combo ends. Works in the air too (you hang in
  the air for the burst). Everything about it is in `data/system/burst.json`: the buttons, the gauge size, whether it
  refills over time or from damage, where it's allowed, and the burst move itself. It can be switched off entirely.
  Right now the gauge starts full and doesn't refill (one burst per match): a sensible start you'll want to tune.
- **HUD.** Under each health bar: the burst gauge (light blue, "BURST" when ready), the super meter (a bar with the
  number of full bars beside it), and the character's mechanic (counters as dots ●●○).
- **Training mode:** a new menu option, "Meter, burst, gauge: normal / always full". The health refill now also
  refills the burst gauge. The frame meter ignores super-flash frames (like it ignores hitstop), so the numbers stay
  true.

## Proto, the engine test character

Avner's specials are yours to design, so I didn't invent any for him. To test every system I made **Proto (engine
test)**, a plain placeholder who is **not part of the game's cast**: `data/characters/proto/proto.toska.json`. He has:

| Input | Move | What it shows |
| --- | --- | --- |
| 236 + L / M / H | Rush | Specials, three strengths |
| 236 + L+M | Rush (EX) | EX: half a bar, two hits, strike-invincible start |
| 623 + H | Rising Strike | Invincible reversal |
| 214 + L, then L, then L | Chain 1 → 2 → 3 | Follow-up-only moves |
| 22 + S | Charge Up | Builds the mechanic counter (max 3) |
| 236 + S | Charged Rush | Needs and spends one Charge; wall bounce |
| 236236 + H | Overdrive | Super: one bar, super flash, invincible, four hits |

At 3 Charge Proto does 10% more damage. Copy any pattern you like into Avner's file.

## Decisions I made (change any of them)

1. **Meter numbers:** normals build 3% of a bar on hit, 1.5% on block, 0.6% on whiff; specials 5% / 2.5% / 1.2%; supers
   and bursts build nothing. EX costs half a bar, a super costs one. All in `data/system/meter.json`.
2. **Chord window: 3 frames** (`data/system/input.json`, `chordWindow`).
3. **Double motions count as supers** automatically, unless the move says otherwise.
4. **Burst on H + S**, from hitstun, crouching hitstun, air hitstun and tumble only (not blockstun, not knockdown).
   A burst pressed during hitstop comes out the moment the hitstop ends.
5. **The game freezes for super flash** for both players (the brief's "freezes for a moment"); during it, nothing
   ticks, including combo time.
6. **A move that is cancelled doesn't pay whiff meter** for the move it left; only moves that end without contact do.
7. **The HUD only draws what the game state says** (rule 3). The dim, the sparks and the bars decide nothing.

## Fixes along the way

- The frame meter measured throws one frame short (a throw that grabs leaves its move on its active frame). Fixed,
  with a test.
- Long motion labels in the input history spilled onto the health bar's name. They're now kept inside the panel.
- One replay test changed a single input as its "tampering", and after this phase's changes that particular input
  happened not to change the fight (it pressed a button during a stun). The test now replaces a full second of
  Player 1's input with walking backwards, which always changes the game. It still demands the tampering is caught
  within 300 frames, so it's no weaker.

## Tests

**134 tests, all passing** (118 before). New, in `tests/meter.test.js`:

- Meter builds on hit, block and whiff by the data's amounts; the defender builds from damage; a move's own amounts
  override; meter never passes the maximum.
- EX costs half a bar and falls back to the normal version without meter.
- Chords work 0, 1, 2 and 3 frames apart in either order, and not at 4.
- The super flash freezes everything (the game state is identical before and after it), and a button pressed during
  it comes out on the first frame after.
- Normal → special → super cancels.
- Chain moves come out only in order, only on hit or block, never from neutral.
- The mechanic: building, spending, requirements, the 3-Charge damage bonus, a gauge with per-frame ticks, on-hit
  effects, and errors for undeclared counter names.
- Burst: breaks a combo and knocks the attacker away, beats the attacker's next hit, doesn't happen without a full
  gauge / outside a combo / with the wrong buttons, works in the air, and can be switched off by data.
- **Rollback safety:** 6000 frames of random specials, EX, supers, chains, Charge and bursts, rewound 8 frames and
  replayed every frame: identical every time.

`npm run build` passes.

## Performance

`npm run bench` on this machine:

| Measure | Time | Budget |
| --- | --- | --- |
| One game frame (Avner vs Avner) | 2.03 µs | 16,700 µs per frame |
| One game frame, Proto doing supers, EX and bursts nonstop | 2.01 µs | |
| Copying the game state (rollback) | 18.7 µs | |
| Rollback worst case (8 frames rewound) | 0.18 ms | 16.7 ms |
| Training frame (game + dummy + frame meter) | 3.03 µs | |

Meter, supers and bursts cost nothing measurable. In the browser the frame-time readout stays around 0.1 ms per
game step with the HUD, effects, the frame meter and the input history all on.

## What to try first

Open the game with Proto on both sides: `http://localhost:5300/?p1=proto&p2=proto` (keys: WASD to move, J = L,
K = M, L = H, I = S; F2 for the training menu).

1. Training menu → **Meter: always full**. Do **236236 + H** (two quarter circles forward + H). Watch the super flash.
   Is 30 frames of freeze the right length? Does the dim read well?
2. **5M → 236L → 236236H** as a combo. Is the cancel into the super easy enough?
3. **236 + L+M** versus **236 + L**. Press the two buttons slightly apart: does EX come out when you mean it to?
4. **214L, L, L** on the dummy, then try it whiffing: the follow-ups should refuse.
5. **22S** three times and watch the Charge dots fill, then **236S** to spend one.
6. **Burst:** the dummy (Player 2) can't burst on its own yet, so try it with a gamepad as Player 2, or two browser
   tabs in netplay (`?mode=netplay&side=1&p1=proto&p2=proto` and the same with `side=2`). Get comboed and press
   H + S together.

Things I'd like your call on: the meter-gain numbers, whether burst should refill over time or from damage taken,
and the 3-frame chord window.
