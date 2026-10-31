let user=null,pass=null;
async function studentRegister(){
  if(initError)return msg("sMsg","Setup error: "+esc(initError));
  const l=$("lrn").value.trim(),p=$("spw").value,g=parseInt($("sgrade").value,10);
  if(!/^\d{12}$/.test(l))return msg("sMsg","LRN must be exactly 12 digits.");
  if(!g)return msg("sMsg","Please choose your grade level.");
  if(!confirm("Register as Grade "+g+"? You cannot change your grade level later."))return;
  const {data,error}=await sb.rpc("student_register",{p_lrn:l,p_pw:p,p_grade:g});
  if(error)return msg("sMsg","Connection error. Try again.");
  const [st,code]=String(data).split(":");
  const m={
    OK:["Registered! SAVE YOUR RECOVERY CODE NOW (shown only once): "+code+" . You need it if you forget your password.",1],
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
function showReset(){$("sAuth").classList.add("hide");$("sReset").classList.remove("hide")}
function hideReset(){
  $("sReset").classList.add("hide");$("sAuth").classList.remove("hide");
  $("rlrn").value=$("rcode").value=$("rpw").value="";$("rMsg").innerHTML="";
}
async function resetPassword(){
  if(initError)return msg("rMsg","Setup error: "+esc(initError));
  const l=$("rlrn").value.trim(),c=$("rcode").value.trim(),p=$("rpw").value;
  if(!/^\d{12}$/.test(l))return msg("rMsg","LRN must be exactly 12 digits.");
  const {data,error}=await sb.rpc("student_reset_password",{p_lrn:l,p_code:c,p_new:p});
  if(error)return msg("rMsg","Connection error. Try again.");
  const [st,nc]=String(data).split(":");
  if(st==="OK")return msg("rMsg","Password changed! Your NEW recovery code (the old one no longer works): "+nc+" . Save it, then go back and log in.",1);
  msg("rMsg",{WEAK:"New password must be at least 6 characters.",BAD_CODE:"LRN or recovery code is incorrect."}[st]||"Could not reset. Try again.");
}
async function newRecovery(){
  if(!confirm("Make a new recovery code? Your old code will stop working."))return;
  const {data,error}=await sb.rpc("student_new_recovery",{p_lrn:user,p_pw:pass});
  const [st,code]=String(data).split(":");
  if(error||st!=="OK")return msg("vMsg","Could not make a new code. Try again.");
  msg("vMsg","Your NEW recovery code (save it, shown only once): "+code,1);
}