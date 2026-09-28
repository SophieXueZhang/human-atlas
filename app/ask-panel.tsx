import {useEffect,useRef,useState} from 'react';
import {ArrowUp,Mic,MicOff,Square,Sparkles,Volume2,VolumeX} from 'lucide-react';
import {ask,type Turn} from './ask-claude';
import {canListen,micPolicyBlocked,canSpeak,defaultLang,listen,saveLang,speak,stopSpeaking,type VoiceLang} from './voice';

const SUGGESTIONS=['What does it do?','它是做什么的？','Explain it to a 7-year-old'];
type VoiceState='off'|'listening'|'thinking'|'speaking';

export default function AskPanel({name,system}:{name:string;system:string}){
 const [turns,setTurns]=useState<Turn[]>([]),[draft,setDraft]=useState(''),[streaming,setStreaming]=useState<string|null>(null),[error,setError]=useState('');
 const [voice,setVoice]=useState<VoiceState>('off'),[lang,setLang]=useState<VoiceLang>(defaultLang),[autoRead,setAutoRead]=useState(()=>{try{return localStorage.getItem('atlas-auto-read')==='1';}catch{return false;}}),[reading,setReading]=useState<number|null>(null);
 const ctl=useRef<AbortController|null>(null),end=useRef<HTMLDivElement>(null),turnsRef=useRef<Turn[]>([]);
 const voiceOn=useRef(false),rec=useRef<ReturnType<typeof listen>|null>(null);
 const [micBlocked,setMicBlocked]=useState(()=>canListen()&&micPolicyBlocked());
 const micOK=canListen()&&!micBlocked,ttsOK=canSpeak();
 turnsRef.current=turns;
 useEffect(()=>()=>{voiceOn.current=false;rec.current?.cancel();ctl.current?.abort();stopSpeaking();},[]);
 useEffect(()=>{end.current?.scrollIntoView({block:'nearest'});},[turns,streaming,voice]);
 const busy=streaming!==null;

 const send=async(q:string,spoken=false):Promise<string|null>=>{
  q=q.trim();if(!q||ctl.current)return null;
  const next:Turn[]=[...turnsRef.current,{role:'user',content:q}];
  setTurns(next);setDraft('');setError('');setStreaming('');
  const c=new AbortController();ctl.current=c;
  try{const text=await ask(name,system,next,t=>setStreaming(t),c.signal,spoken);setTurns([...next,{role:'assistant',content:text}]);return text;}
  catch(e){const msg=(e as Error).message;if(msg!=='cancelled'&&(e as Error).name!=='AbortError')setError(msg);setTurns(next);return null;}
  finally{setStreaming(null);ctl.current=null;}
 };

 // Voice conversation loop: listen -> ask -> speak -> listen again, until stopped or silence.
 const startVoice=async()=>{
  if(voiceOn.current)return;voiceOn.current=true;setError('');stopSpeaking();
  while(voiceOn.current){
   setVoice('listening');setDraft('');
   const r=listen(lang,t=>setDraft(t));rec.current=r;
   let heard='';
   try{heard=await r.done;}catch(e){const m=(e as Error).message;if(/blocked|not allowed/i.test(m)){setMicBlocked(true);}else setError(m);break;}
   finally{rec.current=null;}
   if(!voiceOn.current)break;
   if(!heard){setDraft('');break;} // silence ends the conversation
   setVoice('thinking');
   const answer=await send(heard,true);
   if(!voiceOn.current||!answer)break;
   setVoice('speaking');await speak(answer);
  }
  voiceOn.current=false;setVoice('off');
 };
 const stopVoice=()=>{voiceOn.current=false;rec.current?.cancel();ctl.current?.abort();stopSpeaking();setVoice('off');};
 const readAloud=async(i:number,text:string)=>{if(reading===i){stopSpeaking();setReading(null);return;}setReading(i);await speak(text);setReading(r=>r===i?null:r);};
 const sendTyped=async(q:string)=>{stopSpeaking();setReading(null);const idx=turnsRef.current.length+1;const a=await send(q);if(a&&autoRead)readAloud(idx,a);};
 const toggleAutoRead=()=>{const v=!autoRead;setAutoRead(v);if(!v){stopSpeaking();setReading(null);}try{localStorage.setItem('atlas-auto-read',v?'1':'0');}catch{}};
 const switchLang=()=>{const l:VoiceLang=lang==='zh-CN'?'en-US':'zh-CN';setLang(l);saveLang(l);};
 const status={listening:lang==='zh-CN'?'正在听…说完停一下':'Listening… pause when done',thinking:lang==='zh-CN'?'思考中…':'Thinking…',speaking:lang==='zh-CN'?'正在回答… 点停止可打断':'Speaking… tap stop to interrupt',off:''}[voice];

 return <section className="ask-panel" aria-label={`Ask about ${name}`}>
  <h3><Sparkles size={13}/>Ask about this structure
   {ttsOK&&<button type="button" className={`ask-lang ask-auto ${autoRead?'on':''}`} onClick={toggleAutoRead} aria-pressed={autoRead} title={autoRead?'Auto read-aloud on':'Auto read-aloud off'}>{autoRead?<Volume2 size={12}/>:<VolumeX size={12}/>}{lang==='zh-CN'?'朗读':'Read'}</button>}
   {micOK&&<button type="button" className="ask-lang" onClick={switchLang} disabled={voice!=='off'} title="Voice input language" aria-label={`Voice language: ${lang==='zh-CN'?'Chinese':'English'}. Tap to switch.`}>{lang==='zh-CN'?'中文':'EN'}</button>}
  </h3>
  {turns.length===0&&voice==='off'&&<div className="ask-suggestions">{SUGGESTIONS.map(s=><button key={s} type="button" onClick={()=>sendTyped(s)}>{s}</button>)}</div>}
  <div className="ask-thread">
   {turns.map((t,i)=><p key={i} className={`ask-msg ${t.role}`}>{t.content}{t.role==='assistant'&&ttsOK&&voice==='off'&&<button type="button" className={`ask-play ${reading===i?'on':''}`} aria-label={reading===i?'Stop reading':'Read aloud'} onClick={()=>readAloud(i,t.content)}>{reading===i?<Square size={11}/>:<Volume2 size={13}/>}</button>}</p>)}
   {busy&&<p className="ask-msg assistant">{streaming||<span className="ask-thinking">Thinking…</span>}</p>}
   {error&&<p className="ask-error" role="alert">{error}</p>}
   <div ref={end}/>
  </div>
  {voice!=='off'&&<div className={`ask-voice ${voice}`} role="status"><span className="ask-pulse"/>{status}</div>}
  {micBlocked&&<p className="ask-note">{lang==='zh-CN'?'这个页面不允许用麦克风（嵌在 claude.ai 里时会这样），语音输入已隐藏。朗读仍可用。':'The microphone is blocked on this page (e.g. when embedded in claude.ai), so voice input is hidden. Read-aloud still works.'}</p>}
  <form className="ask-form" onSubmit={e=>{e.preventDefault();sendTyped(draft);}}>
   <input value={draft} onChange={e=>setDraft(e.target.value)} placeholder={micOK?'Type or tap the mic… 用中文也可以':'Ask anything… 用中文也可以'} aria-label="Your question" readOnly={voice!=='off'} onKeyDown={e=>e.stopPropagation()}/>
   {micOK&&(voice==='off'
    ?<button type="button" className="ask-mic" aria-label="Start voice chat" title="Voice chat" disabled={busy} onClick={startVoice}><Mic size={16}/></button>
    :<button type="button" className="ask-mic live" aria-label="Stop voice chat" title="Stop voice chat" onClick={stopVoice}><MicOff size={16}/></button>)}
   {voice==='off'&&(busy?<button type="button" aria-label="Stop" onClick={()=>ctl.current?.abort()}><Square size={14}/></button>:<button type="submit" aria-label="Send" disabled={!draft.trim()}><ArrowUp size={16}/></button>)}
  </form>
 </section>;
}
