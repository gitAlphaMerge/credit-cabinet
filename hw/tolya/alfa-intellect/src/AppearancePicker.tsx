import { useEffect, useRef, useState } from "react";
import { Palette as PaletteIcon } from "lucide-react";
import {
  ACCENTS,
  ACCENT_SWATCH,
  PALETTES,
  PRESETS,
  SWATCH,
  applyPreset,
  currentAccent,
  currentMode,
  currentPalette,
  setAccent,
  setPalette,
  type Accent,
  type Palette,
} from "./appearance";

type Snapshot = { mode: "light" | "dark"; palette: Palette; accent: Accent };

// Единственный источник правды — атрибуты на <html>: так обе копии пикера и кнопка темы всегда согласованы.
function useAppearance(): Snapshot {
  const read = (): Snapshot => ({
    mode: currentMode(),
    palette: currentPalette(),
    accent: currentAccent(),
  });
  const [snap, setSnap] = useState<Snapshot>(read);
  useEffect(() => {
    const sync = () => setSnap(read());
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-palette", "data-accent"],
    });
    return () => observer.disconnect();
  }, []);
  return snap;
}

const DEFAULT_ACCENT: Record<string, Record<"light" | "dark", string>> = {
  "": { light: "#ef3124", dark: "#ef3124" },
  graphite: { light: "#1a1d21", dark: "#e4e7eb" },
  blueprint: { light: "#0b57d0", dark: "#5fd4ff" },
  paper: { light: "#cf2a1c", dark: "#f0594b" },
};

function accentColor(palette: Palette, accent: Accent, mode: "light" | "dark") {
  return accent ? ACCENT_SWATCH[accent][mode] : DEFAULT_ACCENT[palette][mode];
}

function Mini({ palette, accent, mode }: Snapshot) {
  const [bg, surface] = SWATCH[palette][mode];
  return (
    <span className="ap-mini" style={{ background: bg, borderColor: surface }} aria-hidden="true">
      <span className="ap-mini-card" style={{ background: surface }} />
      <span className="ap-mini-dot" style={{ background: accentColor(palette, accent, mode) }} />
    </span>
  );
}

export function AppearanceBody() {
  const now = useAppearance();
  return (
    <div className="ap-body">
      <section>
        <h4>Основа</h4>
        <div className="ap-bases" role="group" aria-label="Основа">
          {PALETTES.map((p) => (
            <button
              key={p.id || "alfa"}
              type="button"
              className="ap-base"
              aria-pressed={now.palette === p.id}
              onClick={() => setPalette(p.id)}
            >
              <Mini {...now} palette={p.id} />
              <span>{p.name}</span>
            </button>
          ))}
        </div>
      </section>
      <section>
        <h4>Акцент</h4>
        <div className="ap-accents" role="group" aria-label="Акцент">
          {ACCENTS.map((a) => (
            <button
              key={a.id || "auto"}
              type="button"
              className="ap-accent"
              aria-pressed={now.accent === a.id}
              onClick={() => setAccent(a.id)}
            >
              <i style={{ background: accentColor(now.palette, a.id, now.mode) }} aria-hidden="true" />
              {a.name}
            </button>
          ))}
        </div>
      </section>
      <section>
        <h4>Готовые сочетания</h4>
        <div className="ap-presets" role="group" aria-label="Готовые сочетания">
          {PRESETS.map((p) => {
            const active = now.mode === p.mode && now.palette === p.palette && now.accent === p.accent;
            return (
              <button
                key={p.name}
                type="button"
                className="ap-preset"
                aria-pressed={active}
                onClick={() => applyPreset(p)}
              >
                <Mini mode={p.mode} palette={p.palette} accent={p.accent} />
                <span>{p.name}</span>
              </button>
            );
          })}
        </div>
      </section>
      <p className="ap-note">Светлая и тёмная — круглая кнопка рядом. Всё сочетается со всем.</p>
    </div>
  );
}

// Кнопка в боковой пилюле: открывает окошко с основой, акцентом и готовыми сочетаниями.
export function AppearancePicker() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <div className="ap-wrap" ref={box}>
      <button
        type="button"
        className="ap-toggle"
        aria-label="Оформление"
        aria-expanded={open}
        title="Основа, акцент и сочетания"
        onClick={() => setOpen((v) => !v)}
      >
        <PaletteIcon size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="ap-pop" role="dialog" aria-label="Оформление">
          <AppearanceBody />
        </div>
      )}
    </div>
  );
}
