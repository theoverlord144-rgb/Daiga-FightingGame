import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { editJSON } from './scripts/json-edit.mjs';
import { applyOps } from './src/editor/box-model.js';

/**
 * The box editor's save button (dev server only: `npm run dev`). The page sends the character file it was editing
 * and the list of small changes; this writes them into the file's text, touching nothing else. It refuses if the
 * file on disk is no longer the one the editor started from, or if the result would not read back as intended.
 */
function toskaEditor() {
  const justSaved = new Map(); // file -> time: our own write should not reload the page under the editor
  return {
    name: 'toska-editor',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__toska/save-character', (req, res) => {
        const reply = (code, body) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
        if (req.method !== 'POST') return reply(405, { error: 'POST only' });
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          try {
            const { file, base, ops } = JSON.parse(body);
            if (!/^data\/characters\/[\w-]+\/[\w.-]+\.toska\.json$/.test(file)) throw new Error('Not a character file');
            const full = path.join(server.config.root, file);
            const text = fs.readFileSync(full, 'utf8');
            // Same content, whatever order the keys are in.
            const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
            const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
            if (!same(JSON.parse(text), base)) throw new Error('The file changed on disk since the editor opened it. Reload the page and redo the change.');
            const out = editJSON(text, ops);
            if (!same(JSON.parse(out), applyOps(structuredClone(base), ops))) throw new Error('The saved file would not match the edit; nothing was written.');
            justSaved.set(full, Date.now());
            fs.writeFileSync(full, out);
            reply(200, { ok: true, changes: ops.length });
          } catch (err) {
            reply(400, { error: err.message });
          }
        });
      });
    },
    handleHotUpdate(ctx) {
      const t = justSaved.get(path.normalize(ctx.file));
      if (t && Date.now() - t < 3000) return []; // the editor already holds the new version
    },
  };
}

export default defineConfig({
  server: { port: 5300 },
  build: { target: 'es2022' },
  plugins: [toskaEditor()],
});
