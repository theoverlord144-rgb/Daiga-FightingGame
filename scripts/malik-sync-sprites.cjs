// node sync.cjs check|write name,name,...
// Every sprite block in Malik's file that uses sheets/<name>.png: compare (check) or bring (write) its cell size and
// origin to the cut sheet's manifest entry. Holds and everything else are left alone; the file is edited in place.
const fs = require('fs');
const F = 'data/characters/malik/malik.toska.json';
const M = JSON.parse(fs.readFileSync('data/characters/malik/sheets/manifest.json', 'utf8'));
const [mode, list] = process.argv.slice(2);
let s = fs.readFileSync(F, 'utf8');
let bad = 0, blocks = 0;
for (const key of list.split(',')) {
  const tag = `"image": "sheets/${key}.png"`, p = M[key].sprite;
  let from = 0, found = 0;
  for (;;) {
    const a = s.indexOf(tag, from); if (a < 0) break;
    const b = s.indexOf('}', a); let blk = s.slice(a, b); found++; blocks++;
    for (const name of ['columns', 'count', 'frameW', 'frameH', 'originX', 'originY']) {
      const re = new RegExp(`"${name}": (-?\\d+)`), m = re.exec(blk);
      if (!m) throw new Error(`${key}: no ${name}`);
      if (+m[1] !== p[name]) { if (mode === 'check') { bad++; console.log(`${key}: ${name} file ${m[1]} sheet ${p[name]}`); } blk = blk.replace(re, `"${name}": ${p[name]}`); }
    }
    s = s.slice(0, a) + blk + s.slice(b);
    from = a + blk.length;
  }
  if (!found) console.log(`${key}: not used in the file`);
}
if (mode === 'write') { JSON.parse(s); fs.writeFileSync(F, s); console.log(`written: ${blocks} sprite blocks`); } else console.log(`${blocks} blocks, ${bad} differences`);
