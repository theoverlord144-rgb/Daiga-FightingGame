# Drawing timing in the box editor (Nov 28)

The owner asked to set how long each drawing of a move stays on screen, to fine-tune how smooth each attack looks.

## What it does (BOXES page)

- A strip above the frame bar shows every drawing as a block with its frame count. The drawing on screen is gold.
- **Drag a gold line** between two drawings: one gets longer, its neighbour shorter, by the frames moved.
- **`-` / `=`** (or the **−1 FRAME / +1 FRAME** buttons) make the drawing on screen one frame shorter or longer;
  the next drawing gives or takes the frame (for the last drawing, the one before it).
- **Space** plays at game speed, **S** (or **½×**) at half speed. UNDO and SAVE work as for boxes.
- The line under the buttons says which drawing it is, its frames, and whether snap timing re-times the move in
  the fight.

## What it never changes

The state's length. Startup, active, recovery, hitboxes, hurtboxes, timed events and cancel windows stay where
they are: only which drawing shows on which frame moves. The test runs every retimeable state of the whole cast
(first three lines, both ways) and checks that nothing but the drawings changed.

## Where the timing is written

`src/editor/timing-model.js` (`moveChange`) tries, in order: a timeline `sprite` event starting on that frame (moved;
if the event also does other things there, only the drawing moves, as its own event at the end of the timeline);
the sprite's `holds` (the two neighbours trade); for drawings spread evenly with no holds, it writes holds. Each
try is recompiled and kept only if the drawings came out exactly as asked.

**Locked, with the reason shown:** an EX version that uses its normal version's drawings (change the normal one);
shared system states and universal moves the character has no drawings of its own for (Vow, the parry, blocks on
Toyle and Khai'ro...); projectiles (their timing is their own animation); states with one drawing.

## Snap timing

The polish switch "Snap timing" is on, and for many Avner and Malik moves the fight plays a re-timed version
(`data/snap/`) as long as the file's holds are the ones it was made from. Once a move is retimed here, the fight
plays the owner's timing exactly and snap timing leaves that move alone. The editor always shows the file's own
timing.

## Layout

The BOXES page's fighter view is 16 px shorter to fit the strip and the drawing row; HIT SETTINGS and FX keep the
full height. Checked on the real screen (headless Chrome): Avner 5H, Khai'ro 4H (timed by events), Malik HIT
SETTINGS.

Tests: `tests/timing-editor.test.js` (7). Full run 594 / 594, build and crash check pass.
