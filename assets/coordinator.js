/* ============================================================
   溝通者現場門戶（示範）
   ------------------------------------------------------------
   登入沿用平台帳號（sessionStorage 的 rf_app_session），
      不再有獨立的示範代碼 —— 兩套登入只會讓人以為自己登不進去。
      能不能進來看的是角色：溝通者，以及需要看現場狀況的管理端。

   離線設計：回報寫入 localStorage 佇列；偵測到連線時才「同步」
   （目前同步的目的地就是同一個 localStorage 示範資料庫）。
   照片只在瀏覽器內產生預覽 URL，不會儲存也不會上傳。
   ============================================================ */

const SESSION_KEY = 'rf_app_session';   // 和整個平台共用同一個登入
const QUEUE_KEY = 'rf_report_queue';

/* 誰能進溝通者平台。管理端也放行 —— 他們需要看得到現場在做什麼。 */
const COORD_ROLES = ['coord', 'super', 'admin', 'editor'];

Store.onReady(() => {
  if (!document.getElementById('signin')) return;

  const signin = document.getElementById('signin');
  const portal = document.getElementById('portal');

  const enter = who => {
    document.getElementById('who-label').textContent = who;
    signin.hidden = true;
    portal.hidden = false;
    fillTreeSelects();
    renderJobs();
    renderMyReports();
    renderLabel();
    flushQueue();
  };

  /* 用平台帳號判斷能不能進來。
     原本這裡是一組寫死的示範代碼，等於平台有兩套各自獨立的登入 ——
     人在官網登入過了，點進來又被要一次代碼，會以為自己登不進去。
     現在統一：沒登入就請他去登入頁，登入了就看角色放不放行。 */
  const saved = sessionStorage.getItem(SESSION_KEY);
  const user  = saved ? (Store.read().users || []).find(x => x.u === saved) : null;
  const perm  = user && (user.perm || (user.role === 'admin' ? 'super' : user.role));

  if (user && COORD_ROLES.includes(perm)) {
    enter(user.name || user.u);
  } else {
    const err  = document.getElementById('login-err');
    const note = document.getElementById('coord-note');
    if (user) {
      err.textContent = `「${user.name || user.u}」這個帳號沒有現場回報的權限，`
                      + '請管理員在 TANJU Portal 的「帳號與權限」把角色改成溝通者。';
      err.style.display = 'block';
      if (note) note.hidden = true;
    }
  }

  document.getElementById('logout').addEventListener('click', () => {
    sessionStorage.removeItem(SESSION_KEY);
    if (typeof Auth !== 'undefined' && Auth.on) Auth.signOut();
    location.assign('app.html');
  });

  /* ---- 連線狀態 ---- */
  /* 連線狀態的標示已經拿掉了 —— 畫面上多一個「已連線」對使用者
     沒有幫助，反而讓頂欄變擠。離線佇列仍然照常運作：
     偵測到重新連線時自動把暫存的回報送出去。 */
  const flushOnline = () => { if (navigator.onLine) flushQueue(); };
  window.addEventListener('online', flushOnline);

  /* ---- 照片預覽（僅本機） ---- */
  document.getElementById('r-photo').addEventListener('change', e => {
    const box = document.getElementById('thumbs');
    box.innerHTML = '';
    [...e.target.files].slice(0, 6).forEach(f => {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(f);
      img.onload = () => URL.revokeObjectURL(img.src);
      box.appendChild(img);
    });
  });

  /* ---- 回報送出 ---- */
  document.getElementById('report-form').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    const report = {
      at: stamp(),
      treeId: f.treeId.value,
      by: '溝通者 · ' + document.getElementById('who-label').textContent,
      stage: f.stage.value,
      health: f.health.value,
      note: f.note.value.trim(),
      photos: document.getElementById('r-photo').files.length,
    };

    if (navigator.onLine) {
      Store.addReport(report);
      note(`✅ 已儲存並同步：${report.treeId}`);
    } else {
      queuePush(report);
      note(`📥 目前離線，已存入本機佇列（${queueRead().length} 筆待同步）。回到有訊號的地方會自動送出。`);
    }

    f.reset();
    document.getElementById('thumbs').innerHTML = '';
    renderMyReports();
  });

  /* ---- 標籤 ---- */
  document.getElementById('l-tree').addEventListener('change', renderLabel);
  document.getElementById('l-basket').addEventListener('input', renderLabel);
  document.getElementById('print-btn').addEventListener('click', () => window.print());
});

