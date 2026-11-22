# Phase 0: the foundation

## What I built
- A fresh project: Vite (the tool that serves and packages the game), plain JavaScript, Node's built-in test runner, and Git.
- `CLAUDE.md`, the brief every future session reads first: your feel targets, the folder layout, the commands, the rules, and a "how the core runs" section I'll update at the end of every phase.
- The folders: rules (`src/core`), drawing (`src/render`), menus and HUD (`src/ui`), editors (`src/tools`), netcode (`src/net`), character data (`data/characters/avner`), tests.
- A tiny maths file for the rules: 1 pixel = 100 units, so every position and speed is a whole number and the game can never drift between two machines.

## What I decided and why
- **Plain JavaScript, no frameworks.** Fewer moving parts. Rollback netcode later needs the whole game to be one simple object we can copy every frame.
- **A "purity" test.** It fails if anyone puts randomness, clocks, screen code or decimal maths into the rules folder. That's how "same inputs, same game, always" stays true. I checked it by planting `Math.random` in the rules folder: the test failed, as it should.
- **No editor export was on this PC.** The brief says Avner's sprites and moves come from the Toska editor's export. I didn't find one, so in Phase 2 I'll write Avner's starting data myself in that format. When you send the real export, it drops in.

## Tests
- 1 test (the purity check), passing. `npm run build` passes.

## What to play-test
- Nothing yet. This phase is the ground the game stands on.
