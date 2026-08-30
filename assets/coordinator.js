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
    renderFieldStats();
    renderDue();
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

    /* 導覽列不要秀出他進不去的地方。
       溝通者與果農點 TANJU Portal 只會被彈回來，
       那種「點了又跳回來」最讓人覺得系統是壞的。 */
    if (!['super', 'admin', 'finance', 'editor'].includes(perm)) {
      document.querySelectorAll('.nav-links a[href="erp.html"]')
        .forEach(a => a.remove());
    }

    mountPlatformSwitch(perm);

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
    location.assign('app.html?next=coordinator.html');
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
    renderFieldStats();
    renderDue();
    renderJobs();
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

/* ============================================================
   現場數字與「該去看看了」
   ------------------------------------------------------------
   站在果園裡最想知道的三件事：
     今天做了多少、有沒有東西還沒送出去、哪幾棵樹太久沒去了。
   所以這裡不放圖表，只放能立刻回答這三件事的數字，
   而且每一張都可以點 —— 點下去直接跳到對應的地方。
   ============================================================ */

/** 兩個日期字串差幾天。抓不到日期就回傳 null。 */
function daysSince(at) {
  if (!at) return null;
  const d = new Date(String(at).replace(' ', 'T'));
  if (isNaN(d)) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function renderFieldStats() {
  const box = document.getElementById('field-stats');
  if (!box) return;

  const who     = document.getElementById('who-label').textContent;
  const trees   = myTrees();
  const ids     = new Set(trees.map(t => t.id));
  const reports = (Store.read().reports || []).filter(r => ids.has(r.treeId));
  const today   = stamp().slice(0, 10);

  const mineToday = reports.filter(r =>
    String(r.at).startsWith(today) &&
    (isFarmer() || String(r.by || '').includes(who))).length;
  const week = reports.filter(r => {
    const d = daysSince(r.at); return d !== null && d <= 7;
  }).length;
  const pending = queueRead().length;
  const attention = reports.filter(r => r.health && r.health !== '良好')
    .map(r => r.treeId);
  const attentionCount = new Set(attention).size;

  const card = (k, v, s, tone, go) => `
    <button class="fs" data-go="${go}" type="button">
      <span class="fs-k">${k}</span>
      <b class="fs-v ${tone || ''}">${v}</b>
      <span class="fs-s">${s}</span>
    </button>`;

  box.innerHTML =
      card(isFarmer() ? '我的果樹' : '負責的樹', trees.length + ' 棵',
           '點一下看清單', '', 'jobs')
    + card('今天已回報', mineToday + ' 筆', '本週 ' + week + ' 筆', '', 'report-form')
    + card('待同步', pending + ' 筆',
           pending ? '回到有訊號會自動送出' : '都送出去了',
           pending ? 'warn' : 'ok', 'my-reports')
    + card('需要注意', attentionCount + ' 棵',
           attentionCount ? '樹況不是「良好」' : '目前都正常',
           attentionCount ? 'warn' : 'ok', 'due-block');

  box.querySelectorAll('[data-go]').forEach(b =>
    b.addEventListener('click', () => {
      const el = document.getElementById(b.dataset.go);
      if (el && !el.hidden) el.scrollIntoView({ behavior:'smooth', block:'start' });
    }));
}

/**
 * 哪幾棵樹太久沒去了。
 * 產季期間顧問建議至少每兩週看一次，所以超過 14 天就列出來。
 */
const DUE_DAYS = 14;

function renderDue() {
  const block = document.getElementById('due-block');
  const list  = document.getElementById('due-list');
  const note  = document.getElementById('due-note');
  if (!block) return;

  const reports = Store.read().reports || [];
  const rows = myTrees().map(t => {
    const last = reports.filter(r => r.treeId === t.id)
      .sort((a, b) => String(a.at).localeCompare(String(b.at))).slice(-1)[0];
    return { t, last, days: last ? daysSince(last.at) : null };
  }).filter(r => r.days === null || r.days >= DUE_DAYS)
    .sort((a, b) => (b.days ?? 9999) - (a.days ?? 9999));

  if (!rows.length) {
    block.hidden = true;
    return;
  }
  block.hidden = false;

  /* 手機上一次列 28 筆等於沒列。只顯示最久沒去的幾棵，
     剩下的用一句話交代，不要假裝清單只有這麼短。 */
  const SHOW = 6;
  const shown = rows.slice(0, SHOW);
  const rest  = rows.length - shown.length;
  note.textContent = rest > 0
    ? `這 ${rows.length} 棵超過 ${DUE_DAYS} 天沒有回報了，先列最久沒去的 ${SHOW} 棵（還有 ${rest} 棵）。點一下直接帶進下面的回報表單。`
    : `這 ${rows.length} 棵超過 ${DUE_DAYS} 天沒有回報了。點一下直接帶進下面的回報表單。`;

  list.innerHTML = shown.map(({ t, last, days }) => `
    <button class="due" data-tree="${t.id}" type="button">
      <span class="due-id">${t.id}</span>
      <span class="due-mid">
        <b>${t.orchard}</b>
        <span>${days === null ? '還沒有任何回報' : `上次回報是 ${days} 天前`}</span>
      </span>
      <span class="due-go" aria-hidden="true">→</span>
    </button>`).join('');

  /* 點一下就把樹帶進表單並捲過去 —— 站在樹下用手機，少一次選單就少一次出錯 */
  list.querySelectorAll('[data-tree]').forEach(b =>
    b.addEventListener('click', () => {
      const sel = document.getElementById('r-tree');
      sel.value = b.dataset.tree;
      sel.dispatchEvent(new Event('change'));
      document.getElementById('report-form').scrollIntoView({ behavior:'smooth', block:'center' });
      document.getElementById('r-note').focus({ preventScroll:true });
    }));
}

/* ============================================================
   平台切換
   ------------------------------------------------------------
   TANJU Portal 與溝通者平台是兩個獨立的系統，但同一個人
   （管理端）常常兩邊都要看。不該為了換一邊而登出再登入 ——
   session 本來就是共用的，只要換頁就好。

   只有兩邊都進得去的角色才看得到這個切換器；
   溝通者與果農看到的是單純的標題，不是一顆點了會被彈回來的按鈕。
   ============================================================ */
function mountPlatformSwitch(perm) {
  const box = document.getElementById('plat-switch');
  if (!box) return;

  const canPortal = ['super', 'admin', 'finance', 'editor'].includes(perm);
  if (!canPortal) { box.hidden = true; return; }
  box.hidden = false;

  const here = location.pathname.split('/').pop() || 'erp.html';
  const tabs = [
    ['erp.html', '📊', 'TANJU Portal'],
    ['coordinator.html', '📍', '溝通者平台'],
  ];

  box.innerHTML = tabs.map(([href, icon, label]) => {
    const on = here === href;
    return on
      ? `<span class="ps on"><span aria-hidden="true">${icon}</span>${label}</span>`
      : `<a class="ps" href="${href}"><span aria-hidden="true">${icon}</span>${label}</a>`;
  }).join('');
}
