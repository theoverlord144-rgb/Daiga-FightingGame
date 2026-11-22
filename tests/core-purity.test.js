// The core must stay deterministic: no randomness, no clocks, no DOM, no rendering, no UI imports.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CORE = new URL('../src/core/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function files(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.js') ? [p] : [];
  });
}

const FORBIDDEN = [
  [/Math\.random/, 'Math.random'],
  [/\bDate\b/, 'Date'],
  [/\bperformance\b/, 'performance'],
  [/\bdocument\b/, 'document'],
  [/\bwindow\b/, 'window'],
  [/requestAnimationFrame/, 'requestAnimationFrame'],
  [/localStorage/, 'localStorage'],
  [/from ['"]\.\.\/(render|ui|tools|net)\//, 'an import from render/ui/tools/net'],
  [/Math\.(sin|cos|tan|sqrt|pow|exp|log|atan2?)\b/, 'floating-point maths'],
];

test('src/core has no randomness, clocks, DOM, rendering or floating-point maths', () => {
  const list = files(CORE);
  for (const f of list) {
    const src = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [re, what] of FORBIDDEN) assert.ok(!re.test(src), `${f} uses ${what}`);
  }
});
