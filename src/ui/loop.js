// The fixed-timestep loop: the simulation steps at exactly 60 Hz no matter the monitor's refresh rate.
// An accumulator collects real time; each 1/60 s of it runs one core step. Drawing happens once per
// display frame and is handed `alpha` (how far we are toward the next step) for optional interpolation.

export function startLoop({ step, render, hz = 60, maxStepsPerFrame = 5, speed = () => 1 }) {
  const dt = 1000 / hz;
  let acc = 0;
  let last = performance.now();
  let raf = 0;
  let running = true;
  const stats = { fps: 0, sps: 0, stepMs: 0, drawMs: 0, drawMax: 0, _frames: 0, _steps: 0, _stepTime: 0, _drawTime: 0, _drawMax: 0, _since: last };

  function frame(now) {
    if (!running) return;
    // Clamp long pauses (tab hidden, breakpoint) so we never fast-forward through seconds of game.
    acc += Math.min(now - last, 250) * speed();
    last = now;
    let n = 0;
    while (acc >= dt && n < maxStepsPerFrame) {
      const t0 = performance.now();
      step();
      stats._stepTime += performance.now() - t0;
      acc -= dt;
      n++;
    }
    if (n === maxStepsPerFrame) acc = 0; // too slow to keep up: drop time instead of spiralling
    stats._steps += n;
    stats._frames++;
    const d0 = performance.now();
    render(acc / dt);
    const dd = performance.now() - d0;
    stats._drawTime += dd;
    if (dd > stats._drawMax) stats._drawMax = dd;
    if (now - stats._since >= 500) {
      const s = (now - stats._since) / 1000;
      stats.fps = Math.round(stats._frames / s);
      stats.sps = Math.round(stats._steps / s);
      stats.stepMs = stats._steps ? stats._stepTime / stats._steps : 0;
      stats.drawMs = stats._frames ? stats._drawTime / stats._frames : 0; // average time to draw a frame
      stats.drawMax = stats._drawMax; // slowest frame drawn in the last half second
      stats._frames = stats._steps = stats._stepTime = stats._drawTime = stats._drawMax = 0;
      stats._since = now;
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return {
    stats,
    stop() { running = false; cancelAnimationFrame(raf); },
  };
}
