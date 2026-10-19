let user=null,pass=null;
async function studentRegister(){
  if(initError)return msg("sMsg","Setup error: "+esc(initError));
  const l=$("lrn").value.trim(),p=$("spw").value;
  if(!/^\d{12}$/.test(l))return msg("sMsg","LRN must be exactly 12 digits.");
  const {data,error}=await sb.rpc("student_register",{p_lrn:l,p_pw:p});
  if(error)return msg("sMsg","Connection error. Try again.");
  const m={OK:["Registered! You can now log in.",1],NOT_ENROLLED:["LRN not found in the official SY enrollment list."],EXISTS:["This LRN is already registered. Please log in."],WEAK:["Password must be at least 6 characters."]}[data];
  msg("sMsg",m[0],m[1]);
}
async function studentLogin(){
  if(initError)return msg("sMsg","Setup error: "+esc(initError));
  const l=$("lrn").value.trim(),p=$("spw").value;
  const {data,error}=await sb.rpc("student_login",{p_lrn:l,p_pw:p});
  if(error)return msg("sMsg","Connection error. Try again.");
  if(!data)return msg("sMsg","Invalid LRN or password.");
  user=l;pass=p;$("sAuth").classList.add("hide");$("sVote").classList.remove("hide");
  $("who").textContent="LRN ••••••••"+l.slice(-4);renderBallot();
}
function studentLogout(){user=pass=null;$("sVote").classList.add("hide");$("sAuth").classList.remove("hide");$("spw").value="";$("sMsg").innerHTML="";$("vMsg").innerHTML=""}
async function renderBallot(){
  const [c,v]=await Promise.all([sb.rpc("list_candidates"),sb.rpc("my_vote",{p_lrn:user,p_pw:pass})]);
  const list=c.data||[],voted=v.data;
  if(!list.length){$("ballot").innerHTML="<p>No candidates yet.</p>";return}
  $("ballot").innerHTML=list.map(x=>`<div class="cand"><div><b>${esc(x.name)}</b><br><small>${esc(x.office)}</small></div>${voted?(voted===x.id?'<span class="chip">✔ Your vote</span>':''):`<button class="btn" onclick="vote('${x.id}')">Vote</button>`}</div>`).join("");
  if(voted)msg("vMsg","You have already voted. One vote per eligible voter.",1);
}
async function vote(id){
  if(!confirm("Submit your vote? It cannot be changed."))return;
  const {data,error}=await sb.rpc("cast_vote",{p_lrn:user,p_pw:pass,p_candidate:id});
  if(error||data!=="OK"&&data!=="ALREADY")return msg("vMsg","Could not record your vote. Try again.");
  renderBallot();
}
async function castVote(position, candidateId) {
  const { error } = await sb.from('votes').insert({
    lrn: currentLRN,
    position: position,
    candidate_id: candidateId
  });
  if (error) {
    alert(error.code === '23505'
      ? 'You already voted for ' + position
      : 'Vote failed: ' + error.message);
    return;
  }
  renderBallot(); // refresh and move on to the next position
}
async function renderBallot() {
  const { data: cands } = await sb.from('candidates').select('*');
  const { data: mine } = await sb.from('votes')
    .select('position').eq('lrn', currentLRN);

  const voted = new Set(mine.map(v => v.position));
  const positions = [...new Set(cands.map(c => c.position))];
  const next = positions.find(p => !voted.has(p));

  const box = document.getElementById('ballot');
  if (!next) { box.innerHTML = '<p>✅ You have voted for all positions. Thank you!</p>'; return; }

  box.innerHTML = '<h3>' + next + '</h3>' +
    cands.filter(c => c.position === next).map(c =>
      '<button class="btn" onclick="castVote(\'' + next + '\',\'' + c.id + '\')">' +
      c.name + '</button>'
    ).join('');
}
