const $=id=>document.getElementById(id);
const msg=(id,t,ok)=>$(id).innerHTML=`<div class="msg ${ok?'ok':'err'}">${t}</div>`;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let sb=null,initError=null;
try{
  if(typeof supabase==="undefined")throw new Error("Supabase library did not load (check internet / ad blocker)");
  if(typeof SUPABASE_URL==="undefined")throw new Error("js/config.js did not load");
  sb=supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
}catch(e){initError=e.message}
