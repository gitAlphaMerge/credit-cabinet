import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { NavigationLink } from "../src/NavigationLink";
import { activateUiSound, playUiSound } from "../src/ui-sounds";
import { trackedFetch } from "../src/request-activity";
import { Landing } from "../src/Landing";

test("Navigation links retain native fallback and ordinary new-tab gestures", () => {
  const routes:string[]=[];
  const element=NavigationLink({to:"/onboarding",go:path=>routes.push(path),children:"Подобрать финансирование"});
  const event=(overrides={})=>({button:0,ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...overrides});
  const normal=event();element.props.onClick(normal);assert.equal(normal.defaultPrevented,true);assert.deepEqual(routes,["/onboarding"]);
  for(const overrides of [{ctrlKey:true},{metaKey:true},{shiftKey:true},{button:1}]){const modified=event(overrides);element.props.onClick(modified);assert.equal(modified.defaultPrevented,false);}
  assert.equal(routes.length,1);
  const failed=NavigationLink({to:"/onboarding",go:()=>{throw new Error("router unavailable");}}), fallback=event();
  assert.doesNotThrow(()=>failed.props.onClick(fallback));assert.equal(fallback.defaultPrevented,false);assert.equal(failed.props.href,"/onboarding");
  const page=renderToStaticMarkup(<Landing go={()=>{}}/>);
  assert.match(page,/<a[^>]*href="\/onboarding"[^>]*>Подобрать финансирование/);
});

let audioClock=10000;
async function withAudio(run:(audio:{resumed:number;notes:number;attempts:number;failNode:boolean;failResume:boolean})=>Promise<void>) {
  const names=["window","fetch","localStorage"];
  const saved=Object.fromEntries(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  const originalNow=Date.now;let instance:{state:string}|undefined;
  const audio={resumed:0,notes:0,attempts:0,failNode:false,failResume:false};
  class FakeAudio {
    state="suspended";currentTime=1;destination={};
    constructor(){instance=this;}
    async resume(){audio.resumed++;await Promise.resolve();if(audio.failResume)throw new Error("autoplay denied");this.state="running";}
    createOscillator(){audio.attempts++;if(audio.failNode)throw new Error("audio device unavailable");audio.notes++;return {type:"",frequency:{value:0},connect(){},start(){},stop(){},disconnect(){},onended:null};}
    createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
  }
  try {
    Object.defineProperty(globalThis,"window",{configurable:true,value:{AudioContext:FakeAudio,dispatchEvent:()=>true}});
    Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{getItem:()=>"on"}});
    Object.defineProperty(globalThis,"fetch",{configurable:true,value:async()=>new Response('{"ok":true}',{status:200})});
    audioClock+=1000;Date.now=()=>audioClock;
    await run(audio);
  } finally {
    if(instance)instance.state="closed";Date.now=originalNow;
    for(const name of names){const descriptor=saved[name];if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name);}
  }
}
test("The first user gesture waits for suspended audio before emitting its sound",async()=>{
  await withAudio(async audio=>{assert.equal(await activateUiSound("tap"),true);assert.equal(audio.resumed,1);assert.equal(audio.notes,1);});
});
test("Audio-device failure cannot turn a successful API action into an error",async()=>{
  await withAudio(async audio=>{assert.equal(await activateUiSound(),true);audio.failNode=true;
    const response=await trackedFetch("/api/select",{method:"POST"});assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true});assert.ok(audio.attempts>0);
    assert.doesNotThrow(()=>playUiSound("error"));
  });
});
test("A browser autoplay rejection is handled without blocking controls",async()=>{
  await withAudio(async audio=>{audio.failResume=true;assert.equal(await activateUiSound("tap"),false);assert.equal(audio.notes,0);});
});
