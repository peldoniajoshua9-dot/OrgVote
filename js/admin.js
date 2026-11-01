let adminId=null,state=null,students=[],stuErr="",wlist=[],wlNote="",lastError=null;
let win=null,cphotos={},winTick=null;   // voting timer + candidate photos
let view="res",wlSel="all",wlOpen=false;   // Results opens first; the Whitelist dropdown starts closed
const openG=new Set();       // whitelist grade folders opened in the "all" view
const closedC=new Set();     // candidate position windows the admin closed
const GI={"7":'<i class="bul g7"></i>',"8":'<i class="bul g8"></i>',"9":'<i class="bul g9"></i>',"10":'<i class="bul g10"></i>',"11":'<i class="bul g11"></i>',"12":'<i class="bul g12"></i>',"none":'<i class="bul gn"></i>'};  // a different bullet per grade folder

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
  const p=await sb.rpc("admin_list_candidate_photos",{p_admin:adminId});
  cphotos=p.error?{}:(p.data||{});
  const wd=await sb.rpc("admin_get_window",{p_admin:adminId});
  win=wd.error?null:wd.data;
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
  clearInterval(winTick);win=null;cphotos={};
  adminId=state=null;students=[];wlist=[];view="res";wlSel="all";wlOpen=false;
  $("aPanel").classList.add("hide");$("aAuth").classList.remove("hide");
  $("aid").value="";$("aMsg").innerHTML="";$("otpOut").innerHTML="";
}

