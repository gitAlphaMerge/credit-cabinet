import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { useReducedMotion } from "./motion";

export function ProductAssembly({ variant = "agents", paused = false, controls = true }: {variant?: "agents" | "pulse"; paused?: boolean; controls?: boolean}) {
  const canvas = useRef<HTMLCanvasElement>(null), [stopped,setStopped] = useState(false), reduced = useReducedMotion();
  const control = useRef({paused:false,reduced:false}), sync = useRef<()=>void>(()=>{});
  control.current = {paused:paused || stopped,reduced};
  useEffect(()=>sync.current(),[paused,stopped,reduced]);
  useEffect(()=>{
    const node=canvas.current, ctx=node?.getContext("2d");if(!node||!ctx)return;
    let width=400,height=220,frame=0,last=0,elapsed=0,visible=true;
    let colors=["#ef3124","#171923","#a4a9b1"];
    const pieces=Array.from({length:72},(_,i)=>({x:(i*79%400),y:(i*37%220),vx:0,vy:0,angle:i*.31}));
    const target=(i:number)=>{
      const version=Math.floor(elapsed/4600)%3, part=i%36, side=i<36?-1:1;
      if(variant==="pulse"){
        const row=Math.floor(i/12),col=i%12;
        return {x:width*(.1+col*.067)+Math.sin(row+elapsed/1300)*12,y:height*(.16+row*.13)+(version===1?Math.sin(col*.8)*18:version===2?(col%3)*7:0)};
      }
      const center=width*(side<0?.29:.72),angle=part/36*Math.PI*1.8+Math.PI*.6;
      if(version===2)return{x:center+Math.cos(angle)*width*.19,y:height*.45+Math.sin(angle)*height*.31};
      if(side<0){const edge=part%3,t=Math.floor(part/3)/11;return{x:center+(edge===0?(t-.5)*width*.3:edge===1?(-.5+t*.5)*width*.3:(t*.5)*width*.3),y:height*(edge===0?.58:edge===1?.78-t*.6:.18+t*.6)};}
      return{x:center+Math.cos(angle)*(version===1?width*.2:width*.16),y:height*.45+Math.sin(angle)*height*.3};
    };
    const draw=(now:number)=>{
      if(now-last<33){frame=requestAnimationFrame(draw);return;}last=now;
      const moving=!control.current.paused&&!control.current.reduced; if(moving)elapsed+=33;
      ctx.clearRect(0,0,width,height);
      pieces.forEach((piece,i)=>{
        const goal=target(i);
        if(control.current.reduced){piece.x=goal.x;piece.y=goal.y;}
        else if(moving){
          // Attraction never settles: gravity and a rotating field keep recombining the parts.
          piece.vx=(piece.vx+(goal.x-piece.x)*.006+Math.sin(elapsed/800+i)*.13)*.94;
          piece.vy=(piece.vy+(goal.y-piece.y)*.006+.095+Math.cos(elapsed/1100+i)*.11)*.94;
          piece.x+=piece.vx;piece.y+=piece.vy;piece.angle+=piece.vx*.008;
        }
        ctx.save();ctx.translate(piece.x,piece.y);ctx.rotate(piece.angle);ctx.fillStyle=colors[i%3];
        const size=variant==="pulse"?5+i%5:6+i%8;ctx.beginPath();
        if(i%4===0){ctx.arc(0,0,size/2,0,Math.PI*2);ctx.fill();}
        else if(i%4===1){ctx.moveTo(-size/2,size/2);ctx.lineTo(size/2,size/2);ctx.lineTo(size/2,-size/2);ctx.closePath();ctx.fill();}
        else if(i%4===2){ctx.lineWidth=2;ctx.strokeStyle=colors[i%3];ctx.arc(0,0,size/2,0,Math.PI*2);ctx.stroke();}
        else{ctx.roundRect(-size/2,-size/2,size,size,2);ctx.fill();}ctx.restore();
      });
      frame=0;if(moving&&visible&&!document.hidden)frame=requestAnimationFrame(draw);
    };
    const schedule=()=>{if(frame)cancelAnimationFrame(frame);frame=0;if(visible&&!document.hidden)draw(performance.now()+34);};
    const resize=()=>{width=node.clientWidth||400;height=node.clientHeight||220;const dpr=Math.min(devicePixelRatio||1,1.5);node.width=Math.round(width*dpr);node.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);schedule();};
    const tint=()=>{const s=getComputedStyle(document.documentElement);colors=[s.getPropertyValue("--theme-red").trim(),s.getPropertyValue("--theme-ink").trim(),s.getPropertyValue("--theme-muted").trim()];schedule();};
    const sizeObserver=new ResizeObserver(resize), themeObserver=new MutationObserver(tint), viewObserver=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;schedule();});
    sizeObserver.observe(node);viewObserver.observe(node);themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:["data-theme","data-palette","data-accent"]});document.addEventListener("visibilitychange",schedule);sync.current=schedule;resize();tint();
    return()=>{if(frame)cancelAnimationFrame(frame);sizeObserver.disconnect();themeObserver.disconnect();viewObserver.disconnect();document.removeEventListener("visibilitychange",schedule);sync.current=()=>{};};
  },[variant]);
  return <div className={"product-assembly assembly-"+variant} role="group" aria-label={variant==="agents"?"Альфа и Омега: фигуры притягиваются и образуют новые сочетания":"Пульс: геометрические новости собираются в меняющуюся сетку"}>
    <canvas ref={canvas} aria-hidden="true"/>
    {variant==="agents"&&<div className="assembly-labels"><span>Альфа<small>Выполняет</small></span><b aria-hidden="true">+</b><span>Омега<small>Координирует</small></span></div>}
    {controls&&<button type="button" className="assembly-pause" aria-label={stopped?"Продолжить движение фигур":"Приостановить движение фигур"} aria-pressed={stopped} disabled={reduced} onClick={()=>setStopped(!stopped)}>{stopped?<Play size={15}/>:<Pause size={15}/>}</button>}
  </div>;
}
