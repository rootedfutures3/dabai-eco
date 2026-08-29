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

/* 誰能進溝通者平台。
   TANJU Portal 是獨立的管理後台，只有管理端進得去；
   溝通者與果農都在這個平台工作 —— 現場的人用手機，
   不會也不需要去碰後台。兩邊靠同一個資料庫連動：
   這裡送出的回報，後台的「樹況回報」立刻看得到。 */
const COORD_ROLES = ['coord', 'farmer', 'super', 'admin', 'editor'];

/* 果農只看得到自己的樹，溝通者與管理端看得到全部。 */
let ME = null;

/** 這個使用者在這個平台上「看得到」的樹。 */
function myTrees() {
  const all = Store.treeList().filter(t => t.crop === 'dabai');
  if (!ME || ME.perm !== 'farmer') return all;
  const name = (ME.name || '').trim();
  const org  = (ME.org  || '').trim();
  return all.filter(t =>
    t.owner === ME.u ||
    (name && String(t.farmer  || '').includes(name)) ||
    (org  && String(t.orchard || '').includes(org)));
}

/** 果農看到的是「我的果園」，溝通者看到的是「今日派工」。 */
function isFarmer() { return ME && ME.perm === 'farmer'; }

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
    ME = { ...user, perm };
    const roleEl = document.getElementById('who-role');
    if (roleEl) {
      roleEl.textContent = { farmer:'果農', coord:'現場溝通者' }[perm] || '管理端';
    }
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
      /* 果農自己回報時要標明是果農，後台才分得出來源 */
      by: (isFarmer() ? '果農 · ' : '溝通者 · ')
          + document.getElementById('who-label').textContent,
      stage: f.stage.value,
      health: f.health.value,
      note: f.note.value.trim(),
      photos: document.getElementById('r-photo').files.length,
    };

    if (navigator.onLine) {
      Store.addReport(report);
      /* 讓人知道兩邊是連動的 —— 這裡送出去，後台立刻看得到，
         而不是存在某個誰也看不到的地方。 */
      note(`✅ ${report.treeId} 已儲存並同步 —— TANJU Portal 的「樹況回報」現在就看得到這一筆。`);
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
  const opts = myTrees().map(t =>
    `<option value="${t.id}">${t.id} · ${CROP_NAME[t.crop]}（${t.orchard}）</option>`).join('');
  document.getElementById('r-tree').innerHTML = opts;
  document.getElementById('l-tree').innerHTML = opts;
}

/* ---------- 派工單 ---------- */
function renderJobs() {
  const box = document.getElementById('jobs');
  const title = document.getElementById('jobs-title');

  /* 果農沒有派工單 —— 他要看的是自己的樹現在什麼狀況。 */
  if (isFarmer()) {
    if (title) title.textContent = '我的果樹';
    const mine = myTrees();
    const reports = Store.read().reports || [];
    box.innerHTML = mine.length ? mine.map(t => {
      const last = reports.filter(r => r.treeId === t.id).slice(-1)[0];
      return `
        <div class="job">
          <div class="job-top">
            <span class="pill">${t.id}</span>
            <span class="job-due">${t.age} 年生 · 預估 ${t.kg} kg</span>
          </div>
          <b>${t.orchard}</b>
          <span class="dim">📍 ${t.area}</span>
          ${last
            ? `<span class="dim">最近一次回報：${last.at} · ${last.stage} · ${last.health}</span>`
            : '<span class="dim">還沒有回報紀錄</span>'}
        </div>`;
    }).join('') : `
      <div class="no-result">
        系統裡還沒有掛在你名下的果樹。<br>
        請聯絡平台管理員把你的果園建檔並掛上 Tree ID。
      </div>`;
    return;
  }

  if (title) title.textContent = '今日派工單';
  const jobs = [
    { id:'WO-0312', area:'Song 支流果園',      task:'開花期巡檢 + 追肥確認', trees:'DB-009, DB-010', due:'今日 12:00' },
    { id:'WO-0313', area:'Sibu 近郊示範園',    task:'幼果疏果與過磅',        trees:'DB-015, DB-016', due:'今日 16:00' },
    { id:'WO-0314', area:'Rumah Panjai 上游',  task:'認養樹掛牌 + 拍照存證',  trees:'DB-001, DB-002, DB-003', due:'明日 09:00' },
  ];
  box.innerHTML = jobs.map(j => `
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
  const ids = new Set(myTrees().map(t => t.id));
  /* 溝通者看自己送的；果農看自己那些樹上的所有回報
     —— 對果農來說，誰去回報的不重要，重要的是他的樹怎麼了。 */
  const mine = (Store.read().reports || [])
    .filter(r => isFarmer() ? ids.has(r.treeId) : String(r.by || '').includes(who))
    .slice(-8).reverse();
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
  const t = myTrees().find(x => x.id === document.getElementById('l-tree').value);
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
