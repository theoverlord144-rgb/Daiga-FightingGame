// The Controls panel: rebind keyboard keys and gamepad buttons for both players. Saved in the browser.

import { ACTIONS } from './devices.js';

const LABEL = { up: 'Up', down: 'Down', left: 'Left', right: 'Right', L: 'Light (L)', M: 'Medium (M)', H: 'Heavy (H)', S: 'Special (S)', R: 'Rite (R)' };

const CSS = `
.tk-panel { position: absolute; inset: 40px; margin: auto; max-width: 760px; max-height: calc(100% - 80px); overflow: auto;
  background: #17141f; border: 1px solid #3a3347; border-radius: 10px; padding: 20px 24px; color: #e8e2d4;
  font: 14px system-ui, sans-serif; box-shadow: 0 20px 60px #0009; }
.tk-panel h2 { margin: 0 0 4px; font-size: 20px; }
.tk-panel p { margin: 0 0 14px; color: #a99fb8; }
.tk-panel .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.tk-panel table { width: 100%; border-collapse: collapse; }
.tk-panel td { padding: 3px 4px; }
.tk-panel button { font: inherit; background: #262131; color: inherit; border: 1px solid #3a3347; border-radius: 6px;
  padding: 4px 8px; cursor: pointer; min-width: 96px; }
.tk-panel button:hover { border-color: #c9a2ff; }
.tk-panel button.wait { background: #4b2f6e; border-color: #c9a2ff; }
.tk-panel .row { display: flex; gap: 8px; margin-top: 16px; align-items: center; }
.tk-panel select { font: inherit; background: #262131; color: inherit; border: 1px solid #3a3347; border-radius: 6px; padding: 3px; }
`;

function keyName(code) {
  return (code || '—').replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ').replace(/^Arrow/, '');
}

/** Adds the shared panel styles to the page once. */
export function ensurePanelCss() {
  if (document.getElementById('tk-panel-css')) return;
  const st = document.createElement('style');
  st.id = 'tk-panel-css';
  st.textContent = CSS;
  document.head.append(st);
}

export function openControlsPanel(root, devices, onClose) {
  ensurePanelCss();
  const el = document.createElement('div');
  el.className = 'tk-panel';
  root.append(el);
  let padPoll = 0;

  function stopPadPoll() { cancelAnimationFrame(padPoll); padPoll = 0; }

  function render() {
    const b = devices.bindings;
    const pads = devices.pads();
    el.innerHTML = `
      <h2>Controls</h2>
      <p>Click a box, then press the key or pad button you want. Saved in this browser. F1 or Esc closes.</p>
      <div class="cols">${[0, 1].map((i) => `
        <div>
          <h3>Player ${i + 1}</h3>
          <div class="row" style="margin:0 0 8px">Gamepad:
            <select data-pad="${i}">
              <option value="auto" ${b.players[i].pad.index === 'auto' ? 'selected' : ''}>Auto (${i === 0 ? 'first' : 'second'} one used)</option>
              ${[0, 1, 2, 3].map((n) => {
                const g = pads.find((p) => p.index === n);
                return `<option value="${n}" ${b.players[i].pad.index === n ? 'selected' : ''}>Pad ${n + 1}${g ? ` (${g.id.slice(0, 24)})` : ' (not connected)'}</option>`;
              }).join('')}
            </select>
          </div>
          <table>
            <tr><td></td><td>Key</td><td>Pad</td></tr>
            ${ACTIONS.map((a) => `<tr><td>${LABEL[a]}</td>
              <td><button data-key="${i}:${a}">${keyName(b.players[i].keys[a])}</button></td>
              <td><button data-padbtn="${i}:${a}">${b.players[i].pad.buttons[a] >= 0 ? `Button ${b.players[i].pad.buttons[a]}` : '—'}</button></td></tr>`).join('')}
          </table>
        </div>`).join('')}
      </div>
      <div class="row"><button data-act="reset">Reset to defaults</button><button data-act="close">Close</button></div>`;
  }

  el.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.pad !== undefined) {
      const b = structuredClone(devices.bindings);
      b.players[Number(t.dataset.pad)].pad.index = t.value === 'auto' ? 'auto' : Number(t.value);
      devices.setBindings(b);
    }
  });

  el.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.act === 'close') return close();
    if (t.dataset.act === 'reset') { devices.resetBindings(); return render(); }
    if (t.dataset.key) {
      const [i, a] = t.dataset.key.split(':');
      t.classList.add('wait');
      t.textContent = 'press a key…';
      devices.captureNextKey((code) => {
        if (code !== 'Escape') {
          const b = structuredClone(devices.bindings);
          b.players[Number(i)].keys[a] = code;
          devices.setBindings(b);
        }
        render();
      });
    }
    if (t.dataset.padbtn) {
      const [i, a] = t.dataset.padbtn.split(':');
      t.classList.add('wait');
      t.textContent = 'press a button…';
      const want = devices.bindings.players[Number(i)].pad.index;
      // On "Auto" any connected controller may answer. Buttons already held when the box was clicked don't count.
      const mine = () => devices.pads().filter((p) => want === 'auto' || p.index === want);
      const before = new Set();
      for (const p of mine()) p.buttons.forEach((bt, n) => bt.pressed && before.add(p.index + ':' + n));
      stopPadPoll();
      const poll = () => {
        for (const pad of mine()) {
          const n = pad.buttons.findIndex((bt, k) => bt.pressed && !before.has(pad.index + ':' + k));
          pad.buttons.forEach((bt, k) => { if (!bt.pressed) before.delete(pad.index + ':' + k); });
          if (n >= 0) {
            const b = structuredClone(devices.bindings);
            b.players[Number(i)].pad.buttons[a] = n;
            devices.setBindings(b);
            stopPadPoll();
            return render();
          }
        }
        padPoll = requestAnimationFrame(poll);
      };
      padPoll = requestAnimationFrame(poll);
    }
  });

  function close() {
    stopPadPoll();
    devices.cancelCapture();
    el.remove();
    onClose?.();
  }

  render();
  return { close };
}
