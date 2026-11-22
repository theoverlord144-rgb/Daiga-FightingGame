// Draws a stage from its data file (data/stages/*.json): layers back to front, each sliding with the camera at its
// own parallax rate. Far layers are painted once into an offscreen canvas wide enough to cover the whole stage;
// after that a frame is a handful of drawImage calls. Drawing only: the stage never affects the game.

function lcg(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** Smooth 1D value noise in 0..1, `n` control points across the width. */
function ridgeHeights(width, n, seed) {
  const r = lcg(seed);
  const pts = Array.from({ length: n + 2 }, () => r());
  const out = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    const t = (x / width) * n;
    const i = Math.floor(t);
    const f = t - i;
    const s = f * f * (3 - 2 * f);
    out[x] = pts[i] * (1 - s) + pts[i + 1] * s;
  }
  return out;
}

export function createStageRenderer(stage, W, H, GROUND, halfWidth) {
  // Each scrolling layer gets a canvas as wide as the screen plus the distance it can travel.
  const layers = stage.layers.map((L) => {
    const par = L.parallax ?? 0;
    const travel = Math.ceil(halfWidth * par) + 40;
    const width = W + travel * 2;
    let canvas = null;
    if (L.type === 'ridge' || L.type === 'arches' || L.type === 'railing') {
      canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = H;
      paint(canvas.getContext('2d'), L, width);
    }
    return { L, par, travel, canvas };
  });

  function paint(c, L, width) {
    const base = GROUND; // the layer canvas is screen-high; heights are above the ground line
    c.fillStyle = L.color;
    if (L.type === 'ridge') {
      const h = ridgeHeights(width, L.roughness, L.seed);
      c.beginPath();
      c.moveTo(0, H);
      for (let x = 0; x < width; x += 2) c.lineTo(x, base - L.height - h[x] * L.variation);
      c.lineTo(width, H);
      c.closePath();
      c.fill();
    } else if (L.type === 'arches') {
      const r = lcg(L.seed);
      for (let x = 20; x < width; x += L.spacing) {
        const broken = r() < L.broken;
        const top = base - L.height;
        const w = L.width;
        const t = L.thickness;
        c.fillRect(x, top, t, L.height); // left column
        c.fillRect(x + w - t, top + (broken ? L.height * 0.45 : 0), t, L.height * (broken ? 0.55 : 1)); // right column
        if (!broken) {
          c.beginPath(); // the arch
          c.arc(x + w / 2, top, w / 2, Math.PI, 0);
          c.arc(x + w / 2, top, w / 2 - t, 0, Math.PI, true);
          c.closePath();
          c.fill();
        }
        c.fillRect(x - 6, base - 10, w + 12, 10); // plinth
      }
    } else if (L.type === 'railing') {
      const top = base - L.height;
      c.fillRect(0, top, width, 6);
      c.fillRect(0, top + L.height * 0.55, width, 4);
      for (let x = 0; x < width; x += L.postSpacing) c.fillRect(x, top, 8, L.height);
    }
  }

  return {
    /** cam.x, cam.y in px (the fight renderer's camera). */
    draw(ctx, cam) {
      for (const { L, par, travel, canvas } of layers) {
        const dx = -cam.x * par;
        const dy = cam.y * par;
        if (L.type === 'sky') {
          const g = ctx.createLinearGradient(0, 0, 0, GROUND + cam.y);
          for (const [at, col] of L.stops) g.addColorStop(at, col);
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, W, H);
        } else if (L.type === 'sun') {
          const x = W / 2 + L.x + dx;
          const y = GROUND - L.height + dy;
          const glow = ctx.createRadialGradient(x, y, L.radius * 0.6, x, y, L.radius * 3.2);
          glow.addColorStop(0, `${L.glow}aa`);
          glow.addColorStop(1, `${L.glow}00`);
          ctx.fillStyle = glow;
          ctx.fillRect(x - L.radius * 3.2, y - L.radius * 3.2, L.radius * 6.4, L.radius * 6.4);
          ctx.fillStyle = L.color;
          ctx.beginPath();
          ctx.arc(x, y, L.radius, 0, Math.PI * 2);
          ctx.fill();
        } else if (L.type === 'haze') {
          const y = GROUND - L.height + cam.y * 0.3;
          const g = ctx.createLinearGradient(0, y - L.thickness, 0, y + L.thickness);
          g.addColorStop(0, `${L.color}00`);
          g.addColorStop(0.5, L.color);
          g.addColorStop(1, `${L.color}00`);
          ctx.globalAlpha = L.alpha;
          ctx.fillStyle = g;
          ctx.fillRect(0, y - L.thickness, W, L.thickness * 2);
          ctx.globalAlpha = 1;
        } else if (L.type === 'floor') {
          const gy = GROUND + cam.y;
          const g = ctx.createLinearGradient(0, gy, 0, H);
          g.addColorStop(0, L.top);
          g.addColorStop(1, L.bottom);
          ctx.fillStyle = g;
          ctx.fillRect(0, gy, W, H - gy);
          // Tile seams that fan out toward the viewer.
          ctx.strokeStyle = L.line;
          ctx.lineWidth = 1;
          ctx.globalAlpha = 0.5;
          ctx.beginPath();
          const off = (((-cam.x) % L.tile) + L.tile) % L.tile;
          for (let x = off - L.tile * 4; x < W + L.tile * 4; x += L.tile) {
            ctx.moveTo(x, gy);
            ctx.lineTo(W / 2 + (x - W / 2) * 1.8, H);
          }
          for (const f of [0.25, 0.55]) { ctx.moveTo(0, gy + (H - gy) * f); ctx.lineTo(W, gy + (H - gy) * f); }
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.fillStyle = L.line;
          ctx.fillRect(0, gy - 1, W, 2);
        } else if (canvas) {
          ctx.drawImage(canvas, Math.round(dx - travel), Math.round(dy));
        }
      }
    },
  };
}
