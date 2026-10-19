// Shared helpers. Prototype only: data lives in this browser's localStorage.
const K="orgvote_v1";
let db;
try{db=JSON.parse(localStorage.getItem(K))}catch(e){}
db=db||{whitelist:[],candidates:[],students:{},votes:{}};
const save=()=>{try{localStorage.setItem(K,JSON.stringify(db))}catch(e){}};
const $=id=>document.getElementById(id);
const msg=(id,t,ok)=>$(id).innerHTML=`<div class="msg ${ok?'ok':'err'}">${t}</div>`;
const esc=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function sha(s){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function tally(){const t={};Object.values(db.votes).forEach(v=>t[v]=(t[v]||0)+1);return t}
