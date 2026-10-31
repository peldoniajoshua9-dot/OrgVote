let adminId=null,state=null,students=[],stuErr="",lastError=null;
async function load(){
  const {data,error}=await sb.rpc("admin_state",{p_admin:adminId});
  if(error){lastError=error;return false;}
  state=data;
  // Student list is separate so the rest of the panel still works if the new SQL has not been run yet
  const s=await sb.rpc("admin_list_students",{p_admin:adminId});
  students=s.error?[]:(s.data||[]);
  stuErr=s.error?s.error.message:"";
  render();return true;
}
async function adminLogin(){
  if(initError)return msg("aMsg","Setup error: "+esc(initError));
  adminId=$("aid").value.trim();
  try{var ok=await load()}catch(e){lastError={message:e.message};ok=false}
  if(!ok){adminId=null;
    const m=lastError&&lastError.message||"";
    return msg("aMsg",m.includes("unauthorized")?"Invalid Admin ID.":"Connection error: "+esc(m||"unknown")+(lastError&&lastError.code?" ("+esc(lastError.code)+")":""));}
  $("aAuth").classList.add("hide");$("aPanel").classList.remove("hide");
}
function adminLogout(){adminId=state=null;students=[];$("aPanel").classList.add("hide");$("aAuth").classList.remove("hide");$("aid").value="";$("aMsg").innerHTML="";$("otpOut").innerHTML=""}
async function addLRN(){
  const l=$("wl").value.trim();
  if(!/^\d{12}$/.test(l))return alert("Enter a 12-digit LRN.");
  await sb.rpc("admin_add_lrn",{p_admin:adminId,p_lrn:l});$("wl").value="";load();
}
async function rmLRN(l){
  const {data}=await sb.rpc("admin_remove_lrn",{p_admin:adminId,p_lrn:l});
  if(data==="VOTED")alert("This student already voted and can't be removed.");load();
}
async function addCand(){
  const n=$("cn").value.trim(),p=$("cp").value.trim();
  if(!n||!p)return alert("Enter name and position.");
  await sb.rpc("admin_add_candidate",{p_admin:adminId,p_name:n,p_pos:p});$("cn").value=$("cp").value="";load();
}
async function rmCand(id){
  const {data}=await sb.rpc("admin_remove_candidate",{p_admin:adminId,p_id:id});
  if(data==="VOTING_STARTED")alert("Candidates can't be removed once voting has started.");load();
}

