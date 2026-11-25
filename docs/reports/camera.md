# Fight camera and HUD framing (Nov 24, 2026)

Drawing only: no rules or core code changed. Every number is in `data/system/camera.json` (camera) and
`data/system/effects.json` `devotion` (bottom HUD).

## What changed

- **Zoom.** The fight is enlarged 1.5x while the players are within 460 px of each other, so a character stands
  about 53% of the screen height (was 35%). It widens steadily to 1.0x at 820 px, the stage's maximum distance.
  1.2x at full distance was asked for, but the stage lets players get 820 px apart and 1.2x shows only 800 px.
- **Ground line.** 89.5% down the screen at every zoom (was 87%): the zoom is anchored on it.
- **Easing.** The zoom moves 12% of the remaining change per frame. Each player always keeps at least 70 px of
  room to the screen edge.
- **Jumps.** A fighter high in the air first widens the view, so the one on the ground stays in the picture; only
  what the widest view cannot hold lifts the camera. It settles back the same way.
- **Round start.** Players start 300 px apart; at 1.5x the screen shows 640 px, so they start 47% of the screen
  apart. No change needed (and `startX` is rules data).
- **Devotion bars.** 40% smaller (scale 0.5 to 0.3), in a strip under the floor line; nothing of them, flames
  included, is drawn above the floor. Flames at 45% strength with a gentler pulse. The mechanic line (Moonmark)
  moved from above the bar to beside it.
- **Sharpness.** The game is now drawn at the real screen resolution (it was drawn at 960x540 and stretched).

## Sprites that will still be soft

At 1080p and the closest zoom a character is about 570 px tall. Every cut sheet holds it at about 380 px, so every
sprite is enlarged 1.5x there (at the widest zoom they are shown 1:1). Fixing it means re-cutting all sheets at
3 px per game px instead of 2. The source drawings mostly allow it: Avner's idle is 628 px tall, Malik's 602, the
test walk 690, the test punch 660. The test idle is only about 470 px, so it would stay soft either way.

## Speed

Headless Chrome, 1920x1080, three seconds live: 56.5 fps before and 56.5 fps after, same single start-up hitch in
both; issuing one frame's drawing takes 0.3 ms before and after. That is not the owner's real screen: watch the
fps readout in training.

## Pictures

`docs/reports/camera/*-before-after.png` (before on the left): round start, mid-range, full distance, super jump.
Retake with `node scripts/camera-shots.mjs <folder>` (dev server running).

## Not checked

Training overlays and the box editor at the new ground line; supers and full-screen effects under zoom; the move
tuner's preview (kept unzoomed).
