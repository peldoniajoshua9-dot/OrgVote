let user=null,pass=null;
let cands=[],photos={},picked=null,vstatus=null,timerId=null;
// Order of offices, highest first. Anything not listed goes after these, A to Z.
const POS_GROUPS=[["president"],["vice president","vp"],["secretary"],["treasurer"],["auditor"],["public information officer","pio"],["business manager"],["peace officer","sergeant at arms","sergeant"],["representative","rep"]];
function posRank(p){
  let t=String(p||"").toLowerCase().replace(/[-_.]/g," ").replace(/\s+/g," ").trim();
  const asst=/^(assistant|asst)\s+/.test(t);
  t=t.replace(/^(assistant|asst)\s+/,"");
  const keys=[];POS_GROUPS.forEach((g,i)=>g.forEach(k=>keys.push([k,i])));
  keys.sort((a,b)=>b[0].length-a[0].length);   // "vice president" is tested before "president"
  const hit=keys.find(([k])=>new RegExp("(^|\\s)"+k+"(\\s|$)").test(t));
  return hit?hit[1]+(asst?0.5:0):100;
}

function showRegister(){
  $("sAuth").classList.add("hide");$("sReset").classList.add("hide");$("sRegister").classList.remove("hide");
  $("rgMsg").innerHTML="";
  if($("lrn").value&&!$("rgLrn").value)$("rgLrn").value=$("lrn").value;   // keep what was typed on the login card
  if($("sgrade").value&&!$("rgGrade").value)$("rgGrade").value=$("sgrade").value;
}
function showLogin(){
  $("sRegister").classList.add("hide");$("sReset").classList.add("hide");$("sAuth").classList.remove("hide");
  $("sMsg").innerHTML="";$("rgMsg").innerHTML="";
}
async function studentRegister(){
  if(initError)return msg("rgMsg","Setup error: "+esc(initError));
  const l=$("rgLrn").value.trim(),g=parseInt($("rgGrade").value,10),e=$("rgEmail").value.trim().toLowerCase(),
        p=$("rgPw").value,p2=$("rgPw2").value;
  if(!/^\d{12}$/.test(l))return msg("rgMsg","LRN must be exactly 12 digits.");
  if(!g)return msg("rgMsg","Please choose your grade level.");
  if(!/^[a-z0-9._%+-]+@gmail\.com$/.test(e))return msg("rgMsg","Enter a valid Gmail address (name@gmail.com).");
  if(p.length<6)return msg("rgMsg","Password must be at least 6 characters.");
  if(p!==p2)return msg("rgMsg","The two passwords do not match.");
  if(!confirm("Register as Grade "+g+" with "+e+"? You cannot change your grade level later."))return;
  const {data,error}=await sb.rpc("student_register_email",{p_lrn:l,p_pw:p,p_grade:g,p_email:e});
  if(error)return msg("rgMsg","Connection error. Try again.");
  const st=String(data).split(":")[0];
  if(st==="OK"){
    ["rgLrn","rgGrade","rgEmail","rgPw","rgPw2"].forEach(id=>{$(id).value=""});
    showLogin();
    $("lrn").value=l;$("sgrade").value=String(g);   // ready to log in
    return msg("sMsg","Registered! Enter your password below to log in. If you forget it later, ask your admin for a one-time password.",1);
  }
  msg("rgMsg",{
    BAD_EMAIL:"Enter a valid Gmail address (name@gmail.com).",
    NOT_ENROLLED:"LRN not found in the official SY enrollment list.",
    EXISTS:"This LRN is already registered. Go back to login.",
    WEAK:"Password must be at least 6 characters.",
    WRONG_GRADE:"That grade level doesn't match your enrollment record. Ask the admin.",
    NO_GRADE:"Please choose your grade level."
  }[st]||"Could not register. Try again.");
}
async function studentLogin(){
  if(initError)return msg("sMsg","Setup error: "+esc(initError));
  const l=$("lrn").value.trim(),p=$("spw").value,g=parseInt($("sgrade").value,10);
  if(!g)return msg("sMsg","Please choose your grade level.");
  const {data,error}=await sb.rpc("student_login_grade",{p_lrn:l,p_pw:p,p_grade:g});
  if(error)return msg("sMsg","Connection error. Try again.");
  if(data==="BAD_LOGIN")return msg("sMsg","Invalid LRN or password.");
  if(data==="WRONG_GRADE")return msg("sMsg","This LRN is registered under a different grade level. Choose the grade you registered with.");
  if(data!=="OK")return msg("sMsg","Could not log in. Try again.");
  user=l;pass=p;$("sAuth").classList.add("hide");$("sVote").classList.remove("hide");
  $("who").textContent="LRN ••••••••"+l.slice(-4)+" · Grade "+g;renderBallot();
}
function studentLogout(){clearInterval(timerId);user=pass=null;if($("vTimer"))$("vTimer").innerHTML="";$("sVote").classList.add("hide");$("sAuth").classList.remove("hide");$("spw").value="";$("sMsg").innerHTML="";$("vMsg").innerHTML=""}

