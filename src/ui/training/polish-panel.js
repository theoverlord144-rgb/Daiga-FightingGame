// The polish panel (training mode, key P): a live on / off switch for every look-only polish item in
// data/system/polish.json, so each can be compared in motion. It sits in a corner and does not pause or block the
// game. The switches only change drawing; the choice is remembered in this browser.
import { POLISH, POLISH_ITEMS, setPolish, setAllPolish } from '../../render/polish.js';

const PART = { 1: 'Sprites', 3: 'Engine polish', 4: 'Snap timing' };

export function openPolishPanel(root, onClose) {
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;top:8px;right:8px;z-index:20;background:#0b0910e6;border:1px solid #3a3347;border-radius:6px;padding:10px 12px;font:12px system-ui,sans-serif;color:#e8e2d4;max-width:300px;pointer-events:auto';
  const render = () => {
    let html = '<div style="font-weight:700;margin-bottom:6px">Polish (look only) · P closes</div>';
    let part = -1;
    for (const i of POLISH_ITEMS) {
      if (i.part !== part) { part = i.part; html += `<div style="margin:6px 0 2px;color:#a99fb8">${PART[part] ?? 'Other'}</div>`; }
      html += `<label style="display:block;cursor:pointer;line-height:1.5"><input type="checkbox" data-k="${i.key}"${POLISH[i.key].on ? ' checked' : ''}> ${i.label}</label>`;
    }
    html += '<div style="margin-top:8px;display:flex;gap:6px"><button data-all="1">All on</button><button data-all="0">All off (baseline look)</button><button data-all="default">Defaults</button></div>';
    html += '<div style="margin-top:6px;color:#a99fb8">Frame data shown by the meter (F8) is the real data either way.</div>';
    el.innerHTML = html;
  };
  render();
  root.append(el);
  el.addEventListener('change', (e) => { const k = e.target.dataset.k; if (k) setPolish(k, e.target.checked); });
  el.addEventListener('click', (e) => {
    const all = e.target.dataset?.all;
    if (all === undefined) return;
    setAllPolish(all === 'default' ? 'default' : all === '1');
    render();
  });
  // Keys typed while a box has the focus must still reach the game.
  el.addEventListener('mouseup', () => document.activeElement?.blur?.());
  return { close() { el.remove(); onClose?.(); } };
}
