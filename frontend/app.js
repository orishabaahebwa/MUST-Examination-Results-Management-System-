const API='/api';let token=localStorage.getItem('must_token');let currentUser=null;let resultsCache=[];const $=id=>document.getElementById(id);
const roleNames={ADMIN:'System Administrator',LECTURER:'Lecturer',REVIEWER:'Academic Reviewer',APPROVER:'Academic Registrar',STUDENT:'Student'};
const headers=()=>({'Content-Type':'application/json','Authorization':`Bearer ${token}`});
async function api(path,options={}){const r=await fetch(API+path,{...options,headers:{...headers(),...(options.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok){if(r.status===401)signOut();throw new Error(d.error||`Request failed (${r.status})`)}return d}
function safe(v){return String(v??'â€”').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function toast(message,type='info'){const e=$('toast');e.textContent=message;e.className=`toast ${type}`}
function initials(name){return String(name||'MUST').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()}
function showLogin(){$('loginScreen').classList.remove('hidden');$('appShell').classList.add('hidden')}
function showApp(){$('loginScreen').classList.add('hidden');$('appShell').classList.remove('hidden');$('sideName').textContent=currentUser.name;$('sideRole').textContent=roleNames[currentUser.role]||currentUser.role;$('sideAvatar').textContent=initials(currentUser.name);$('topName').textContent=currentUser.name;$('topRole').textContent=currentUser.role;$('topAvatar').textContent=initials(currentUser.name);$('auditNav').classList.toggle('hidden',!['ADMIN','APPROVER'].includes(currentUser.role));renderRoleWorkspace();loadDashboard()}
function signOut(){localStorage.removeItem('must_token');token=null;currentUser=null;showLogin();closeSidebar()}
$('sideLogout').addEventListener('click',signOut);
$('togglePassword').addEventListener('click',()=>{const p=$('password');p.type=p.type==='password'?'text':'password';$('togglePassword').textContent=p.type==='password'?'Show':'Hide'});
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();$('loginError').textContent='';const b=$('loginButton');b.disabled=true;b.textContent='Signing inâ€¦';try{const r=await fetch(API+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('email').value.trim(),password:$('password').value})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Sign-in failed');token=d.token;currentUser=d.user;localStorage.setItem('must_token',token);showApp()}catch(err){$('loginError').textContent=err.message}finally{b.disabled=false;b.innerHTML='Sign in <span>â†’</span>'}});
function setPage(name){['overview','submissions','audit'].forEach(p=>$(`${p}Page`).classList.toggle('hidden',p!==name));document.querySelectorAll('.nav-link').forEach(b=>b.classList.toggle('active',b.dataset.page===name));const labels={overview:'Overview',submissions:'Results & submissions',audit:'Audit trail'};$('crumbPage').textContent=labels[name];$('pageHeading').textContent=labels[name];if(name==='submissions')renderAllResults();if(name==='audit')loadAudit();closeSidebar()}
document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>setPage(b.dataset.page)));document.querySelectorAll('[data-goto]').forEach(b=>b.addEventListener('click',()=>setPage(b.dataset.goto)));
$('menuToggle').addEventListener('click',()=>{$('sidebar').classList.add('open');$('mobileOverlay').classList.add('show')});$('mobileOverlay').addEventListener('click',closeSidebar);function closeSidebar(){$('sidebar').classList.remove('open');$('mobileOverlay').classList.remove('show')}
function stat(label,value,note,icon){return `<article class="stat-card"><div class="stat-top"><span class="stat-label">${safe(label)}</span><span class="stat-icon">${icon}</span></div><div class="stat-value">${safe(value)}</div><div class="stat-note">${safe(note)}</div></article>`}
function renderRoleWorkspace() {
  const r = currentUser.role;
  const titles = {
    LECTURER: "Submit examination marks",
    REVIEWER: "Review submitted results",
    APPROVER: "Approve and publish results",
    STUDENT: "Your academic results",
    ADMIN: "System administration"
  };

  $("actionHeading").textContent = titles[r] || "Workspace";
  $("welcomeKicker").textContent =
    (roleNames[r] || r).toUpperCase() + " WORKSPACE";
  $("welcomeHeading").textContent =
    `Welcome, ${currentUser.name.split(" ")[0]}`;

  $("welcomeSub").textContent = ({
    LECTURER: "Prepare and submit marks for your assigned courses.",
    REVIEWER: "Review submissions and ensure academic accuracy.",
    APPROVER: "Authorise verified results for publication.",
    STUDENT: "View your official published examination results.",
    ADMIN: "Monitor examination activity and maintain accountability."
  })[r] || "Your examination workspace.";

  const area = $("actionArea");

  if (r === "LECTURER") {
    area.innerHTML = `
      <form id="marksForm" class="action-form">
        <div class="form-grid">
          <div>
            <label for="courseId">Course</label>
            <select name="courseId" id="courseId" required>
              <option value="">Loading courses...</option>
            </select>
          </div>
          <div>
            <label for="semesterId">Academic semester</label>
            <select name="semesterId" id="semesterId" required>
              <option value="">Loading semesters...</option>
            </select>
          </div>
          <div class="wide">
            <label for="studentId">Student</label>
            <select name="studentId" id="studentId" required>
              <option value="">Loading students...</option>
            </select>
          </div>
          <div>
            <label for="score">Examination score (0-100)</label>
            <input name="score" id="score" type="number"
              min="0" max="100" step="0.01" required
              placeholder="Enter score">
          </div>
        </div>
        <div class="form-actions">
          <button class="primary-btn" type="submit">Submit marks</button>
        </div>
        <p class="inline-help">
          Check the course, semester, student and score before submitting.
        </p>
      </form>`;

    $("marksForm").addEventListener("submit", submitMarks);
    loadLecturerOptions();

  } else if (r === "REVIEWER") {
    area.innerHTML = `
      <form id="reviewForm" class="action-form">
        <div class="form-grid">
          <div>
            <label for="reviewId">Submission ID</label>
            <input id="reviewId" type="number" min="1" required
              placeholder="Enter submission ID">
          </div>
          <div>
            <label for="returnReason">Return reason</label>
            <input id="returnReason"
              placeholder="Required when returning">
          </div>
        </div>
        <div class="form-actions">
          <button class="primary-btn" type="button" id="verifyBtn">
            Verify submission
          </button>
          <button class="secondary-btn" type="button" id="returnBtn">
            Return for correction
          </button>
        </div>
        <p class="inline-help">
          Returned submissions must include a correction reason.
        </p>
      </form>`;

    $("verifyBtn").onclick = () => review("VERIFY");
    $("returnBtn").onclick = () => review("RETURN");

  } else if (r === "APPROVER") {
    area.innerHTML = `
      <div class="action-form">
        <div class="form-grid">
          <div class="wide">
            <label for="approvalId">Submission ID</label>
            <input id="approvalId" type="number" min="1"
              placeholder="Enter verified submission ID">
          </div>
        </div>
        <div class="form-actions">
          <button class="primary-btn" id="approveBtn" type="button">
            Approve results
          </button>
          <button class="secondary-btn" id="publishBtn" type="button">
            Publish results
          </button>
        </div>
        <p class="inline-help">
          The required sequence is verified, approved, then published.
        </p>
      </div>`;

    $("approveBtn").onclick = () => transition("approve");
    $("publishBtn").onclick = () => transition("publish");

  } else if (r === "STUDENT") {
    area.innerHTML = `
      <div class="action-empty">
        <p>
          Your official results are shown after the Registrar publishes them.
          Unpublished marks are not displayed in your student account.
        </p>
        <button class="secondary-btn" data-goto="submissions">
          View published results
        </button>
      </div>`;

    area.querySelector("[data-goto]").onclick =
      () => setPage("submissions");

  } else {
    area.innerHTML = `
      <div class="action-empty">
        <p>
          Review the system audit trail to monitor marks submission,
          verification, approval and publication actions.
        </p>
        <button class="primary-btn" id="auditButton" type="button">
          Open audit trail
        </button>
      </div>`;

    $("auditButton").onclick = () => setPage("audit");
  }
}

async function loadLecturerOptions() {
  try {
    const [courses, students, semesters] = await Promise.all([
      api("/courses"),
      api("/students"),
      api("/semesters")
    ]);

    $("courseId").innerHTML =
      '<option value="">Choose assigned course</option>' +
      (courses.courses || []).map(course => `
        <option value="${Number(course.id)}">
          ${safe(course.code)} - ${safe(course.title)}
        </option>
      `).join("");

    $("studentId").innerHTML =
      '<option value="">Choose student</option>' +
      (students.students || []).map(student => `
        <option value="${Number(student.id)}">
          ${safe(student.registration_number)} - ${safe(student.name)}
        </option>
      `).join("");

    $("semesterId").innerHTML =
      '<option value="">Choose academic semester</option>' +
      (semesters.semesters || []).map(semester => `
        <option value="${Number(semester.id)}">
          ${safe(semester.name)} - ${safe(semester.academic_year)}
        </option>
      `).join("");

  } catch (error) {
    toast("Could not load academic options: " + error.message, "error");
  }
}
async function submitMarks(e){e.preventDefault();const f=new FormData(e.currentTarget);try{const d=await api('/results',{method:'POST',body:JSON.stringify({courseId:Number(f.get('courseId')),semesterId:Number(f.get('semesterId')),marks:[{studentId:Number(f.get('studentId')),score:Number(f.get('score'))}]})});toast(`Submission ${d.submissionId} was created successfully.`,'success');e.currentTarget.reset();await loadDashboard()}catch(err){toast(err.message,'error')}}
async function review(decision){const id=$('reviewId').value,reason=$('returnReason').value.trim();if(!id)return toast('Enter a submission ID.','error');if(decision==='RETURN'&&!reason)return toast('Enter a reason before returning the submission.','error');try{const d=await api(`/results/${id}/verify`,{method:'PATCH',body:JSON.stringify({decision,reason})});toast(d.message||'Review action completed.','success');await loadDashboard()}catch(e){toast(e.message,'error')}}
async function transition(action){const id=$('approvalId').value;if(!id)return toast('Enter a submission ID.','error');try{const d=await api(`/results/${id}/${action}`,{method:'PATCH'});toast(d.message||'Submission status updated.','success');await loadDashboard()}catch(e){toast(e.message,'error')}}
function badge(status){const s=String(status||'UNKNOWN').toUpperCase();return `<span class="status-badge status-${safe(s.toLowerCase())}">${safe(s)}</span>`}
function table(rows,fields){if(!rows?.length)return '<div class="empty-state">No records are available for this account yet.</div>';return `<table><thead><tr>${fields.map(f=>`<th>${safe(f.label)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>'<tr>'+fields.map(f=>`<td>${f.key==='status'?badge(row[f.key]):safe(f.format?f.format(row[f.key]):row[f.key])}</td>`).join('')+'</tr>').join('')}</tbody></table>`}
const dateValue=v=>v?new Date(v).toLocaleString():'â€”';
function renderAllResults(){const student=currentUser.role==='STUDENT';const fields=student?[{key:'code',label:'Course code'},{key:'title',label:'Course title'},{key:'semester',label:'Semester'},{key:'academic_year',label:'Academic year'},{key:'score',label:'Score'},{key:'status',label:'Status'}]:[{key:'id',label:'Submission'},{key:'code',label:'Course code'},{key:'title',label:'Course title'},{key:'semester',label:'Semester'},{key:'status',label:'Status'},{key:'submitted_at',label:'Submitted',format:dateValue}];$('allResultsTable').innerHTML=table(resultsCache,fields);$('recordCount').textContent=`${resultsCache.length} record${resultsCache.length===1?'':'s'}`}
async function loadDashboard(){try{if(currentUser.role==='STUDENT'){const me=await api('/me');const d=await api(`/students/${me.user.studentId}/results`);resultsCache=d.results||[];$('statGrid').innerHTML=stat('Published courses',resultsCache.length,'Courses with released results','â–¤')+stat('Results available',resultsCache.length,'Official academic records','âœ“')+stat('Latest score',resultsCache.length?resultsCache[0].score:'â€”','Most recent published score','â—ˆ');$('recentHeading').textContent='Your published results';$('recentTable').innerHTML=table(resultsCache.slice(0,5),[{key:'code',label:'Course'},{key:'title',label:'Course title'},{key:'semester',label:'Semester'},{key:'score',label:'Score'},{key:'status',label:'Status'}])}
else{const d=await api('/results');resultsCache=d.results||[];const published=resultsCache.filter(x=>x.status==='PUBLISHED').length;const awaiting=resultsCache.filter(x=>['SUBMITTED','RETURNED','VERIFIED','APPROVED'].includes(x.status)).length;$('statGrid').innerHTML=stat('Total submissions',resultsCache.length,'Records visible to your role','â–¤')+stat('In progress',awaiting,'Awaiting workflow action','â—·')+stat('Published',published,'Released academic results','âœ“');$('recentHeading').textContent='Recent submissions';$('recentTable').innerHTML=table(resultsCache.slice(0,5),[{key:'id',label:'Submission'},{key:'code',label:'Course'},{key:'title',label:'Course title'},{key:'semester',label:'Semester'},{key:'status',label:'Status'}])}renderAllResults()}catch(e){$('statGrid').innerHTML=stat('Workspace status','Unavailable','Could not retrieve data','!');$('recentTable').innerHTML=`<div class="empty-state">${safe(e.message)}</div>`;$('allResultsTable').innerHTML=`<div class="empty-state">${safe(e.message)}</div>`}}
async function loadAudit(){$('auditTable').innerHTML='<div class="loading-state">Loading audit recordsâ€¦</div>';try{const d=await api('/audit');$('auditTable').innerHTML=table(d.auditLogs||[],[{key:'id',label:'Log'},{key:'action',label:'Action'},{key:'actor',label:'Performed by'},{key:'details',label:'Details'},{key:'submission_id',label:'Submission'},{key:'created_at',label:'Date',format:dateValue}])}catch(e){$('auditTable').innerHTML=`<div class="empty-state">${safe(e.message)}</div>`}}
async function init(){if(!token)return showLogin();try{const d=await api('/me');currentUser=d.user;showApp()}catch{localStorage.removeItem('must_token');token=null;showLogin()}}init();
