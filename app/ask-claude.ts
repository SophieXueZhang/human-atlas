/** Chat backend for the "Ask about this structure" panel.
 * 1. Inside a claude.ai artifact viewer: uses the `sample` capability (viewer's own Claude account).
 * 2. Anywhere else (e.g. Vercel): POSTs to /api/chat, a serverless function holding ANTHROPIC_API_KEY. */
export type Turn={role:'user'|'assistant';content:string};
type Sample=(input:Turn[],opts:{onText?:(u:{text:string})=>void;signal?:AbortSignal;cache?:boolean;modelTier?:string})=>Promise<{text:string}>;
declare global{interface Window{claude?:{use:(name:string)=>Promise<unknown>}}}

let samplePromise:Promise<Sample|null>|null=null;
const getSample=()=>samplePromise??=(window.claude?.use?window.claude.use('sample').then(s=>(s as Sample)||null).catch(()=>null):Promise.resolve(null));

export const instructions=(name:string,system:string)=>`You are a friendly anatomy tutor inside a 3D human anatomy explorer (BodyParts3D adult male model). The viewer has selected: "${name}" (system: ${system}).
Answer questions about this structure: what it is, what it does, where it sits, what it connects to, fun facts. Keep answers short (2-5 sentences or a few bullets) unless asked for more.
Reply in the same language the viewer writes in (e.g. Chinese question -> 简体中文 answer). If asked to explain for a child, use simple words and a concrete analogy.
This is general education, not medical advice: for personal symptoms, suggest seeing a doctor.`;

export async function ask(name:string,system:string,turns:Turn[],onText:(t:string)=>void,signal:AbortSignal):Promise<string>{
 const input:Turn[]=[{role:'user',content:instructions(name,system)},...turns.slice(-12)];
 const sample=await getSample();
 if(sample){
  try{const {text}=await sample(input,{onText:({text})=>onText(text),signal,cache:false});return text;}
  catch(e){const code=(e as {code?:string})?.code;throw new Error(code==='not_granted'||code==='sampling_disabled'?'Claude access was not allowed for this page.':code==='rate_limited'?'Too many questions right now — try again in a moment.':code==='cancelled'?'cancelled':'Claude could not answer. Try again.');}
 }
 const res=await fetch('api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,system,turns:turns.slice(-12)}),signal});
 if(!res.ok||!res.body)throw new Error(res.status===404?'Chat is not set up on this deployment (missing /api/chat).':'Could not get an answer. Try again.');
 const reader=res.body.getReader(),dec=new TextDecoder();let text='';
 for(;;){const {done,value}=await reader.read();if(done)break;text+=dec.decode(value,{stream:true});onText(text);}
 return text;
}
