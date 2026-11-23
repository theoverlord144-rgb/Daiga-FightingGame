# Reverse beat

Built Nov 23, 2026, the way we agreed: free-order chains, each normal once per string, lights twice, launchers
one-way.

## What changed in play

- **Normals chain in any order.** 5H into 5M into 5L now works, on hit and on block, on the ground and in the air.
- **Each normal comes out once in a string. Lights come out twice.** A string is normals cancelled one into the
  next. Press a normal you have already used and nothing comes out; the move you are in just recovers.
- **A new string starts** the moment you do anything that isn't a normal cancelled from a normal: recover and
  press again, cancel into a special, jump, dash.
- **Enders stay one-way.** You can chain into these, never out of them into another normal:
  - Malik: 2H (sweep), Back Heavy, 5S (launcher), j.S (ground bounce).
  - Avner: 2H (sweep), 3H, 5S (launcher), j.S (ground bounce).

So the longest ground string for Malik is seven normals: 5L twice, 2L twice, 5M, 2M, 5H in any order, then an
ender or a special.

## What to play-test

- **Pressure on block.** A blocked 5H can now be cancelled into 5L, which recovers far sooner. Heavies are much
  safer than yesterday. If it feels oppressive, the fixes are more pushback on block for lights, or lights once
  instead of twice.
- **Combo length.** Seven normals before a launcher is a lot of free damage. The combo proration still applies
  to every hit, but check what a full string into launcher into air string does.
- **Malik's Back Heavy.** In your working copy it is a soft launcher (your edit), so I treated it as an ender.
  On Avner it is a plain normal, so it chains freely there.

## Where to tune it

- `data/system/combo.json`, `chainUses`: `{ "default": 1, "L": 2 }`. The numbers are how many times; `L` is the
  light button. Take the line out and there is no limit.
- The routes themselves are on the editor's **CANCELS** page. Every reverse route is a gold square you can click
  off. The page's top line states the limit.

## Things I decided

- **The count is per move, not per button.** 5L and 2L are different moves, so each gets its two uses.
- **A special resets the string.** 5M, special, then 5M again is allowed if the special lets you act in time.
- **Three older tests repeat one jab on purpose** to test other rules (the once-per-combo cap, combo decay,
  Perfect Link's limit). Their checks are unchanged; I switched the new limit off inside those three so the jab
  can still repeat there.
- **Your uncommitted edits were not committed.** Both character files had tuning of yours in them. I committed
  only the chain tables; your hitbox, damage and launch edits are still in your working copy, still uncommitted.

## Tests

`tests/reverse-beat.test.js`, 9 tests: strong into weak in any order; a repeat is refused on hit and on block;
lights twice and not three times; mashing every button runs out after four moves (and never does with the limit
off); a new string after recovering and after a special; specials are never refused; the switch; and the count
survives rollback.
