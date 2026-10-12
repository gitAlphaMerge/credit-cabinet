// Живой узор в hero: плитки 6×6 собираются в предметы бизнеса и обратно в узор.
// Сцена = 6 строк по 6 плиток. Плитка = фигура, поворот (0–3, шаг 90° по часовой, можно не писать), цвет, фон (по умолчанию w).
// Фигуры: F квадрат, Q четверть круга (Q2 скругляет левый верхний угол предмета, Q3 правый верхний,
// Q1 левый нижний, Q0 правый нижний), H полукруг (H0 купол вверх, H2 фестон вниз), T треугольник,
// D круг, R кольцо, B палочка (B1 вертикальная), . пусто.
// Цвета: a красный, s бледно-розовый, p лососевый, k почти-чёрный, g зелёный, n серый, w белый.
(function () {
  const COLORS = { a: '#ef3124', s: '#fbe8e7', p: '#f7a39c', k: '#0b0b0c', g: '#13a463', n: '#e9e9eb', w: '#ffffff' };
  const SHAPES = {
    F: 'M0 0H64V64H0Z',
    Q: 'M0 0H64A64 64 0 0 1 0 64Z',
    H: 'M0 64A32 32 0 0 1 64 64Z',
    T: 'M0 0H64V64Z',
    D: 'M10 32a22 22 0 1 0 44 0a22 22 0 1 0 -44 0Z',
    R: 'M8 32a24 24 0 1 0 48 0a24 24 0 1 0 -48 0ZM16 32a16 16 0 1 1 32 0a16 16 0 1 1 -32 0Z',
    B: 'M14 26H50A6 6 0 0 1 50 38H14A6 6 0 0 1 14 26Z',
    '.': ''
  };

  // Предметы взяты под гипотезу о целевой аудитории; когда кастдев её уточнит, меняется только этот список.
  const SCENES = [
    { name: '', hold: 2200, rows: [
      'B1aw R0as Q3an B1kw B1as D0kw',
      'D0aw R0aw T2ps T0an D0kw R0as',
      'H0as T1aw Q1ps Q2kn H0aw B0aw',
      'B0pw B0kw T3ks D0as B0kw D0aw',
      'Q1ps Q1pw Q2as R0an Q3kn H3aw',
      'H3aw R0kw H0as B0aw T1aw D0ps'] },
    { name: 'Магазин у дома', rows: [
      'Q2a Fa Fa Fa Fa Q3a',
      'H2a H2p H2a H2p H2a H2p',
      'Fs Fs Fs Fs Fs Fs',
      'Fs Fn Fn Fs Fk Fs',
      'Fs Fn Fn Fs Fk Fs',
      'Fs Fs Fs Fs Fk Fs'] },
    { name: 'Кофейня', rows: [
      '. . B1p . B1p .',
      '. B1p . B1p . .',
      '. Fa Fa Fa Fa .',
      '. Fa Fa Fa Fa R0a',
      '. Q1a Fa Fa Q0a .',
      '. B0k B0k B0k B0k .'] },
    { name: 'Грузоперевозки', rows: [
      '. . . . . .',
      'Fa Fa Fa Fa . .',
      'Fa Fa Fa Fa Q2k T2k',
      'Fa Fa Fa Fa Fk Fk',
      '. D0k . . D0k .',
      'B0n B0n B0n B0n B0n B0n'] },
    { name: 'Селлер на маркетплейсе', rows: [
      '. . . . . D0g',
      'Q2a Fa Fa Fa Fa Q3a',
      '. Fs Fs Fs Fs .',
      '. Fs Fs B0a Fs .',
      '. Q1s Fs Fs Q0s .',
      '. . . . . .'] },
    { name: 'Больше после одного шага', rows: [
      '. . . . H0g .',
      '. . H0a . Fa .',
      'H0p . Fa . Fa .',
      'Fp . Fa . Fa .',
      'Fp . Fa . Fa .',
      'Fp . Fa . Fa .'] }
  ];

  function parse(tok) {
    if (tok === '.') return { s: '.', r: 0, c: 'w', b: 'w' };
    // поворот можно не писать: «Fa» = «F0a»
    if (!/\d/.test(tok[1])) tok = tok[0] + '0' + tok.slice(1);
    return { s: tok[0], r: +tok[1], c: tok[2], b: tok[3] || 'w' };
  }
  const grids = SCENES.map(sc => sc.rows.flatMap(row => row.trim().split(/\s+/).map(parse)));

  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  };
  // 1.016: соседние фигуры заходят друг на друга на полпикселя, иначе между квадратами видны волоски
  const shapeTf = (r, k) => `translate(32 32) scale(${k * 1.016}) rotate(${r * 90}) translate(-32 -32)`;

  function mount(box) {
    // фоны плиток отдельным слоем под фигурами: так фон соседа не перекрывает край фигуры
    const svg = el('svg', { viewBox: '0 0 384 384', 'aria-hidden': 'true' });
    const bgLayer = el('g', {}), shLayer = el('g', {});
    svg.append(bgLayer, shLayer);
    const tiles = grids[0].map((t, i) => {
      const x = (i % 6) * 64, y = Math.floor(i / 6) * 64;
      const bg = el('rect', { x, y, width: 64, height: 64, fill: COLORS[t.b] });
      bg.style.transition = 'fill .5s ease';
      bgLayer.append(bg);
      const g = el('g', { transform: `translate(${x} ${y})` });
      const sh = el('path', { d: SHAPES[t.s], fill: COLORS[t.c], 'fill-rule': 'evenodd', transform: shapeTf(t.r, 1) });
      g.append(sh);
      shLayer.append(g);
      return { bg, sh, cur: t, row: Math.floor(i / 6), col: i % 6 };
    });
    // подпись под карточкой, а не поверх: поверх она закрывает нижний ряд предмета
    const cap = document.createElement('p');
    cap.className = 'lp-cap';
    cap.textContent = ' ';
    box.replaceChildren(svg);
    box.after(cap);
    return { tiles, cap };
  }

  function tween(ms, delay, fn, done) {
    const t0 = performance.now() + delay;
    function step(now) {
      const p = Math.min(1, Math.max(0, (now - t0) / ms));
      fn(p);
      if (p < 1) requestAnimationFrame(step); else if (done) done();
    }
    requestAnimationFrame(step);
  }
  const easeIn = p => p * p * p;
  const easeBack = p => { const c = 1.7; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };

  function show(view, idx) {
    const next = grids[idx];
    view.tiles.forEach((t, i) => {
      const n = next[i], c = t.cur;
      const delay = (t.row + t.col) * 45;
      if (n.b !== c.b) setTimeout(() => t.bg.setAttribute('fill', COLORS[n.b]), delay + 120);
      if (n.s === c.s && n.r === c.r && n.c === c.c) { t.cur = n; return; }
      tween(200, delay, p => t.sh.setAttribute('transform', shapeTf(c.r, 1 - easeIn(p))), () => {
        t.sh.setAttribute('d', SHAPES[n.s]);
        t.sh.setAttribute('fill', COLORS[n.c]);
        tween(420, 0, p => t.sh.setAttribute('transform', shapeTf(n.r, easeBack(p))));
      });
      t.cur = n;
    });
    const name = SCENES[idx].name;
    view.cap.classList.toggle('on', !!name);
    if (name) view.cap.textContent = name;
  }

  function start(box) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const view = mount(box);
    let idx = 0, timer = null, visible = true;
    const tick = () => {
      timer = null;
      if (!visible || document.hidden) return;
      idx = (idx + 1) % SCENES.length;
      show(view, idx);
      timer = setTimeout(tick, SCENES[idx].hold || 2800);
    };
    const resume = () => { if (!timer && visible && !document.hidden) timer = setTimeout(tick, 900); };
    new IntersectionObserver(es => { visible = es[0].isIntersecting; resume(); }).observe(box);
    document.addEventListener('visibilitychange', resume);
    timer = setTimeout(tick, SCENES[0].hold);
  }

  document.querySelectorAll('[data-live-pattern]').forEach(start);
})();
