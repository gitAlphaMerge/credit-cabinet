// One particle engine for React loading screens and the standalone v2 preview.
export const PATTERN_ROWS = [
  ['B1r R0r Q3r B1k B1r D0k', 'D0r R0r T2p T0r D0k R0r', 'Q0r T1r Q1p Q2k Q0r B0r', 'B0p B0k T3k D0r B0k D0r', 'Q1p Q1r Q2r R0r Q3k Q3r', 'Q3r R0k Q0p B0r T1r D0p'],
  ['Q3r D0r T0r Q2r R0r B0k', '. T1r B0r Q1r D0p R0r', 'R0k Q3r D0r Q0r T1k B0r', 'T3r D0p R0r . B0k Q2r', 'Q3r Q1r R0r T1p D0r Q2k', 'B0r D0r . R0r T1r Q1r'],
];
const COLORS = {r: '#ef3124', p: '#f6a59f', k: '#151517'};
let referenceSamples;
/** Rasterize only the two trusted local SVG assets supplied by the user. */
function readReferenceSamples() {
  if (!referenceSamples) referenceSamples = Promise.all(['pattern-original.svg', 'pattern-alternate.svg'].map(name => new Promise(resolve => {
    const image = new Image();
    image.onload = () => {
      const mask = document.createElement('canvas'); mask.width = mask.height = 104;
      const context = mask.getContext('2d', {willReadFrequently: true});
      if (!context) { resolve([]); return; }
      context.drawImage(image, 0, 0, 104, 104);
      const pixels = context.getImageData(0, 0, 104, 104).data, samples = [];
      for (let y = 0; y < 104; y++) for (let x = 0; x < 104; x++) {
        const i = (y * 104 + x) * 4, r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
        if (pixels[i + 3] < 200 || (r > 220 && g > 210 && b > 210)) continue;
        const color = Math.max(r, g, b) < 130 ? COLORS.k : r > 170 && g < 120 ? COLORS.r : r > 190 && g < 210 ? COLORS.p : null;
        if (color) samples.push({x: (x + .5) / 104, y: (y + .5) / 104, color});
      }
      resolve(samples);
    };
    image.onerror = () => resolve([]);
    image.src = new URL('./img/' + name, import.meta.url).href;
  })));
  return referenceSamples;
}

/** Match each reference tile by testing its local, inverse-rotated coordinates. */
export function inShape(shape, rotation, x, y) {
  for (let n = 0; n < rotation; n++) [x, y] = [y, 1 - x];
  const d = Math.hypot(x - .5, y - .5);
  if (shape === 'D') return d < .34;
  if (shape === 'R') return d < .38 && d > .25;
  if (shape === 'B') return x > .18 && x < .82 && Math.abs(y - .5) < .085;
  if (shape === 'T') return x > y;
  if (shape === 'Q') return Math.hypot(x, y - 1) < 1;
  return false;
}

/** Deterministic target sampling bounds CPU/memory while keeping the dots tiny. */
export function particleTargets(width, height, compact = false, reference = null) {
  const size = compact ? Math.min(width * .55, height * 1.35) : Math.min(360, width * (width > 700 ? .36 : .8), height * .72);
  const panels = compact || width < 620 ? 1 : 2;
  const cells = size / 6;
  const spacing = Math.max(2.5, size / (compact ? 58 : 118));
  const positions = panels === 1 ? [(width - size) / 2] : [Math.max(16, width * .045), width - size - Math.max(16, width * .045)];
  const targets = [];
  positions.forEach((left, panel) => {
    const top = (height - size) / 2;
    if (reference?.[panel]?.length) {
      reference[panel].forEach((sample, index) => {
        if (compact && index % 3) return;
        targets.push({x: left + sample.x * size, y: top + sample.y * size, color: sample.color, seed: targets.length * 2.399963});
      });
      return;
    }
    const tokens = PATTERN_ROWS[panel].flatMap(row => row.split(' '));
    for (let yy = spacing / 2; yy < size; yy += spacing)
      for (let xx = spacing / 2; xx < size; xx += spacing) {
        const col = Math.min(5, Math.floor(xx / cells)), row = Math.min(5, Math.floor(yy / cells));
        const token = tokens[row * 6 + col];
        if (token !== '.' && inShape(token[0], Number(token[1]), (xx % cells) / cells, (yy % cells) / cells))
          targets.push({x: left + xx, y: top + yy, color: COLORS[token[2]], seed: targets.length * 2.399963});
      }
  });
  return targets;
}

