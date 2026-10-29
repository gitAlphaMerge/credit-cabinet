import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";

export function OmegaMark({ size = 24 }: { size?: number }) {
  return <svg className="omega-mark" width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M5 26h8v-4a10 10 0 1 1 6 0v4h8" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

type Recognition = {
  lang: string; interimResults: boolean; continuous: boolean;
  start(): void; stop(): void; abort(): void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
};
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };

// Recognition only writes to the draft. It never sends a message or uploads audio to our API.
export function OmegaMicrophone({ onText, disabled = false }: { onText(text: string): void; disabled?: boolean }) {
  const [listening, setListening] = useState(false), [notice, setNotice] = useState("");
  const recognition = useRef<Recognition | null>(null), callback = useRef(onText);
  callback.current = onText;
  useEffect(() => () => {
    const current = recognition.current;
    if (current) { current.onresult = null; current.onend = null; current.onerror = null; current.abort(); }
  }, []);
  useEffect(() => { if (disabled) recognition.current?.stop(); }, [disabled]);
  function toggle() {
    if (recognition.current) { recognition.current.stop(); return; }
    const speech = window as SpeechWindow;
    const Constructor = speech.SpeechRecognition || speech.webkitSpeechRecognition;
    if (!Constructor) { setNotice("Голосовой ввод недоступен в этом браузере. Напишите сообщение."); return; }
    const current = new Constructor();
    current.lang = "ru-RU"; current.interimResults = false; current.continuous = false;
    current.onresult = event => {
      const text = Array.from(event.results).map(result => result[0]?.transcript || "").join(" ").trim();
      if (text) { callback.current(text); setNotice("Текст в черновике. Проверьте перед отправкой."); }
    };
    current.onerror = event => setNotice(event.error === "not-allowed" ? "Нет доступа к микрофону. Разрешите его в настройках браузера или напишите сообщение." : "Не удалось распознать речь. Попробуйте ещё раз или напишите сообщение.");
    current.onend = () => { recognition.current = null; setListening(false); };
    recognition.current = current;
    try { current.start(); setListening(true); setNotice("Слушаю. Речь распознаёт браузер, сообщение останется в черновике."); }
    catch { recognition.current = null; setListening(false); setNotice("Не удалось включить микрофон."); }
  }
  return <span className="omega-voice">
    {listening && <span className="omega-wave" aria-hidden="true">{[0,1,2,3,4,5].map(i => <i key={i} style={{animationDelay: `${i * .09}s`}}/>)}</span>}
    <button type="button" className="omega-mic" aria-label={listening ? "Остановить голосовой ввод" : "Голосовой ввод"} aria-pressed={listening} title="Голосом в черновик" disabled={disabled} onClick={toggle}>{listening ? <Square size={17}/> : <Mic size={20}/>}</button>
    {notice && <span className="omega-voice-notice" role="status">{notice}</span>}
  </span>;
}
