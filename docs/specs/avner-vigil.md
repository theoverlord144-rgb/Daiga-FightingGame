# Avner: Vigil stance and the 4H change (the owner's spec, as given on Nov 22, 2026)

Kept word for word so any session can build from it. The message was cut off at the end of the Tests list.

---

Read CLAUDE.md and the existing character and move data first. This task adds Avner's Vigil stance and changes his 4H.

## Assets already in the project
I've added sprite sheets and effect sheets for these moves (look for files named Avner_VigilStance_*, plus Avner_VigilM_Projectile.png). Find them, wire them in, and list in your report which file you used for what. Where a sheet is missing, use a placeholder (mark it `placeholder` in the file name) so every move can be played and tested now.

## The Brand (new system)
- A mark placed on the opponent by certain Vigil moves. Only one Brand at a time; placing it again refreshes it.
- Lasts 300 frames (5 s), then fades. Getting hit doesn't remove it; Anchor and Flare consume it.
- States the game needs to know: `branded` (bool) and `brandTimer`.
- Visuals: the Brand effect sheet (apply, loop, burst, fizzle) is drawn on the opponent at a body anchor point. Visuals never decide results.
- All numbers in data (duration, which moves place or consume it, the stagger lengths below).

## Vigil (22 + S): enter the stance
- Entry 20 frames, fully punishable (no armor, no invulnerability).
- Then a looping stance (24-frame animation loop): Avner stands in a low wide stance whirling the chain around himself. He can't walk or block while in it.
- The stance lasts until a follow-up is pressed, back is pressed, or 120 frames pass (then it exits by itself). Put the time limit in data.
- Follow-ups are available from the first frame of the loop.
- Getting hit in the stance ends it (normal hit reaction).
- Effect: the Vigil aura sheet plays behind Avner, centered on his feet, looping in step with the stance loop. The chain light trail sheet, if present, plays on top, frame for frame with the loop.

## Snap (Vigil + L): close low flick
- Low (must be blocked crouching). Startup 7, active 3, recovery 14. Short range (about one body length).
- Places the Brand on hit (not on block).
- If the opponent is ALREADY branded when it hits: a stagger (extra hitstun, start with +12 frames) so a combo can follow. Does not consume the Brand.
- Recovers back into the Vigil stance.

## Vigil + M: vertical light swipe (projectile)
- Avner rips the chain up in a vertical swipe; on the release frame a tall crescent of gold light spawns in front of him and flies forward.
- Body: startup 16 (the projectile spawns on frame 16), recovery 22, back into the Vigil stance.
- The projectile: hits mid (blockable high or low), one hit, low damage. Speed to start: 9 units per frame, straight forward at chest height. It disappears on hit, on block, on reaching the edge of the screen, or when it collides with an opponent's projectile (both vanish). One on screen at a time: M can't be used while it's still out.
- Places the Brand on hit (not on block). If the opponent is already branded: a stagger (start: +14 frames hitstun) so a combo can follow, from range. Does not consume the Brand.
- Hitbox: a tall thin box matching the crescent's height (about Avner's height), positioned at the crescent's leading edge. In data.
- Projectile sheet Avner_VigilM_Projectile.png: a 3×3 grid of 760 px frames on black, drawn ADDITIVE (black = invisible). Its leading edge sits at x = 670, its vertical center at y = 380 in every frame; use that point as the anchor. Frames 1-3 release (holds 2,2,3), 4-6 flight loop (3,3,3), 7-9 impact (2,3,4), played where it hit or vanished. The projectile is a core object (position, hitbox, lifetime) and runs with no screen; the sheet only draws it.

## Anchor (Vigil + H): ground chain pull
- Startup 13, active 8 (the chain racing along the ground, about three body lengths).
- Only connects with a BRANDED opponent. Against an unbranded opponent its hitbox does not hit at all (it whiffs, even if they are standing on it).
- On a branded hit: consumes the Brand, pulls the opponent toward Avner to a fixed combo distance over the catch animation, and leaves them in hitstun long enough for a follow-up (start: Avner is +20 when the pull ends). Recovery on catch 22.
- On a whiff: recovery 34 (meant to be punished). Ends in his normal standing stance.
- Two animation branches after the shared slam: catch and miss.

## Flare (Vigil + S): turn and snap, detonate the Brand
- Avner pivots, the chain wrapping round him, and snaps his fingers. Startup 11.
- Works at any distance: if the opponent is branded, on frame 11 the Brand bursts. It's a small hit (low damage) plus a stagger (start: 20 frames hitstun). It counts as a hit from Avner wherever the opponent is, consumes the Brand, and can't be blocked once it fires (the risk is the stance entry). Recovery 16, then Avner returns to the Vigil stance.
- If the opponent is NOT branded: a fizzle. Nothing happens to the opponent, Avner drops out of the stance, and recovery is 12 frames ending in his standing stance.
- Two animation branches split after the turn (drawing 3): detonate and fizzle.

## Exit (Vigil + back, or the time limit)
- 12 frames, punishable, ends in his standing stance.

## Animation holds (game frames per drawing)
- Vigil entry: 1 drawing, 20 frames. Loop: drawings 2-9, 3 each.
- Snap: 3,3,3,7,7
- M: 3,5,4,4,10,8 (projectile spawns on drawing 5)
- Anchor: shared 3,5,4,3,5; catch 8,8,6; miss 12,12,10
- Flare: 3,4,3,3,8,8 (detonate); fizzle 3,6,6 after drawing 3
- Exit: 3,3,3,3
Drawing 1 of every follow-up is the same frame as the stance loop's drawing 2, so the moves look identical until their tell. If a sheet's drawing 1 doesn't match, use the stance loop's drawing 2 in its place.

## 4H change: double the range
- Double Avner's 4H (the stepping-back side lash) reach and hitbox length, from about 190 to about 380. Keep its startup, active, recovery, damage and self-push as they are.
- A new sprite with a longer smear is coming. Keep the hitbox length in data, not tied to the art, so swapping the sprite changes nothing in the rules.

## Rules
- Everything that decides a result (Brand, stagger, pull, whiff, the projectile) lives in the deterministic core and runs with no screen. Numbers live in data, not code.
- Tests: each move's frame data; Snap and M on unbranded vs branded opponents; M's projectile hitting, being blocked, leaving the screen, clashing with another projectile, and being locked out while it's on screen; Anchor catch vs whiff on a branded vs unbranded opponent standing in its path; Flare detonate at full screen vs fizzle;
