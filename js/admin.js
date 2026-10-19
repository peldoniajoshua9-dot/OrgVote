let adminId=null,state=null,lastError=null;
async function load(){
  const {data,error}=await sb.rpc("admin_state",{p_admin:adminId});
  if(error){lastError=error;return false;}
  state=data;render();return true;
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
function adminLogout(){adminId=state=null;$("aPanel").classList.add("hide");$("aAuth").classList.remove("hide");$("aid").value="";$("aMsg").innerHTML=""}
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
function render(){
  $("wlList").innerHTML=state.whitelist.map(l=>`<span class="chip">${l} <a href="#" onclick="rmLRN('${l}');return false">✕</a></span>`).join("")||"<small>No LRNs yet.</small>";
  $("cList").innerHTML=state.candidates.map(c=>`<span class="chip">${esc(c.name)} — ${esc(c.position)} <a href="#" onclick="rmCand('${c.id}');return false">✕</a></span>`).join("")||"<small>No candidates yet.</small>";
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
