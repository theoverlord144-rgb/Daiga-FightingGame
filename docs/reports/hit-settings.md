# The editor's second page: HIT SETTINGS

Built overnight, Nov 22 to 23, 2026, from your ask: edit how far an attack pushes the opponent or the attacker, and
for a launcher which direction and how hard, while watching the launch play over and over.

## The short version

The box editor has a second page now. Press **T**, or click **HIT SETTINGS** at the top right. Pick a move on the
left. The top half plays the real game: the fighter does that move against a dummy, again and again. The bottom
half is the move's numbers. Change one and the next loop shows it. **SAVE** writes it into the character's file the
same way the box page does, and Training has it straight away.

363 tests, 361 pass (the same two as before, from your Avner hitbox edits). Build passes. I checked it in a real
browser (Edge, driven by a script): clicked numbers, typed one, dragged the launch arrow, undid it, switched pages,
saved, and read the file afterwards. I have not used it by hand with a mouse for any length of time; you will find
rough edges I didn't.

## What you can edit

**On hit:** damage, the freeze on hit (hitstop), hitstun, **how far the opponent is pushed**, **how far the
attacker is pushed back**, and whether it knocks down.

**On block:** blockstun, the freeze on block, how far the opponent is pushed, the corner push (what the attacker
slides back when the opponent is against the wall), chip damage, and how it must be blocked (either way, crouching
only, standing only, cannot be).

**Launch and air:**
- **Launch: none, soft or hard.** This is where you decide a move is a soft launcher.
- **Launch forward** and **Launch up**: direction and strength. Forward can go negative, which pulls them toward
  the attacker.
- **Air hit forward / up:** how an opponent who is already in the air gets knocked. A negative "up" spikes them down.
- How long they can't air tech, and the juggle cost.

**Flight** (projectiles only): speed forward and up, how long it lasts, where it starts.

## How to use it

- Click a number, then **left / right arrows** change it (hold **Shift** for bigger steps), or **type a number and
  press Enter**. The small − and + next to each one do the same with the mouse.
- **Drag the gold arrow** on the dummy to aim a launch. Which way it points is the direction, how long it is is
  the strength. The dotted line behind the dummy is the path they actually flew.
- **Backspace** (or BACK TO DEFAULT) takes a setting out of the file again, so it goes back to its default.
- **Bold with a gold mark** means "set for this move in the file". Grey means it is the default.
- **DUMMY** (or D) switches the dummy: standing, crouching, in the air, blocking. Use "in the air" to tune the air
  hit numbers and "blocking" for the block ones.
- **DISTANCE** − / + (or the mouse wheel over the fight) moves the dummy nearer or farther.
- The line at the top of the fight says what happened in plain numbers: which frame it hit, damage, how far the
  dummy slid or how high they went and where they came down, where the attacker ended up, and who is free first
  ("+5 on hit").
- Hover a setting and the strip under the fight says what it does.

## Things I decided. Change any of them.

- **"Push attacker" is a new rule.** The engine only had "the attacker slides back when the opponent is cornered".
  You asked to push the attacker back as its own thing, so a move can now have `recoil`: the attacker slides back
  that far every time the move touches, on hit or block, launching or not. No move uses it until you set it.
- **A move that only throws a projectile shows the projectile's numbers.** Malik's Rite moves and Spirit Orb have
  no hitbox of their own; the hand or the orb does the hitting. So picking `rite_j` shows the settings of its hand
  (`palmJ`), and says so. They are the same numbers you get by picking `palmJ` in the list.
- **Plain "soft" or "hard" follows the system's launch speeds** (soft: 2 forward, 13 up; hard: 0 and 24). The moment
  you change forward or up, that move gets its own speeds written in.
- **A universal move** (Vow strikes, Absolve) can be tuned per character: the change is written into that
  character's entry. The shared version in the system files is not touched from here.
- **The dummy is a copy of the same character**, standing where the move reaches. Air moves start 110 px up.
- **The blocking dummy** is stood back in place each frame until the hit arrives, because holding back also walks
  backward and it would walk out of range.

## What is not in it

- Startup, active and recovery are on the page since Nov 23, and cancels have their own page: see
  `docs/reports/cancel-editor.md`.
- **Combo scaling, meter gain, wall and ground bounces.** All in the file, none on this page yet.
- **Shared rules** (gravity, how long pushback takes, the default launch speeds) live in `data/system`, not here.
- The two fighters in the preview are the same character, so it does not show how a move looks on Avner's body
  when Malik does it.

## One thing in your file I did not make

When I saved a test change at 07:10 on Nov 23, the save also carried a change I had not made:
`rite_j` (Malik's j.R) had been given `launch: soft, forward 13, up 24`. It was on disk or in the editor before my
change; I don't know how it got there, and you may have been trying the page yourself. I took my own test change
back out and **left that one alone, uncommitted**. Note it does nothing where it is: j.R hits with its hand, so
the launch that counts is `palmJ`'s (5 forward, 12 up). That confusion is why picking `rite_j` now shows the
hand's settings. If 13 / 24 was you, set it again on that page. If it wasn't, tell me and I'll remove it.

## Tests

`tests/move-editor.test.js`, 10 tests:
- For every move and projectile of Malik and Avner, what the page shows is what the game uses.
- A change lands on that move only; "back to default" removes it from the file; limits and steps hold.
- Launch: none, soft, hard, own direction, back to the system's; an old-style launcher stays a hard launcher.
- Projectiles, universal moves, and states that have nothing to edit.
- Saving changes only the lines that changed.
- The preview hits, blocks and whiffs as it should; more pushback, hitstun, launch or air-hit numbers change what
  it measures in the right direction.
- Recoil pushes the attacker back on hit, on block and when launching, and not on a whiff.

## Nov 25: "Appears" and the projectile timeline (owner approved)

- **Appears** (FLIGHT column of a projectile): *in front of him* or *under the opponent*. It rewrites the spawn line of every move that releases that projectile, so it is the same edit as writing `{ name, under: "opponent" }` by hand. A spawn with its own distance keeps it. Back to default = in front of him.
- **Projectile timeline** (top left of the fight, for any move that releases a projectile): the move as a bar (its own hitting frames red), each projectile from the frame it appears (gold = its hitbox is out), a white mark on the frame it reached the dummy, a blue line where the loop is now. Under it, the same in words. For a move whose own hit only lands on someone its projectile has caught (Tide), an orange line says so when the projectile does not arrive on an earlier frame.
- Display and file editing only: nothing under `src/core` changed. Tests: three new ones in `tests/move-editor.test.js`. The strip itself was not checked on screen by the AI: no script pictures the editor.
