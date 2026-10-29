let cached:{at:number;value:{model:string;core:string;connected:boolean}}|undefined;
/** Cloud folder identifiers are infrastructure, not part of the public model label. */
export const publicModelName=(name:string)=>name.replace(/^gpt:\/\/[^/]+\//,"");
/** Expose only a public model name reported by the running agent, never its config or credentials. */
export async function agentIdentity(){
  if(cached&&Date.now()-cached.at<30000)return cached.value;
  let model="Не удалось уточнить модель",connected=false;
  try{
    if(process.env.TEAM_AGENT_URL){const r=await fetch(new URL("/health",process.env.TEAM_AGENT_URL),{signal:AbortSignal.timeout(1500)});if(!r.ok)throw new Error("health");const v=await r.json();if(typeof v.llm==="string"&&/^[\w./:+ -]{1,120}$/.test(v.llm)){model=v.llm==="templates"?"Шаблонный режим":publicModelName(v.llm);connected=v.ok===true&&v.llm!=="templates";}}
    else if(process.env.AI_PROVIDER==="openai"){model=process.env.AI_MODEL||"gpt-5.4-mini";connected=!!process.env.OPENAI_API_KEY;}
    else model="Демонстрационный режим";
  }catch{}
  const value={model,core:"Скоркарта Лизы · детерминированное ядро /score",connected};cached={at:Date.now(),value};return value;
}
