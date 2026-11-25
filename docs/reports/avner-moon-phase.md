# Avner: the rebound move (j.2H) and Moon Phase Assault (j.236)

**Changed later the same day (owner):** the rebound move is on **j.2H** and drawn from `Avner_Air_DownMedium.png`
(a downward lantern swing). The j.2M kick on the Moonfall sheet is removed entirely; down + M is the plain air medium
again. Where this report says "Rebound Kick" or "j.2M" below, read the j.2H move: its behaviour and numbers are the
same. What differs: its hit area is under and in front of him, the rebound uses drawings 5 and 6 (6 frames each), a
miss lands in the Lantern Crash landing drawings (the sheet has no landing of its own), and the blocked landing is
9 frames so a low block is still about -4. Previews are `moon-rebound-hit`, `-block`, `-whiff`.

Nov 25, 2026. Branch `avner-moon-phase`. Nothing is committed. Rules code was not touched: both moves are built from
data. One drawing-code change was made with the owner's yes (the moon crash effect, see "Drawing code").

Previews (game speed GIF and a contact sheet each) are in `docs/reports/avner-moon-phase/`:
`moon-kick-hit`, `moon-kick-block`, `moon-kick-whiff`, `moon-part1`, `moon-part2`, `moon-full`, `moon-ex`.
The preview tool cannot show tints, so the EX effects look moon-coloured there; in the game they are gold.

## What changed in his move list

| | Before | Now |
|---|---|---|
| j.214M | Moonfall | nothing special (the plain air medium comes out) |
| j.2M | the plain air medium | **Rebound Kick** |
| j.236L / M / H | nothing (Air Crescent was cut earlier) | **Moon Phase Assault**, Part 1 |
| j.236 + attack + S | nothing | **Moon Phase Assault EX** (1 bar) |
| air chains | j.L and j.M chained into Moonfall | j.L, j.M and j.H chain into Rebound Kick |

Moonfall is fully gone: the move, its four states, its cut sheets, previews and lantern points. The raw sheet
`Avner_MoonFall.png` stays because the kick is cut from it.

## Sheets

All drawing counts match the spec: Moonfall sheet 7, Waxing Crescent 8, Half Moon 9, Full Moon 8, Moonfall Smash 7;
effects three crescents 8, half moon 7, moon crash 7.

Three things about the folder that do not match the spec:

1. The Full Moon effect sheet arrived later the same day (10 drawings, as the spec says). It is in: it starts on
   Part 3's third drawing at his chest, with the spec's holds. Its ring on frame 7 is not built (see "Not built").
2. **`Avner_Air_DownMedium.png` (6 drawings, a downward lantern swing) is in the folder and the spec never mentions
   it.** The spec says j.2M uses the Moonfall sheet, so that is what I used. The new sheet is untouched.
3. The Waxing Crescent effect is on white at half the size of the others, and it is dark swirls, not light. It is
   cleaned and cut, but it is drawn as light like the rest, so the dark parts read as a faint haze. Look at it in game.

## Hold check (spec numbers against the moves)

| Move | Holds | Adds up to | Startup / active / recovery | Match |
|---|---|---|---|---|
| j.2M | 6, 5, then 3 / 3 looping | hit drawing on frame 12 | 12 startup | yes |
| Part 1 | 7, 3, 2, 3, 2, 3, 6, 8 | 34 | 8 startup, hits on 8 / 13 / 18 (3 each), 14 recovery = 34 | yes |
| Part 2 | 7, 2, 2, 2, 3, 3, 5, 6, 6 | 36 | 8 startup, hits on 8 / 10 / 12 (2 each) and 17 (3), 17 recovery = 36 | yes |
| Part 3 | 4, 5, 3, 3, 4, 6, then held | hit drawings on frames 10 to 15 | 10 startup, 6 active | yes |
| Smash | 4, 3, 4, 3, then held; 10, 8 landing | hit drawing on frame 12 | the spec gives no startup; it falls out as 12 | nothing to compare |

No mismatches.

## What I built

**Rebound Kick.** Dives at about 50 degrees, overhead, once per jump, 600 damage, counts one juggle point.
- Hit: 12-frame rebound up and back (about 45 px up, 24 px back), then he is free in the air. A grounded opponent is
  popped up.
- Block: same rebound, but he cannot act until he lands. Measured -4.
- Whiff: lands for 12 + 6 frames, with slide dust.

