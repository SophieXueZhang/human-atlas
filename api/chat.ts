// Vercel serverless function: streams a short Claude answer about the selected structure.
// Requires env var ANTHROPIC_API_KEY. Optional: ANTHROPIC_MODEL (default claude-haiku-4-5-20251001).
export const config={runtime:'edge'};
type Turn={role:'user'|'assistant';content:string};
const clean=(v:unknown,max:number)=>String(v??'').slice(0,max);
export default async function handler(req:Request):Promise<Response>{
 if(req.method!=='POST')return new Response('Method not allowed',{status:405});
 const key=process.env.ANTHROPIC_API_KEY;if(!key)return new Response('Chat not configured',{status:503});
 let body:{name?:unknown;system?:unknown;turns?:unknown;spoken?:unknown};try{body=await req.json();}catch{return new Response('Bad request',{status:400});}
 const name=clean(body.name,120),system=clean(body.system,60);
 const turns=(Array.isArray(body.turns)?body.turns:[]).slice(-12).map((t:Turn)=>({role:t?.role==='assistant'?'assistant':'user',content:clean(t?.content,2000)})).filter(t=>t.content);
 if(!name||!turns.length||turns[turns.length-1].role!=='user')return new Response('Bad request',{status:400});
 const systemPrompt=`You are a friendly anatomy tutor inside a 3D human anatomy explorer (BodyParts3D adult male model). The viewer has selected: "${name}" (system: ${system}). Answer questions about this structure: what it is, what it does, where it sits, what it connects to, fun facts. Keep answers short (2-5 sentences or a few bullets) unless asked for more. Reply in the viewer's language (Chinese question -> 简体中文). If asked to explain for a child, use simple words and a concrete analogy. Stay on anatomy/biology topics. This is general education, not medical advice: for personal symptoms, suggest seeing a doctor.${body.spoken===true?' This answer will be READ ALOUD: 2-3 short spoken sentences, plain text only, no markdown or lists; end with a short follow-up question when natural.':''}`;
 const upstream=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'x-api-key':key,'anthropic-version':'2023-06-01','content-type':'application/json'},body:JSON.stringify({model:process.env.ANTHROPIC_MODEL||'claude-haiku-4-5-20251001',max_tokens:body.spoken===true?300:600,stream:true,system:systemPrompt,messages:turns})});
 if(!upstream.ok||!upstream.body)return new Response('Upstream error',{status:502});
 const enc=new TextEncoder(),dec=new TextDecoder();let buf='';
 const out=new ReadableStream({async start(ctrl){const r=upstream.body!.getReader();for(;;){const {done,value}=await r.read();if(done)break;buf+=dec.decode(value,{stream:true});const lines=buf.split('\n');buf=lines.pop()??'';for(const l of lines){if(!l.startsWith('data:'))continue;try{const ev=JSON.parse(l.slice(5));if(ev.type==='content_block_delta'&&ev.delta?.type==='text_delta')ctrl.enqueue(enc.encode(ev.delta.text));}catch{}}}ctrl.close();}});
 return new Response(out,{headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}});
}
