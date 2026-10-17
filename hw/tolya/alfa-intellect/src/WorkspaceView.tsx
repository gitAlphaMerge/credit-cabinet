import { useEffect, useRef, useState } from "react";
import { PanelRightOpen } from "lucide-react";
import { useWorkspace } from "./context";
import { Cabinet } from "./Cabinet";
import { Chat } from "./Chat";
import { Button } from "./ui";
import type { AppState } from "../shared/types";
import { panelSplit } from "./panel-layout";
export function WorkspaceView({
  preview,
  tour = -1,
}: {
  preview?: AppState;
  tour?: number;
}) {
  const w = useWorkspace(),
    root = useRef<HTMLDivElement>(null),
    dragging = useRef(false),
    ratio = useRef(w.state.preferences.split);
  const [narrow, setNarrow] = useState(() => innerWidth < 1100),
    [mobileTab, setMobileTab] = useState("credit"),
    [availableWidth, setAvailableWidth] = useState(innerWidth - 40);
  const split = panelSplit(availableWidth, w.state.preferences.split),
    visible = w.chatVisible;
  useEffect(() => {
    if (!root.current) return;
    const observer = new ResizeObserver((entries) =>
      setAvailableWidth(entries[0].contentRect.width),
    );
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const media = matchMedia("(max-width:1099px)");
    const update = () => setNarrow(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    return () => document.body.classList.remove("resizing-panels");
  }, []);
  useEffect(() => {
    if (tour >= 0) {
      w.setChatVisible(true);
      setMobileTab(tour === 3 ? "chat" : "credit");
    }
  }, [tour]);
  function change(value: number) {
    const width = root.current?.clientWidth || innerWidth;
    const n = panelSplit(width, value);
    ratio.current = n;
    w.setSplit(n);
  }
  async function save() {
    try {
      await w.act("/preferences", { split: ratio.current }, "PATCH");
    } catch {}
  }
  return (
    <main className="cabinet-page work-page">
      <div className="work-toolbar">
        <div>
          <h1>Кредитный кабинет</h1>
          <span>Сводка, платежи и денежный прогноз</span>
        </div>
        {narrow ? (
          <div className="segmented mobile-work-tabs">
            <button
              className={mobileTab === "credit" ? "active" : ""}
              onClick={() => setMobileTab("credit")}
            >
              Кабинет
            </button>
            <button
              className={mobileTab === "chat" ? "active" : ""}
              onClick={() => {
                w.setChatVisible(true);
                setMobileTab("chat");
              }}
            >
              Чат
            </button>
          </div>
        ) : (
          !visible && (
            <Button secondary onClick={() => w.setChatVisible(true)}>
              <PanelRightOpen size={17} /> Показать чат
            </Button>
          )
        )}
      </div>
      <div
        ref={root}
        className={
          "split-workspace " +
          (!visible ? "credit-only" : "") +
          (narrow ? " narrow" : "")
        }
        style={
          !narrow && visible
            ? {
                gridTemplateColumns: `minmax(0,${split}fr) 14px minmax(0,${100 - split}fr)`,
              }
            : { gridTemplateColumns: "minmax(0,1fr)" }
        }
      >
        {(!narrow || mobileTab === "credit" || !visible) && (
          <div className="cabinet-scroll">
            <Cabinet preview={preview} />
          </div>
        )}
        {!narrow && visible && (
          <div
            className="splitter"
            role="separator"
            aria-label="Изменить ширину кабинета и чата"
            aria-orientation="vertical"
            aria-valuemin={40}
            aria-valuemax={75}
            aria-valuenow={Math.round(split)}
            tabIndex={0}
            onPointerDown={(e) => {
              dragging.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              document.body.classList.add("resizing-panels");
            }}
            onPointerMove={(e) => {
              if (dragging.current && root.current) {
                const r = root.current.getBoundingClientRect();
                change(((e.clientX - r.left) / r.width) * 100);
              }
            }}
            onPointerUp={() => {
              if (dragging.current) {
                dragging.current = false;
                document.body.classList.remove("resizing-panels");
                void save();
              }
            }}
            onPointerCancel={() => {
              dragging.current = false;
              document.body.classList.remove("resizing-panels");
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                change(split + (e.key === "ArrowLeft" ? -2 : 2));
              }
              if (e.key === "Home") {
                e.preventDefault();
                change(40);
              }
              if (e.key === "End") {
                e.preventDefault();
                change(75);
              }
            }}
            onBlur={() => void save()}
          >
            <span />
          </div>
        )}
        {visible && (!narrow || mobileTab === "chat") && (
          <div className="split-chat">
            <Chat
              onHide={() => {
                w.setChatVisible(false);
                setMobileTab("credit");
              }}
            />
          </div>
        )}
      </div>
    </main>
  );
}