/* ---------- 工具 ---------- */
function stamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function note(msg) { document.getElementById('queue-note').textContent = msg; }

function queueRead() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch (e) { return []; }
}
function queuePush(r) {
  const q = queueRead(); q.push(r);
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch (e) {}
}
function flushQueue() {
  const q = queueRead();
  if (!q.length || !navigator.onLine) return;
  q.forEach(r => Store.addReport(r));
  try { localStorage.removeItem(QUEUE_KEY); } catch (e) {}
  note(`🔄 已將 ${q.length} 筆離線回報同步完成。`);
  renderMyReports();
}

function fillTreeSelects() {
  const opts = Store.treeList().filter(t => t.crop === 'dabai').map(t =>
    `<option value="${t.id}">${t.id} · ${CROP_NAME[t.crop]}（${t.orchard}）</option>`).join('');
  document.getElementById('r-tree').innerHTML = opts;
  document.getElementById('l-tree').innerHTML = opts;
}

/* ---------- 派工單 ---------- */
function renderJobs() {
  const jobs = [
    { id:'WO-0312', area:'Song 支流果園',      task:'開花期巡檢 + 追肥確認', trees:'DB-009, DB-010, RB-007, RB-008', due:'今日 12:00' },
    { id:'WO-0313', area:'Sibu 近郊示範園',    task:'幼果疏果與過磅',        trees:'DR-011, DR-012, RB-009',         due:'今日 16:00' },
    { id:'WO-0314', area:'Rumah Panjai 上游',  task:'認養樹掛牌 + 拍照存證',  trees:'DB-001, DB-002, DB-003',         due:'明日 09:00' },
  ];
  document.getElementById('jobs').innerHTML = jobs.map(j => `
    <div class="job">
      <div class="job-top">
        <span class="pill">${j.id}</span>
        <span class="job-due">${j.due}</span>
      </div>
      <b>${j.task}</b>
      <span class="dim">📍 ${j.area}</span>
      <div class="job-trees">${j.trees.split(', ').map(t => `<span class="pill">${t}</span>`).join('')}</div>
    </div>`).join('');
}

/* ---------- 我的回報 ---------- */
function renderMyReports() {
  const who = document.getElementById('who-label').textContent;
  const mine = Store.read().reports.filter(r => r.by.includes(who)).slice(0, 8);
  const pend = queueRead();
  const box = document.getElementById('my-reports');

  const card = (r, pending) => `
    <div class="rep ${pending ? 'pending' : ''}">
      <div class="rep-top">
        <span class="pill">${r.treeId}</span>
        <span class="dim">${r.at}</span>
        ${pending ? '<span class="badge-wait">待同步</span>' : '<span class="badge-ok">已同步</span>'}
      </div>
      <b>${r.stage} · ${r.health}</b>
      <p>${r.note}</p>
      ${r.photos ? `<span class="dim">📷 ${r.photos} 張照片</span>` : ''}
    </div>`;

  const html = [...pend.map(r => card(r, true)), ...mine.map(r => card(r, false))].join('');
  box.innerHTML = html || '<div class="no-result">還沒有回報紀錄。用上面的表單新增一筆。</div>';
}

/* ---------- 採收標籤 ---------- */
function renderLabel() {
  const t = Store.treeList().filter(t => t.crop === 'dabai').find(x => x.id === document.getElementById('l-tree').value);
  if (!t) return;
  const basket = document.getElementById('l-basket').value || 'B-01';
  document.getElementById('label').innerHTML = `
    <div class="label-card" id="label-card">
      <div class="label-head">
        <b>${t.id}</b>
        <span>ROOTED FUTURES</span>
      </div>
      <div class="label-body">
        <div><span>作物</span><b>${CROP_NAME[t.crop]}</b></div>
        <div><span>品種</span><b>${t.variety}</b></div>
        <div><span>果園</span><b>${t.orchard}</b></div>
        <div><span>果農</span><b>${t.farmer}</b></div>
        <div><span>採收籃</span><b>${basket}</b></div>
        <div><span>日期</span><b>${stamp().slice(0, 10)}</b></div>
      </div>
      <div class="label-foot">Song, Sarawak · 一樹一碼追溯</div>
    </div>`;
}
