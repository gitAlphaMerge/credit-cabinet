import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { soundsEnabled, setSoundsEnabled, activateUiSound } from "./ui-sounds";
export function SoundToggle() {
  const [enabled, setEnabled] = useState(soundsEnabled);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const sync = () => setEnabled(soundsEnabled());
    window.addEventListener("alfa-sounds-preference", sync);
    window.addEventListener("storage", sync);
    return () => {window.removeEventListener("alfa-sounds-preference", sync); window.removeEventListener("storage", sync);};
  }, []);
  return <span className="sound-toggle-container" style={{position:"relative",display:"inline-flex"}}><button className="sound-toggle" type="button" aria-label="Звуки интерфейса" title={enabled ? "Выключить звуки" : "Включить звуки"} aria-pressed={enabled} data-sound-silent onClick={() => {
    const next=!enabled;setSoundsEnabled(next);setBlocked(false);
    if(next) void activateUiSound("toggle").then(ok=>setBlocked(!ok));
  }}>{enabled ? <Volume2 size={16}/> : <VolumeX size={16}/>}</button>{blocked&&<span className="sound-blocked-note" role="status" style={{position:"absolute",left:"calc(100% + 14px)",bottom:0,width:240,maxWidth:"calc(100vw - 85px)",padding:12,border:"1px solid var(--theme-line)",borderRadius:12,background:"var(--theme-surface)",color:"var(--theme-ink)",fontSize:12,lineHeight:1.5,textAlign:"left",zIndex:2}}>Браузер не запустил звук. Проверьте, не заглушена ли вкладка.</span>}</span>;
}
