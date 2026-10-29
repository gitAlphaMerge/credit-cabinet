import { applyTheme, themeKey, type Theme } from "./ThemeToggle";

// Оформление = три независимые оси на <html>: data-theme (светлая/тёмная, ThemeToggle),
// data-palette (основа: поверхности и текст) и data-accent (цвет главных кнопок).
// Экраны читают только токены --theme-*, поэтому любое сочетание перекрашивает всё само.
export type Palette = "" | "graphite" | "blueprint" | "paper";
export type Accent = "" | "red" | "blue" | "mono" | "mint";

export const paletteKey = "alfa-cabinet-palette";
export const accentKey = "alfa-cabinet-accent";

export const PALETTES: { id: Palette; name: string }[] = [
  { id: "", name: "Альфа" },
  { id: "graphite", name: "Графит" },
  { id: "blueprint", name: "Чертёж" },
  { id: "paper", name: "Бумага" },
];

export const ACCENTS: { id: Accent; name: string }[] = [
  { id: "", name: "Авто" },
  { id: "red", name: "Красный" },
  { id: "blue", name: "Синий" },
  { id: "mono", name: "Моно" },
  { id: "mint", name: "Мята" },
];

// Цвета превью: фон, карточка, акцент по основе и режиму (дублируют palettes.css, нужны только кнопкам выбора).
export const SWATCH: Record<string, Record<Theme, [string, string, string]>> = {
  "": { light: ["#f3f4f5", "#ffffff", "#ef3124"], dark: ["#0b0b0c", "#161618", "#ef3124"] },
  graphite: { light: ["#eceef0", "#ffffff", "#1a1d21"], dark: ["#0e0f11", "#16181b", "#e4e7eb"] },
  blueprint: { light: ["#eaf2fb", "#f8fbff", "#0b57d0"], dark: ["#0a1a33", "#0f2447", "#5fd4ff"] },
  paper: { light: ["#f4efe6", "#fbf8f2", "#cf2a1c"], dark: ["#1f1c19", "#292521", "#f0594b"] },
};
export const ACCENT_SWATCH: Record<Exclude<Accent, "">, Record<Theme, string>> = {
  red: { light: "#ef3124", dark: "#ef3124" },
  blue: { light: "#0a5bd6", dark: "#6aa8ff" },
  mono: { light: "#1a1d21", dark: "#e4e7eb" },
  mint: { light: "#0d7a55", dark: "#5fd6a4" },
};

export type Preset = { name: string; mode: Theme; palette: Palette; accent: Accent };
// Заготовленные сочетания: основа + акцент + режим одним нажатием.
export const PRESETS: Preset[] = [
  { name: "Классика", mode: "dark", palette: "", accent: "" },
  { name: "Графит", mode: "dark", palette: "graphite", accent: "" },
  { name: "Белый графит", mode: "light", palette: "graphite", accent: "" },
  { name: "Графит и синий", mode: "dark", palette: "graphite", accent: "blue" },
  { name: "Чертёж", mode: "dark", palette: "blueprint", accent: "" },
  { name: "Калька", mode: "light", palette: "blueprint", accent: "" },
  { name: "Бумага", mode: "light", palette: "paper", accent: "" },
  { name: "Ночная бумага", mode: "dark", palette: "paper", accent: "" },
  { name: "Бумага и моно", mode: "light", palette: "paper", accent: "mono" },
  { name: "Чертёж и мята", mode: "dark", palette: "blueprint", accent: "mint" },
];

const palettes = new Set<string>(PALETTES.map((p) => p.id));
const accents = new Set<string>(ACCENTS.map((a) => a.id));

function read(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Вкладка работает и без памяти браузера.
  }
}

export function currentMode(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

export function currentPalette(): Palette {
  if (typeof document === "undefined") return "";
  const v = document.documentElement.getAttribute("data-palette") ?? "";
  return (palettes.has(v) ? v : "") as Palette;
}

export function currentAccent(): Accent {
  if (typeof document === "undefined") return "";
  const v = document.documentElement.getAttribute("data-accent") ?? "";
  return (accents.has(v) ? v : "") as Accent;
}

function setAttr(name: string, value: string) {
  const root = document.documentElement;
  if (value) root.setAttribute(name, value);
  else root.removeAttribute(name);
}

// На время смены цвета переходы выключены (тот же приём, что в ThemeToggle).
function withoutTransitions(change: () => void) {
  const root = document.documentElement;
  root.classList.add("theme-switching");
  change();
  requestAnimationFrame(() =>
    requestAnimationFrame(() => root.classList.remove("theme-switching")),
  );
}

export function setPalette(palette: Palette) {
  withoutTransitions(() => setAttr("data-palette", palette));
  write(paletteKey, palette);
}

export function setAccent(accent: Accent) {
  withoutTransitions(() => setAttr("data-accent", accent));
  write(accentKey, accent);
}

export function applyPreset(p: Preset) {
  withoutTransitions(() => {
    applyTheme(p.mode, document.documentElement, window.localStorage);
    setAttr("data-palette", p.palette);
    setAttr("data-accent", p.accent);
  });
  write(paletteKey, p.palette);
  write(accentKey, p.accent);
  // ThemeToggle слушает storage и подтягивает свою кнопку из сохранённого значения.
  try {
    window.dispatchEvent(new StorageEvent("storage", { key: themeKey }));
  } catch {
    // Кнопка темы обновится при следующем клике.
  }
}

// meta theme-color берётся из реального фона страницы, поэтому совпадает с любым сочетанием.
function syncThemeColor() {
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--theme-bg").trim();
  if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg);
}

function boot() {
  const palette = read(paletteKey);
  const accent = read(accentKey);
  setAttr("data-palette", palettes.has(palette) ? palette : "");
  setAttr("data-accent", accents.has(accent) ? accent : "");
  const watch = () => requestAnimationFrame(syncThemeColor);
  new MutationObserver(watch).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "data-palette", "data-accent"],
  });
  watch();
}

if (typeof document !== "undefined" && typeof window !== "undefined") boot();
