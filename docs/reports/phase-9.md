# Phase 9: the game around it

This is the last phase of the brief. The engine is now a game you can boot and play.

## What's new, in plain words

- **Title screen** with the stage drifting behind the logo: Versus, Versus CPU, Training, Settings.
- **Character select.** Each side moves a cursor over the cast, picks a **colour** (up/down) and confirms. In Versus
  each player picks their own; in Versus CPU and Training, Player 1 picks their fighter and then the opponent. Back
  undoes one pick at a time. Proto is marked "engine test" and sits at the end of the row.
- **Versus screen** ("AVNER vs PROTO") before every match. Skip it with any confirm.
- **Rounds.** "ROUND 1", "FIGHT!", a 99-second timer, "K.O." (or "DOUBLE K.O.", or "TIME"), then "AVNER WINS" and
  a round marker under the health bar. The knocked-out fighter is knocked off their feet and stays down. First to 2
  rounds by default. On a time-out, whoever has more of their health left wins; equal is a draw (both get the round).
  Meter carries into the next round; the burst gauge refills each round. All of it is in `data/system/match.json`,
  and rounds and timer are also in the Settings menu.
- **Pause** (Enter, or Start on a pad): Resume, Character Select, Main Menu. **Results** after the match: Rematch,
  Character Select, Main Menu. **Ctrl+S** saves a replay of the match, rounds and colours included.
- **HUD:** big health bars with a red trail showing the damage just taken (it drains when the combo ends), names,
  the timer, round markers, the burst gauge, the super meter (bottom corners, number of bars beside it), and the
  character's mechanic.
- **A stage with parallax:** Dusk Terrace, an evening sky, a low sun, two mountain lines, a row of old arches, a
  railing and a stone floor. Each layer slides at its own speed as the camera moves, so it has depth. The stage is a
  data file (`data/stages/dusk-terrace.json`); a new stage is a new file, no code.
- **Colour swaps (palettes).** Each character file lists its base colours and its alternate sets (Avner has six:
  Ember, Tide, Moss, Bone, Dusk, Ash). Sprites will be drawn in the base colours only, and each alternate swaps them
  colour for colour. Until there are sprites, the placeholder figure uses the colours, so you can see it working now.
  If both players pick the same fighter in the same colour, the second one moves to the next colour.
- **CPU opponent** for testing, three levels (Settings). It walks in, **blocks** (lows crouching, jump-ins standing,
  keeps blocking through a string), **punishes** moves that leave the opponent stuck in recovery for longer than its
  fastest suitable move takes to hit (blocked unsafe moves and whiffs at its range), **chains** into a stronger hit
  when its hit lands, **pokes** when in range, and backs off now and then. On Hard it blocks 95% of attacks and almost
  always punishes; on Easy, a quarter of the time. It presses buttons like a controller would, so it can't cheat the
  rules.
- **Settings:** rounds to win (1, 2, 3, 5), round timer (30, 60, 99, none), CPU level, a performance readout, and the
  controls screen. Saved in the browser.
- **Training** is now reached from the menu, with your chosen fighters and colours, on the new stage. Enter opens
  its menu (back to character select or the main menu); everything from Phases 6 to 8 works as before.
- **Netplay now has rounds too** (two tabs). Both tabs use the same rules file, so they always agree.

## Decisions I made (change any of them)

1. **Rounds live inside the game state**, not in the menus. A KO decides who wins, so it has to be part of what
   rollback, replays and netplay agree on. Training has no rounds and no timer (the timer shows ∞).
2. **All stages play the same.** A stage is only drawing; its size and walls come from `battle.json`. That's how
   tournament fighters keep stages fair. A stage could change this later if you want stage-specific sizes.
3. **The timer stops during a super flash**, but not during hitstop.
4. **Meter carries between rounds, burst refills every round.** Both are switches in `match.json`.
5. **Menu buttons:** L confirms (or Enter), M goes back (or Esc). Enter or a pad's Start pauses. In training, Esc
   stays the training panel's close key, so Enter opens the menu there.
