let user=null,pass=null;
let cands=[],photos={},picked=null,vstatus=null,timerId=null;
async function studentRegister(){
  if(initError)return msg("sMsg","Setup error: "+esc(initError));
  const l=$("lrn").value.trim(),p=$("spw").value,g=parseInt($("sgrade").value,10),
        e=$("semail").value.trim().toLowerCase();
  if(!/^\d{12}$/.test(l))return msg("sMsg","LRN must be exactly 12 digits.");
  if(!g)return msg("sMsg","Please choose your grade level.");
  if(!/^[a-z0-9._%+-]+@gmail\.com$/.test(e))return msg("sMsg","Enter a valid Gmail address (name@gmail.com).");
  if(!confirm("Register as Grade "+g+" with "+e+"? You cannot change your grade level later."))return;
  const {data,error}=await sb.rpc("student_register_email",{p_lrn:l,p_pw:p,p_grade:g,p_email:e});
  if(error)return msg("sMsg","Connection error. Try again.");
  const st=String(data).split(":")[0];
  const m={
    OK:["Registered! You can log in now. If you forget your password, ask your admin for a one-time password.",1],
    BAD_EMAIL:["Enter a valid Gmail address (name@gmail.com)."],
    NOT_ENROLLED:["LRN not found in the official SY enrollment list."],
    EXISTS:["This LRN is already registered. Please log in."],
    WEAK:["Password must be at least 6 characters."],
    WRONG_GRADE:["That grade level doesn't match your enrollment record. Ask the admin."],
    NO_GRADE:["Please choose your grade level."]
  }[st]||["Could not register. Try again."];
  msg("sMsg",m[0],m[1]);
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
  const offices=[...new Set(list.map(x=>x.office))];
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
