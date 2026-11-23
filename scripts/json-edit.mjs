// Change values inside a JSON file's text without reformatting the rest of it. The character files are formatted
// by hand (a move per line or two); writing them back with JSON.stringify would rewrite every line. This finds the
// exact characters of the value at a path and replaces only those.
//
//   editJSON(text, [{ op: 'set' | 'add' | 'remove', path: ['moves', 3, 'hitboxes', 0, 2], value }]) -> new text

/** Parse JSON text into a tree that remembers where each value sits: { type, start, end, items | members }. */
function parse(text) {
  let i = 0;
  const ws = () => { while (i < text.length && ' \t\r\n'.includes(text[i])) i++; };
  const fail = (what) => { throw new Error(`JSON: expected ${what} at character ${i}`); };
  function string() {
    const start = i;
    if (text[i] !== '"') fail('a string');
    i++;
    while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
    i++;
    return { type: 'string', start, end: i, value: JSON.parse(text.slice(start, i)) };
  }
  function value() {
    ws();
    const start = i;
    const c = text[i];
    if (c === '{') {
      i++;
      const members = [];
      ws();
      if (text[i] === '}') { i++; return { type: 'object', start, end: i, members }; }
      for (;;) {
        ws();
        const key = string();
        ws();
        if (text[i] !== ':') fail('":"');
        i++;
        const v = value();
        members.push({ key: key.value, start: key.start, end: v.end, node: v });
        ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === '}') { i++; return { type: 'object', start, end: i, members }; }
        fail('"," or "}"');
      }
    }
    if (c === '[') {
      i++;
      const items = [];
      ws();
      if (text[i] === ']') { i++; return { type: 'array', start, end: i, items }; }
      for (;;) {
        const v = value();
        items.push(v);
        ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === ']') { i++; return { type: 'array', start, end: i, items }; }
        fail('"," or "]"');
      }
    }
    if (c === '"') return string();
    const m = /^(-?\d+(\.\d+)?([eE][+-]?\d+)?|true|false|null)/.exec(text.slice(i, i + 40));
    if (!m) fail('a value');
    i += m[0].length;
    return { type: 'literal', start, end: i };
  }
  const root = value();
  ws();
  if (i !== text.length) fail('the end of the file');
  return root;
}

/** A value written the way the character files write them: [[20, 100, 60, 20]], { "at": 4, "hurt": [...] }. */
export function format(v) {
  if (Array.isArray(v)) return `[${v.map(format).join(', ')}]`;
  if (v !== null && typeof v === 'object') {
    const keys = Object.keys(v);
    return keys.length ? `{ ${keys.map((k) => `${JSON.stringify(k)}: ${format(v[k])}`).join(', ')} }` : '{}';
  }
  return JSON.stringify(v);
}

function find(root, path) {
  let node = root;
  for (const k of path) {
    if (node.type === 'object') node = node.members.find((m) => m.key === k)?.node;
    else if (node.type === 'array') node = node.items[k];
    else node = undefined;
    if (!node) throw new Error(`No value at ${JSON.stringify(path)}`);
  }
  return node;
}

function editOne(text, { op, path, value }) {
  const root = parse(text);
  const splice = (from, to, s) => text.slice(0, from) + s + text.slice(to);
  if (op === 'set') {
    const node = find(root, path);
    return splice(node.start, node.end, format(value));
  }
  const parent = find(root, path.slice(0, -1));
  const key = path.at(-1);
  // Children as spans, whichever the container is.
  const kids = parent.type === 'object' ? parent.members : parent.type === 'array' ? parent.items : null;
  if (!kids) throw new Error(`${JSON.stringify(path.slice(0, -1))} is not an object or a list`);
  if (op === 'add') {
    const isObj = parent.type === 'object';
    if (isObj && kids.some((m) => m.key === key)) throw new Error(`${JSON.stringify(path)} already exists`);
    if (!isObj && key !== kids.length) throw new Error(`Can only add at the end of the list at ${JSON.stringify(path.slice(0, -1))}`);
    const piece = isObj ? `${JSON.stringify(key)}: ${format(value)}` : format(value);
    if (!kids.length) return splice(parent.start, parent.end, isObj ? `{ ${piece} }` : `[${piece}]`);
    return splice(kids.at(-1).end, kids.at(-1).end, `, ${piece}`);
  }
  if (op === 'remove') {
    const n = parent.type === 'object' ? kids.findIndex((m) => m.key === key) : key;
    if (!(n >= 0 && n < kids.length)) throw new Error(`No value at ${JSON.stringify(path)}`);
    if (n < kids.length - 1) return splice(kids[n].start, kids[n + 1].start, '');
    if (n > 0) return splice(kids[n - 1].end, kids[n].end, '');
    return splice(parent.start, parent.end, parent.type === 'object' ? '{}' : '[]');
  }
  throw new Error(`Unknown change "${op}"`);
}

export function editJSON(text, ops) {
  let out = text;
  for (const op of ops) out = editOne(out, op);
  JSON.parse(out); // never hand back a file that doesn't read
  return out;
}
