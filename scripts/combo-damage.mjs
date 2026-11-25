// Combo damage table (a measuring tool; it changes nothing in the game):
//   node scripts/combo-damage.mjs [--only <text>] [--verbose]
//
// Plays every combo listed in scripts/combo-damage.json through the real game rules (src/core/, the real character
// files and system files) with real button presses, and prints what each one truly does: hits, damage, share of a
// life bar, touches needed to win a round, and the Devotion it gives both fighters. It finds the timing of each
// press by trying every delay, so a combo that cannot be done is reported as dropped, with the step it dropped at.
// The table is also written to docs/reports/combo-damage.md.
//
// A combo is written like  "5L > 5M > 5H > 623H":
//   5L 2M 6H ...      a direction and buttons (numpad directions, as if facing right)
//   236H 623HS 22HS   a motion, then the buttons (S with an attack button = the EX version)
//   9 > j.M           a jump (7, 8, 9; 29 = super jump), then an air move
//   66 > 2L           a dash (66 forward, 44 back), then the press
//   link:5H           this press must be a Perfect Link
// Options per combo: "bars" (Devotion bars the attacker starts with, default 0), "start": "counter" | "witness"
// (the defender is caught in the startup / the recovery of their standing heavy), "gap" (px between them, default 70).
import fs from 'node:fs';
import { createGame, step } from '../src/core/game.js';
import { enterState } from '../src/core/fighter.js';
import { RAW } from '../src/core/input.js';
import { cloneState } from '../src/core/state.js';
import { px } from '../src/core/fixed.js';
import { loadWorld, loadJSON } from '../tests/helpers.js';

const args = process.argv.slice(2);
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1].toLowerCase() : null;
const VERBOSE = args.includes('--verbose');
const LIST = loadJSON('scripts/combo-damage.json');
const FILE = (id) => `data/characters/${id}/${id}.toska.json`;
const MAX_DELAY = 110, MAX_GAP = 44, WAIT = 90, BUDGET = 6000000;

const MIRROR = { 1: 3, 3: 1, 4: 6, 6: 4, 7: 9, 9: 7 };
function rawOf(dir, buttons, flip) {
  const d = flip ? (MIRROR[dir] ?? dir) : Number(dir);
  let r = 0;
  if ([1, 4, 7].includes(d)) r |= RAW.LEFT;
  if ([3, 6, 9].includes(d)) r |= RAW.RIGHT;
  if ([7, 8, 9].includes(d)) r |= RAW.UP;
  if ([1, 2, 3].includes(d)) r |= RAW.DOWN;
  for (const b of buttons) r |= RAW[b];
  return r;
}

/** "5L > 9 > j.M > link:623H" -> [{ text, jump, dirs, buttons, link }] (a jump joins the step after it). */
function parse(text) {
  const steps = [];
  let jump = null;
  for (const tokRaw of text.split('>').map((t) => t.trim()).filter(Boolean)) {
    let tok = tokRaw, link = false;
    if (tok.startsWith('link:')) { link = true; tok = tok.slice(5); }
    if (/^(7|8|9|27|28|29|66|44)$/.test(tok)) { jump = tok; continue; } // a jump or a dash before the next press
    const m = /^(?:j\.)?(\d*)([LMHSR]+)$/.exec(tok);
    if (!m) throw new Error(`cannot read "${tokRaw}" in "${text}"`);
    let dirs = [...(m[1] || '5')];
    if (m[1] === '22') dirs = ['2', '5', '2'];
    steps.push({ text: (jump ? jump + ' > ' : '') + tokRaw, jump, dirs, buttons: m[2], link });
    jump = null;
  }
  return steps;
}

/** The raw frames of one step, with `gap` empty frames between the jump and the press. */
function framesOf(s, flip, gap) {
  const out = [];
  if (s.jump === '66' || s.jump === '44') {
    const d = s.jump[0];
    out.push(rawOf(d, '', flip), rawOf(5, '', flip), rawOf(d, '', flip));
    for (let i = 0; i < gap; i++) out.push(0);
  } else if (s.jump) {
    if (s.jump.length === 2) out.push(rawOf(2, '', flip), rawOf(2, '', flip));
    const up = s.jump[s.jump.length - 1];
    for (let i = 0; i < 6; i++) out.push(rawOf(up, '', flip));
    for (let i = 0; i < gap; i++) out.push(0);
  }
  s.dirs.forEach((d, i) => out.push(rawOf(d, i === s.dirs.length - 1 ? s.buttons : '', flip)));
  return out;
}

