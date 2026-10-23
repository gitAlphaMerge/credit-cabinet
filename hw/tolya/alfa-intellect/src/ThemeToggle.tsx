import { useEffect, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";

export type Theme = "light" | "dark";
export const themeKey = "alfa-cabinet-theme";
type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;

export function storedTheme(storage: StorageReader): Theme | null {
  try {
    const value = storage.getItem(themeKey);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

export function applyTheme(
  theme: Theme,
  root: Pick<HTMLElement, "setAttribute">,
  storage?: StorageWriter,
) {
  root.setAttribute("data-theme", theme);
  try {
    storage?.setItem(themeKey, theme);
  } catch {
    // The current tab still works when the browser denies storage.
  }
}

function browserPreference(): Theme | null {
  try {
    return storedTheme(window.localStorage);
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function initialTheme(): Theme {
  return browserPreference() ?? systemTheme();
}

// Runs before React paints, including the loading and public screens.
if (typeof document !== "undefined")
  applyTheme(initialTheme(), document.documentElement);

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const manual = useRef(browserPreference() !== null);
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const update = () => {
      if (manual.current) return;
      const next = systemTheme();
      applyTheme(next, document.documentElement);
      setTheme(next);
    };
    const sync = (event: StorageEvent) => {
      if (event.key !== themeKey && event.key !== null) return;
      const saved = browserPreference();
      manual.current = saved !== null;
      const next = saved ?? systemTheme();
      applyTheme(next, document.documentElement);
      setTheme(next);
    };
    update();
    media?.addEventListener("change", update);
    window.addEventListener("storage", sync);
    return () => {
      media?.removeEventListener("change", update);
      window.removeEventListener("storage", sync);
    };
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    manual.current = true;
    applyTheme(next, document.documentElement);
    try {
      window.localStorage.setItem(themeKey, next);
    } catch {
      // Accessing localStorage itself can throw, not just setItem.
    }
    setTheme(next);
  }

  return (
    <button
      type="button"
      className="icon-button theme-toggle"
      aria-label="Тёмная тема"
      title={theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}
      aria-pressed={theme === "dark"}
      onClick={toggle}
    >
      {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
    </button>
  );
}
