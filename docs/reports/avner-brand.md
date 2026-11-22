# Avner: Brand of Light, and his first sprite

## What's new, in plain words

**Avner's light punch has real art.** Your six drawings play in the order you asked for (1, 4, 3, 5, 2, 6). The
fully extended fist (your drawing 4) is on screen on exactly the two frames the punch can hit. The magenta
background is gone with clean edges, every frame stands on the same floor line, and his front foot stays planted
so he doesn't jitter. Only the light punch has art; everything else still draws the placeholder figure, so he
switches between the two for now.

**Brand of Light**, his mechanic:

- **Lumen Hook** (236 + L, M or H): he throws the chain out as a line of light. L is the quickest with the
  shortest reach (210 px), H the slowest with the longest (290 px; his 5H reaches 130). **On hit it brands the
  opponent for 5 seconds:** a pulsing ring of light around their waist, and "Brand 4.8s" counting down in his HUD
  line. A whiff or a block brands nothing.
- **While the brand is on, two moves unlock:**
  - **Reel** (214H): the chain drags the opponent from anywhere on screen to right in front of him. On hit he's
    **+10**, enough to link a normal and keep going. Works on airborne opponents too. Blocked, it's an ordinary
    blocked hit.
  - **Lightstep** (214L): he pulls himself to the opponent and arrives just in front of them, then can attack out
    of it. A chase and mix-up tool.
  - Both use the brand up. Without a brand, those inputs do nothing special.
- **Hook combos into Reel or Lightstep** (on hit only). Hook can't cancel into another Hook, and Reel works once
  per combo, so there's no infinite loop.

## Numbers to tune first (all in `data/characters/avner/avner.toska.json`)

| Move | Startup | Active | Recovery | Damage | Reach | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Lumen Hook L | 13 | 3 | 18 | 700 | 210 px | brands for 300 frames |
| Lumen Hook M | 15 | 3 | 20 | 750 | 250 px | |
| Lumen Hook H | 18 | 4 | 23 | 800 | 290 px | about −2 on hit by itself |
| Reel | 9 | 3 | 22 | 600 | 360 px | pulls to 70 px over 10 frames; +10 on hit |
| Lightstep | 22 total | — | — | — | — | arrives 70 px away; attacks from frame 12 |

## Decisions I made (change any of them)

1. **The brand lives on Avner** (a 5-second countdown in his mechanic), and it means "my opponent is branded".
   Same effect, simpler and safer for rollback.
2. **The brand only lands on hit.** On block it would be very strong with this much range. Easy to change.
3. **Re-hitting with Hook refreshes the brand** to a full 5 seconds; it doesn't stack.
4. **Lightstep has no invincibility.** You can hit him out of it. That's the honest version; Yahushua may want a few
   frames.
5. **The chain's reach is "disjointed":** his hurtbox doesn't stretch along the chain, so you can't hit the chain.
   That's how chain and sword characters usually work, but at 290 px it's strong. If it feels oppressive, the fix
   is a small hurtbox along the chain during the active frames.
6. **Pull-in, move-to-opponent and once-per-combo are general engine features**, not Avner code. Any character can
   use them from its file. Documented in `docs/toska-format.md`.
7. **Tests no longer use Avner's numbers.** Everything that depended on exact frame data (reach, startup, combo
   routes) now uses a frozen copy of Avner as he was (`tests/fixtures/fighter.toska.json`). The tests check exactly
   what they checked before; Avner himself is now free to be retuned.
8. **A sprite-prep tool** (`scripts/sprite-prep.mjs`) does the art processing: background removal, splitting
   touching drawings, your frame order, floor line, scaling. The next move's art goes through the same command.
   Your original drawing stays where you put it and isn't shipped with the game; only the cut-down sheet is
   (584 KB instead of 3.5 MB).

## Two things to know about the art

- **Frame order.** I used your order: 1, 4, 3, 5, 2, 6. Your drawing 2 (his back turned, scarf out) now plays
  near the end, in recovery. In the strip, 1 → 2 → 3 → 4 read like wind-up → swing → hit, so please look at it
  slowed down (` key) and confirm that's what you want. Changing the order is one number in a command.
- **Colour swaps don't work on painted art.** The engine's colour swaps replace a fixed set of base colours,
  pixel for pixel. That works for sprites drawn with a limited palette, but this art has thousands of shades
  (soft shading, gradients), so the alternate colours leave it unchanged. In a mirror match both Avners' punch
  looks the same. This is an art-pipeline decision for Yahushua: draw sprites in a fixed palette (classic
  fighting-game style, swaps stay exact), or keep painted art and we build colour swaps by hue shift (less
  precise, works on any art).

## Tests

**170 tests, all passing** (159 before). New in `tests/brand.test.js` (11):

- Pull-in ends the defender exactly 70 px in front from 150, 250 or 380 px away; works in the air; doesn't pull
  on block.
- Move-to-opponent arrives 80 px away from either side, and doesn't move a fighter who is already closer.
- Once-per-combo: without the limit a move chains into itself three times; with it, once; after the combo it
  works again.
- Avner: each Hook brands on hit, not on whiff or block; the brand counts down one frame at a time and is gone
  after 5 seconds; Reel and Lightstep only come out while branded and both use the brand up; Lightstep arrives in
  front from 500 px away; Hook → Reel is one combo with the opponent pulled in; a second Reel in the same combo is
  refused.
- A sync test (rewinding 8 frames every frame) through Hook, Reel, Lightstep and the brand timer: no desync.

Browser-checked: Hook H from range brands (ring and HUD timer), then Reel drags the opponent in at +10 on hit.

## Performance

`npm run bench`: one game frame 2.23 µs (Phase 9: 2.02), rollback worst case 0.18 ms of a 16.7 ms frame. Drawing
with the sprite, the brand ring and the training overlay: about 1.3 ms a frame in the headless browser.

## What to try first

Training, Avner vs Avner (from the menu, or `?mode=training&p1=avner&p2=avner`):

1. Press **J** (5L) slowed down (` twice) and check the frame order and the art.
2. **236 + L** (S, then S+D, then D, with J) from far away. Look for the ring.
3. Then **214 + H** (S, S+A, A, with L): he drags them in. Try a 5L or 5M right after.
4. Hook, and on hit cancel straight into **214 + L** (Lightstep).
5. Tell me: is the Hook's range too much? Is 5 seconds the right brand length? Should Lightstep have
   invincibility?
