let adminId=null,state=null,students=[],stuErr="",wlist=[],wlNote="",lastError=null;
let win=null,cphotos={},winTick=null;   // voting timer + candidate photos
let me=null,admins=[],pr={mine:null,incoming:[],admins:0},prNote="",pollId=null;   // admins + print approval
let syncV=null,syncVotes=null,syncBusy=false;   // detects changes made by another admin
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
  const mm=await sb.rpc("admin_me",{p_admin:adminId});me=mm.error?null:mm.data;
  const al=await sb.rpc("admin_list_admins",{p_admin:adminId});admins=al.error?[]:(al.data||[]);
  const pq=await sb.rpc("admin_list_print_requests",{p_admin:adminId});
  pr=pq.error||!pq.data?{mine:null,incoming:[],admins:0}:pq.data;
  const sy=await sb.rpc("admin_sync",{p_admin:adminId});
  if(!sy.error&&sy.data){syncV=sy.data.v;syncVotes=sy.data.votes}
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
  clearInterval(pollId);pollId=setInterval(pollSync,6000);   // checks for print requests from other admins
}
function adminLogout(){
  clearInterval(winTick);clearInterval(pollId);win=null;cphotos={};me=null;admins=[];pr={mine:null,incoming:[],admins:0};prNote="";document.title="OrgVote Admin";syncV=syncVotes=null;
  adminId=state=null;students=[];wlist=[];view="res";wlSel="all";wlOpen=false;
  $("aPanel").classList.add("hide");$("aAuth").classList.remove("hide");
  $("aid").value="";$("aMsg").innerHTML="";$("otpOut").innerHTML="";
}