// ---- Student Gmail verification + one-time password ----
async function verifyEmail(l,v){
  const {data,error}=await sb.rpc("admin_set_email_verified",{p_admin:adminId,p_lrn:l,p_verified:v});
  if(error)return alert("Error: "+error.message);
  if(data==="NO_EMAIL")return alert("This student has no Gmail on file. Use Edit Gmail first.");
  $("otpOut").innerHTML="";load();
}
async function editEmail(l){
  const cur=(students.find(s=>s.lrn===l)||{}).email||"";
  const e=prompt("Gmail for LRN "+l+".\nOnly save it after confirming with the student that it is theirs (it will be marked verified):",cur);
  if(e===null)return;
  const {data,error}=await sb.rpc("admin_set_email",{p_admin:adminId,p_lrn:l,p_email:e.trim()});
  if(error)return alert("Error: "+error.message);
  if(data==="BAD_EMAIL")return alert("Enter a valid Gmail address (name@gmail.com).");
  $("otpOut").innerHTML="";load();
}
async function genOtp(l){
  const out=$("otpOut");
  const {data,error}=await sb.rpc("admin_generate_otp",{p_admin:adminId,p_lrn:l});
  if(error){out.innerHTML="<p><small>Error: "+esc(error.message)+"</small></p>";return}
  const [st,code,email]=String(data).split(":");
  if(st!=="OK"){out.innerHTML="<p><small>"+(st==="NOT_REGISTERED"?"This LRN has not registered yet.":"Could not make an OTP.")+"</small></p>";return}
  const body="Your OrgVote one-time password is "+code+". It works once and expires in 15 minutes. Do not share it with anyone.";
  const link=email?("https://mail.google.com/mail/?view=cm&fs=1&to="+encodeURIComponent(email)+"&su="+encodeURIComponent("OrgVote one-time password")+"&body="+encodeURIComponent(body)).replace(/&/g,"&amp;"):"";
  out.innerHTML=`<div class="cand" style="flex-direction:column;align-items:flex-start"><div>OTP for LRN <b>${esc(l)}</b>: <b style="font-size:1.8rem;letter-spacing:4px">${esc(code)}</b></div>`+
    (email
      ?`<div>Verified Gmail: <b>${esc(email)}</b></div><a class="btn" style="text-decoration:none" target="_blank" rel="noopener" href="${link}">Open Gmail to send it</a>`
      :`<small>This student's Gmail is not verified (or missing). Verify it below to email the OTP, or give this OTP in person.</small>`)+
    `<small>Valid for 15 minutes, one use. Making a new OTP cancels the old one.</small></div>`;
}
function renderStudents(){
  const box=$("stuList");
  if(stuErr){box.innerHTML="<small>Could not load students: "+esc(stuErr)+". Run orgvote_admin_otp.sql in the Supabase SQL Editor.</small>";return}
  const q=($("stuSearch").value||"").trim().toLowerCase();
  const rows=students.filter(s=>!q||s.lrn.includes(q)||(s.email||"").includes(q));
  if(!rows.length){box.innerHTML="<small>"+(students.length?"No match.":"No students have registered yet.")+"</small>";return}
  box.innerHTML=`<div style="overflow-x:auto"><table class="stu"><thead><tr><th>LRN</th><th>Grade</th><th>Gmail</th><th>Status</th><th>Actions</th></tr></thead><tbody>`+
    rows.map(s=>{
      const status=s.verified?`<span class="chip">✔ Verified</span>`:(s.email?`<span class="chip">Unverified</span>`:`<small>No Gmail</small>`);
      const acts=
        (s.email&&!s.verified?`<button class="btn sm" onclick="verifyEmail('${s.lrn}',true)">Verify</button>`:"")+
        (s.verified?`<button class="btn sm alt" onclick="verifyEmail('${s.lrn}',false)">Unverify</button>`:"")+
        `<button class="btn sm alt" onclick="editEmail('${s.lrn}')">${s.email?"Edit Gmail":"Add Gmail"}</button>`+
        `<button class="btn sm" onclick="genOtp('${s.lrn}')">Get OTP</button>`;
      return `<tr><td>${esc(s.lrn)}</td><td>${esc(String(s.grade==null?"-":s.grade))}</td><td>${s.email?esc(s.email):"<small>none</small>"}</td><td>${status}</td><td>${acts}</td></tr>`;
    }).join("")+`</tbody></table></div>`;
}

function render(){
  $("wlList").innerHTML=state.whitelist.map(l=>`<span class="chip">${l} <a href="#" onclick="rmLRN('${l}');return false">✕</a></span>`).join("")||"<small>No LRNs yet.</small>";
  $("cList").innerHTML=state.candidates.map(c=>`<span class="chip">${esc(c.name)} — ${esc(c.position)} <a href="#" onclick="rmCand('${c.id}');return false">✕</a></span>`).join("")||"<small>No candidates yet.</small>";
  renderStudents();
  const total=state.total_votes;
  $("results").innerHTML=`<p>Total votes: <b>${total}</b> / Registered voters: <b>${state.registered}</b></p>`+
    state.candidates.map(c=>{const pc=total?Math.round(c.votes/total*100):0;return`<div style="margin:10px 0"><b>${esc(c.name)}</b> <small>(${esc(c.position)})</small> — ${c.votes} votes (${pc}%)<div class="bar"><i style="width:${pc}%"></i></div></div>`}).join("");
}
function csv(){
  const rows=[["Candidate","Position","Votes"],...state.candidates.map(c=>[c.name,c.position,c.votes])];
  const f=v=>/^[=+\-@]/.test(String(v))?"'"+v:v;
  const out=rows.map(r=>r.map(v=>`"${String(f(v)).replace(/"/g,'""')}"`).join(",")).join("\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([out],{type:"text/csv"}));a.download="orgvote-results.csv";a.click();
}
