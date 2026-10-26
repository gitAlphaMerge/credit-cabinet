import { useEffect, useRef, type CSSProperties } from "react";
import { useReveal } from "./motion";

// Данные сцен и геометрия: services/frontend/live-pattern.js.
export const COLORS = {
  a: "#ef3124",
  s: "#fbe8e7",
  p: "#8fbdf7",
  k: "#0b0b0c",
  g: "#0072ef",
  n: "#e9e9eb",
  w: "#ffffff",
};
export const SHAPES = {
  F: "M0 0H64V64H0Z",
  Q: "M0 0H64A64 64 0 0 1 0 64Z",
  H: "M0 64A32 32 0 0 1 64 64Z",
  T: "M0 0H64V64Z",
  D: "M10 32a22 22 0 1 0 44 0a22 22 0 1 0 -44 0Z",
  R: "M8 32a24 24 0 1 0 48 0a24 24 0 1 0 -48 0ZM16 32a16 16 0 1 1 32 0a16 16 0 1 1 -32 0Z",
  B: "M14 26H50A6 6 0 0 1 50 38H14A6 6 0 0 1 14 26Z",
  ".": "",
};

// Предметы взяты под гипотезу о целевой аудитории; когда кастдев её уточнит, меняется только этот список.
export const SCENES: readonly {
  name: string;
  hold?: number;
  rows: readonly string[];
}[] = [
  {
    name: "",
    hold: 2200,
    rows: [
      "B1aw R0as Q3an B1kw B1as D0kw",
      "D0aw R0aw T2ps T0an D0kw R0as",
      "H0as T1aw Q1ps Q2kn H0aw B0aw",
      "B0pw B0kw T3ks D0as B0kw D0aw",
      "Q1ps Q1pw Q2as R0an Q3kn H3aw",
      "H3aw R0kw H0as B0aw T1aw D0ps",
    ],
  },
  {
    name: "Магазин у дома",
    rows: [
      "Q2a Fa Fa Fa Fa Q3a",
      "H2a H2p H2a H2p H2a H2p",
      "Fs Fs Fs Fs Fs Fs",
      "Fs Fn Fn Fs Fk Fs",
      "Fs Fn Fn Fs Fk Fs",
      "Fs Fs Fs Fs Fk Fs",
    ],
  },
  {
    name: "Кофейня",
    rows: [
      ". . B1p . B1p .",
      ". B1p . B1p . .",
      ". Fa Fa Fa Fa .",
      ". Fa Fa Fa Fa R0a",
      ". Q1a Fa Fa Q0a .",
      ". B0k B0k B0k B0k .",
    ],
  },
  {
    name: "Грузоперевозки",
    rows: [
      ". . . . . .",
      "Fa Fa Fa Fa . .",
      "Fa Fa Fa Fa Q2k T2k",
      "Fa Fa Fa Fa Fk Fk",
      ". D0k . . D0k .",
      "B0n B0n B0n B0n B0n B0n",
    ],
  },
  {
    name: "Селлер на маркетплейсе",
    rows: [
      ". . . . . D0g",
      "Q2a Fa Fa Fa Fa Q3a",
      ". Fs Fs Fs Fs .",
      ". Fs Fs B0a Fs .",
      ". Q1s Fs Fs Q0s .",
      ". . . . . .",
    ],
  },
  {
    name: "Больше после одного шага",
    rows: [
      ". . . . H0g .",
      ". . H0a . Fa .",
      "H0p . Fa . Fa .",
      "Fp . Fa . Fa .",
      "Fp . Fa . Fa .",
      "Fp . Fa . Fa .",
    ],
  },
] as const;

type Tile = {
  s: keyof typeof SHAPES;
  r: number;
  c: keyof typeof COLORS;
  b: keyof typeof COLORS;
};
function parse(token: string): Tile {
  if (token === ".") return { s: ".", r: 0, c: "w", b: "w" };
  if (!/\d/.test(token[1])) token = token[0] + "0" + token.slice(1);
  return {
    s: token[0] as Tile["s"],
    r: +token[1],
    c: token[2] as Tile["c"],
    b: (token[3] || "w") as Tile["b"],
  };
}
const grids = SCENES.map((scene) =>
  scene.rows.flatMap((row) => row.trim().split(/\s+/).map(parse)),
);
const fill = (color: Tile["c"]) =>
  color === "a"
    ? "var(--red, #ef3124)"
    : color === "w"
      ? "var(--surface, #ffffff)"
      : COLORS[color];
const shapeTf = (rotation: number, scale: number) =>
  `translate(32 32) scale(${scale * 1.016}) rotate(${rotation * 90}) translate(-32 -32)`;
const clamp = (p: number) => Math.max(0, Math.min(1, p));
const easeIn = (p: number) => p * p * p;
const easeBack = (p: number) =>
  1 + 2.7 * Math.pow(p - 1, 3) + 1.7 * Math.pow(p - 1, 2);
// CSS ease = cubic-bezier(.25,.1,.25,1), как у фонов в оригинале.
function ease(p: number) {
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 16; i++) {
    const t = (lo + hi) / 2;
    const x = 3 * (1 - t) ** 2 * t * 0.25 + 3 * (1 - t) * t * t * 0.25 + t ** 3;
    if (x < p) lo = t;
    else hi = t;
  }
  const t = (lo + hi) / 2;
  return 3 * (1 - t) ** 2 * t * 0.1 + 3 * (1 - t) * t * t + t ** 3;
}
function blend(from: Tile["b"], to: Tile["b"], progress: number) {
  const a = COLORS[from],
    b = COLORS[to],
    p = ease(progress);
  return `rgb(${[1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - p) + parseInt(b.slice(i, i + 2), 16) * p)).join(", ")})`;
}

