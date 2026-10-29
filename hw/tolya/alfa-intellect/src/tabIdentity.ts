import { COLORS, SHAPES } from "./LivePattern";
import { ALPHA_PATH, OMEGA_PATH, BRAND_BASE, BRAND_NAME, identityPhase } from "./brand-identity";
const FRAME_MS = 200, STEP_MS = 700, SIZE = 64;
const SEQ = ["Q", "D", "H", "T", "F", "R"] as const;
const CELLS = [[4,4],[32,4],[4,32],[32,32]] as const;
type Tone = {bg:string;ink:string;accent:string};
let stopIdentity: (() => void) | undefined;
function plate(ctx: CanvasRenderingContext2D, color: string) {
  ctx.clearRect(0,0,SIZE,SIZE);ctx.fillStyle=color;
  ctx.beginPath();ctx.roundRect(0,0,SIZE,SIZE,15);ctx.fill();
}
function drawPattern(ctx: CanvasRenderingContext2D, elapsed: number, tone: Tone) {
  plate(ctx,tone.bg);
  const step=Math.floor(elapsed/STEP_MS), progress=Math.min(1,(elapsed%STEP_MS)/STEP_MS*2.4);
  const ease=progress<.5 ? 2*progress*progress : 1-Math.pow(-2*progress+2,2)/2;
  const tints=[tone.accent,tone.ink,COLORS.p,COLORS.a];
  CELLS.forEach(([x,y],i)=>{
    ctx.save();ctx.translate(x+14,y+14);ctx.rotate(Math.PI/2*ease);
    const scale=28/64*(.82+.18*Math.sin(Math.PI*ease));ctx.scale(scale,scale);ctx.translate(-32,-32);
    ctx.fillStyle=tints[(step+i)%tints.length];ctx.fill(new Path2D(SHAPES[SEQ[(step+i)%SEQ.length]]),"evenodd");ctx.restore();
  });
}
function drawMark(ctx: CanvasRenderingContext2D, phase: "pair"|"alpha"|"omega", tone: Tone) {
  plate(ctx,tone.bg);ctx.save();ctx.lineCap="round";ctx.lineJoin="round";ctx.lineWidth=4.2;
  if(phase==="pair"){
    ctx.translate(2,13);ctx.scale(.86,.86);ctx.strokeStyle=tone.accent;ctx.stroke(new Path2D(ALPHA_PATH));
    ctx.strokeStyle=tone.ink;ctx.stroke(new Path2D(OMEGA_PATH));ctx.lineWidth=2.5;ctx.strokeStyle=tone.accent;ctx.stroke(new Path2D(BRAND_BASE));
  }else if(phase==="alpha"){
    ctx.translate(8,0);ctx.scale(1.45,1.45);ctx.strokeStyle=tone.accent;ctx.stroke(new Path2D(ALPHA_PATH));ctx.lineWidth=2.5;ctx.stroke(new Path2D("M5 40h22"));
  }else{
    ctx.translate(-42,0);ctx.scale(1.45,1.45);ctx.strokeStyle=tone.ink;ctx.stroke(new Path2D(OMEGA_PATH));ctx.lineWidth=2.5;ctx.strokeStyle=tone.accent;ctx.stroke(new Path2D("M38 40h26"));
  }
  ctx.restore();
}
export function startTabIdentity() {
  stopIdentity?.();document.title=BRAND_NAME;
  try {
    const canvas=document.createElement("canvas");canvas.width=canvas.height=SIZE;
    const ctx=canvas.getContext("2d");if(!ctx||typeof ctx.roundRect!=="function")return;
    let link=document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if(!link){link=document.createElement("link");link.rel="icon";document.head.appendChild(link);}
    link.type="image/png";
    const target=link, media=window.matchMedia("(prefers-reduced-motion: reduce)"), started=performance.now();
    let timer:ReturnType<typeof setInterval>|undefined, lastKey="",revision=0;
    let tone:Tone={bg:"#16181b",ink:"#eceef1",accent:"#ef3124"};
    const render=()=>{
      if(document.hidden)return;
      const elapsed=media.matches?0:performance.now()-started, phase=media.matches?"pair":identityPhase(elapsed);
      const key=revision+":"+phase+":"+(phase==="pattern"?Math.floor(elapsed/FRAME_MS):0);
      if(key===lastKey)return;lastKey=key;
      if(phase==="pattern")drawPattern(ctx,elapsed,tone);else drawMark(ctx,phase,tone);
      target.href=canvas.toDataURL("image/png");
    };
    const updateTone=()=>{
      const style=getComputedStyle(document.documentElement);
      tone={bg:style.getPropertyValue("--theme-bg").trim()||"#16181b",ink:style.getPropertyValue("--theme-ink").trim()||"#eceef1",accent:style.getPropertyValue("--theme-red").trim()||"#ef3124"};revision++;render();
    };
    const schedule=()=>{
      if(timer!==undefined){clearInterval(timer);timer=undefined;}lastKey="";render();
      if(!document.hidden&&!media.matches)timer=setInterval(render,FRAME_MS);
    };
    const observer=new MutationObserver(updateTone);
    observer.observe(document.documentElement,{attributes:true,attributeFilter:["data-theme","data-palette","data-accent"]});
    document.addEventListener("visibilitychange",schedule);media.addEventListener("change",schedule);
    updateTone();schedule();
    stopIdentity=()=>{if(timer!==undefined)clearInterval(timer);observer.disconnect();document.removeEventListener("visibilitychange",schedule);media.removeEventListener("change",schedule);};
    return stopIdentity;
  }catch{
    // Keep the static SVG fallback if canvas icons are unavailable.
  }
}
if(import.meta.hot)import.meta.hot.dispose(()=>stopIdentity?.());
