# The box editor

A screen for moving, resizing, adding and deleting hitboxes and hurtboxes with the mouse. It is on the title menu as
**BOX EDITOR**, under SETTINGS. It only appears when the game runs from the dev server (`npm run dev`), because
that is what writes your changes into the character's file.

## How to use it

- **Left:** the list of everything the character can be in. Moves first, then his own states, then the system
  ones (idle, crouch, jump, hit reactions). Click one, or use the up and down arrows.
- **Middle:** the fighter on one frame, enlarged, with his boxes. Green is hurtbox, red is hitbox. The dashed white
  and yellow boxes are the push and throw boxes; they are shown but not editable yet.
- **The coloured bar:** one cell per frame. Green is startup, red is active, blue is recovery. Click or drag along it
  to change frame. A small notch marks where the drawing changes.
- **Drag a box** to move it; **drag an edge or corner** to resize it. Click a box and use the arrow keys for one
  pixel at a time (Shift resizes, Ctrl moves 10).
- **+ HURTBOX, + HITBOX, DELETE BOX, UNDO, SAVE** are buttons under the bar. PLAY runs the animation.
- **SAVE** (or Ctrl+S) writes the file. Until then nothing outside the editor has changed. After a save, Training
  uses the new boxes straight away, with no reload.
- **Esc** goes back. With unsaved changes it warns first; Esc again leaves without saving.

## The one thing to know: where a hurtbox comes from

A hitbox belongs to its move. A hurtbox usually does not: most moves use the **shared standing (or crouching, or
in-the-air) hurtbox**, the same one idle and walking use. The editor always says which one you are looking at, in
the line next to "Hurtbox:". If it says shared, changing it changes every state that uses it.

To change it for one move only, use the buttons on that line:

- **OWN HURTBOX FOR THIS MOVE:** the move gets its own, for its whole length.
- **NEW HURTBOX FROM FRAME n ON:** the hurtbox changes on this frame and stays that way to the end (a leg that
  sticks out during the kick, for example). Go to another frame and do it again to change it back.
- **REMOVE THIS OVERRIDE:** takes it away again.

Hitboxes exist only on a move's active frames (the red cells). On other frames + HITBOX is greyed out and tells you
which frames to go to.

## Where I had to decide

- **Frame numbers start at 0,** the same as the labels in Training.
- **A hurtbox changed "from frame n on" lasts to the end of the move.** That is how the engine's timeline works; it
  has no "this frame only". To limit it, set it back at a later frame.
- **Not editable here:** push boxes, throw boxes, a projectile's hitbox (the crescent), the burst (shared by every
  character), and frames where the system says there is no hurtbox at all (lying on the floor, being thrown). They
  are drawn, dashed, so you can see them.
- **Hitboxes can't be split per frame from the editor.** In the engine, a new hitbox partway through a move counts
  as a second hit, which changes how the move plays. That stays a decision made in the data, not a drag.
- **Saving only touches the numbers you changed.** The rest of the file stays exactly as written. It refuses to
  save if the file was changed on disk while the editor was open (reload the page in that case).
- **Changing boxes can make tests fail.** Some tests check reach and what hits what. That is the test doing its
  job; tell me and I will look at which is right.

## Tests

213 tests, all passing (8 new in `tests/box-editor.test.js`). `npm run build` passes.

- For every frame of every state of both characters, the editor finds exactly the boxes the game uses.
- An edit changes the frames it should and no others.
- Overrides (whole move, from a frame, a system state) work and can be removed, leaving the file as it was.
- The shared stance box changes every state of that stance, and resets to the default.
- Saving changes only the touched lines of the file, and the file reads back as the edit.

Checked in the browser: opened a move, nudged and resized a hitbox with the keyboard, saved (one line of the file
changed, the page did not reload, the game had the new box), then with the mouse gave a move its own hurtbox,
resized and moved it, added a box, saw the unsaved warning, undid everything and went back to the menu. My test
edits were put back; Avner's file is unchanged.

## Not done

- Push and throw boxes, projectile hitboxes.
- No onion skin (seeing the previous frame faintly), no copy and paste of boxes between frames or moves.
- It shows the fighter in his first colour only.
