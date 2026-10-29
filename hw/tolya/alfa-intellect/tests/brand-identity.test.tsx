import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { Brand } from "../src/ui";
import { Landing } from "../src/Landing";
import { ALPHA_PATH, OMEGA_PATH, BRAND_NAME } from "../src/brand-identity";
import { startTabIdentity } from "../src/tabIdentity";

test("Shared header, static icon and landing use the same Alfa and Omega identity", () => {
  const brand = renderToStaticMarkup(<Brand/>);
  assert.ok(brand.includes(BRAND_NAME));
  assert.ok(brand.includes(ALPHA_PATH)); assert.ok(brand.includes(OMEGA_PATH));
  const svg = readFileSync(new URL("../public/favicon.svg",import.meta.url),"utf8");
  assert.ok(svg.includes(ALPHA_PATH)); assert.ok(svg.includes(OMEGA_PATH));
  const page = renderToStaticMarkup(<Landing go={()=>{}}/>);
  assert.match(page,/<h1 class="hero-title" aria-label="Альфа">Aльфа/);
  assert.ok(page.includes("Умный кредитный")); assert.ok(page.includes("Агент Омега"));
  assert.ok(page.includes('aria-label="Анимированный пример возможностей кабинета"'));
  assert.ok(page.includes("Подобрать финансирование"));
});

test("Tab animation keeps a stable name, pauses when hidden and obeys live reduced-motion changes", () => {
  const names = ["document","window","MutationObserver","Path2D","getComputedStyle","setInterval","clearInterval"];
  const saved = Object.fromEntries(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  const listeners = new Map<string,()=>void>(), timers = new Map<number,()=>void>();
  let sequence = 0, renders = 0;
  const link = {type:"",href:"/favicon.svg"};
  const media = {matches:true,addEventListener:(_name:string,fn:()=>void)=>listeners.set("motion",fn),removeEventListener:()=>listeners.delete("motion")};
  const context = Object.fromEntries(["clearRect","beginPath","roundRect","fill","save","restore","translate","scale","stroke","rotate"].map(name=>[name,()=>{}]));
  const doc = {title:"УКК",hidden:false,createElement:()=>({getContext:()=>context,toDataURL:()=>{renders++;return "data:image/png;base64,"+renders;}}),querySelector:()=>link,documentElement:{},addEventListener:(name:string,fn:()=>void)=>listeners.set(name,fn),removeEventListener:(name:string)=>listeners.delete(name)};
  function install(name:string,value:unknown){Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});}
  let stop: (()=>void)|undefined;
  try {
    install("document",doc);install("window",{matchMedia:()=>media});
    install("MutationObserver",class {observe(){}disconnect(){}});install("Path2D",class {});
    install("getComputedStyle",()=>({getPropertyValue:()=>"#16181b"}));
    install("setInterval",(fn:()=>void)=>{const id=++sequence;timers.set(id,fn);return id;});install("clearInterval",(id:number)=>timers.delete(id));
    stop=startTabIdentity();
    assert.equal(doc.title,BRAND_NAME);assert.equal(timers.size,0);assert.ok(renders>0);
    media.matches=false;listeners.get("motion")!();assert.equal(timers.size,1);
    doc.hidden=true;listeners.get("visibilitychange")!();assert.equal(timers.size,0);
    doc.hidden=false;listeners.get("visibilitychange")!();assert.equal(timers.size,1);
    media.matches=true;listeners.get("motion")!();assert.equal(timers.size,0);
    assert.equal(doc.title,BRAND_NAME);
    stop?.();stop=undefined;assert.equal(listeners.size,0);
  } finally {
    stop?.();for(const name of names){const descriptor=saved[name];if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name);}
  }
});
