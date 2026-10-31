let user=null,pass=null,pendingLrn="";

// STEP 1 of registration: validate, then email a one-time code. No account exists yet.
async function studentStartRegister(){
  if(initError)return msg("sMsg","Setup error: "+esc(initError));
  const l=$("lrn").value.trim(),p=$("spw").value,g=parseInt($("sgrade").value,10),
        e=$("semail").value.trim().toLowerCase();
  if(!/^\d{12}$/.test(l))return msg("sMsg","LRN must be exactly 12 digits.");
  if(!g)return msg("sMsg","Please choose your grade level.");
  if(!/^[a-z0-9._%+-]+@gmail\.com$/.test(e))return msg("sMsg","Enter a valid Gmail address (name@gmail.com).");
  if(!confirm("Register as Grade "+g+"? You cannot change your grade level later."))return;
  msg("sMsg","Sending code...",1);
  const {data,error}=await sb.functions.invoke("send-code",{body:{purpose:"REGISTER",lrn:l,email:e,pw:p,grade:g}});
  const st=data&&data.status;
  if(error||!st)return msg("sMsg","Could not send the email. Try again.");
  if(st==="SENT"){
    pendingLrn=l;
    $("sAuth").classList.add("hide");$("sVerify").classList.remove("hide");
    return msg("vfMsg","We sent a 6-digit code to "+esc(e)+". It expires in 15 minutes.",1);
  }
  msg("sMsg",{
    BAD_EMAIL:"Enter a valid Gmail address (name@gmail.com).",
    NOT_ENROLLED:"LRN not found in the official SY enrollment list.",
    EXISTS:"This LRN is already registered. Please log in.",
    WEAK:"Password must be at least 6 characters.",
    WRONG_GRADE:"That grade level doesn't match your enrollment record. Ask the admin.",
    NO_GRADE:"Please choose your grade level.",
    WAIT:"Please wait a minute before asking for another code."
  }[st]||"Could not send the email. Try again.");
}

// STEP 2: student types the emailed code -> account is created with a verified Gmail
async function verifyRegister(){
  const c=$("vcode").value.trim();
  if(!/^\d{6}$/.test(c))return msg("vfMsg","Enter the 6-digit code.");
  const {data,error}=await sb.rpc("student_register_verify",{p_lrn:pendingLrn,p_code:c});
  if(error)return msg("vfMsg","Connection error. Try again.");
  if(data==="OK"){
    $("vcode").value="";$("vfMsg").innerHTML="";
    $("sVerify").classList.add("hide");$("sAuth").classList.remove("hide");
    return msg("sMsg","Registered and Gmail verified! You can log in now.",1);
  }
  msg("vfMsg",{EXISTS:"This LRN is already registered. Please log in."}[data]||"Wrong or expired code.");
}
function cancelVerify(){
  $("sVerify").classList.add("hide");$("sAuth").classList.remove("hide");
  $("vcode").value="";$("vfMsg").innerHTML="";
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
function studentLogout(){user=pass=null;$("sVote").classList.add("hide");$("sAuth").classList.remove("hide");$("spw").value="";$("sMsg").innerHTML="";$("vMsg").innerHTML=""}

async function renderBallot(){
  const [c,v]=await Promise.all([
    sb.rpc("ballot_candidates",{p_lrn:user,p_pw:pass}),
    sb.rpc("my_ballot",{p_lrn:user,p_pw:pass})
  ]);
  if(c.error)return msg("vMsg","Ballot error: "+esc(c.error.message));
  const list=c.data||[],mine=v.data||[];
  if(!list.length){$("ballot").innerHTML="<p>No candidates yet.</p>";return}
  const offices=[...new Set(list.map(x=>x.office))];
  const done=new Map(mine.map(m=>[m.office,m.candidate_id]));
  const next=offices.find(o=>!done.has(o));
  if(!next){
    $("ballot").innerHTML="<p>✅ You have answered all positions. Thank you!</p>"+
      offices.map(o=>{
        const cand=list.find(x=>x.id===done.get(o));
        return `<div class="cand"><div><b>${esc(o)}</b><br><small>${cand?esc(cand.name):"No candidate selected"}</small></div><span class="chip">${cand?"✔ Your vote":"Abstained"}</span></div>`;
      }).join("");
    return;
  }
  const n=offices.filter(o=>done.has(o)).length+1;
  $("ballot").innerHTML=`<h3>${esc(next)} <small>(${n} of ${offices.length})</small></h3>`+
    list.filter(x=>x.office===next).map(x=>`<div class="cand"><div><b>${esc(x.name)}</b></div><button class="btn" onclick="vote('${x.id}')">Vote</button></div>`).join("")+
    `<div class="cand"><div><b>Abstain</b><br><small>Skip this position without voting</small></div><button class="btn alt" data-o="${esc(next)}" onclick="abstain(this.dataset.o)">Abstain</button></div>`;
}
async function abstain(office){
  if(!confirm("Abstain from this position? It cannot be changed."))return;
  const {data,error}=await sb.rpc("cast_abstain",{p_lrn:user,p_pw:pass,p_office:office});
  if(error||(data!=="OK"&&data!=="ALREADY"))return msg("vMsg","Could not record your choice. Try again.");
  $("vMsg").innerHTML="";
  renderBallot();
}
async function vote(id){
  if(!confirm("Submit your vote for this position? It cannot be changed."))return;
  const {data,error}=await sb.rpc("cast_vote",{p_lrn:user,p_pw:pass,p_candidate:id});
  if(error||(data!=="OK"&&data!=="ALREADY"))return msg("vMsg","Could not record your vote. Try again.");
  $("vMsg").innerHTML="";
  renderBallot();
}

// Forgot password: one-time code emailed to the verified Gmail
function showReset(){$("sAuth").classList.add("hide");$("sReset").classList.remove("hide")}
function hideReset(){
  $("sReset").classList.add("hide");$("sAuth").classList.remove("hide");$("rStep2").classList.add("hide");
  $("rlrn").value=$("rcode").value=$("rpw").value="";$("rMsg").innerHTML="";
}
async function sendResetCode(){
  if(initError)return msg("rMsg","Setup error: "+esc(initError));
  const l=$("rlrn").value.trim();
  if(!/^\d{12}$/.test(l))return msg("rMsg","LRN must be exactly 12 digits.");
  msg("rMsg","Sending...",1);
  const {data,error}=await sb.functions.invoke("send-code",{body:{purpose:"RESET",lrn:l}});
  const st=data&&data.status;
  if(error||!st||st==="ERROR")return msg("rMsg","Could not send the email. Try again.");
  if(st==="WAIT")return msg("rMsg","Please wait a minute before asking for another code.");
  $("rStep2").classList.remove("hide");
  msg("rMsg","If this LRN has a verified Gmail, a 6-digit code was sent. It expires in 15 minutes.",1);
}
async function resetPassword(){
  const l=$("rlrn").value.trim(),c=$("rcode").value.trim(),p=$("rpw").value;
  if(!/^\d{12}$/.test(l))return msg("rMsg","LRN must be exactly 12 digits.");
  if(!/^\d{6}$/.test(c))return msg("rMsg","Enter the 6-digit code from your Gmail.");
  const {data,error}=await sb.rpc("student_reset_with_email",{p_lrn:l,p_code:c,p_new:p});
  if(error)return msg("rMsg","Connection error. Try again.");
  if(data==="OK"){hideReset();return msg("sMsg","Password changed! You can log in now.",1)}
  msg("rMsg",{WEAK:"New password must be at least 6 characters.",BAD_CODE:"Wrong or expired code."}[data]||"Could not reset. Try again.");
}