**Moon Phase Assault.** He hangs dead still in each part and falls after the last one he does.
- Part 1: 3 hits of 220, each pulls them slightly toward him. -6 on block.
- Part 2: 3 hits of 160 then a 450 that nudges them away. -8 on block.
- Part 3: 850, launch (the combo's hard launch if it is left, else soft), then he falls and lands for 10. -14 on block.
- The next part only comes out from the current part's first hit to the end of its active frames, on hit or block.
  Never on whiff. Once per jump.
- EX: one input plays all three parts on hit and then the Moonfall Smash (800, ground bounce or hard knockdown).
  On block or whiff it stops after Part 1. Damage 308 x3, 224 x3 + 630, 1190, 800.

## Calls I made that you did not specify

- **The pop on a grounded opponent is not "slight".** With a slight pop, your own route (kick, rebound, j.M) cannot
  connect: he rebounds up and away while they stay low. I raised the pop until j.M reaches. If you want the small pop,
  the route has to change.
- **Each rekka part costs one juggle point, not one per hit.** At one per hit the long route hits the juggle limit
  (10) before Part 3 and the launch fizzles.
- **Almost no push on block in Parts 1 and 2**, otherwise the third hit of Part 1 whiffs on a blocking opponent.
- **Pressing the motion right after Part 1's first hit skips hits 2 and 3.** That is what your window rule says, so I
  kept it. For full damage you press during the third hit. Tell me if the window should open on the last hit instead.
- **The ring on Part 3's hit** is only on the H and EX versions. A standing test forbids rings on L and M moves and I
  did not weaken it.
- Hitboxes, blockstun numbers and the smash's rise are my first fits.

## Damage (health 10,000)

| | Damage | Health |
|---|---|---|
| Part 1 alone | 608 | 6.1% |
| Full rekka | 1,696 | 17.0% |
| Full EX | 2,786 | 27.9% |
| j.H > j.2M > rebound > j.M > j.H > full rekka | 3,384 | 33.8% |
| Same route, EX ending | 4,162 | 41.6% |

Nothing is above 50% without a super. The raw numbers add up to more (Part 1 is 660 before scaling); normal combo
scaling does the rest.

## Drawing code (owner said yes)

`src/render/fight-renderer.js`, between `GROUNDFX BEGIN` and `END`: the drawing code remembers the last move that hit
each fighter. When that fighter next touches the ground (a bounce or a knockdown), it plays the effect Avner's file
names for that move (`art.groundFx`) at that spot on the ground line, and fires the ring on the drawing the file
gives. The smash names the gold moon crash, ring on its second drawing. Nothing in the rules changed.

## The box editor

- Every hit of every new move now takes its numbers from the move's own entry, so HIT SETTINGS edits reach the game.
  To get there, Half Moon's big last hit became its own entry, **Half Moon finish (L / M / H / EX)**. It used to be
  an override the editor could not see. Timing, damage and block advantage are unchanged.
- One thing still does not follow the editor: juggle cost on the second and third hits of Part 1 and of Part 2's
  quick strikes is fixed at 0 (one point per part). Editing juggle cost changes the first hit only.
- L, M and H are separate entries, and the EX parts are separate again. An edit to one does not copy to the others.
- Your Full Moon edit (hard launch 32 forward, 3 up; air hit 22 forward, 11 down on L, M and H) is in and works.
  The EX Full Moon still launches straight up, on purpose: the Moonfall Smash has to reach them.
- I no longer rewrite his move lines from my build script; all further edits are line by line on what is there.

## Full Moon's launch (owner's edit) and why it went upward

The owner set Full Moon L / M / H to launch sideways and it still sent the opponent up in play. Cause: the launch was
typed "hard", and a combo gets one hard launch. If one was already spent (a launcher earlier in the combo), the rules
drop the move's own numbers and use the tumble's standard upward launch. Fix, in his file only: the type is now
"soft", which always uses his numbers, with juggle cost kept at 1. Measured: sideways on a standing opponent, on an
airborne one, and after a hard launch earlier in the combo. The EX Full Moon is untouched (straight up, for the smash).

## The Full Moon ring

Built with the owner's yes, in the same marked block of the drawing code: an effect whose entry has
`ring: { frame, set }` fires that shockwave set from where it started when it reaches that drawing. Full Moon's is on
its seventh drawing. The preview tool cannot show rings; check it in the game.


## Checks

- `npm test`: 462 tests, 457 pass. Four failures are the same four as before this work (Back Heavy 4H, Vigil M
  crescent, Malik j.R, Tide). The fifth is new and comes from an editor change, not from this work: 5H's reaction
  on counter hit was changed from crumple to normal, and a standing test says a counter-hit heavy crumples. No test
  was weakened.
- Tests changed for the cut: the Moonfall test in `tests/hit-states.test.js` is replaced by a Rebound Kick test and a
  Moon Phase Assault test; the cut list in `tests/lampbearer.test.js` now also names Moonfall.
- Build passes, draw check passes. The recorded baseline match was re-recorded, because new moves change what the
  random fight does.

## What to play-test

- Rebound: snappy, or does the 12 frames feel floaty?
- Does j.M after the rebound connect by feel, not just in my script?
- Rekka: fast and flashy enough? Is the hang too still?
- Is stopping after Part 1 (-6) or Part 2 (-8) a real mixup, or just unsafe?
- EX: is the finish worth a bar at 27.9% raw?
- Down + M has to be held, not tapped, when chained from another air normal.
