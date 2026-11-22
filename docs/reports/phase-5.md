# Phase 5: the combo system (BBCF style)

## What I built
- **Gatling table per character.** One line per move says what it chains into. Avner's:
  - 5L and 2L chain into any light, medium, heavy, 3H or the launcher.
  - 5M goes into 2M, 5H, 2H, 3H, 5S. 2M goes into 5H, 2H, 3H, 5S.
  - 5H goes into 2H, 3H, 5S. 3H goes into 5S.
  - In the air, j.L goes into any air normal, j.M into j.H and j.S, j.H into j.S.
  - Every normal cancels into specials and supers on hit or block, unless the move opts out (the throws do).
  - j.L and j.M can jump-cancel on hit.
- **Proration, BlazBlue style:**
  - The first hit always does full damage.
  - The starter's proration then applies once (Avner's lights 80%, mediums 90%).
  - Every hit applies its combo proration (default 92%).
  - Scaling never drops below 10%.
- **Same-move penalty:** using a move again in one combo costs 20% more each time. The hits of one multi-hit move
  don't count as repeats.
- **Combo time:** a clock that starts on the first hit. As it runs, hitstun and untechable time shrink:
  - Hitstun: 90% after 2 seconds, down to 10% after 14 seconds.
  - Untechable time shrinks faster, reaching nothing.
  - So every combo ends on its own.
- **Juggle gravity:** a juggled fighter falls 4% faster per hit, up to twice as fast.
- **Air tech:** once the untechable time runs out, any button recovers, with 8 invincible frames.
- **Wall bounce and ground bounce**, each once per combo unless the move says more. Avner has:
  - 3H "Crushing Blow": blasts the opponent into the wall, and they bounce back.
  - j.S "Air Spike": spikes them into the floor, and they bounce up.
- **Launcher into air combo:** 5S sends the opponent straight up. On hit, pressing up skips the pre-jump and
  super jumps you after them, at the same speed, so the air combo connects.
- **Combo counter on screen:** hits, damage, current scaling and combo time. It stays up for a moment after the
  combo ends.

## What I decided and why
- **Gatling windows open on the first active frame and last to the end of the move**, but only once you've made
  contact. That's generous, anime-style. Any move can narrow its window.
- **A combo ends the instant the victim is free**, checked before that frame's hits. So if your link is a frame too
  late, they can block it. It won't quietly count as a combo.
- **The same-move penalty only touches damage**, not hitstun. Combo time already handles hitstun.
- **Combo time doesn't count hitstop**, so long-hitstop moves don't eat the clock.
- I tuned the launcher so you and your opponent rise together after up-forward. Straight up works too if you're
  already close.

## Tests
- 87 tests, all passing. New:
  - The exact proration maths, the same-move penalty, and the scaling floor.
  - Hitstun and untechable time at six combo times, matching the tables.
  - Combo time counting only real frames.
  - A self-chaining jab with no pushback against a cornered opponent: it runs over 20 hits deep into the decay, then
    drops by itself, and the opponent blocks the next jab.
  - A finished combo kept for display, with the next hit starting fresh.
  - Juggle gravity and its cap.
  - Air tech: refused during untech, accepted after.
  - Wall and ground bounces once per combo, and a move allowing two.
  - Gatling legality from the table, including no chains on whiff and no going backwards.
  - A full launcher sequence: 5S hits, up super jumps with no pre-jump, and air hits land in the same combo.

## What to play-test first
1. `npm run dev`, open http://localhost:5300.
2. 2L 5L 5M 5H 5S, then up-forward and j.L j.M (jump) j.L j.M j.H j.S. Watch the counter and the scaling.
3. Corner your opponent and try 5M 3H: wall bounce, then catch them with 5S.
4. j.S an airborne opponent into the floor for the ground bounce.
5. On Player 2, mash a button after a launcher: you can only tech once untech runs out.
6. Tell me how the scaling and the decay feel. Every number is in `data/system/combo.json` or the move.
