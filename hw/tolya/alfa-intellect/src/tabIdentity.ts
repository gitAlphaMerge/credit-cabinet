import { COLORS, SHAPES } from "./LivePattern";

// Вкладка браузера: долго живёт анимированный знак, на секунду-другую
// выходит буква «А» — сначала графитовая, затем синяя из темы. Заголовок меняется синхронно.
const LOGO_MS = 5200;
const LETTER_MS = 1400;
const CYCLE_MS = LOGO_MS + LETTER_MS * 2;
const FRAME_MS = 160;
const STEP_MS = 700;
const SIZE = 64;

const TITLE_LONG = "Умный кредитный кабинет";
const TITLE_SHORT = "УКК";

const GRAPHITE = { bg: "#16181b", ink: "#eceef1", bar: "#7d8590" };
const BLUE = { bg: "#172335", ink: "#8db4e6", bar: "#5b97e6" };

const SEQ = ["Q", "D", "H", "T", "F", "R"] as const;
const TINTS = [COLORS.a, "#5b97e6", "#e9e9eb", COLORS.p];
const CELLS = [
  [4, 4],
  [32, 4],
  [4, 32],
  [32, 32],
] as const;
const CELL = 28;

type Phase = "logo" | "graphite" | "blue";

function phaseAt(t: number): Phase {
  const m = t % CYCLE_MS;
  if (m < LOGO_MS) return "logo";
  return m < LOGO_MS + LETTER_MS ? "graphite" : "blue";
}

function ease(x: number) {
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

function plate(ctx: CanvasRenderingContext2D, color: string) {
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(0, 0, SIZE, SIZE, 15);
  ctx.fill();
}

function drawLogo(ctx: CanvasRenderingContext2D, t: number) {
  plate(ctx, "#0e0f11");
  const step = Math.floor(t / STEP_MS);
  const k = ease(Math.min(1, ((t % STEP_MS) / STEP_MS) * 2.4));
  CELLS.forEach(([x, y], i) => {
    const n = step + i;
    const path = SHAPES[SEQ[n % SEQ.length]];
    ctx.save();
    ctx.translate(x + CELL / 2, y + CELL / 2);
    ctx.rotate((Math.PI / 2) * k);
    const s = (CELL / 64) * (0.82 + 0.18 * Math.sin(Math.PI * k));
    ctx.scale(s, s);
    ctx.translate(-32, -32);
    ctx.fillStyle = TINTS[n % TINTS.length];
    ctx.fill(new Path2D(path), "evenodd");
    ctx.restore();
  });
}

function drawLetter(ctx: CanvasRenderingContext2D, tone: typeof BLUE) {
  plate(ctx, tone.bg);
  ctx.fillStyle = tone.ink;
  ctx.font = "800 46px Manrope, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("А", SIZE / 2, 46);
  ctx.fillStyle = tone.bar;
  ctx.fillRect(18, 51, 28, 5);
}

function iconLink() {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.type = "image/png";
  return link;
}

export function startTabIdentity() {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx || typeof ctx.roundRect !== "function") return;
    const link = iconLink();
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t0 = performance.now();
    let lastKey = "";
    const render = () => {
      const t = still ? 0 : performance.now() - t0;
      const phase = phaseAt(t);
      const frame = phase === "logo" ? Math.floor(t / FRAME_MS) : 0;
      const key = phase + ":" + (phase === "logo" ? frame : Math.floor(t / CYCLE_MS));
      if (key === lastKey) return;
      lastKey = key;
      if (phase === "logo") drawLogo(ctx, t % CYCLE_MS);
      else drawLetter(ctx, phase === "graphite" ? GRAPHITE : BLUE);
      link.href = canvas.toDataURL("image/png");
      document.title = phase === "logo" ? TITLE_LONG : TITLE_SHORT;
    };
    render();
    if (!still) window.setInterval(render, FRAME_MS);
  } catch {
    // вкладка остаётся со статичным favicon.svg и заголовком из index.html
  }
}
