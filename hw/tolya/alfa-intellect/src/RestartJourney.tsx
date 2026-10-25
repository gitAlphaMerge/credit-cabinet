import { useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { api } from "./api";
import { Button, Modal } from "./ui";

export function RestartJourney() {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  async function restart() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await api("/journey/restart", {});
      // Full navigation unmounts all forms, queues and cached decisions. No global storage clear.
      window.location.replace("/");
    } catch (e) {
      setError(visibleError(e));
      setBusy(false);
      lock.current = false;
    }
  }
  return (
    <>
      <Button
        secondary
        className="journey-restart-button"
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        <RotateCcw size={16} aria-hidden="true" /> Начать сначала
      </Button>
      {open && (
        <Modal
          title="Начать сначала?"
          onClose={() => {
            if (!lock.current) setOpen(false);
          }}
        >
          <p>
            Вы вернётесь на главную страницу и сможете пройти оформление заново,
            с пустой анкетой.
          </p>
          <p className="muted">
            Предыдущая заявка останется сохранённой отдельно. Её ответы и
            текущий этап не перенесутся в новый проход.
          </p>
          {error && (
            <p className="mvp-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <Button secondary disabled={busy} onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button disabled={busy} onClick={() => void restart()}>
              {busy ? "Начинаем заново…" : "Да, начать сначала"}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
import { visibleError } from "./application-client";
