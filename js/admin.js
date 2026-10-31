let adminId=null,state=null,students=[],stuErr="",wlist=[],wlNote="",lastError=null;
let view="wl",wlSel="all";   // which section and which whitelist folder are showing
const openG=new Set();       // whitelist grade folders opened in the "all" view
const closedC=new Set();     // candidate position windows the admin closed
const GI={"7":"🔵","8":"🟢","9":"🟡","10":"🟠","11":"🔴","12":"🟣","none":"⚪"};  // a different bullet per grade folder

async function load(){
  const {data,error}=await sb.rpc("admin_state",{p_admin:adminId});
  if(error){lastError=error;return false;}
  state=data;
  // Extra lists load separately so the panel still works if a SQL file has not been run yet
  const s=await sb.rpc("admin_list_students",{p_admin:adminId});
  students=s.error?[]:(s.data||[]);
  stuErr=s.error?s.error.message:"";
  const w=await sb.rpc("admin_list_whitelist",{p_admin:adminId});
  if(w.error){
    wlist=(state.whitelist||[]).map(l=>({lrn:l,grade:null,registered:false}));
    wlNote="Grade folders need orgvote_admin_organize.sql to be run in Supabase.";
  }else{wlist=w.data||[];wlNote="";}
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
function adminLogout(){
  adminId=state=null;students=[];wlist=[];view="wl";wlSel="all";
  $("aPanel").classList.add("hide");$("aAuth").classList.remove("hide");
  $("aid").value="";$("aMsg").innerHTML="";$("otpOut").innerHTML="";
}

// ---- Left sidebar ----
function go(v,sel){
  view=v;
  if(v==="wl"){wlSel=sel||"all";if(/^\d+$/.test(wlSel))$("wgrade").value=wlSel;}
  render();window.scrollTo({top:0,behavior:"smooth"});
}
function renderSide(){
  const cnt=k=>wlist.filter(w=>(w.grade==null?"none":String(w.grade))===k).length;
  const item=(icon,label,click,on,count,sub)=>
    `<a href="#" class="si${sub?" sub":""}${on?" on":""}" onclick="${click};return false"><span class="ic">${icon}</span><span>${label}</span>${count==null?"":`<span class="chip">${count}</span>`}</a>`;
  let h=item("📁","Whitelist","go('wl','all')",view==="wl"&&wlSel==="all",wlist.length);
  ["7","8","9","10","11","12"].forEach(g=>{h+=item(GI[g],"Grade "+g,`go('wl','${g}')`,view==="wl"&&wlSel===g,cnt(g),1)});
  if(cnt("none"))h+=item(GI.none,"No grade",`go('wl','none')`,view==="wl"&&wlSel==="none",cnt("none"),1);
  h+=item("✉️","Students &amp; OTP","go('stu')",view==="stu",students.length);
  h+=item("🗳️","Candidates","go('cand')",view==="cand",state.candidates.length);
  h+=item("📊","Results","go('res')",view==="res");
  h+=`<a href="#" class="si out" onclick="adminLogout();return false"><span class="ic">🚪</span><span>Log out</span></a>`;
  $("side").innerHTML=h;
}

// ---- Whitelist (grade-level folders) ----
async function addLRN(){
  const l=$("wl").value.trim(),g=parseInt($("wgrade").value,10);
  if(!/^\d{12}$/.test(l))return alert("Enter a 12-digit LRN.");
  if(!g)return alert("Choose the grade level for this LRN.");
  const {data,error}=await sb.rpc("admin_add_lrn_grade",{p_admin:adminId,p_lrn:l,p_grade:g});
  if(error){
    // SQL not run yet: fall back to the old add so the admin is not blocked
    await sb.rpc("admin_add_lrn",{p_admin:adminId,p_lrn:l});
    $("wl").value="";return load();
  }
  if(data==="REGISTERED_OTHER_GRADE")return alert("This student already registered under a different grade level.");
  if(data!=="OK")return alert("Could not add this LRN.");
  openG.add(String(g));$("wl").value="";load();
}
async function setGrade(l){
  const g=parseInt(prompt("Grade level (7 to 12) for LRN "+l+":"),10);
  if(!g)return;
  const {data,error}=await sb.rpc("admin_add_lrn_grade",{p_admin:adminId,p_lrn:l,p_grade:g});
  if(error)return alert("Error: "+error.message);
  if(data==="BAD_GRADE")return alert("Grade must be 7 to 12.");
  if(data==="REGISTERED_OTHER_GRADE")return alert("This student already registered under a different grade level.");
  openG.add(String(g));load();
}
async function rmLRN(l){
  const {data}=await sb.rpc("admin_remove_lrn",{p_admin:adminId,p_lrn:l});
  if(data==="VOTED")alert("This student already voted and can't be removed.");load();
}
function folderToggle(k,isOpen){isOpen?openG.add(k):openG.delete(k)}
function lrnChip(w,k){
  return `<span class="chip">${esc(w.lrn)}${w.registered?" ✔":""}${k==="none"?` <a href="#" onclick="setGrade('${w.lrn}');return false">set grade</a>`:""} <a href="#" onclick="rmLRN('${w.lrn}');return false">✕</a></span>`;
}
function renderWhitelist(){
  const groups={};
  wlist.forEach(w=>{const k=w.grade==null?"none":String(w.grade);(groups[k]=groups[k]||[]).push(w)});
  const reg=wlist.filter(w=>w.registered).length;
  $("wlSummary").innerHTML="<b>"+wlist.length+"</b> LRNs on the whitelist"+(wlNote?"":" · <b>"+reg+"</b> registered")+(wlNote?"<br><small>"+esc(wlNote)+"</small>":"");
  if(!wlist.length){$("wlList").innerHTML="<small>No LRNs yet.</small>";return}

  if(wlSel!=="all"){   // one folder picked in the sidebar
    const items=groups[wlSel]||[];
    const title=wlSel==="none"?"No grade assigned":"Grade "+wlSel;
    $("wlList").innerHTML=`<h3 class="pos">${GI[wlSel]} ${title} <small>(${items.length})</small></h3>`+
      (items.map(w=>lrnChip(w,wlSel)).join("")||"<small>No LRNs in this folder yet.</small>");
    return;
  }
  const keys=["7","8","9","10","11","12"].concat(groups.none?["none"]:[]);   // all folders
  $("wlList").innerHTML=keys.map(k=>{
    const items=groups[k]||[];
    const title=k==="none"?"No grade assigned":"Grade "+k;
    return `<details class="folder" ${openG.has(k)?"open":""} ontoggle="folderToggle('${k}',this.open)"><summary>${GI[k]} ${title} <span class="chip">${items.length}</span></summary><div>${items.map(w=>lrnChip(w,k)).join("")||"<small>No LRNs in this folder.</small>"}</div></details>`;
  }).join("");
}

// ---- Candidates (one window per position) ----
async function addCand(){
  const n=$("cn").value.trim(),p=$("cp").value.trim();
  if(!n||!p)return alert("Enter name and position.");
  await sb.rpc("admin_add_candidate",{p_admin:adminId,p_name:n,p_pos:p});$("cn").value=$("cp").value="";load();
}
async function rmCand(id){
  const {data}=await sb.rpc("admin_remove_candidate",{p_admin:adminId,p_id:id});
  if(data==="VOTING_STARTED")alert("Candidates can't be removed once voting has started.");load();
}
function winToggle(el){el.open?closedC.delete(el.dataset.p):closedC.add(el.dataset.p)}
function byPosition(list){
  const m={};
  list.forEach(c=>{(m[c.position]=m[c.position]||[]).push(c)});
  return Object.keys(m).sort((a,b)=>a.localeCompare(b)).map(p=>[p,m[p]]);
}
function renderCandidates(){
  $("cList").innerHTML=byPosition(state.candidates).map(([p,cs])=>
    `<details class="folder" data-p="${esc(p)}" ${closedC.has(p)?"":"open"} ontoggle="winToggle(this)"><summary>🗳️ ${esc(p)} <span class="chip">${cs.length} candidate${cs.length>1?"s":""}</span></summary><div>`+
    cs.map(c=>`<span class="chip">${esc(c.name)} <a href="#" onclick="rmCand('${c.id}');return false">✕</a></span>`).join("")+
    `</div></details>`).join("")||"<small>No candidates yet.</small>";
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

// ---- Results (grouped by position, percent within each position) ----
function renderResults(){
  const total=state.total_votes;
  $("results").innerHTML=`<p>Total votes cast: <b>${total}</b> / Registered voters: <b>${state.registered}</b></p>`+
    byPosition(state.candidates).map(([p,cs])=>{
      const sum=cs.reduce((a,c)=>a+Number(c.votes||0),0);
      return `<h3 class="pos">${esc(p)} <small>(${sum} vote${sum===1?"":"s"})</small></h3>`+
        cs.map(c=>{const pc=sum?Math.round(c.votes/sum*100):0;return`<div style="margin:10px 0"><b>${esc(c.name)}</b> — ${c.votes} votes (${pc}%)<div class="bar"><i style="width:${pc}%"></i></div></div>`}).join("");
    }).join("");
}

function render(){
  if(wlSel==="none"&&!wlist.some(w=>w.grade==null))wlSel="all";   // the "No grade" folder emptied out
  const sections={wl:"vWl",stu:"vStu",cand:"vCand",res:"vRes"};
  Object.keys(sections).forEach(k=>$(sections[k]).classList.toggle("hide",k!==view));
  renderSide();renderWhitelist();renderCandidates();renderStudents();renderResults();
}
function csv(){
  const rows=[["Candidate","Position","Votes"],...state.candidates.map(c=>[c.name,c.position,c.votes])];
  const f=v=>/^[=+\-@]/.test(String(v))?"'"+v:v;
  const out=rows.map(r=>r.map(v=>`"${String(f(v)).replace(/"/g,'""')}"`).join(",")).join("\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([out],{type:"text/csv"}));a.download="orgvote-results.csv";a.click();
}
