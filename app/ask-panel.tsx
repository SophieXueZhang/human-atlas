import {useEffect,useRef,useState} from 'react';
import {ArrowUp,Square,Sparkles} from 'lucide-react';
import {ask,type Turn} from './ask-claude';

const SUGGESTIONS=['What does it do?','它是做什么的？','Explain it to a 7-year-old'];

export default function AskPanel({name,system}:{name:string;system:string}){
 const [turns,setTurns]=useState<Turn[]>([]),[draft,setDraft]=useState(''),[streaming,setStreaming]=useState<string|null>(null),[error,setError]=useState('');
 const ctl=useRef<AbortController|null>(null),end=useRef<HTMLDivElement>(null);
 useEffect(()=>()=>ctl.current?.abort(),[]);
 useEffect(()=>{end.current?.scrollIntoView({block:'nearest'});},[turns,streaming]);
 const busy=streaming!==null;
 const send=async(q:string)=>{
  q=q.trim();if(!q||busy)return;
  const next:Turn[]=[...turns,{role:'user',content:q}];
  setTurns(next);setDraft('');setError('');setStreaming('');
  const c=new AbortController();ctl.current=c;
  try{const text=await ask(name,system,next,t=>setStreaming(t),c.signal);setTurns([...next,{role:'assistant',content:text}]);}
  catch(e){const msg=(e as Error).message;if(msg!=='cancelled'&&(e as Error).name!=='AbortError')setError(msg);setTurns(next);}
  finally{setStreaming(null);ctl.current=null;}
 };
 return <section className="ask-panel" aria-label={`Ask about ${name}`}>
  <h3><Sparkles size={13}/>Ask about this structure</h3>
  {turns.length===0&&<div className="ask-suggestions">{SUGGESTIONS.map(s=><button key={s} type="button" onClick={()=>send(s)}>{s}</button>)}</div>}
  <div className="ask-thread">
   {turns.map((t,i)=><p key={i} className={`ask-msg ${t.role}`}>{t.content}</p>)}
   {busy&&<p className="ask-msg assistant">{streaming||<span className="ask-thinking">Thinking…</span>}</p>}
   {error&&<p className="ask-error" role="alert">{error}</p>}
   <div ref={end}/>
  </div>
  <form className="ask-form" onSubmit={e=>{e.preventDefault();send(draft);}}>
   <input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Ask anything… 用中文也可以" aria-label="Your question" onKeyDown={e=>e.stopPropagation()}/>
   {busy?<button type="button" aria-label="Stop" onClick={()=>ctl.current?.abort()}><Square size={14}/></button>:<button type="submit" aria-label="Send" disabled={!draft.trim()}><ArrowUp size={16}/></button>}
  </form>
 </section>;
}