// ---- Left sidebar ----
function go(v,sel){
  view=v;
  if(v==="wl"){wlSel=sel||"all";wlOpen=true;if(/^\d+$/.test(wlSel))$("wgrade").value=wlSel;}
  render();window.scrollTo({top:0,behavior:"smooth"});
}
function toggleWl(){
  if(view!=="wl"){view="wl";wlSel="all";wlOpen=true;}   // first click opens the Whitelist and its dropdown
  else wlOpen=!wlOpen;                                  // later clicks open or close the dropdown
  render();
}
function renderSide(){
  const cnt=k=>wlist.filter(w=>(w.grade==null?"none":String(w.grade))===k).length;
  const item=(icon,label,click,on,count,sub)=>
    `<a href="#" class="si${sub?" sub":""}${on?" on":""}" onclick="${click};return false"><span class="ic">${icon}</span><span>${label}</span>${count==null?"":`<span class="chip">${count}</span>`}</a>`;
  let h=item('<i class="bul sq"></i>',"Results","go('res')",view==="res");
  h+=item('<i class="bul dia"></i>',"Candidates","go('cand')",view==="cand",state.candidates.length);
  h+=item('<i class="bul tm"></i>',"Timer &amp; Reset","go('ctl')",view==="ctl");
  h+=`<a href="#" class="si${view==="wl"&&wlSel==="all"?" on":""}" onclick="toggleWl();return false"><span class="ic"><i class="bul fold"></i></span><span>Whitelist</span><span class="chip">${wlist.length}</span><span class="caret">${wlOpen?"▾":"▸"}</span></a>`;
  if(wlOpen){   // the dropdown: one folder per grade, each with its own bullet
    ["7","8","9","10","11","12"].forEach(g=>{h+=item(GI[g],"Grade "+g,`go('wl','${g}')`,view==="wl"&&wlSel===g,cnt(g),1)});
    if(cnt("none"))h+=item(GI.none,"No grade",`go('wl','none')`,view==="wl"&&wlSel==="none",cnt("none"),1);
  }
  h+=item('<i class="bul cir"></i>',"Students &amp; OTP","go('stu')",view==="stu",students.length);
  h+=`<a href="#" class="si out" onclick="adminLogout();return false"><span class="ic"><i class="bul out"></i></span><span>Log out</span></a>`;
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
  return `<span class="chip">${esc(w.lrn)}${w.registered?" <small>registered</small>":""}${k==="none"?` <a href="#" onclick="setGrade('${w.lrn}');return false">set grade</a>`:""} <a href="#" onclick="rmLRN('${w.lrn}');return false">×</a></span>`;
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
function photoTag(c){
  const p=cphotos[c.id];
  if(p&&/^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(p))return `<img src="${p}" alt="">`;
  return esc(String(c.name||"?").trim().charAt(0).toUpperCase());
}
function renderCandidates(){
  $("cList").innerHTML=byPosition(state.candidates).map(([p,cs])=>
    `<details class="folder" data-p="${esc(p)}" ${closedC.has(p)?"":"open"} ontoggle="winToggle(this)"><summary><i class="bul dia"></i> ${esc(p)} <span class="chip">${cs.length} candidate${cs.length>1?"s":""}</span></summary><div>`+
    cs.map(c=>{const has=!!cphotos[c.id];return `<div class="acand"><div class="aph">${photoTag(c)}</div><div class="ainfo"><b>${esc(c.name)}</b><div>`+
      `<label class="btn sm alt" style="cursor:pointer">${has?"Change photo":"Add photo"}<input type="file" accept="image/*" hidden onchange="setPhoto('${c.id}',this)"></label>`+
      (has?`<button class="btn sm alt" onclick="rmPhoto('${c.id}')">Remove photo</button>`:"")+
      `<button class="btn sm alt" onclick="rmCand('${c.id}')">Delete candidate</button></div></div></div>`}).join("")+
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
      const status=s.verified?`<span class="chip">Verified</span>`:(s.email?`<span class="chip">Unverified</span>`:`<small>No Gmail</small>`);
      const first=s.verified
        ?`<button class="btn sm alt" onclick="verifyEmail('${s.lrn}',false)">Unverify</button>`
        :(s.email?`<button class="btn sm" onclick="verifyEmail('${s.lrn}',true)">Verify</button>`:`<span></span>`);
      const acts=`<div class="acts">${first}`+
        `<button class="btn sm alt" onclick="editEmail('${s.lrn}')">${s.email?"Edit Gmail":"Add Gmail"}</button>`+
        `<button class="btn sm" onclick="genOtp('${s.lrn}')">Get OTP</button></div>`;
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

// ---- Candidate photos ----
function shrink(file){   // crop to 240x300 and compress to a small JPEG
  return new Promise((res,rej)=>{
    const img=new Image(),u=URL.createObjectURL(file);
    img.onload=()=>{
      const W=240,H=300,cv=document.createElement("canvas");cv.width=W;cv.height=H;
      const x=cv.getContext("2d"),r=Math.max(W/img.width,H/img.height),w=img.width*r,h=img.height*r;
      x.fillStyle="#fff";x.fillRect(0,0,W,H);
      x.drawImage(img,(W-w)/2,(H-h)*0.25,w,h);   // keeps heads in frame
      URL.revokeObjectURL(u);res(cv.toDataURL("image/jpeg",0.82));
    };
    img.onerror=()=>{URL.revokeObjectURL(u);rej(new Error("bad image"))};
    img.src=u;
  });
}
async function setPhoto(id,input){
  const f=input.files&&input.files[0];input.value="";
  if(!f)return;
  if(!/^image\//.test(f.type))return alert("Choose an image file (JPG or PNG).");
  let url;try{url=await shrink(f)}catch(e){return alert("Could not read that image.")}
  const {data,error}=await sb.rpc("admin_set_candidate_photo",{p_admin:adminId,p_id:id,p_photo:url});
  if(error)return alert("Error: "+error.message+"\nRun orgvote_ballot_features.sql in the Supabase SQL Editor.");
  if(data!=="OK")return alert("Could not save the photo.");
  load();
}
async function rmPhoto(id){
  if(!confirm("Remove this candidate's photo?"))return;
  const {data,error}=await sb.rpc("admin_set_candidate_photo",{p_admin:adminId,p_id:id,p_photo:null});
  if(error)return alert("Error: "+error.message);
  load();
}

// ---- Voting timer + reset ballot ----
function fmtLeft(s){
  s=Math.max(0,Math.floor(s));
  const d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60),x=s%60;
  return (d?d+"d ":"")+((d||h)?h+"h ":"")+m+"m "+String(x).padStart(2,"0")+"s";
}
function winText(){
  if(!win||win.state==="none")return "No timer is set. Voting is open all the time.";
  const now=Date.now();
  const o=win.opens_at?new Date(win.opens_at).toLocaleString():"",c=win.closes_at?new Date(win.closes_at).toLocaleString():"";
  if(win.state==="upcoming")return "Voting opens "+o+" (in "+fmtLeft((Date.parse(win.opens_at)-now)/1000)+")"+(c?" and closes "+c+".":".");
  if(win.state==="closed")return "Voting closed on "+c+".";
  return "Voting is open"+(c?" and closes "+c+" ("+fmtLeft((Date.parse(win.closes_at)-now)/1000)+" left).":".");
}
function renderControl(){
  clearInterval(winTick);
  $("winStatus").textContent=winText();
  if(view!=="ctl")return;
  winTick=setInterval(()=>{
    $("winStatus").textContent=winText();
    const edge=win&&((win.state==="upcoming"&&Date.parse(win.opens_at)<=Date.now())||(win.state==="open"&&win.closes_at&&Date.parse(win.closes_at)<=Date.now()));
    if(edge){clearInterval(winTick);load()}
  },1000);
}
async function setWindow(){
  const d=parseInt($("tmDays").value||"0",10),h=parseInt($("tmHours").value||"0",10);
  if(!(d>=0&&h>=0)||(d===0&&h===0))return msg("ctlMsg","Enter days and/or hours greater than 0.");
  const sv=$("tmStart").value,start=sv?new Date(sv):null;
  if(start&&isNaN(start))return msg("ctlMsg","Pick a valid start date and time.");
  const base=start||new Date();
  const end=new Date(base.getTime()+d*86400000+h*3600000);
  const {data,error}=await sb.rpc("admin_set_window",{p_admin:adminId,p_opens:start?start.toISOString():null,p_closes:end.toISOString()});
  if(error)return msg("ctlMsg","Error: "+esc(error.message)+". Run orgvote_ballot_features.sql in Supabase.");
  if(data!=="OK")return msg("ctlMsg","That time range is not valid.");
  msg("ctlMsg","Timer saved: voting "+(start?"opens "+start.toLocaleString():"is open now")+" and closes "+end.toLocaleString()+".",1);
  load();
}
async function closeNow(){
  if(!confirm("Close voting right now? Students will not be able to vote."))return;
  const {error}=await sb.rpc("admin_close_voting_now",{p_admin:adminId});
  if(error)return msg("ctlMsg","Error: "+esc(error.message));
  msg("ctlMsg","Voting is closed.",1);load();
}
async function clearWindow(){
  const {error}=await sb.rpc("admin_clear_window",{p_admin:adminId});
  if(error)return msg("ctlMsg","Error: "+esc(error.message));
  msg("ctlMsg","Timer removed. Voting is open all the time.",1);load();
}
async function resetBallot(){
  if($("rbConfirm").value.trim()!=="RESET")return msg("ctlMsg","Type RESET (capital letters) in the box to confirm.");
  if(!confirm("This permanently deletes ALL votes and abstains. Students and candidates are kept. Continue?"))return;
  const {data,error}=await sb.rpc("admin_reset_ballot",{p_admin:adminId});
  if(error)return msg("ctlMsg","Error: "+esc(error.message)+". Run orgvote_ballot_features.sql in Supabase.");
  const [st,n,tables]=String(data).split(":");
  $("rbConfirm").value="";
  if(st!=="OK")return msg("ctlMsg","Could not reset the ballot.");
  msg("ctlMsg","Ballot reset. "+esc(n)+" record(s) cleared from: "+esc(tables||"no tables found")+".",1);
  load();
}

function render(){
  if(wlSel==="none"&&!wlist.some(w=>w.grade==null))wlSel="all";   // the "No grade" folder emptied out
  const sections={wl:"vWl",stu:"vStu",cand:"vCand",ctl:"vCtl",res:"vRes"};
  Object.keys(sections).forEach(k=>$(sections[k]).classList.toggle("hide",k!==view));
  renderSide();renderWhitelist();renderCandidates();renderStudents();renderResults();renderControl();
}
function csv(){
  const rows=[["Candidate","Position","Votes"],...state.candidates.map(c=>[c.name,c.position,c.votes])];
  const f=v=>/^[=+\-@]/.test(String(v))?"'"+v:v;
  const out=rows.map(r=>r.map(v=>`"${String(f(v)).replace(/"/g,'""')}"`).join(",")).join("\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([out],{type:"text/csv"}));a.download="orgvote-results.csv";a.click();
}
