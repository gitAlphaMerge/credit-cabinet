import { useState } from "react";
import { Contrast } from "lucide-react";

// Экспериментальная палитра «Графит»: живёт отдельно от светлой/тёмной темы, ползунок темы не трогает.
export const paletteKey = "alfa-cabinet-palette";

function savedGraphite() {
  try {
    return window.localStorage.getItem(paletteKey) === "graphite";
  } catch {
    return false;
  }
}

function applyPalette(on: boolean) {
  const root = document.documentElement;
  if (on) root.setAttribute("data-palette", "graphite");
  else root.removeAttribute("data-palette");
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", on ? "#0e0f11" : "#ef3124");
}

if (typeof document !== "undefined" && typeof window !== "undefined" && savedGraphite())
  applyPalette(true);

export function PaletteToggle() {
  const [on, setOn] = useState(() => typeof window !== "undefined" && savedGraphite());
  return (
    <button
      type="button"
      className="palette-toggle"
      aria-label="Палитра «Графит»"
      title={on ? "Вернуть обычную палитру" : "Включить палитру «Графит»"}
      aria-pressed={on}
      onClick={() => {
        const next = !on;
        applyPalette(next);
        try {
          window.localStorage.setItem(paletteKey, next ? "graphite" : "");
        } catch {
          // Вкладка работает и без памяти браузера.
        }
        setOn(next);
      }}
    >
      <Contrast size={15} aria-hidden="true" />
    </button>
  );
}