function measure(entry, attackerId, defenderId) {
  const world = loadWorld(FILE(attackerId), FILE(defenderId));
  const steps = parse(entry.combo);
  const bars = entry.bars ?? 0;
  const ddef = world.chars[1];
  const maxHp = ddef.stats.health;
  // The defender's standing heavy, for a counter / Witness start: held on one frame until the first hit lands.
  const heavy = loadJSON(FILE(defenderId)).moves.find((m) => m.input === '5H' && !m.requires);
  const pinFrame = entry.start === 'counter' ? 1 : entry.start === 'witness' ? heavy.startup + heavy.active : -1;
  const pin = (g) => {
    const d = g.players[1];
    if (pinFrame < 0 || d.combo || d.lastCombo || d.health < d.startHealth) return;
    enterState(d, ddef, heavy.id); d.frame = pinFrame;
  };
  const fresh = (health) => {
    const g = createGame(world);
    const gap = entry.gap ?? 70;
    g.players[0].x = px(-gap / 2); g.players[1].x = px(gap / 2);
    g.players[0].meter = bars * world.meter.barSize;
    g.players[1].health = health;
    g.players[1].startHealth = health;
    return g;
  };
  let sims = 0;
  const adv = (g, raw) => { pin(g); step(g, [raw, 0], world); sims++; };

  // The moves a step may mean: every move in the attacker's file with that input (the EX version for "…S").
  const moveFile = loadJSON(FILE(attackerId));
  const projKinds = new Set(Object.keys(moveFile.projectiles || {}));
  function idsOf(s) {
    const air = s.text.includes('j.') ? 'j.' : '';
    const motion = s.dirs.join('') === '252' ? '22' : s.dirs.join('');
    const full = air + (air && motion === '5' ? '' : motion) + s.buttons;
    let found = moveFile.moves.filter((m) => m.input === full).map((m) => m.id);
    if (!found.length && s.buttons.length > 1 && s.buttons.endsWith('S')) {
      found = moveFile.moves.filter((m) => m.input === full.slice(0, -1) && m.ex).map((m) => `${m.id}_ex`);
    }
    if (!found.length) throw new Error(`${attackerId} has no move on "${full}"`);
    return new Set(found);
  }

  /** One try of step s from state g: wait `delay`, press, and see whether that very move lands in the combo. */
  function attempt(g0, s, delay, gap, first) {
    const g = cloneState(g0);
    const a = g.players[0], d = g.players[1];
    const linksBefore = d.combo?.links ?? 0;
    const ids = idsOf(s);
    const inputs = [];
    let entered = false, landed = false;
    /** One frame; false = the combo was dropped. */
    const tick = (raw) => {
      adv(g, raw); inputs.push(raw);
      if (ids.has(a.state)) entered = true;
      if (g.cues.some((q) => q.p === 0 && (q.type === 'hit' || q.type === 'counter' || q.type === 'witness') && (ids.has(q.move) || (entered && projKinds.has(q.move))))) landed = true;
      return first || !!d.combo || landed;
    };
    for (let i = 0; i < delay; i++) if (!tick(0)) return null;
    for (const raw of framesOf(s, a.x > d.x, gap)) { if (!tick(raw)) return null; if (landed) break; }
    for (let i = 0; i < WAIT && !landed; i++) if (!tick(0)) return null;
    if (!landed) return null;
    const c = d.combo ?? { links: 0, witness: 0, damage: d.startHealth - d.health };
    if (first && entry.start === 'witness' && !c.witness) return null;
    if (first && entry.start === 'counter' && !g.cues.some((q) => q.type === 'counter')) return null;
    if (s.link && c.links <= linksBefore) return null;
    if (a.health < world.chars[0].stats.health) return null; // the attacker got hit: not this combo
    return { g, inputs, delay, gap, damage: c.damage };
  }

  /** The tries worth following for a step: the most damage (earliest), the earliest of all, and one in between. */
  function options(g, s, first) {
    const ok = [];
    for (let delay = 0; delay <= MAX_DELAY; delay++) {
      for (let gap = 0; gap <= (s.jump ? MAX_GAP : 0); gap += 2) {
        const r = attempt(g, s, delay, gap, first);
        if (r) ok.push(r);
      }
      if (sims > BUDGET) break;
    }
    if (!ok.length) return [];
    const best = [...ok].sort((x, y) => y.damage - x.damage || x.delay + x.gap - (y.delay + y.gap))[0];
    const picks = [best, ok[0], ok[Math.floor(ok.length / 2)], ok[ok.length - 1]];
    return picks.filter((p, i) => picks.indexOf(p) === i);
  }

  let deepest = 0;
  function search(g, i, inputs) {
    if (i === steps.length) return { g, inputs };
    for (const o of options(g, steps[i], i === 0)) {
      deepest = Math.max(deepest, i + 1);
      const r = search(o.g, i + 1, inputs.concat(o.inputs));
      if (r) return r;
      if (sims > BUDGET) return null;
    }
    return null;
  }

  const found = search(fresh(maxHp), 0, []);
  if (!found) return { ok: false, droppedAt: steps[Math.min(deepest, steps.length - 1)].text, done: Math.min(deepest, steps.length - 1), of: steps.length };

  /** Play the found presses on a defender with `health` left; returns the combo and the health afterwards. */
  function play(health) {
    const g = fresh(health);
    let last = null;
    const run = (raw) => { adv(g, raw); if (g.players[1].combo) last = { ...g.players[1].combo }; };
    for (const raw of found.inputs) { run(raw); if (g.players[1].health <= 0) break; }
    for (let i = 0; i < 600 && (g.players[1].combo || g.players[1].state === 'thrown') && g.players[1].health > 0; i++) run(0);
    return { combo: last, health: g.players[1].health, meter: g.players[0].meter, defMeter: g.players[1].meter };
  }
  const one = play(maxHp);
  let touches = 0, hp = maxHp;
  while (hp > 0 && touches < 12) { hp = play(hp).health; touches++; }
  const unit = world.meter.unit;
  // Devotion: earned = what the combo gave the attacker (a throw: the change in the meter); spent = what is missing
  // from the starting bars plus what was earned; the victim's is what their empty meter holds afterwards.
  const gave = one.combo ? one.combo.gave / unit : one.meter / unit - bars * 100;
  return {
    ok: true, hits: one.combo?.hits ?? 1, damage: maxHp - one.health, pct: ((maxHp - one.health) * 100) / maxHp, touches,
    links: one.combo?.links ?? 0, gave, took: one.defMeter / unit,
    spent: Math.max(0, Math.round(bars * 100 + gave - one.meter / unit)),
  };
}