// ---- Voting timer (server clock decides; this only shows the countdown) ----
function fmtLeft(s){
  const d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60),x=s%60;
  return (d?d+"d ":"")+((d||h)?h+"h ":"")+m+"m "+String(x).padStart(2,"0")+"s";
}
function renderBanner(left){
  const el=$("vTimer");if(!el)return;
  const s=vstatus&&vstatus.state;
  if(!s||s==="none"){el.innerHTML="";return}
  if(s==="closed")el.innerHTML='<div class="tbar closed">Voting is closed.</div>';
  else if(s==="upcoming")el.innerHTML='<div class="tbar soon">Voting opens in <b>'+fmtLeft(left)+'</b></div>';
  else el.innerHTML=vstatus.seconds_to_close==null
    ?'<div class="tbar open">Voting is open.</div>'
    :'<div class="tbar open">Voting closes in <b>'+fmtLeft(left)+'</b></div>';
}
function startCountdown(){
  clearInterval(timerId);
  const s=vstatus&&vstatus.state;
  const secs=s==="upcoming"?vstatus.seconds_to_open:(s==="open"?vstatus.seconds_to_close:null);
  if(secs==null){renderBanner(0);return}
  const target=Date.now()+secs*1000;
  const tick=()=>{
    const left=Math.max(0,Math.ceil((target-Date.now())/1000));
    renderBanner(left);
    if(left<=0){clearInterval(timerId);renderBallot()}   // boundary reached: ask the server again
  };
  tick();timerId=setInterval(tick,1000);
}
async function notOpenMsg(){
  const s=await sb.rpc("voting_status");const d=s.data;
  if(d&&d.state==="closed")return "Voting is closed.";
  if(d&&d.state==="upcoming")return "Voting has not started yet.";
  return null;
}

// ---- Ballot: one position per screen, photo cards ----
function initials(n){return String(n||"?").trim().split(/\s+/).slice(0,2).map(w=>w.charAt(0)).join("").toUpperCase()}
function photoHtml(x){
  const p=photos[x.id];
  return (p&&/^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(p))
    ?`<img src="${p}" alt="">`
    :`<div class="bini">${esc(initials(x.name))}</div>`;
}
async function renderBallot(){
  const st=await sb.rpc("voting_status");
  vstatus=st.error?null:st.data;   // if the timer SQL has not been run, voting simply stays open
  startCountdown();
  const stt=vstatus&&vstatus.state;
  if(stt==="upcoming"){$("ballot").innerHTML="<p>Voting has not started yet. This page updates by itself when voting opens.</p>";return}
  if(stt==="closed"){$("ballot").innerHTML="<p>Voting is closed. Thank you for taking part.</p>";return}

  const [c,v,ph]=await Promise.all([
    sb.rpc("ballot_candidates",{p_lrn:user,p_pw:pass}),
    sb.rpc("my_ballot",{p_lrn:user,p_pw:pass}),
    sb.rpc("ballot_photos",{p_lrn:user,p_pw:pass})
  ]);
  if(c.error)return msg("vMsg","Ballot error: "+esc(c.error.message));
  photos={};if(!ph.error)(ph.data||[]).forEach(p=>{photos[p.id]=p.photo});
  const list=c.data||[],mine=v.data||[];
  cands=list;picked=null;
  if(!list.length){$("ballot").innerHTML="<p>No candidates yet.</p>";return}
  const offices=[...new Set(list.map(x=>x.office))].sort((a,b)=>posRank(a)-posRank(b)||a.localeCompare(b));   // President first, then Vice President, and so on
  const done=new Map(mine.map(m=>[m.office,m.candidate_id]));
  const next=offices.find(o=>!done.has(o));
  if(!next){
    $("ballot").innerHTML="<p>You have answered all positions. Thank you!</p>"+
      offices.map(o=>{
        const cand=list.find(x=>x.id===done.get(o));
        return `<div class="cand"><div><b>${esc(o)}</b><br><small>${cand?esc(cand.name):"No candidate selected"}</small></div><span class="chip">${cand?"Your vote":"Abstained"}</span></div>`;
      }).join("");
    return;
  }
  const n=offices.filter(o=>done.has(o)).length+1;
  const after=offices.find(o=>!done.has(o)&&o!==next);
  const cards=list.filter(x=>x.office===next).map(x=>
    `<button type="button" class="bcard" data-id="${x.id}" onclick="pick('${x.id}')"><span class="bchk"></span><div class="bph">${photoHtml(x)}</div><div class="bname">${esc(x.name)}</div></button>`).join("");
  $("ballot").innerHTML=
    `<div class="bh"><span>${esc(next)}</span><small>Position ${n} of ${offices.length}</small></div>`+
    `<p class="bhint">Pick 1 candidate for ${esc(next)}. Click a photo to select it, and click it again to deselect.</p>`+
    `<div class="bwrap"><aside class="bside"><div class="bcount"><b id="pickN">0</b> out of <b>1</b></div>`+
    `<div class="bpick" id="pickList"><small>No candidate picked</small></div>`+
    `<button class="btn alt bsm" data-o="${esc(next)}" onclick="abstain(this.dataset.o)">Abstain</button></aside>`+
    `<div class="bgrid">${cards}</div></div>`+
    `<div class="bbar"><span>${after?"Next screen: "+esc(after):"Next screen: Your completed ballot"}</span>`+
    `<button id="doneBtn" class="btn ok" disabled onclick="finishPick()">Finished Choosing &gt;&gt;</button></div>`;
}
function pick(id){
  picked=(picked===id)?null:id;
  document.querySelectorAll(".bcard").forEach(b=>b.classList.toggle("sel",b.dataset.id===picked));
  const c=cands.find(x=>x.id===picked);
  $("pickN").textContent=picked?"1":"0";
  $("pickList").innerHTML=picked&&c?`<div class="bchip">${esc(c.name)}</div>`:"<small>No candidate picked</small>";
  $("doneBtn").disabled=!picked;
}
function finishPick(){if(picked)vote(picked)}
async function abstain(office){
  if(!confirm("Abstain from this position? It cannot be changed."))return;
  const {data,error}=await sb.rpc("cast_abstain",{p_lrn:user,p_pw:pass,p_office:office});
  if(error||(data!=="OK"&&data!=="ALREADY")){
    const m=await notOpenMsg();
    if(m){msg("vMsg",m);return renderBallot()}
    return msg("vMsg","Could not record your choice. Try again.");
  }
  $("vMsg").innerHTML="";
  renderBallot();
}
async function vote(id){
  if(!confirm("Submit your vote for this position? It cannot be changed."))return;
  const {data,error}=await sb.rpc("cast_vote",{p_lrn:user,p_pw:pass,p_candidate:id});
  if(error||(data!=="OK"&&data!=="ALREADY")){
    const m=await notOpenMsg();
    if(m){msg("vMsg",m);return renderBallot()}
    return msg("vMsg","Could not record your vote. Try again.");
  }
  $("vMsg").innerHTML="";
  renderBallot();
}

