const ADMIN_HASH="283b40616ccd07df6bc188351075aabee654c771e99691adb95827741839ff30";
async function adminLogin(){
  if(await sha($("aid").value.trim())!==ADMIN_HASH)return msg("aMsg","Invalid Admin ID.");
  $("aAuth").classList.add("hide");$("aPanel").classList.remove("hide");renderAdmin();
}
function adminLogout(){$("aPanel").classList.add("hide");$("aAuth").classList.remove("hide");$("aid").value="";$("aMsg").innerHTML=""}
function addLRN(){
  const l=$("wl").value.trim();
  if(!/^\d{12}$/.test(l)||db.whitelist.includes(l))return alert("Enter a new 12-digit LRN.");
  db.whitelist.push(l);save();$("wl").value="";renderAdmin();
}
function rmLRN(l){db.whitelist=db.whitelist.filter(x=>x!==l);save();renderAdmin()}
function addCand(){
  const n=$("cn").value.trim(),p=$("cp").value.trim();
  if(!n||!p)return alert("Enter name and position.");
  db.candidates.push({id:"c"+Date.now(),name:n,pos:p});save();$("cn").value=$("cp").value="";renderAdmin();
}
function rmCand(id){
  if(Object.keys(db.votes).length)return alert("Candidates can't be removed once voting has started.");
  db.candidates=db.candidates.filter(c=>c.id!==id);save();renderAdmin();
}
function renderAdmin(){
  $("wlList").innerHTML=db.whitelist.map(l=>`<span class="chip">${l} <a href="#" onclick="rmLRN('${l}');return false">✕</a></span>`).join("")||"<small>No LRNs yet.</small>";
  $("cList").innerHTML=db.candidates.map(c=>`<span class="chip">${esc(c.name)} — ${esc(c.pos)} <a href="#" onclick="rmCand('${c.id}');return false">✕</a></span>`).join("")||"<small>No candidates yet.</small>";
  const t=tally(),total=Object.keys(db.votes).length;
  $("results").innerHTML=`<p>Total votes: <b>${total}</b> / Registered voters: <b>${Object.keys(db.students).length}</b></p>`+
    db.candidates.map(c=>{const n=t[c.id]||0,pc=total?Math.round(n/total*100):0;return`<div style="margin:10px 0"><b>${esc(c.name)}</b> <small>(${esc(c.pos)})</small> — ${n} votes (${pc}%)<div class="bar"><i style="width:${pc}%"></i></div></div>`}).join("");
}
function csv(){
  const t=tally();
  const rows=[["Candidate","Position","Votes"],...db.candidates.map(c=>[c.name,c.pos,t[c.id]||0])];
  const f=v=>/^[=+\-@]/.test(String(v))?"'"+v:v;
  const out=rows.map(r=>r.map(v=>`"${String(f(v)).replace(/"/g,'""')}"`).join(",")).join("\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([out],{type:"text/csv"}));a.download="orgvote-results.csv";a.click();
}
