// Takes the block effect and the see-through effects out again, completely:  node scripts/block-fx-remove.mjs
// It removes the marked blocks and lines from the drawing code and the settings, the "opacity" and "blockFx" numbers
// from effects.json, the art.opacity lists from the character files (by text, so nothing else in them is touched),
// the cut strips, and the test and tools. The old block flash and Repel wave play again. Then run npm test and delete
// this file. (The drawn sheets in data/UniversalEffects/ are left alone.)
import fs from 'node:fs';

const edit = (file, fn) => { const a = fs.readFileSync(file, 'utf8'); const b = fn(a); if (a === b) console.log(`${file}: nothing to remove`); else { fs.writeFileSync(file, b); console.log(`${file}: removed`); } };
const marked = (s) => {
  for (const tag of ['FXOPACITY', 'BLOCKFX']) {
    const a = s.indexOf(`  // ${tag} BEGIN`), end = `  // ${tag} END\n`, b = s.indexOf(end);
    if (a >= 0 && b > a) s = s.slice(0, a) + s.slice(b + end.length);
  }
  return s.split('\n').filter((line) => !line.endsWith('// FXOPACITY') && !line.endsWith('// BLOCKFX')).join('\n');
};
const dropKey = (s, key) => {
  const a = s.indexOf(`,\n  "${key}": {`);
  if (a < 0) return s;
  let depth = 0, i = s.indexOf('{', a);
  for (; i < s.length; i++) { if (s[i] === '{') depth++; else if (s[i] === '}' && --depth === 0) break; }
  return s.slice(0, a) + s.slice(i + 1);
};

edit('src/render/fight-renderer.js', marked);
edit('src/ui/settings.js', marked);
edit('data/system/effects.json', (s) => { const out = dropKey(dropKey(s, 'blockFx'), 'opacity').replace(/"opacity": [\d.]+, /g, ''); JSON.parse(out); return out; });
for (const id of ['avner', 'malik']) edit(`data/characters/${id}/${id}.toska.json`, (s) => { const out = s.replace(/\n    "opacity": \{[^\n]*\},(?=\r?\n)/, ''); JSON.parse(out); return out; });
const gone = ['src/render/fx-opacity.js', 'tests/block-fx.test.js', 'scripts/block-fx-shots.mjs', 'scripts/block-fx-prep.mjs', ...fs.readdirSync('data/effects').filter((f) => f.startsWith('block-')).map((f) => `data/effects/${f}`)];
for (const f of gone) if (fs.existsSync(f)) { fs.rmSync(f); console.log(`${f}: deleted`); }
