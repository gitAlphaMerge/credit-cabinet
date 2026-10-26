import { useEffect, useState } from "react";
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

function initialTheme(): Theme {
  return browserPreference() ?? "dark";
}

// Runs before React paints, including the loading and public screens.
if (typeof document !== "undefined")
  applyTheme(initialTheme(), document.documentElement);

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== themeKey && event.key !== null) return;
      const saved = browserPreference();
      const next = saved ?? "dark";
      applyTheme(next, document.documentElement);
      setTheme(next);
    };
    applyTheme(initialTheme(), document.documentElement);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("storage", sync);
    };
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    // На время смены темы переходы цветов выключены: иначе сотни элементов анимируют фон разом и экран лагает.
    const root = document.documentElement;
    root.classList?.add("theme-switching");
    applyTheme(next, root);
    if (typeof requestAnimationFrame === "function")
      requestAnimationFrame(() =>
        requestAnimationFrame(() => root.classList?.remove("theme-switching")),
      );
    else root.classList?.remove("theme-switching");
    try {
      window.localStorage.setItem(themeKey, next);
    } catch {
      // Accessing localStorage itself can throw, not just setItem.
    }
    setTheme(next);
  }

  // Круглая кнопка в пилюле: солнце и луна сменяют друг друга поворотом.
  return (
    <button
      type="button"
      className="theme-toggle theme-orb"
      aria-label="Тёмная тема"
      title={
        theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"
      }
      aria-pressed={theme === "dark"}
      onClick={toggle}
    >
      <Sun size={16} className="theme-orb-sun" aria-hidden="true" />
      <Moon size={16} className="theme-orb-moon" aria-hidden="true" />
    </button>
  );
}
