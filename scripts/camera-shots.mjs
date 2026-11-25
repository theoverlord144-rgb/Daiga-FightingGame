// node scripts/camera-shots.mjs <out-folder> [scene,scene]  Real screenshots of the fight camera scenes (and draw timing
// on "mid") through headless Chrome and scripts/camera-shots.html. Needs the dev server on port 5300 and Chrome installed.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const port = 9333;
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1920,1080', `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(os.tmpdir(), 'toska-camera-shots-profile')}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 40 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const waiting = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d.result); waiting.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { waiting.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
const evalJs = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.value;
for (const s of (process.argv[3] ? process.argv[3].split(',') : ['start', 'mid', 'far', 'superjump', 'jump'])) {
  await send('Page.navigate', { url: `http://localhost:5300/scripts/camera-shots.html?scene=${s}${s === 'mid' ? '&time=1&fps=1' : ''}` });
  let title = '';
  for (let i = 0; i < 80 && !(title.startsWith('done') && (s !== 'mid' || title.includes('fps'))); i++) { await sleep(250); title = (await evalJs('document.title')) || ''; }
  await sleep(300);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(out, `${s}.png`), Buffer.from(shot.data, 'base64'));
  console.log(s, title, await evalJs('(() => { const c = document.getElementById("game"); return c.width + "x" + c.height + " shown " + c.style.width; })()'));
}
ws.close(); chrome.kill();