const rows = [];
for (const [attacker, list] of Object.entries(LIST.combos)) {
  const defender = LIST.defender[attacker];
  for (const entry of list) {
    if (ONLY && !(`${attacker} ${entry.name} ${entry.combo}`.toLowerCase().includes(ONLY))) continue;
    const t0 = Date.now();
    let r;
    try { r = measure(entry, attacker, defender); } catch (e) { r = { ok: false, error: e.message }; }
    rows.push({ attacker, entry, r });
    const what = r.ok ? `${r.hits} hits, ${r.damage} (${r.pct.toFixed(1)}%), ${r.touches} touches, gives ${Math.round(r.gave)} / victim ${Math.round(r.took)}, spent ${Math.round(r.spent)}`
      : r.error ? `ERROR ${r.error}` : `DROPPED at "${r.droppedAt}" (${r.done} of ${r.of} steps worked)`;
    console.log(`${attacker.padEnd(6)} ${entry.name.padEnd(34)} ${what}${VERBOSE ? `  [${Date.now() - t0} ms]` : ''}`);
  }
}

if (!ONLY) {
  const lines = ['# Combo damage table', '',
    'Measured by `node scripts/combo-damage.mjs`: every combo is played through the real game rules with real button',
    'presses, against a defender who does nothing. Health is 10,000. "Touches" = how many times that same combo has',
    'to land to win a round (the comeback rule makes the last part of a life bar tougher). Devotion: 100 = one bar.', ''];
  for (const attacker of Object.keys(LIST.combos)) {
    lines.push(`## ${attacker[0].toUpperCase() + attacker.slice(1)}`, '',
      '| Combo | Presses | Bars | Hits | Damage | Life bar | Touches | Devotion earned | Victim earns |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const { entry, r } of rows.filter((x) => x.attacker === attacker)) {
      const start = entry.start ? `(${entry.start} hit) ` : '';
      lines.push(r.ok
        ? `| ${entry.name} | ${start}${entry.combo} | ${entry.bars ?? 0} | ${r.hits} | ${r.damage} | ${r.pct.toFixed(1)}% | ${r.touches} | ${Math.round(r.gave)} | ${Math.round(r.took)} |`
        : `| ${entry.name} | ${start}${entry.combo} | ${entry.bars ?? 0} | | | | | ${r.error ? 'error: ' + r.error : `does not connect: drops at "${r.droppedAt}"`} | |`);
    }
    lines.push('');
  }
  fs.writeFileSync('docs/reports/combo-damage.md', lines.join('\n'));
  console.log('\nwritten: docs/reports/combo-damage.md');
}
