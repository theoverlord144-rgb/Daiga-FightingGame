// The Training menu (F2): dummy settings. Saved in this browser.

import { ensurePanelCss } from '../controls-panel.js';
import { OPTIONS, defaultSettings } from './training.js';

const KEY = 'toska.training.v1';
const LABEL = {
  stance: 'Dummy stance',
  block: 'Dummy blocks',
  blockGuard: 'Block height',
  tech: 'Air recovery',
  refill: 'Health refill',
  position: 'Start position (R)',
};

export function loadTrainingSettings() {
  const s = defaultSettings();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    for (const k of Object.keys(s)) if (OPTIONS[k].includes(saved[k])) s[k] = saved[k];
  } catch { /* no storage: defaults */ }
  return s;
}

function save(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* no storage */ }
}

export function openTrainingPanel(root, settings, onClose) {
  ensurePanelCss();
  const el = document.createElement('div');
  el.className = 'tk-panel';
  el.style.maxWidth = '520px';
  el.style.bottom = 'auto'; // as tall as its content
  el.innerHTML = `
    <h2>Training</h2>
    <p>Changes apply right away. F2 or Esc closes. R resets to the start position.</p>
    <table>${Object.keys(OPTIONS).map((k) => `
      <tr><td>${LABEL[k]}</td><td><select data-k="${k}">${OPTIONS[k].map((o) =>
        `<option${o === settings[k] ? ' selected' : ''}>${o}</option>`).join('')}</select></td></tr>`).join('')}
    </table>
    <p style="margin-top:14px">F6 records the dummy: your Player 1 controls drive it until you press F6 again.
      F7 plays the recording back on a loop, mirrored if the dummy has switched sides.</p>
    <div class="row"><button data-act="defaults">Defaults</button><button data-act="close">Close</button></div>`;
  root.append(el);
  el.addEventListener('change', (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    settings[k] = e.target.value;
    save(settings);
  });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.act === 'close') close();
    if (b.dataset.act === 'defaults') {
      Object.assign(settings, defaultSettings());
      save(settings);
      for (const s of el.querySelectorAll('select')) s.value = settings[s.dataset.k];
    }
  });
  function close() {
    el.remove();
    onClose?.();
  }
  return { close };
}
