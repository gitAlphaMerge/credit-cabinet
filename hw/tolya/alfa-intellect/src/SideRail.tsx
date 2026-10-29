import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ThemeToggle } from "./ThemeToggle";
import { SoundToggle } from "./SoundToggle";
import { AppearancePicker } from "./AppearancePicker";

// Служебные кнопки экрана (тема, палитра, сброс, связь) живут в боковой пилюле, а не в шапке.
export function SideRail({ children }: { children?: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <aside className="side-rail" aria-label="Настройки экрана" data-ai-static>
      <span className="side-rail-item" data-tip="Светлая или тёмная тема">
        <ThemeToggle />
      </span>
      <span className="side-rail-item" data-tip="Оформление: основа и акцент">
        <AppearancePicker />
      </span>
      <span className="side-rail-item" data-tip="Звуки интерфейса"><SoundToggle /></span>
      {children}
    </aside>,
    document.body,
  );
}

export function SideRailItem({ tip, children }: { tip: string; children: ReactNode }) {
  return (
    <span className="side-rail-item" data-tip={tip}>
      {children}
    </span>
  );
}
