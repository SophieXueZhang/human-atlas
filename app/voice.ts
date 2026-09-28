/** Browser-native voice I/O (Web Speech API): no server, no API key.
 * Speech-to-text: Chrome, Edge, Safari (not Firefox). Text-to-speech: all modern browsers. */
type Rec={lang:string;interimResults:boolean;continuous:boolean;maxAlternatives:number;start():void;stop():void;abort():void;
 onresult:((e:{resultIndex:number;results:ArrayLike<ArrayLike<{transcript:string}>&{isFinal:boolean}>})=>void)|null;
 onerror:((e:{error:string})=>void)|null;onend:(()=>void)|null};
const RecCtor=():(new()=>Rec)|null=>{const w=window as unknown as Record<string,unknown>;return (w.SpeechRecognition||w.webkitSpeechRecognition||null) as (new()=>Rec)|null;};

export const canListen=()=>typeof window!=='undefined'&&!!RecCtor();
export const canSpeak=()=>typeof window!=='undefined'&&'speechSynthesis' in window;

export type VoiceLang='zh-CN'|'en-US';
export const defaultLang=():VoiceLang=>{try{const s=localStorage.getItem('atlas-voice-lang');if(s==='zh-CN'||s==='en-US')return s;}catch{}return navigator.language?.toLowerCase().startsWith('zh')?'zh-CN':'en-US';};
export const saveLang=(l:VoiceLang)=>{try{localStorage.setItem('atlas-voice-lang',l);}catch{}};

const errorCopy:Record<string,string>={'not-allowed':'Microphone access was blocked. Allow the mic for this page and try again.','service-not-allowed':'Speech recognition is not allowed here. Try opening the page directly in Chrome or Safari.','audio-capture':'No microphone was found.','network':'Speech recognition needs an internet connection.'};

/** Listen for one utterance. Resolves with the final transcript ('' if nothing was heard). */
export function listen(lang:VoiceLang,onInterim:(t:string)=>void):{done:Promise<string>;stop:()=>void;cancel:()=>void}{
 const C=RecCtor();if(!C)return {done:Promise.reject(new Error('Voice input is not supported in this browser. Try Chrome or Safari.')),stop(){},cancel(){}};
 const r=new C();r.lang=lang;r.interimResults=true;r.continuous=false;r.maxAlternatives=1;
 let final='',cancelled=false;
 const done=new Promise<string>((resolve,reject)=>{
  let settled=false,watchdog=0;
  const finish=(v:string|Error)=>{if(settled)return;settled=true;clearTimeout(watchdog);v instanceof Error?reject(v):resolve(v);};
  // Some embedded contexts never fire any event: give up after 15 s of total silence.
  const arm=()=>{clearTimeout(watchdog);watchdog=window.setTimeout(()=>{try{r.abort();}catch{}finish(final.trim()?final.trim():new Error('Did not hear anything. Check the microphone, or type your question.'));},15000);};
  arm();
  r.onresult=e=>{arm();let interim='';for(let i=e.resultIndex;i<e.results.length;i++){const res=e.results[i];if(res.isFinal)final+=res[0].transcript;else interim+=res[0].transcript;}onInterim((final+interim).trim());};
  r.onerror=e=>{if(e.error==='no-speech'||e.error==='aborted')return;finish(new Error(errorCopy[e.error]??'Voice input failed. Try again.'));};
  r.onend=()=>finish(cancelled?'':final.trim());
 });
 try{r.start();}catch{/* already started */}
 return {done,stop:()=>r.stop(),cancel:()=>{cancelled=true;try{r.abort();}catch{}}};
}

const hasCJK=(t:string)=>/[㐀-鿿]/.test(t);
const clean=(t:string)=>t.replace(/[*_#`>|]/g,'').replace(/\[(.*?)\]\(.*?\)/g,'$1').replace(/^\s*[-•]\s+/gm,'');

/** Speak text aloud; resolves when finished or stopped. Picks a Chinese voice for Chinese text. */
export function speak(text:string):Promise<void>{
 if(!canSpeak()||!text.trim())return Promise.resolve();
 const synth=window.speechSynthesis;synth.cancel();
 const lang=hasCJK(text)?'zh-CN':'en-US';
 const voice=synth.getVoices().find(v=>v.lang.replace('_','-').toLowerCase().startsWith(lang.slice(0,2).toLowerCase())&&(lang!=='zh-CN'||/cn|hans|mandarin|普通话/i.test(v.lang+v.name)))??synth.getVoices().find(v=>v.lang.toLowerCase().startsWith(lang.slice(0,2)));
 // Chrome cuts utterances off after ~15 s, so speak sentence by sentence.
 const chunks=clean(text).split(/(?<=[。！？.!?；;\n])\s*/).map(s=>s.trim()).filter(Boolean);
 return new Promise(resolve=>{
  let left=chunks.length;if(!left)return resolve();
  for(const c of chunks){const u=new SpeechSynthesisUtterance(c);u.lang=lang;if(voice)u.voice=voice;u.rate=lang==='zh-CN'?1:1.02;u.onend=u.onerror=()=>{if(--left===0)resolve();};synth.speak(u);}
 });
}
export const stopSpeaking=()=>{if(canSpeak())window.speechSynthesis.cancel();};
