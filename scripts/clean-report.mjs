// node scripts/clean-report.mjs [avner malik]: what the cleanup pass changed, per sheet (reads sheets-clean/report.json).
import fs from 'node:fs';
const ids = process.argv.slice(2).filter((a) => !a.startsWith('--'));
for (const id of ids.length ? ids : ['avner', 'malik']) {
  const rep = JSON.parse(fs.readFileSync(`data/characters/${id}/sheets-clean/report.json`, 'utf8'));
  const rows = [];
  let n = 0, over = 0;
  for (const [image, r] of Object.entries(rep)) {
    const ch = r.frames.map((f) => f.changed);
    const bad = r.frames.map((f, i) => (f.changed > 0.25 ? i : -1)).filter((i) => i >= 0);
    n += ch.length; over += bad.length;
    rows.push({ name: image.replace(/^sheets\/|\.png$/g, ''), worst: Math.max(...ch), mean: ch.reduce((a, b) => a + b, 0) / ch.length, bad });
  }
  rows.sort((a, b) => b.worst - a.worst);
  console.log(`${id}: ${rows.length} sheets, ${n} drawings, ${over} drawings over 25% changed`);
  for (const r of rows.filter((r) => r.bad.length || process.argv.includes('--all'))) console.log(`  ${r.name}: worst ${(r.worst * 100).toFixed(0)}%, mean ${(r.mean * 100).toFixed(0)}%${r.bad.length ? `, drawings over 25%: ${r.bad.join(' ')}` : ''}`);
  console.log(`  top: ${rows.slice(0, 8).map((r) => `${r.name} ${(r.worst * 100).toFixed(0)}`).join(', ')}`);
}
