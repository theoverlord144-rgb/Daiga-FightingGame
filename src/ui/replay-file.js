// Saving and opening replay files in the browser.

export function downloadReplay(file, name = 'toska-replay') {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name}-${stamp}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Calls onFile(parsedJson) when a file is dropped anywhere on the page. */
export function onDroppedJSON(onFile, onError) {
  addEventListener('dragover', (e) => e.preventDefault());
  addEventListener('drop', async (e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    try { onFile(JSON.parse(await f.text())); } catch (err) { onError(err); }
  });
}

/** A visible "Open replay..." button (a file picker), for people who'd rather click than drag. */
export function openButton(root, onFile, onError) {
  const label = document.createElement('label');
  label.style.cssText = 'position:absolute;left:50%;top:62%;transform:translateX(-50%);padding:8px 16px;border:1px solid #3a3347;'
    + 'border-radius:6px;background:#262131;color:#e8e2d4;font:14px system-ui;cursor:pointer';
  label.textContent = 'Open replay…';
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.style.display = 'none';
  input.addEventListener('change', async () => {
    const f = input.files?.[0];
    if (!f) return;
    try { onFile(JSON.parse(await f.text())); } catch (err) { onError(err); }
    input.value = '';
  });
  label.append(input);
  root.append(label);
  return label;
}