// ---- Left sidebar ----
function go(v,sel){
  view=v;
  if(v==="wl"){wlSel=sel||"all";wlOpen=true;if(/^\d+$/.test(wlSel))$("wgrade").value=wlSel;}
  render();window.scrollTo({top:0,behavior:"smooth"});
  if(v==="res"||v==="ctl")load();   // pick up changes the other admin made
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
  let h=(me?`<div style="padding:2px 12px 8px"><small>Signed in as <b>${esc(me.name)}</b>${me.role==="main"?" (Main Admin)":""}</small></div>`:"")+item('<i class="bul sq"></i>',"Results","go('res')",view==="res");
  h+=item('<i class="bul dia"></i>',"Candidates","go('cand')",view==="cand",state.candidates.length);
  h+=item('<i class="bul tm"></i>',"Timer &amp; Reset","go('ctl')",view==="ctl");
  if(me&&me.role==="main")h+=item('<i class="bul adm"></i>',"Admins","go('adm')",view==="adm",admins.length);
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
  const cur=(wlist.find(x=>x.lrn===l)||{}).grade;
  const g=parseInt(prompt("New grade level (7 to 12) for LRN "+l+(cur?" (now Grade "+cur+")":"")+":"),10);
  if(!g)return;
  const {data,error}=await sb.rpc("admin_set_student_grade",{p_admin:adminId,p_lrn:l,p_grade:g});
  if(error)return alert("Error: "+error.message+"\nRun orgvote_promote.sql in the Supabase SQL Editor.");
  const m={BAD_GRADE:"Grade must be 7 to 12.",NOT_FOUND:"This LRN is not on the whitelist.",VOTED:"This student already voted, so the grade can't be changed. Reset the ballot first if the election is being restarted."}[data];
  if(data!=="OK")return alert(m||"Could not change the grade.");
  openG.add(String(g));load();
}
async function rmLRN(l){
  const w=wlist.find(x=>x.lrn===l);
  if(!confirm(w&&w.registered
    ?"Remove LRN "+l+" from the whitelist? The student's registered account is deleted too, and they cannot register again unless you add the LRN back.\n\nTo keep the LRN and only reset the registration, press Cancel and use 'unregister' instead."
    :"Remove LRN "+l+" from the whitelist?"))return;
  const {data}=await sb.rpc("admin_remove_lrn",{p_admin:adminId,p_lrn:l});
  if(data==="VOTED")alert("This student already voted and can't be removed.");load();
}
// Delete only the student's account. The LRN stays in its grade folder, so the student can register again.
async function unregister(l){
  if(!confirm("Unregister the student with LRN "+l+"?\n\nTheir account is deleted, but the LRN stays in the whitelist so they can register again."))return;
  const {data,error}=await sb.rpc("admin_unregister_student",{p_admin:adminId,p_lrn:l});
  if(error)return alert("Error: "+error.message+"\nRun orgvote_unregister.sql in the Supabase SQL Editor.");
  if(data==="VOTED")return alert("This student already voted, so the account can't be removed. Use Reset ballot first if the election is being restarted.");
  if(data==="NOT_REGISTERED")alert("This LRN is not registered.");
  load();
}
function folderToggle(k,isOpen){isOpen?openG.add(k):openG.delete(k)}
function lrnChip(w,k){
  return `<span class="chip">${esc(w.lrn)}${w.registered?` <small>registered</small> <a href="#" onclick="unregister('${w.lrn}');return false">unregister</a>`:""} <a href="#" onclick="setGrade('${w.lrn}');return false">${k==="none"?"set grade":"change grade"}</a> <a href="#" title="Remove this LRN from the whitelist" onclick="rmLRN('${w.lrn}');return false">×</a></span>`;
}
function isMain(){return !!(me&&me.role==="main")}
function promoPanel(){
  if(!isMain())return "";
  return `<div class="cand" style="flex-direction:column;align-items:flex-start"><div><b>New school year</b><br><small>Moves every student up one grade (7 to 8, 8 to 9, and so on) and removes Grade 12 graduates from the whitelist. Allowed only when no votes are recorded, so download the results and use Reset ballot first.</small></div><button class="btn sm" onclick="promoteAll()">Promote all grades</button></div>`;
}
function promoBtn(g){
  if(!isMain()||!/^\d+$/.test(g))return "";
  return `<p><button class="btn sm alt" onclick="promoteGrade(${g})">${g==="12"?"Graduate Grade 12":"Promote Grade "+g+" to Grade "+(Number(g)+1)}</button></p>`;
}
function promoMsg(data){
  return {NOT_MAIN:"Only the Main Admin can promote grades.",VOTES_EXIST:"Votes are recorded. Download the results, then use Reset ballot under Timer & Reset, and try again.",BAD_GRADE:"Grade must be 7 to 12."}[data]||"Could not promote. Try again.";
}
async function promoteGrade(g){
  const n=wlist.filter(w=>w.grade===g).length,nx=wlist.filter(w=>w.grade===g+1).length;
  const what=g===12
    ?"Graduate Grade 12? "+n+" student(s) are removed from the whitelist and their accounts are deleted."
    :"Promote Grade "+g+" to Grade "+(g+1)+"? "+n+" student(s) move up."+(nx?" Grade "+(g+1)+" already has "+nx+" LRN(s); they will be merged. Promote the higher grade first to avoid this.":"");
  if(!confirm(what+"\n\nThis cannot be undone."))return;
  const {data,error}=await sb.rpc("admin_promote_grade",{p_admin:adminId,p_from:g});
  if(error)return alert("Error: "+error.message+"\nRun orgvote_promote.sql in the Supabase SQL Editor.");
  const [st,cnt]=String(data).split("|");
  if(st!=="OK")return alert(promoMsg(st));
  alert((g===12?"Graduated ":"Promoted ")+cnt+" student(s).");
  load();
}
async function promoteAll(){
  const counts=[12,11,10,9,8,7].map(g=>"Grade "+g+": "+wlist.filter(w=>w.grade===g).length).join(", ");
  if(!confirm("Promote ALL grades for the new school year?\n\nGrade 12 graduates are removed from the whitelist and their accounts are deleted. Grades 7 to 11 move up one grade.\n\nStudents now - "+counts+"\n\nThis cannot be undone."))return;
  if(prompt("Type PROMOTE to confirm:")!=="PROMOTE")return;
  const {data,error}=await sb.rpc("admin_promote_all",{p_admin:adminId});
  if(error)return alert("Error: "+error.message+"\nRun orgvote_promote.sql in the Supabase SQL Editor.");
  const [st,res]=String(data).split("|");
  if(st!=="OK")return alert(promoMsg(st));
  alert("Done. Students moved or graduated per grade (grade:count): "+res+"\n\nAdd the new Grade 7 LRNs under the Grade 7 folder.");
  load();
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
    $("wlList").innerHTML=`<h3 class="pos">${GI[wlSel]} ${title} <small>(${items.length})</small></h3>`+promoBtn(wlSel)+
      (items.map(w=>lrnChip(w,wlSel)).join("")||"<small>No LRNs in this folder yet.</small>");
    return;
  }
  const keys=["7","8","9","10","11","12"].concat(groups.none?["none"]:[]);   // all folders
  $("wlList").innerHTML=promoPanel()+keys.map(k=>{
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
function byPosition(list){
  const m={};
  list.forEach(c=>{(m[c.position]=m[c.position]||[]).push(c)});
  return Object.keys(m).sort((a,b)=>posRank(a)-posRank(b)||a.localeCompare(b)).map(p=>[p,m[p]]);
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
  const total=state.total_votes,closed=win&&win.state==="closed";
  $("results").innerHTML=`<p>Total votes cast: <b>${total}</b> / Registered voters: <b>${state.registered}</b></p>`+
    byPosition(state.candidates).map(([p,cs])=>{
      const rows=cs.slice().sort((a,b)=>Number(b.votes||0)-Number(a.votes||0)||String(a.name).localeCompare(String(b.name)));
      const sum=rows.reduce((a,c)=>a+Number(c.votes||0),0),top=rows.length?Number(rows[0].votes||0):0;
      const leaders=rows.filter(c=>top>0&&Number(c.votes||0)===top).length;
      return `<h3 class="pos">${esc(p)} <small>(${sum} vote${sum===1?"":"s"})</small></h3>`+
        rows.map(c=>{
          const v=Number(c.votes||0),pc=sum?Math.round(v/sum*100):0;
          const tag=top>0&&v===top?`<span class="chip">${leaders>1?"Tied":(closed?"Winner":"Leading")}</span>`:"";
          return `<div style="margin:10px 0"><b>${esc(c.name)}</b> ${tag} - ${v} vote${v===1?"":"s"} (${pc}%)<div class="bar"><i style="width:${pc}%"></i></div></div>`;
        }).join("");
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

// ---- Verified printing: another admin must approve (only after voting ends) ----
async function pollRequests(){
  if(!adminId)return;
  const r=await sb.rpc("admin_list_print_requests",{p_admin:adminId});
  if(r.error||!r.data)return;
  pr=r.data;
  renderNotify();renderPrintStatus();
}
// Every 6 seconds: refresh print requests, and reload everything if ANOTHER admin changed something
async function pollSync(){
  if(!adminId||syncBusy)return;
  syncBusy=true;
  try{
    await pollRequests();
    const s=await sb.rpc("admin_sync",{p_admin:adminId});
    if(s.error||!s.data||syncV===null)return;
    const changed=s.data.v!==syncV;
    const votesChanged=s.data.votes!==syncVotes&&view==="res";   // keep live results fresh on the Results page
    if(changed||votesChanged)await load();                        // load() also resets the baseline
    else syncVotes=s.data.votes;
  }finally{syncBusy=false}
}
function renderNotify(){
  const el=$("notify");if(!el)return;
  const inc=(pr&&pr.incoming)||[];
  el.innerHTML=inc.map(r=>
    `<div class="card nreq noprint"><div><b>${esc(r.requester_name)}</b> wants to print the official election results. <small>Requested ${esc(new Date(r.created_at).toLocaleTimeString())}</small></div>`+
    `<div><button class="btn sm" onclick="decidePrint('${r.id}',true)">Approve</button><button class="btn sm alt" onclick="decidePrint('${r.id}',false)">Deny</button></div></div>`).join("");
  document.title=(inc.length?"("+inc.length+") Print request - ":"")+"OrgVote Admin";
}
async function decidePrint(id,ok){
  if(!ok&&!confirm("Deny this print request?"))return;
  if(ok&&!confirm("Approve printing the official election results?"))return;
  const {data,error}=await sb.rpc("admin_decide_print",{p_admin:adminId,p_request:id,p_approve:ok});
  if(error)return alert("Error: "+error.message);
  if(data!=="OK")alert({NOT_FOUND:"Request not found.",OWN_REQUEST:"You cannot answer your own request.",NOT_PENDING:"This request is no longer waiting for an answer.",NOT_MAIN:"Only the Main Admin can answer print requests."}[data]||"Could not save your answer.");
  pollRequests();
}
function notifyLinks(){
  const others=admins.filter(a=>a.role==="main"&&!a.me&&a.email);   // the Main Admin is the one who approves
  if(!others.length)return "";
  const body="Hello, I am asking to print the official election results in OrgVote. Please open the OrgVote Admin portal and approve or deny my request. It stays open for 30 minutes.";
  return "<p><small>Notify by Gmail: </small>"+others.map(a=>{
    const link=("https://mail.google.com/mail/?view=cm&fs=1&to="+encodeURIComponent(a.email)+"&su="+encodeURIComponent("OrgVote: print approval needed")+"&body="+encodeURIComponent(body)).replace(/&/g,"&amp;");
    return `<a href="${link}" target="_blank" rel="noopener">${esc(a.name)}</a>`;
  }).join(" · ")+"</p>";
}
function renderPrintStatus(){
  const el=$("printMsg");if(!el)return;
  const m=pr&&pr.mine;let h="";
  if(prNote)h+=`<div class="msg err">${esc(prNote)}</div>`;
  if(m&&m.status==="pending")h+=`<div class="msg ok">Request sent. Waiting for the Main Admin (supervisor) to approve it. This page updates by itself.</div>`+notifyLinks();
  else if(m&&m.status==="approved")h+=`<div class="msg ok">Approved by <b>${esc(m.decided_name||"another admin")}</b>. You can print now (valid for 15 minutes, one time).</div><button class="btn" onclick="doPrint()">Print the official report</button>`;
  else if(m&&m.status==="denied")h+=`<div class="msg err">${esc(m.decided_name||"Another admin")} denied the print request.</div>`;
  el.innerHTML=h;
}
async function startPrint(){
  prNote="";
  await load();   // refresh the voting state first, in case the timer just ended
  if(!win||win.state!=="closed"){
    prNote="Voting has not ended yet. The official report can be printed only after voting ends: set a timer, or use Close voting now under Timer & Reset.";
    return renderPrintStatus();
  }
  const {data,error}=await sb.rpc("admin_request_print",{p_admin:adminId});
  if(error){prNote="Error: "+error.message+". Run orgvote_admin_approval.sql in the Supabase SQL Editor.";return renderPrintStatus()}
  const st=String(data).split("|")[0];
  if(st==="NEED_OTHER_ADMIN")prNote="Printing needs approval from another admin, but there is only one admin. Add a second admin under Admins first.";
  else if(st==="NOT_CLOSED")prNote="Voting has not ended yet.";
  else if(st!=="OK")prNote="Could not send the request. Try again.";
  await pollRequests();renderPrintStatus();
}
function buildPrintSheet(code,iso,total,reg,by,appr){
  const when=new Date(iso).toLocaleString();
  const closed=win&&win.closes_at?new Date(win.closes_at).toLocaleString():"";
  const tables=byPosition(state.candidates).map(([p,cs])=>{
    const rows=cs.slice().sort((a,b)=>Number(b.votes||0)-Number(a.votes||0)||String(a.name).localeCompare(String(b.name)));
    const sum=rows.reduce((a,c)=>a+Number(c.votes||0),0);
    return `<h3>${esc(p)}</h3><table><thead><tr><th>Candidate</th><th class="n">Votes</th><th class="n">%</th></tr></thead><tbody>`+
      rows.map(c=>{const v=Number(c.votes||0);return `<tr><td>${esc(c.name)}</td><td class="n">${v}</td><td class="n">${sum?Math.round(v/sum*100):0}%</td></tr>`}).join("")+
      `</tbody></table>`;
  }).join("");
  $("printSheet").innerHTML=
    `<h1>OrgVote Official Election Results</h1>`+
    `<p class="ps-sub">Printed ${esc(when)}${closed?" | Voting closed "+esc(closed):""}</p>`+
    `<p><b>Total votes cast:</b> ${esc(total)} &nbsp;&nbsp; <b>Registered voters:</b> ${esc(reg)}</p>`+
    tables+
    `<div class="ps-ver"><b>Report verification code:</b> <span class="ps-code">${esc(code)}</span><br>`+
    `<b>Print requested by:</b> ${esc(by)} &nbsp;&nbsp; <b>Approved by:</b> ${esc(appr)}<br>`+
    `<small>To confirm these results are authentic and unchanged, enter this code under Results, Check a printed report, in the OrgVote Admin portal.</small></div>`+
    `<div class="ps-sign"><div><span></span>Prepared by: ${esc(by)}</div><div><span></span>Approved by: ${esc(appr)}</div><div><span></span>Verified by (Adviser)</div></div>`;
}
async function doPrint(){
  const m=pr&&pr.mine;
  if(!m||m.status!=="approved")return;
  const {data,error}=await sb.rpc("admin_report_print",{p_admin:adminId,p_request:m.id});
  if(error){prNote="Error: "+error.message;return renderPrintStatus()}
  const [st,code,iso,total,reg,by,appr]=String(data).split("|");
  if(st!=="OK"){
    prNote={NOT_APPROVED:"This request is not approved.",EXPIRED:"The approval expired. Send a new request.",NOT_CLOSED:"Voting has not ended yet.",NOT_FOUND:"Request not found."}[st]||"Could not print. Try again.";
    await pollRequests();return renderPrintStatus();
  }
  prNote="";
  await load();await pollRequests();   // fresh numbers for the report
  buildPrintSheet(code,iso,total,reg,by,appr);
  window.print();
}
window.addEventListener("afterprint",()=>{const el=$("printSheet");if(el)el.innerHTML=""});

// ---- Admins ----
function renderAdmins(){
  const el=$("admList");if(!el)return;
  el.innerHTML=admins.map(a=>
    `<div class="acand"><div class="ainfo"><b>${esc(a.name)}</b>${a.role==="main"?" <span class=\"chip\">Main Admin</span>":""}${a.me?" <span class=\"chip\">You</span>":""}<br><small>${a.email?esc(a.email):"No email"}</small></div>`+
    (a.me?"":`<div style="margin-left:auto"><button class="btn sm alt" onclick="removeAdmin('${a.id}')">Remove</button></div>`)+`</div>`).join("")||"<small>No admins found.</small>";
}
async function addAdmin(){
  const n=$("anName").value.trim(),i=$("anId").value,e=$("anEmail").value.trim();
  if(!n)return msg("admMsg","Enter a name.");
  if(i.length<8)return msg("admMsg","The Admin ID must be at least 8 characters.");
  const {data,error}=await sb.rpc("admin_add_admin",{p_admin:adminId,p_name:n,p_new_id:i,p_email:e||null});
  if(error)return msg("admMsg","Error: "+esc(error.message)+". Run orgvote_admin_approval.sql in the Supabase SQL Editor.");
  const m={BAD_NAME:"Enter a valid name.",WEAK_ID:"The Admin ID must be at least 8 characters.",BAD_EMAIL:"Enter a valid email address.",DUPLICATE_ID:"That Admin ID is already used. Choose a different one.",NOT_MAIN:"Only the Main Admin can add admins."}[data];
  if(data!=="OK")return msg("admMsg",m||"Could not add the admin.");
  $("anName").value=$("anId").value=$("anEmail").value="";
  msg("admMsg","Admin added. Give them their Admin ID privately.",1);
  load();
}
async function removeAdmin(id){
  if(!confirm("Remove this admin? Their Admin ID will stop working."))return;
  const {data,error}=await sb.rpc("admin_remove_admin",{p_admin:adminId,p_target:id});
  if(error)return msg("admMsg","Error: "+esc(error.message));
  if(data==="SELF")return msg("admMsg","You cannot remove yourself.");
  if(data==="NOT_MAIN")return msg("admMsg","Only the Main Admin can remove admins.");
  load();
}

async function checkReport(){
  const c=$("chkCode").value.trim();
  if(!c)return msg("chkMsg","Enter the report code printed on the report.");
  const {data,error}=await sb.rpc("admin_check_report",{p_admin:adminId,p_code:c});
  if(error)return msg("chkMsg","Error: "+esc(error.message)+". Run orgvote_report_verify.sql in the Supabase SQL Editor.");
  const [st,iso,total,reg,cur,by,appr]=String(data).split("|");
  if(st!=="FOUND")return msg("chkMsg","No report with that code was printed from this system. It may have been altered, or it is from another election.");
  msg("chkMsg","Valid report. Printed "+esc(new Date(iso).toLocaleString())+" with "+esc(total)+" votes and "+esc(reg)+" registered voters. "+(by?"Requested by "+esc(by)+(appr?", approved by "+esc(appr):"")+". ":"")+
    (cur==="CURRENT"?"The current results still match this report.":"The current results are different from this report (votes or candidates changed, or the ballot was reset, after it was printed)."),
    cur==="CURRENT"?1:0);
}

function render(){
  if(view==="adm"&&!(me&&me.role==="main"))view="res";   // only the Main Admin manages admins
  if(wlSel==="none"&&!wlist.some(w=>w.grade==null))wlSel="all";   // the "No grade" folder emptied out
  const sections={wl:"vWl",stu:"vStu",cand:"vCand",ctl:"vCtl",adm:"vAdm",res:"vRes"};
  Object.keys(sections).forEach(k=>$(sections[k]).classList.toggle("hide",k!==view));
  renderSide();renderWhitelist();renderCandidates();renderStudents();renderResults();renderControl();renderAdmins();renderNotify();renderPrintStatus();
}
function csv(){
  const rows=[["Candidate","Position","Votes"],...byPosition(state.candidates).flatMap(([p,cs])=>cs.slice().sort((a,b)=>Number(b.votes||0)-Number(a.votes||0)).map(c=>[c.name,c.position,c.votes]))];
  const f=v=>/^[=+\-@]/.test(String(v))?"'"+v:v;
  const out=rows.map(r=>r.map(v=>`"${String(f(v)).replace(/"/g,'""')}"`).join(",")).join("\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([out],{type:"text/csv"}));a.download="orgvote-results.csv";a.click();
}

// Always start at a clean sign-in screen (reload, back button, or a restored tab)
function resetToSignIn(){
  clearInterval(winTick);clearInterval(pollId);me=null;admins=[];pr={mine:null,incoming:[],admins:0};prNote="";document.title="OrgVote Admin";syncV=syncVotes=null;
  adminId=state=null;students=[];wlist=[];win=null;cphotos={};view="res";wlSel="all";wlOpen=false;
  $("aPanel").classList.add("hide");$("aAuth").classList.remove("hide");
  $("aMsg").innerHTML="";$("otpOut").innerHTML="";
  ["aid","wl","wgrade","stuSearch","cn","cp","tmStart","rbConfirm","chkCode","anName","anId","anEmail"].forEach(id=>{const el=$(id);if(el)el.value=""});
  ["printMsg","chkMsg"].forEach(id=>{const el=$(id);if(el)el.innerHTML=""});
  if($("printSheet"))$("printSheet").innerHTML="";
  window.scrollTo(0,0);
}
if("scrollRestoration" in history)history.scrollRestoration="manual";
window.addEventListener("pageshow",resetToSignIn);


// ---- Students\x27 "Request code" notices ----
(function () {
  let list = [], busy = false;

  function box() {
    let el = document.getElementById("resetNotify");
    if (!el) {
      el = document.createElement("div"); el.id = "resetNotify";
      const n = document.getElementById("notify");
      n.parentNode.insertBefore(el, n);
    }
    return el;
  }

  function draw() {
    const el = box();
    if (!adminId) { el.innerHTML = ""; return; }
    // Only registered students count (admin.js keeps that list in `students`)
    const rows = list.map(r => ({ r, s: students.find(x => x.lrn === r.lrn) })).filter(x => x.s);
    el.innerHTML = rows.map(({ r, s }) =>
      `<div class="card nreq noprint"><div><b>LRN ${esc(r.lrn)}</b> (Grade ${esc(String(s.grade == null ? "-" : s.grade))}) asked for a password reset code. ` +
      `<small>${esc(new Date(r.created_at).toLocaleTimeString())} · ` +
      (s.verified ? "Gmail verified" : (s.email ? "Gmail NOT verified yet" : "No Gmail on file")) + `</small></div>` +
      `<div><button class="btn sm" onclick="rrGetOtp('${esc(r.lrn)}')">Get OTP</button>` +
      `<button class="btn sm alt" onclick="rrDismiss('${esc(r.lrn)}')">Dismiss</button></div></div>`).join("");
  }

  async function poll() {
    if (!adminId || busy) { if (!adminId) draw(); return; }
    busy = true;
    try {
      const { data, error } = await sb.rpc("admin_list_reset_requests", { p_admin: adminId });
      if (!error && Array.isArray(data)) { list = data; draw(); }
    } finally { busy = false; }
  }

  async function resolve(lrn) {
    await sb.rpc("admin_resolve_reset", { p_admin: adminId, p_lrn: lrn });
    list = list.filter(r => r.lrn !== lrn); draw(); poll();
  }

  window.rrGetOtp = async function (lrn) {
    go("stu");                       // open Students & OTP so the code shows there
    await genOtp(lrn);               // existing flow: makes the OTP + Gmail link
    const out = document.getElementById("otpOut");
    if (out && out.textContent.includes("OTP for LRN")) await resolve(lrn);   // clear the notice only if a code was made
  };
  window.rrDismiss = async function (lrn) {
    if (confirm("Dismiss this request without sending a code?")) await resolve(lrn);
  };

  setInterval(poll, 6000);
  setTimeout(poll, 1500);
})();