6. **The CPU is for testing, not a final AI.** It reads the opponent's move the moment it starts and blocks or not
   by a dice roll for that move, so it's beatable by mix-ups only on lower levels. Easy to grow later: jump-ins,
   specials, anti-airs and throws are the obvious next steps.
7. **Placeholder art stays** (coloured figures) until real sprites arrive. A knocked-down fighter now lies on the
   floor; before this phase a knockdown was drawn standing.
8. **A console hook:** `toska.app` in the browser console. It's for my screenshot checks and for debugging (for
   example, setting health to test a KO). Nothing in the game reads it.

## Fixes along the way

- **A quick tap could be lost** on a slow machine: several game steps can run back to back between two drawn
  frames, and a key pressed and released in that gap was never seen. Every key press is now held for at least one
  game step. Found while scripting the menus.
- **Knockdowns were drawn standing** (they have no hurtbox, and the figure fell back to a standing shape).

## Tests

**159 tests, all passing** (134 before). New:

- `tests/match.test.js` (9): the intro freezes the fighters; the timer counts and stops for a super flash; a KO
  makes the loser fall and stay down, nobody can act, and the next round starts fresh (positions, health, timer;
  meter kept, burst refilled); two wins end the match; time-up by health share and the draw; double KO; no timer;
  a **sync test over whole matches** (rounds, KOs, time-ups, rewinding 8 frames every frame); a **match replay**
  rebuilt from the file alone.
- `tests/cpu.test.js` (8): walks in; blocks lows crouching and jump-ins standing; blocks an unsafe move and then
  punishes it; chains into a stronger normal; whiff-punishes; doesn't swing at things out of reach; pokes; sits
  still between rounds; the same seed gives the same match.
- `tests/game-screens.test.js` (7): the colour swap changes exactly the base colours; every character has at least
  four colour sets; a broken palette is an error when the file loads; every stage file is well formed; character
  select bumps a same-colour mirror, lets Player 1 pick both sides against the CPU with back undoing one pick, and
  goes where it should.
- `tests/rollback.test.js` (+1): **netplay with rounds** over a lossy link (10% packet loss, jitter): several
  rounds, no desync, both sides identical.

`npm run build` passes.

## Performance

`npm run bench` on this machine:

| Measure | Time | Budget |
| --- | --- | --- |
| One game frame (Avner vs Avner) | 2.02 µs | 16,700 µs |
| A full match frame, CPU vs CPU (both CPUs thinking) | 2.89 µs (CPUs: 0.45 µs) | |
| Training frame (game + dummy + frame meter) | 2.94 µs | |
| Rollback worst case (8 frames rewound) | 0.17 ms | 16.7 ms |

Drawing, measured in the browser with two characters, the stage, the HUD, effects, the training frame meter and the
input history all on: **1.2 ms per frame on average, 2.6 ms at worst**, against a 16.7 ms budget. That was in a
headless browser with software drawing, slower than a real laptop's. The readout is on screen in training (and
anywhere with Settings → Show performance) as "draw X ms (max Y)".

## What to try first

Open the game: `npm run dev`, then http://localhost:5300 (keys: WASD move, J = L, K = M, L = H, I = S; Player 2 on
the arrows and numpad 1/2/3/5; F1 to rebind or set up a pad).

1. **Versus CPU**, Avner against Avner, CPU on Normal. Try a blocked 5S or 3H: does it punish? Try whiffing 5S
   from just outside its range.
2. **Settings → CPU level: Hard** and see if it feels like a useful sparring partner or a wall.
3. Play a full match: do the round banners and the KO pacing feel right (the KO pause is 2.5 s, the intro 1.7 s)?
4. **Character select:** flip through Avner's six colours. Tell me which ones you'd keep.
5. **Training** from the menu: everything from before, now on the stage.

Things I'd like your call on: the round timings, whether meter should carry between rounds, the CPU's chances per
level, and what Avner's real colour sets should be.