// Один таймер смены сцены и один RAF только на время перехода.
// При паузе сохраняем и выдержку сцены, и время внутри перехода.
export function animateLivePattern(
  svg: SVGSVGElement,
  caption: HTMLParagraphElement,
  showCaption = true,
) {
  const backgrounds = Array.from(svg.querySelectorAll("rect"));
  const shapes = Array.from(svg.querySelectorAll("path"));
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  const now = () => window.performance.now();
  let index = 0,
    visible = true,
    running = false,
    disposed = false;
  let timer: number | null = null,
    frame: number | null = null;
  let remaining = 2200,
    deadline = 0,
    pausedAt = now();
  let transition: { from: Tile[]; to: Tile[]; start: number } | null = null;
  function captionScene() {
    const name = showCaption ? SCENES[index].name : "";
    caption.classList.toggle("on", !!name);
    caption.textContent = name || " ";
  }
  function renderStatic() {
    grids[0].forEach((t, i) => {
      backgrounds[i].setAttribute("fill", fill(t.b));
      shapes[i].setAttribute("d", SHAPES[t.s]);
      shapes[i].setAttribute("fill", fill(t.c));
      shapes[i].setAttribute("transform", shapeTf(t.r, 1));
    });
    index = 0;
    transition = null;
    remaining = SCENES[0].hold || 2200;
    captionScene();
  }
  function paint() {
    frame = null;
    if (!running || document.hidden || media.matches || !transition) return;
    const elapsed = now() - transition.start;
    transition.to.forEach((n, i) => {
      const c = transition!.from[i];
      const local = elapsed - (Math.floor(i / 6) + (i % 6)) * 45;
      if (n.b !== c.b && local >= 120) {
        const p = clamp((local - 120) / 500);
        backgrounds[i].setAttribute(
          "fill",
          p === 1 ? fill(n.b) : blend(c.b, n.b, p),
        );
      }
      if (n.s === c.s && n.r === c.r && n.c === c.c) return;
      if (local < 200) {
        shapes[i].setAttribute(
          "transform",
          shapeTf(c.r, 1 - easeIn(clamp(local / 200))),
        );
      } else {
        shapes[i].setAttribute("d", SHAPES[n.s]);
        shapes[i].setAttribute("fill", fill(n.c));
        shapes[i].setAttribute(
          "transform",
          shapeTf(n.r, easeBack(clamp((local - 200) / 420))),
        );
      }
    });
    if (elapsed < 1070) frame = window.requestAnimationFrame(paint);
    else transition = null;
  }
  function schedule() {
    deadline = now() + remaining;
    timer = window.setTimeout(tick, remaining);
  }
  function tick() {
    timer = null;
    if (!running || document.hidden || media.matches) {
      sync();
      return;
    }
    const previous = index;
    index = (index + 1) % SCENES.length;
    transition = { from: grids[previous], to: grids[index], start: now() };
    captionScene();
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(paint);
    remaining = SCENES[index].hold || 2800;
    schedule();
  }
  function sync() {
    const active = !disposed && visible && !document.hidden && !media.matches;
    if (running && !active) {
      remaining = Math.max(0, deadline - now());
      pausedAt = now();
      running = false;
      if (timer !== null) window.clearTimeout(timer);
      if (frame !== null) window.cancelAnimationFrame(frame);
      timer = frame = null;
    }
    if (media.matches) renderStatic();
    if (!running && active) {
      if (transition) transition.start += now() - pausedAt;
      running = true;
      schedule();
      if (transition) frame = window.requestAnimationFrame(paint);
    }
  }
  const observer =
    typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(([entry]) => {
          visible = entry.isIntersecting;
          sync();
        });
  observer?.observe(svg);
  document.addEventListener("visibilitychange", sync);
  media.addEventListener("change", sync);
  sync();
  return () => {
    disposed = true;
    sync();
    observer?.disconnect();
    document.removeEventListener("visibilitychange", sync);
    media.removeEventListener("change", sync);
  };
}

export function LivePattern({
  showCaption = true,
}: { showCaption?: boolean } = {}) {
  const svg = useRef<SVGSVGElement>(null);
  const caption = useRef<HTMLParagraphElement>(null);
  const reveal = useReveal<HTMLDivElement>();
  useEffect(() => {
    if (svg.current && caption.current)
      return animateLivePattern(svg.current, caption.current, showCaption);
  }, [showCaption]);
  return (
    <div
      className="live-pattern"
      aria-label="Живой узор: магазин, кофейня, грузоперевозки и развитие бизнеса"
    >
      <div ref={reveal.ref} className={"live-pattern-box " + reveal.className}>
        <svg ref={svg} viewBox="0 0 384 384" aria-hidden="true">
          <g>
            {grids[0].map((t, i) => (
              <rect
                key={i}
                x={(i % 6) * 64}
                y={Math.floor(i / 6) * 64}
                width="64"
                height="64"
                fill={fill(t.b)}
              />
            ))}
          </g>
          <g>
            {grids[0].map((t, i) => (
              <g
                key={i}
                data-lp-tile={i}
                style={{ "--ai-t": i } as CSSProperties}
                transform={`translate(${(i % 6) * 64} ${Math.floor(i / 6) * 64})`}
              >
                <path
                  d={SHAPES[t.s]}
                  fill={fill(t.c)}
                  fillRule="evenodd"
                  transform={shapeTf(t.r, 1)}
                />
              </g>
            ))}
          </g>
        </svg>
      </div>
      <p
        ref={caption}
        className="live-pattern-caption"
        style={showCaption ? undefined : { display: "none" }}
        aria-hidden={!showCaption}
        aria-live="off"
      >
        {" "}
      </p>
    </div>
  );
}