/** A damped spring assembles each dot; gravity releases it during the fall phase. */
export function advanceParticle(p, dt, elapsed, pointer = null, reduced = false) {
  if (reduced) { p.x = p.tx; p.y = p.ty; p.vx = p.vy = 0; return; }
  dt = Math.min(.04, Math.max(0, dt));
  const phase = elapsed % 14;
  const falling = phase > 9.4 && phase < 10.8;
  const spring = falling ? .35 : 15;
  const gravity = falling ? 260 : 22;
  const tx = p.tx + Math.sin(elapsed * .65 + p.seed) * 2.4;
  const ty = p.ty + Math.cos(elapsed * .5 + p.seed) * 2.8;
  let ax = (tx - p.x) * spring, ay = (ty - p.y) * spring + gravity;
  if (pointer) {
    const dx = p.x - pointer.x, dy = p.y - pointer.y, d = Math.hypot(dx, dy);
    if (d < 105 && d > .5) { const force = (1 - d / 105) * 1150; ax += dx / d * force; ay += dy / d * force; }
  }
  const drag = Math.exp(-(falling ? 1.2 : 6.4) * dt);
  p.vx = (p.vx + ax * dt) * drag;
  p.vy = (p.vy + ay * dt) * drag;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
}

/** Own a single canvas/RAF, pause offscreen/background, and fully dispose on unmount. */
export function mountLoadingPattern(canvas, {compact = false} = {}) {
  const ctx = canvas.getContext('2d', {alpha: true});
  if (!ctx) return () => {};
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let particles = [], width = 0, height = 0, frame = 0, last = 0, elapsed = 0, visible = true, disposed = false, pointer = null, reference = null, ink = COLORS.k;
  const draw = () => {
    ctx.clearRect(0, 0, width, height);
    for (const color of Object.values(COLORS)) {
      ctx.fillStyle = color === COLORS.k ? ink : color;
      for (const p of particles) if (p.color === color) ctx.fillRect(p.x, p.y, compact ? .95 : 1.25, compact ? .95 : 1.25);
    }
  };
  const tick = time => {
    frame = 0;
    if (disposed || document.hidden || !visible || media.matches) return;
    const dt = last ? Math.min(.04, (time - last) / 1000) : .016;
    if (last && time - last < 30) { frame = requestAnimationFrame(tick); return; }
    last = time;
    elapsed += dt;
    for (const p of particles) advanceParticle(p, dt, elapsed, pointer);
    draw();
    frame = requestAnimationFrame(tick);
  };
  const sync = () => {
    cancelAnimationFrame(frame); frame = 0; last = 0;
    if (disposed) return;
    if (media.matches) { for (const p of particles) advanceParticle(p, 0, 0, null, true); draw(); }
    else if (visible && !document.hidden) frame = requestAnimationFrame(tick);
  };
  const resize = () => {
    const box = canvas.getBoundingClientRect();
    width = Math.max(1, box.width); height = Math.max(1, box.height);
    ink = getComputedStyle(canvas).color || COLORS.k;
    const dpr = Math.min(1.5, devicePixelRatio || 1);
    canvas.width = Math.ceil(width * dpr); canvas.height = Math.ceil(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    particles = particleTargets(width, height, compact, reference).map(t => ({...t, tx: t.x, ty: t.y, x: t.x + Math.sin(t.seed) * 70, y: t.y - 100 - (Math.cos(t.seed) + 1) * height * .3, vx: 0, vy: 0}));
    elapsed = 0; sync();
  };
  const move = event => { const box = canvas.getBoundingClientRect(); pointer = {x: event.clientX - box.left, y: event.clientY - box.top}; };
  const leave = () => { pointer = null; };
  const release = () => { elapsed = 9.5; sync(); };
  const host = canvas.parentElement;
  host?.addEventListener('pointermove', move, {passive: true});
  host?.addEventListener('pointerleave', leave);
  host?.addEventListener('loading-pattern-release', release);
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(canvas);
  const intersection = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
  intersection?.observe(canvas);
  media.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
  resize();
  readReferenceSamples().then(samples => { if (!disposed) { reference = samples; resize(); } });
  return () => {
    disposed = true; sync(); resizeObserver.disconnect(); intersection?.disconnect();
    host?.removeEventListener('pointermove', move); host?.removeEventListener('pointerleave', leave);
    host?.removeEventListener('loading-pattern-release', release);
    media.removeEventListener('change', sync); document.removeEventListener('visibilitychange', sync);
  };
}

// HTML module loading keeps the public asset usable by Vite dev and production.
if (typeof window !== 'undefined') {
  window.AlfaLoadingPattern = {mountLoadingPattern};
  window.dispatchEvent(new Event('alfa-loading-pattern-ready'));
}
