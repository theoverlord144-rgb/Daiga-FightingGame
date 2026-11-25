// Takes the shockwave rings out again, completely:  node scripts/shockwave-remove.mjs
// It removes the marked blocks from the drawing code, the "shockwave" numbers from effects.json, the art.shockwave
// lists from the character files (by text, so nothing else in them is touched), and the shockwave test and picture
// tool. Then run npm test and delete this file.
import fs from 'node:fs';

const edit = (file, fn) => { const a = fs.readFileSync(file, 'utf8'); const b = fn(a); if (a === b) console.log(`${file}: nothing to remove`); else { fs.writeFileSync(file, b); console.log(`${file}: shockwave removed`); } };

edit('src/render/fight-renderer.js', (s) => {
  const a = s.indexOf('  // SHOCKWAVE BEGIN'), end = '  // SHOCKWAVE END\n', b = s.indexOf(end);
  if (a >= 0 && b > a) s = s.slice(0, a) + s.slice(b + end.length);
  return s.split('\n').filter((line) => !line.endsWith('// SHOCKWAVE')).join('\n').replace(/\n    \/\*\* Play a shockwave set at a place in the game[^\n]*\*\//, '');
});
edit('data/system/effects.json', (s) => {
  const a = s.indexOf(',\n  "shockwave": {');
  if (a < 0) return s;
  let depth = 0, i = s.indexOf('{', a);
  for (; i < s.length; i++) { if (s[i] === '{') depth++; else if (s[i] === '}' && --depth === 0) break; }
  const out = s.slice(0, a) + s.slice(i + 1);
  JSON.parse(out);
  return out;
});
for (const id of ['avner', 'malik']) edit(`data/characters/${id}/${id}.toska.json`, (s) => { const out = s.replace(/\n    "shockwave": \{[^\n]*\},(?=\r?\n)/, ''); JSON.parse(out); return out; });
for (const f of ['tests/shockwave.test.js', 'scripts/shockwave-shots.mjs']) if (fs.existsSync(f)) { fs.rmSync(f); console.log(`${f}: deleted`); }
