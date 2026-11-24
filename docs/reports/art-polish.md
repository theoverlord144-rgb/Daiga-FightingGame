# Art polish: impact, snap timing, best-frame assembly (Nov 23, 2026)

Everything here only changes the picture. The rules never read any of it, and a recorded match plays out identically
with every switch on, every switch off, and with no drawing at all.

## What was built

| Thing | How to use it |
| --- | --- |
| Polish panel | Training mode, press **P**. A live switch for every item, plus All on / All off (baseline look) / Defaults. |
| The switches and their numbers | `data/system/polish.json` |
| Snap timing and drawing roles | `data/snap/avner.json`, `data/snap/malik.json`. Rebuild: `node scripts/snap-timing.mjs`. Add `"hand": true` to an entry to keep your own edit. |
| Side-by-side timing GIFs | `node scripts/snap-gifs.mjs` → `data/characters/<name>/previews/snap/` (left original, right snap) |
| Best-frame assembly | `node scripts/sprite-assemble.mjs <character> --versions <move> <sheet> <sheet> ...` makes a numbered contact sheet; write the picks into `data/assembly/<character>_<move>.json`; `node scripts/sprite-assemble.mjs <character> <move>` builds the sheet and a GIF. |
| Baseline and checks | `node scripts/baseline.mjs --check` (recorded match + every move's frame data), `node scripts/baseline-screen.mjs docs/baseline --label <name> --polish off\|on\|<item>` (real-screen pictures and frame time; needs the dev server). Baseline lives in `docs/baseline/`. |

Engine polish (on by default except ribbons and the impact frame, which Jay switched off on Nov 24 as too jarring): impact frame on big hits (2 frames, black fighters on an inverted
grey stage), hit flash toward white (stronger on heavies), squash and stretch from the feet (landing, takeoff, heavy
hit push), soft shadow that shrinks and fades in the air, rim light in the stage's light colour (Dusk Terrace: warm
orange from the right), victim shake in hitstop. Ribbons are built and off; no anchor points are marked.

Snap: each drawing is tagged anticipation / smear / impact / followthrough / recovery. The smear gets 1 frame, the
wind-up before it gets the frames the smear gave up, the first recovery drawing gets 2 to 4 frames and the last one
the rest. Frames only move inside startup, active and recovery. Overshoot (a 2 to 6 px push and slight stretch when
the impact drawing ends), attacker hit-freeze, and a 3 px lean back before the smear are drawn by the game.
59 moves are re-timed (30 Avner, 29 Malik).

## Parked: the sprite cleanup pass

Jay's call, Nov 23: it made the sprites look worse. The art is painted with soft shading, and snapping it to a small
fixed palette flattens it and costs detail. The tool (`scripts/sprite-clean.mjs`) and the palette files
(`data/palettes/`) remain, the switch is off, the cleaned sheets were deleted, and no original was ever modified.
Head-size matching was never reliable either (hair colours show up in boots and shadows). Best-frame assembly
therefore does no cleanup: it cuts and aligns only.

## Regressions and what was done

- **Cleanup pass: worse than the originals.** Switched off and parked (above).
- **Snap would have put three timed events on the wrong drawing** (Rising Moon H, Moon Snap, Lariat L: the frame
  something leaves the hand or he starts to move). Fixed: where a timed event would land on a different drawing,
  that part of the move keeps its original holds.
- **Game results:** identical on all 3,000 recorded frames; every move's startup, active, recovery, hit frames and
  boxes unchanged. Polish-off screenshots match the baseline pixel for pixel.
- **Not regressions, but look at these first:** with snap on, the last recovery drawing is held much longer on
  Lunar Halo (21 frames, was 11), 2H, Back Heavy, Rising Moon, New Moon; Malik's lariats (20, was 12), Spirit Orb,
  Pillar, 2H. That is the rule as written ("fast settle"), but it can read as standing frozen.
- **Assembly cannot cut raw drawn sheets** (drawings are off-grid). It takes game-ready strips; new versions go
  through the usual prep first.

## Performance (headless Chrome, a yardstick only)

Same run: all off 6.98 ms average / 11.5 ms worst 5%; all on 7.43 / 10.7. So about **+0.45 ms a frame for
everything together**; budget is 16.7 ms. Single items measured later on a busier machine (off = 8.76 that session):
impact frame 8.71, hit flash 8.75, squash 8.78, shadow 8.64: all inside the noise. Rim light, hitstop shake, snap,
overshoot, hit-freeze and lean were **not measured one by one** (the machine ran low on memory and the run was
stopped); they are part of the all-on number. The one frame over budget (about 19 ms) is in the baseline too.

## Not verified

- Seen as still pictures only: impact frame, shadow, rim light, cleaned-off idle. Nothing was watched in motion:
  squash, shake, overshoot, lean and the snap feel need Jay's eyes in training mode.
- Ribbons have never been drawn (no anchors). Every body drawing with a scarf end, coat tail or sash would need one
  or two points; start with idle, walk, dash, jump and fall.

## Tags worth a second look

No smear found (no short drawing right before the hit): Avner 5M, 2H, j.M, Lunar Halo; Malik Back Heavy, j.H, 5S,
Spirit Orb, Pillar, Lariat H, 2L. Moves with no hitbox of their own (Rising Moon, Tide, Moonlit, Malik's Rite moves,
install, Vow start) use the release frame as the hit. Throws and the guardian normals are left untouched. Air
Crescent is not timed by plain holds and was left alone. The full list is the `unsure` field in the snap files.
