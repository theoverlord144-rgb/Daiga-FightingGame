// Draws a stage from its data file (data/stages/*.json): layers back to front, each sliding with the camera at its
// own parallax rate. The far layers' outlines (ridges, arches, railing) are worked out once, wide enough to cover the
// whole stage, and filled as shapes each frame: under the fight camera's zoom that is many times cheaper than
// enlarging a stored picture of them, and the edges stay sharp at any zoom. Drawing only: the stage never affects the game.

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
    let canvas = null, shapes = null;
    if (L.type === 'ridge' || L.type === 'arches' || L.type === 'railing') {
      if (typeof Path2D !== 'undefined') {
        // The outlines, kept as shapes. Each closed piece is its own path, so overlapping pieces never cancel out.
        shapes = [];
        const pen = { fillStyle: '', beginPath() { shapes.push(new Path2D()); }, moveTo: (x, y) => shapes.at(-1).moveTo(x, y), lineTo: (x, y) => shapes.at(-1).lineTo(x, y),
          arc: (...a) => shapes.at(-1).arc(...a), closePath: () => shapes.at(-1).closePath(), fill() {}, fillRect(x, y, w, h) { const p = new Path2D(); p.rect(x, y, w, h); shapes.push(p); } };
        paint(pen, L, width);
      } else {
        // No shapes here (a picture tool's plain canvas): the layer is painted once into its own canvas instead.
        canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = H;
        paint(canvas.getContext('2d'), L, width);
      }
    }
    return { L, par, travel, canvas, shapes };
  });

  function paint(c, L, width) {
    const base = GROUND; // heights are above the ground line
    c.fillStyle = L.color;
    if (L.type === 'ridge') {
      const h = ridgeHeights(width, L.roughness, L.seed);
      c.beginPath();
      c.moveTo(0, H * 2); // well below the screen, so the camera rising never shows its lower edge
      for (let x = 0; x < width; x += 2) c.lineTo(x, base - L.height - h[x] * L.variation);
      c.lineTo(width, H * 2);
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

  // Soft light is painted once into its own small canvas and stamped each frame (a gradient a frame is slow).
  const light = (size, stops) => {
    const c = document.createElement('canvas');
    c.width = c.height = size * 2;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(size, size, 0, size, size, size);
    for (const [at, col] of stops) grad.addColorStop(at, col);
    g.fillStyle = grad;
    g.fillRect(0, 0, size * 2, size * 2);
    return c;
  };
  for (const layer of layers) {
    const { L } = layer;
    if (L.type === 'torches') {
      layer.glow = light(L.radius, [[0, `${L.glow}88`], [0.35, `${L.glow}2e`], [1, `${L.glow}00`]]);
      layer.pool = light(L.radius, [[0, `${L.glow}3a`], [1, `${L.glow}00`]]);
    } else if (L.type === 'vignette') {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(W / 2, H * 0.55, H * L.inner, W / 2, H * 0.55, W * L.outer);
      grad.addColorStop(0, `${L.color}00`);
      grad.addColorStop(1, L.color);
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
      layer.shade = c;
    } else if (L.type === 'floor' && L.sheen) {
      layer.sheen = light(L.sheen.radius, [[0, `${L.sheen.color}66`], [1, `${L.sheen.color}00`]]);
    }
  }
  // Scattered things (stars, motes) get their places once, from the layer's seed: the same every time.
  for (const layer of layers) {
    const { L } = layer;
    if (L.type !== 'stars' && L.type !== 'motes') continue;
    const r = lcg(L.seed ?? 1);
    layer.dots = Array.from({ length: L.count }, () => ({ x: r(), y: r(), phase: r() * Math.PI * 2, size: r() < 0.25 ? 2 : 1, speed: 0.5 + r() }));
  }

  return {
    /** cam.x, cam.y in px (the fight renderer's camera). t: the frame count, for things that flicker or drift. */
    draw(ctx, cam, t = 0) {
      for (const { L, par, travel, canvas, shapes, dots, glow: glowImg, shade, sheen } of layers) {
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
          if (L.sheen) {
            // The low sun lying on the stone: a soft band of light on the floor under it.
            const sx = W / 2 + L.sheen.x - cam.x * (L.sheen.parallax ?? 0);
            const r = L.sheen.radius;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.drawImage(sheen, 0, r, r * 2, r, Math.round(sx - r), gy, r * 2, r * 0.35); // its lower half, flattened onto the floor
            ctx.restore();
          }
          // The floor is drawn last, over everything behind it, so it carries the braziers' pools of light (the
          // lower half of a glow, flattened) and the vignette's shade itself.
          for (const o of layers) {
            if (o.L.type === 'torches') {
              const T = o.L, width = W + o.travel * 2, pr = T.radius * 1.2;
              ctx.save();
              ctx.globalCompositeOperation = 'lighter';
              let n = 0;
              for (let x = T.offset ?? 0; x < width; x += T.spacing, n++) {
                const px = Math.round(x - cam.x * o.par - o.travel);
                if (px < -pr || px > W + pr) continue;
                ctx.globalAlpha = 0.82 + 0.1 * Math.sin(t * 0.21 + n * 1.7) + 0.08 * Math.sin(t * 0.47 + n * 2.9);
                ctx.drawImage(o.pool, 0, T.radius, T.radius * 2, T.radius, px - pr, gy, pr * 2, pr * 0.3);
              }
              ctx.restore();
            } else if (o.L.type === 'vignette' && gy < H) {
              ctx.globalAlpha = o.L.alpha;
              ctx.drawImage(o.shade, 0, gy, W, H - gy, 0, gy, W, H - gy);
              ctx.globalAlpha = 1;
            }
          }
        } else if (L.type === 'stars') {
          // Faint stars in the top of the sky, each twinkling at its own pace.
          const span = (GROUND + cam.y) * L.band;
          ctx.fillStyle = L.color;
          for (const d of dots) {
            ctx.globalAlpha = L.alpha * (1 - d.y) * (0.55 + 0.45 * Math.sin(t * 0.03 * d.speed + d.phase));
            ctx.fillRect(Math.round(d.x * W), Math.round(d.y * span), d.size, d.size);
          }
          ctx.globalAlpha = 1;
        } else if (L.type === 'torches') {
          // Braziers on posts along the railing: a flickering flame, its glow, and its light pooled on the floor.
          const gy = GROUND + cam.y;
          const width = W + travel * 2;
          let n = 0;
          for (let x = L.offset ?? 0; x < width; x += L.spacing, n++) {
            const px = Math.round(x + dx - travel);
            if (px < -L.radius || px > W + L.radius) continue;
            const top = gy - L.height;
            const flick = 0.82 + 0.1 * Math.sin(t * 0.21 + n * 1.7) + 0.08 * Math.sin(t * 0.47 + n * 2.9);
            ctx.fillStyle = L.color;
            ctx.fillRect(px - 3, top, 6, L.height); // post
            ctx.fillRect(px - 11, top - 5, 22, 7); // bowl
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const gr = L.radius * flick;
            ctx.drawImage(glowImg, px - gr, top - 12 - gr, gr * 2, gr * 2);
            ctx.restore();
            // The flame: two tongues that lean and stretch.
            const lean = 2.5 * Math.sin(t * 0.17 + n * 2.3);
            for (const [col, w, h] of [[L.flame, 7, 17 * flick], [L.core, 3.5, 9 * flick]]) {
              ctx.fillStyle = col;
              ctx.beginPath();
              ctx.moveTo(px - w, top - 5);
              ctx.quadraticCurveTo(px - w, top - 5 - h * 0.6, px + lean, top - 5 - h);
              ctx.quadraticCurveTo(px + w, top - 5 - h * 0.6, px + w, top - 5);
              ctx.closePath();
              ctx.fill();
            }
          }
        } else if (L.type === 'motes') {
          // Dust and embers adrift in the evening light: they rise slowly, sway and wrap around.
          const width = W + travel * 2;
          const tall = GROUND * L.band;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = L.color;
          for (const d of dots) {
            const x = (((d.x * width + t * L.drift * d.speed + dx) % width) + width) % width - travel;
            const y = GROUND + cam.y - ((((d.y * tall + t * L.rise * d.speed) % tall) + tall) % tall) + 6 * Math.sin(t * 0.02 * d.speed + d.phase);
            if (x < -4 || x > W + 4) continue;
            ctx.globalAlpha = L.alpha * (0.5 + 0.5 * Math.sin(t * 0.05 * d.speed + d.phase));
            ctx.fillRect(Math.round(x), Math.round(y), d.size, d.size);
          }
          ctx.restore();
        } else if (L.type === 'vignette') {
          // The edges of the screen fall into shadow, so the eye stays on the middle.
          const gy = Math.min(H, GROUND + cam.y);
          ctx.globalAlpha = L.alpha;
          ctx.drawImage(shade, 0, 0, W, gy, 0, 0, W, gy);
          ctx.globalAlpha = 1;
        } else if (shapes) {
          ctx.save();
          ctx.translate(Math.round(dx - travel), Math.round(dy));
          ctx.fillStyle = L.color;
          for (const p of shapes) ctx.fill(p);
          ctx.restore();
        } else if (canvas) {
          ctx.drawImage(canvas, Math.round(dx - travel), Math.round(dy));
        }
      }
    },
  };
}
