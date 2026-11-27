// Toyle: the table of drawn sheets for the cutting tool.
//
//   node scripts/avner-prep.mjs --char toyle [--only idle] [--analyze]
//
// The owner's drawings (Nov 26) sit beside sheets/ in data/characters/toyle/ (2688 x 1520, two rows of five). Only
// the idle (on magenta) and the forward walk (see-through, with a soft glow painted round him) exist so far. He is
// drawn 205 px tall standing (owner, Nov 26: a little taller than the first 195; Avner is 190, Malik 186). No holds came with
// them. The back walk is the forward walk played the other way round until it is drawn.
// The fields are explained at the top of the table in avner-prep.mjs.
export const MEASURE = 'area';

const S = 205; // standing height in game px
export const SHEETS = [
  { name: 'idle', bb: true, scaleRef: true, stand: S, file: 'Toyle_Idle.png', n: 10, rows: 2, anchor: 'upper', holds: [6, 6, 6, 6, 6, 6, 6, 6, 6, 6] },
  { ref: [3, S - 5], bb: true, file: 'Toyle_Forward_Walk.png', n: 10, rows: 2, parts: [
    { name: 'walk', frames: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], anchor: 'upper', holds: [5, 5, 5, 5, 4, 5, 5, 5, 5, 4] },
    { name: 'walk-back', frames: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1], anchor: 'upper', holds: [4, 5, 5, 5, 5, 4, 5, 5, 5, 5] },
  ] },
];