// Forgot password: LRN + one-time password from the admin + new password
function showReset(){$("sAuth").classList.add("hide");$("sReset").classList.remove("hide")}
function hideReset(){
  $("sReset").classList.add("hide");$("sAuth").classList.remove("hide");
  $("rlrn").value=$("rcode").value=$("rpw").value="";$("rMsg").innerHTML="";
}
async function resetPassword(){
  if(initError)return msg("rMsg","Setup error: "+esc(initError));
  const l=$("rlrn").value.trim(),c=$("rcode").value.trim(),p=$("rpw").value;
  if(!/^\d{12}$/.test(l))return msg("rMsg","LRN must be exactly 12 digits.");
  if(!/^\d{6}$/.test(c))return msg("rMsg","Enter the 6-digit one-time password from your admin.");
  const {data,error}=await sb.rpc("student_reset_with_otp",{p_lrn:l,p_code:c,p_new:p});
  if(error)return msg("rMsg","Connection error. Try again.");
  if(data==="OK"){hideReset();return msg("sMsg","Password changed! You can log in now.",1)}
  msg("rMsg",{WEAK:"New password must be at least 6 characters.",BAD_CODE:"Wrong or expired one-time password. Ask the admin for a new one."}[data]||"Could not reset. Try again.");
}

// Always start at a clean sign-in screen (reload, back button, or a restored tab)
function resetToSignIn(){
  clearInterval(timerId);user=pass=null;picked=null;
  ["sVote","sReset","sRegister"].forEach(id=>{const el=$(id);if(el)el.classList.add("hide")});
  $("sAuth").classList.remove("hide");
  ["lrn","spw","sgrade","rgLrn","rgGrade","rgEmail","rgPw","rgPw2","rlrn","rcode","rpw"].forEach(id=>{const el=$(id);if(el)el.value=""});
  ["sMsg","rgMsg","vMsg","rMsg","ballot","vTimer"].forEach(id=>{const el=$(id);if(el)el.innerHTML=""});
  window.scrollTo(0,0);
}
if("scrollRestoration" in history)history.scrollRestoration="manual";
window.addEventListener("pageshow",resetToSignIn);


// ---- Request code from admin (Reset Password) ----
let _rrWait = false;
async function requestResetCode(){
  if (initError) return msg("rMsg", "Setup error: " + esc(initError));
  const l = $("rlrn").value.trim();
  if (!/^\d{12}$/.test(l)) return msg("rMsg", "Enter your 12-digit LRN first.");
  if (_rrWait) return;
  _rrWait = true; setTimeout(() => { _rrWait = false; }, 30000);   // 30 s cooldown per page
  const { error } = await sb.rpc("request_reset", { p_lrn: l });
  // Same answer whether or not the LRN is registered, so nobody can probe for LRNs
  if (error) { _rrWait = false; return msg("rMsg", "Could not send the request. Try again."); }
  msg("rMsg", "If that LRN is registered, your admin has been notified. Wait for the one-time password in your Gmail, then type it below.", 1);
}
