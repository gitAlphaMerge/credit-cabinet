import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Info, X } from "lucide-react";

export function useAnchoredPosition(anchor: HTMLElement | null, open: boolean) {
  const panel = useRef<HTMLDivElement>(null),
    [position, setPosition] = useState({ top: 80, left: 16 });
  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const measure = () => {
      const a = anchor.getBoundingClientRect(),
        p = panel.current?.getBoundingClientRect(),
        width = p?.width || 360,
        height = p?.height || 300;
      const below = innerHeight - a.bottom - 12,
        above = a.top - 12;
      const top =
        below >= height
          ? a.bottom + 8
          : above >= height
            ? a.top - height - 8
            : Math.max(12, Math.min(a.bottom + 8, innerHeight - height - 12));
      setPosition({
        top: Math.max(12, top),
        left: Math.max(12, Math.min(a.right - width, innerWidth - width - 12)),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (panel.current) observer.observe(panel.current);
    addEventListener("resize", measure);
    addEventListener("scroll", measure, true);
    return () => {
      observer.disconnect();
      removeEventListener("resize", measure);
      removeEventListener("scroll", measure, true);
    };
  }, [anchor, open]);
  return { panel, position };
}

/** Hover/focus for desktop; tap pins the same explanation on touch screens. */
export function ContextHelp({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const trigger = useRef<HTMLButtonElement>(null),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    id = useId();
  const [open, setOpen] = useState(false),
    [pinned, setPinned] = useState(false),
    { panel, position } = useAnchoredPosition(trigger.current, open);
  const cancel = () => clearTimeout(timer.current);
  const close = () => {
    cancel();
    setOpen(false);
    setPinned(false);
  };
  const leave = () => {
    cancel();
    if (!pinned) timer.current = setTimeout(() => setOpen(false), 180);
  };
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
        if (
          !trigger.current?.contains(e.target as Node) &&
          !panel.current?.contains(e.target as Node)
        )
          close();
      },
      escape = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          close();
        }
      };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      cancel();
    };
  }, [open]);
  return (
    <span className="context-help">
      <button
        ref={trigger}
        type="button"
        className="context-help-trigger"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") {
            cancel();
            setOpen(true);
          }
        }}
        onPointerLeave={leave}
        onFocus={() => {
          cancel();
          setOpen(true);
        }}
        onBlur={leave}
        onClick={() => {
          cancel();
          if (pinned) close();
          else {
            setOpen(true);
            setPinned(true);
          }
        }}
      >
        <Info size={16} />
      </button>
      {open &&
        createPortal(
          <div
            id={id}
            ref={panel}
            style={position}
            className="context-help-panel"
            role="tooltip"
            onPointerEnter={cancel}
            onPointerLeave={leave}
          >
            <h3>{label.replace(/^О показателе: /, "")}</h3>
            {children}
            <small className="context-help-hint">
              Нажмите значок, чтобы закрепить · Esc — закрыть
            </small>
          </div>,
          document.body,
        )}
    </span>
  );
}

export function AnchoredPanel({
  anchor,
  title,
  children,
  onClose,
}: {
  anchor: HTMLElement | null;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const { panel, position } = useAnchoredPosition(anchor, true);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current
      ?.querySelector<HTMLButtonElement>("button")
      ?.focus({ preventScroll: true });
    const outside = (e: PointerEvent) => {
        if (
          !panel.current?.contains(e.target as Node) &&
          !anchor?.contains(e.target as Node)
        )
          onClose();
      },
      escape = (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
      };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      previous?.isConnected && previous.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <div
      ref={panel}
      className="anchored-calendar"
      role="dialog"
      aria-label={title}
      style={position}
    >
      <header>
        <h2>{title}</h2>
        <button aria-label="Закрыть календарь" onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      {children}
    </div>,
    document.body,
  );
}
