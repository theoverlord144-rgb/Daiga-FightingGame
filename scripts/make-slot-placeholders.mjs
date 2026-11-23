// Placeholder art for the universal systems' slots (docs/specs/universal-systems.md, section 12). Run from the
// project folder:  node scripts/make-slot-placeholders.mjs [character-file ...]
//
//  1. Effect slots: writes data/effects/<slot>-placeholder.png, a simple drawn-by-code ring or flash per slot
//     (four frames). data/system/effects.json "slots" describes them; real art replaces the file and its entry.
//  2. Animation slots, for each character file given (default: Avner and Malik): every slot that has no art yet
//     gets a COPY of one of the character's own sheets, saved as sheets/<slot>-placeholder.png, and an entry in the
//     character file that points at it. So every new mechanic shows the character on-model, and the word
//     "placeholder" in the file name marks what is still waiting for its own drawing. Safe to run again: a slot
//     that already has an entry with art is left alone.
import fs from 'node:fs';
import path from 'node:path';
import { encodePng } from './png.mjs';

// ---------- 1. effect slots ----------
// (The Vow guard and strike, the Absolve burst and the Repel wave have the owner's art now.)
const EFFECTS = {
  perfect_flash: { color: [255, 255, 255], core: 1 },
  witness_flash: { color: [201, 162, 255], core: 1 },
  ex_flash: { color: [255, 211, 107], core: 0 },
};
const SIZE = 128;
const FRAMES = 4;
function effectSheet({ color, core }) {
  const width = SIZE * FRAMES;
  const data = Buffer.alloc(width * SIZE * 4);
  for (let f = 0; f < FRAMES; f++) {
    const t = f / (FRAMES - 1); // 0 → 1 over the effect
    const radius = 18 + 40 * t;
    const thick = 10 - 6 * t;
    const fade = 1 - 0.7 * t;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const d = Math.hypot(x - SIZE / 2 + 0.5, y - SIZE / 2 + 0.5);
        let a = Math.max(0, 1 - Math.abs(d - radius) / thick) * fade; // the ring
        if (core) a = Math.max(a, Math.max(0, 1 - d / (26 * (1 - t) + 1)) * (1 - t)); // a bright centre that shrinks
        if (a <= 0) continue;
        const i = (y * width + f * SIZE + x) * 4;
        data[i] = color[0]; data[i + 1] = color[1]; data[i + 2] = color[2];
        data[i + 3] = Math.round(255 * Math.min(1, a));
      }
    }
  }
  return encodePng({ width, height: SIZE, data });
}
for (const [slot, look] of Object.entries(EFFECTS)) {
  fs.writeFileSync(`data/effects/${slot}-placeholder.png`, effectSheet(look));
}
console.log(`effects: ${Object.keys(EFFECTS).length} placeholder sheets in data/effects/`);

// ---------- 2. animation slots ----------
// slot: [the character's own move or state whose sheet stands in, what the slot is].
const UNIVERSAL = {
  vow_start: ['blockStand', 'Vow: the guard coming up'],
  vow_hold: ['blockStand', 'Vow: holding the guard (loop)'],
  vow_absorb: ['blockCrouch', 'Vow: an absorbed hit'],
  vow_strike_quick: ['5H', 'Vow: quick strike'],
  vow_strike: ['backHeavy', 'Vow: strike (crumples)'],
  vow_strike_full: ['backHeavy', 'Vow: full strike (unblockable)'],
  absolve: ['5S', 'Absolve'],
  absolve_air: ['j.H', 'Absolve in the air'],
  absolve_recovery: ['crouch', 'Absolve: the baited recovery'],
  absolve_recovery_air: ['fall', 'Absolve: the baited recovery, falling'],
  repel: ['blockStand', 'Repel'],
  draw: ['blockStand', 'Draw'],
  drawn: ['hitStand', 'pulled in by a Draw'],
  crumple: ['hitCrouch', 'crumple (hit by a Vow strike)'],
};
// Rite moves (already in the character's list, without art): slot → the move whose sheet stands in.
const RITE = { malik: { rite_5: 'spiritOrb', rite_2: '2M', rite_6: 'pillarL', rite_j: 'j.H' } };
// Projectiles without art: projectile → the projectile whose sheet stands in.
const PROJECTILES = { malik: { palm5: 'spiritOrb', palm2: 'spiritOrb', palm6: 'spiritOrb', palmJ: 'spiritOrb' } };

