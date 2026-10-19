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
  const ballot = $("ballot");
  ballot.innerHTML = '<p class="loading">Loading candidates…</p>';

  try {
    const [c, v] = await Promise.all([
      sb.rpc("ballot_candidates", { p_lrn: user, p_pw: pass }),
      sb.rpc("my_ballot", { p_lrn: user, p_pw: pass })
    ]);

    // Show request failures instead of silently treating them as an empty ballot.
    if (c.error || v.error) {
      console.error("Could not load ballot", { candidatesError: c.error, ballotError: v.error });
      ballot.innerHTML = '<p class="msg err">Could not load candidates. Please check your connection and try again.</p>';
      return;
    }

    const list = Array.isArray(c.data) ? c.data : [];
    const mine = Array.isArray(v.data) ? v.data : [];
    if (!list.length) {
      ballot.innerHTML = "<p>No candidates are available for your account yet.</p>";
      return;
    }

    const offices = [...new Set(list.map(x => x.office).filter(Boolean))];
    const done = new Map(mine.map(m => [m.office, m.candidate_id]));
    const next = offices.find(o => !done.has(o));

    if (!next) {
      ballot.innerHTML = "<p>✅ You have answered all positions. Thank you!</p>" +
        offices.map(o => {
          const cand = list.find(x => x.id === done.get(o));
          return `<div class="cand"><div><b>${esc(o)}</b><br><small>${cand ? esc(cand.name) : "No candidate selected"}</small></div><span class="chip">${cand ? "✔ Your vote" : "Abstained"}</span></div>`;
        }).join("");
      return;
    }

    const n = offices.filter(o => done.has(o)).length + 1;
    ballot.innerHTML = `<h3>${esc(next)} <small>(${n} of ${offices.length})</small></h3>` +
      list.filter(x => x.office === next).map(x =>
        `<div class="cand"><div><b>${esc(x.name)}</b></div><button class="btn" onclick="vote('${x.id}')">Vote</button></div>`
      ).join("") +
      `<div class="cand"><div><b>Abstain</b><br><small>Skip this position without voting</small></div><button class="btn alt" data-o="${esc(next)}" onclick="abstain(this.dataset.o)">Abstain</button></div>`;
  } catch (error) {
    console.error("Unexpected error while rendering ballot", error);
    ballot.innerHTML = '<p class="msg err">Something went wrong while loading candidates. Please refresh the page and log in again.</p>';
  }
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