// How long each universal move lasts (frames), so a stand-in's drawings can be spread to fill it exactly.
const SYS = JSON.parse(fs.readFileSync('data/system/systems.json', 'utf8'));
const BURST = JSON.parse(fs.readFileSync('data/system/burst.json', 'utf8'));
const length = (m) => m.startup - 1 + m.active + m.recovery;
const DURATION = { vow_start: SYS.vow.startup };
for (const [id, m] of Object.entries({ ...SYS.vow.moves, ...BURST.moves })) DURATION[id] = length(m);
/** The sprite entry with its drawings spread evenly over `frames` (fewer drawings if the move is shorter). */
function fit(sprite, frames) {
  const count = Math.max(1, Math.min(sprite.count, frames));
  const holds = Array.from({ length: count }, (_, i) => Math.floor(((i + 1) * frames) / count) - Math.floor((i * frames) / count));
  return { ...sprite, count, holds };
}

const files = process.argv.slice(2).length ? process.argv.slice(2)
  : ['data/characters/avner/avner.toska.json', 'data/characters/malik/malik.toska.json'];
for (const file of files) {
  let text = fs.readFileSync(file, 'utf8');
  const data = JSON.parse(text);
  const id = data.character.id;
  const dir = path.join('data', 'characters', id);
  const spriteOf = (name) => data.moves.find((m) => m.id === name)?.sprite ?? data.states?.[name]?.sprite ?? null;
  const one = (o) => JSON.stringify(o).replace(/([:,])(?=\S)/g, '$1 ').replace(/\{(?=\S)/g, '{ ').replace(/(?<=\S)\}/g, ' }');
  /** Copy the stand-in sheet under the slot's placeholder name; returns the sprite entry for it. */
  const standIn = (slot, src) => {
    const image = `sheets/${slot.replace('.', '')}-placeholder.png`;
    const to = path.join(dir, image);
    if (!fs.existsSync(to)) fs.copyFileSync(path.join(dir, src.image), to);
    return { ...src, image };
  };
  const added = [];
  // Universal slots: a new entry at the end of the move list (only the art; the rules stay the universal ones).
  const entries = [];
  for (const [slot, [from, what]] of Object.entries(UNIVERSAL)) {
    if (spriteOf(slot)) continue;
    const src = spriteOf(from);
    if (!src) { console.log(`${id}: no "${from}" art to stand in for ${slot}`); continue; }
    entries.push(`    { "id": "${slot}", "name": "${what} (placeholder art: a copy of ${from})",\n      "sprite": ${one(DURATION[slot] ? fit(standIn(slot, src), DURATION[slot]) : standIn(slot, src))} }`);
    added.push(slot);
  }
  if (entries.length) {
    const last = text.lastIndexOf('    { "id": "');
    const end = text.indexOf('\n  ]', last);
    if (last < 0 || end < 0) throw new Error(`${file}: could not find the end of the move list`);
    text = text.slice(0, end) + ',\n' + entries.join(',\n') + text.slice(end);
  }
  // Rite moves and projectiles: add the art to the entry that is already there.
  for (const [slot, from] of Object.entries(RITE[id] || {})) {
    const src = spriteOf(from);
    const anchor = `{ "id": "${slot}", `;
    if (spriteOf(slot) || !src || !text.includes(anchor)) continue;
    text = text.replace(anchor, () => `${anchor}"sprite": ${one(fit(standIn(slot, src), length(data.moves.find((m) => m.id === slot))))},\n      `);
    added.push(slot);
  }
  for (const [name, from] of Object.entries(PROJECTILES[id] || {})) {
    const src = data.projectiles?.[from];
    const anchor = `"${name}": { `;
    if (data.projectiles?.[name]?.sprite || !src?.sprite || !text.includes(anchor)) continue;
    text = text.replace(anchor, () => `${anchor}"sprite": ${one(standIn(name, src.sprite))},\n      "anim": ${one(src.anim)},\n      `);
    added.push(name);
  }
  JSON.parse(text); // still valid
  fs.writeFileSync(file, text);
  console.log(`${id}: ${added.length ? added.join(', ') : 'nothing to add'}`);
}
