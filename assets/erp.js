/* ============================================================
   ERP 儀表板（示範）
   ------------------------------------------------------------
   資料全部來自 assets/store.js 的 localStorage 示範資料庫，
   樹體資產透過 Store.treeList() 取得（資料庫優先，否則用種子）。
   沒有後端、沒有權限控管 —— 這是給 demo 看流程用的。
   ============================================================ */

Store.onReady((info) => {
  if (!document.getElementById('kpis')) return;
  showDbStatus(info);
  renderAll();

  // 左側功能列
  document.getElementById('side-menu').addEventListener('click', e => {
    const btn = e.target.closest('.side-item[data-tab]');
    if (!btn) return;
    show(btn.dataset.tab);
    closeSide();          // 手機上點完就把抽屜收起來
  });

  // 手機：漢堡開關側邊欄
  const side = document.getElementById('side');
  const veil = document.getElementById('side-veil');
  document.getElementById('side-toggle').addEventListener('click', () => {
    const open = !side.classList.contains('open');
    side.classList.toggle('open', open);
    veil.hidden = !open;
    document.getElementById('side-toggle').setAttribute('aria-expanded', String(open));
  });
  veil.addEventListener('click', closeSide);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSide(); });

  // 網址帶 #commission 之類的就直接開那一頁，方便加書籤與分享
  const want = location.hash.replace('#', '');
  if (want && document.querySelector(`.side-item[data-tab="${want}"]`)) show(want);

  showMe();
  gateMenu();

  // 樹體資產篩選
  ['erp-crop', 'erp-status'].forEach(id =>
    document.getElementById(id).addEventListener('change', renderTrees));

  // 佣金比例
  document.getElementById('rate-save').addEventListener('click', () => {
    const c = parseFloat(document.getElementById('rate-commission').value);
    const d = parseFloat(document.getElementById('rate-deposit').value);
    if (!Number.isFinite(c) || c < 0 || c > 100) return alert('佣金％請填 0–100 之間的數字。');
    if (!Number.isFinite(d) || d < 0 || d > 100) return alert('訂金％請填 0–100 之間的數字。');
    if (c + d > 100) return alert(`佣金 ${c}% ＋ 訂金 ${d}% 超過 100%，果農的尾款會變成負數。`);
    Store.saveSetting('commission_rate', c);
    Store.saveSetting('deposit_share', d);
    renderCommission();
    renderKpis();
    if (typeof renderFinance === 'function') renderFinance();
  });

  // 即時預覽（還沒按儲存就先看得到分帳結果）
  ['rate-commission', 'rate-deposit'].forEach(id =>
    document.getElementById(id).addEventListener('input', previewRates));

  // 撥款
  document.getElementById('t-commission').addEventListener('click', e => {
    const b = e.target.closest('[data-payout]');
    if (b) makePayout(b.dataset.payout);
  });

  document.getElementById('db-reset').addEventListener('click', () => {
    if (confirm('確定要清除本機的示範資料，回到初始狀態嗎？')) {
      Store.reset();
      renderAll();
    }
  });
});

/** 在頁面上標示目前是接雲端資料庫還是本機 localStorage */
function showDbStatus(info) {
  const box = document.querySelector('.demo-banner');
  if (!box) return;
  const cloud = info && info.mode === 'cloud';
  const missing = (info && info.missing) || [];
  const warn = missing.length
    ? `<br><span class="dim">⚠️ 以下資料表尚未建立，目前只存在這台裝置：<b>${missing.join('、')}</b>。
       到 Supabase 的 SQL Editor 跑一次專案裡的 <code>supabase-setup-v2.sql</code> 就會同步到雲端。</span>`
    : '';
  box.innerHTML = cloud
    ? `☁️ <b>已連線到雲端資料庫</b> —— 資料存在 Supabase，所有裝置共用同一份。
       目前有 ${info.trees || 0} 棵樹、${info.orders || 0} 筆訂單、${info.users || 0} 個帳號。${warn}`
    : `⚠️ <b>目前使用本機儲存</b> —— 尚未設定雲端資料庫，資料只存在<b>這台瀏覽器</b>，
       換一台裝置看不到。設定方式見專案的 <code>assets/config.js</code>。`
       + (info && info.error ? `<br><span class="dim">連線錯誤：${info.error}</span>` : '');
  box.style.borderLeftColor = cloud ? 'var(--gold)' : 'var(--red)';
}

const money = n => 'RM ' + Number(n).toLocaleString('en-MY');

function table(headers, rows) {
  if (!rows.length) return '<tbody><tr><td style="text-align:center;padding:34px">目前沒有資料</td></tr></tbody>';
  return `<thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>`;
}

function renderAll() {
  renderKpis();
  renderOrders();
  renderTrees();
  renderCustomers();
  renderReports();
  renderWages();
  renderCommission();
  renderSocial();
  renderFinance();
  renderOverview();
  renderUsers();
}

/* ---------- KPI ---------- */
function renderKpis() {
  const db = Store.read();
  const paid      = db.orders.reduce((s, o) => s + o.paid, 0);
  const contract  = db.orders.reduce((s, o) => s + o.amount, 0);
  const unearned  = contract - paid;                       // 已簽未收
  const adopted   = Store.treeList().filter(t =>
    t.status === 'adopted' || db.orders.some(o => o.treeId === t.id)).length;
  const rate      = Math.round(adopted / Store.treeList().length * 100);

  document.getElementById('kpis').innerHTML = [
    ['認養訂單', db.orders.length + ' 筆', '含本機新增的模擬訂單'],
    ['已收款項', money(paid), '預付金 + 全額'],
    ['待收尾款', money(unearned), 'Unearned Revenue'],
    ['樹體資產', Store.treeList().length + ' 棵', `已認養 ${adopted} 棵 · 認養率 ${rate}%`],
    ['B2B 名單', db.leads.length + ' 家', '企業潛在客戶'],
    ['樹況回報', db.reports.length + ' 筆', '溝通者現場紀錄'],
  ].map(([k, v, s]) => `
    <div class="kpi-card"><span class="k">${k}</span><b>${v}</b><small>${s}</small></div>
  `).join('');
}

/* ---------- 訂單 ---------- */
function renderOrders() {
  const db = Store.read();
  const rows = [...db.orders].reverse().map(o => [
    `<b>${o.no}</b>`, o.date,
    `<span class="pill">${o.treeId}</span>`,
    o.customer,
    `<span class="dim">${o.email}</span>`,
    money(o.amount), `<b>${money(o.paid)}</b>`,
    money(o.amount - o.paid),
    o.channel,
    `<span class="badge-${o.status === '已付全額' ? 'ok' : 'wait'}">${o.status}</span>`,
  ]);
  document.getElementById('t-orders').innerHTML = table(
    ['訂單編號', '日期', 'Tree ID', '認養人', 'Email', '合約金額', '已收', '待收', '付款方式', '狀態'], rows);
}

/* ---------- 樹體資產 ---------- */
function renderTrees() {
  const crop = document.getElementById('erp-crop').value;
  const st   = document.getElementById('erp-status').value;
  const db   = Store.read();

  // 有訂單綁定的樹一律視為已認養 —— 狀態以訂單為準，避免與訂單表打架
  const effective = t => db.orders.some(o => o.treeId === t.id) ? 'adopted' : t.status;

  const rows = Store.treeList()
    .filter(t => (!crop || t.crop === crop) && (!st || effective(t) === st))
    .map(t => {
      const o = db.orders.find(x => x.treeId === t.id);
      const stat = { available:['開放認養','wait'], reserved:['保留中','wait'], adopted:['已認養','ok'] }[effective(t)];
      return [
        `<b>${t.id}</b>`, CROP_NAME[t.crop], t.variety, t.age + ' 年',
        t.kg + ' kg', money(t.price), t.orchard, t.area, t.farmer,
        `<span class="badge-${stat[1]}">${stat[0]}</span>`,
        o ? `<span class="pill">${o.no}</span>` : '<span class="dim">—</span>',
      ];
    });

  document.getElementById('t-trees').innerHTML = table(
    ['Tree ID', '作物', '品種', '樹齡', '預估產量', '年認養金', '果園', '地區', '果農', '狀態', '綁定訂單'], rows);
}

/* ---------- 客戶 ---------- */
function renderCustomers() {
  const db = Store.read();

  // B2C：以 email 聚合認養人
  const map = new Map();
  db.orders.forEach(o => {
    const k = o.email;
    if (!map.has(k)) map.set(k, { name:o.customer, email:o.email, phone:o.phone, trees:[], paid:0 });
    const c = map.get(k);
    c.trees.push(o.treeId);
    c.paid += o.paid;
  });
  const b2c = [...map.values()].map(c => [
    `<b>${c.name}</b>`, `<span class="dim">${c.email}</span>`, c.phone,
    c.trees.map(t => `<span class="pill">${t}</span>`).join(' '),
    c.trees.length + ' 棵', `<b>${money(c.paid)}</b>`,
  ]);
  document.getElementById('t-b2c').innerHTML = table(
    ['認養人', 'Email', '電話', '認養樹', '棵數', '累計已付'], b2c);

  const b2b = db.leads.map(l => [
    l.date, `<b>${l.company}</b>`, l.contact, `<span class="dim">${l.title}</span>`,
    `<span class="dim">${l.email}</span>`, l.need, l.budget,
    `<span class="badge-wait">${l.stage}</span>`,
  ]);
  document.getElementById('t-b2b').innerHTML = table(
    ['日期', '公司', '窗口', '職稱', 'Email', '需求', '預算', '階段'], b2b);
}

/* ---------- 樹況回報 ---------- */
function renderReports() {
  const db = Store.read();
  const rows = db.reports.map(r => [
    r.at, `<span class="pill">${r.treeId}</span>`, r.by, r.stage,
    `<span class="badge-${r.health === '良好' ? 'ok' : 'wait'}">${r.health}</span>`,
    r.note, r.photos + ' 張',
  ]);
  document.getElementById('t-reports').innerHTML = table(
    ['時間', 'Tree ID', '回報人', '生長階段', '樹況', '備註', '照片'], rows);
}

/* ---------- 工資 ---------- */
function renderWages() {
  const db = Store.read();
  const rows = db.wages.map(w => [
    w.month, `<b>${w.person}</b>`, w.role,
    money(w.base), money(w.bonus), `<b>${money(w.base + w.bonus)}</b>`, `<span class="dim">${w.note}</span>`,
  ]);
  document.getElementById('t-wages').innerHTML = table(
    ['月份', '對象', '身分', '基本', '分潤／獎金', '合計', '備註'], rows);
}

/* ============================================================
   佣金與分潤
   ------------------------------------------------------------
   商業模式（依 2026-08-18 教練會議確認）：
     認養人付 RM 100 → 果農拿 RM 80，平台留 RM 20（20% 佣金）。
   果農那 80% 再拆兩段，預設 55% 在開花前先撥、25% 採收後結清——
   認養制的重點就是錢要在開花前到果農手上。
   ============================================================ */

function renderCommission() {
  const rate = Store.settingNum('commission_rate', 20);
  const dep  = Store.settingNum('deposit_share', 55);

  const rc = document.getElementById('rate-commission');
  const rd = document.getElementById('rate-deposit');
  if (rc && document.activeElement !== rc) rc.value = rate;
  if (rd && document.activeElement !== rd) rd.value = dep;

  const ex = document.getElementById('rate-explain');
  if (ex) {
    const bal = 100 - rate - dep;
    ex.innerHTML = bal < 0
      ? `⚠️ <b>比例不合理</b> —— 佣金 ${rate}% ＋ 開花前訂金 ${dep}% 已經超過 100%，
         果農的尾款會變成負數。請把訂金％調低。`
      : `每 RM 100 的認養金：<b>果農拿 RM ${fmt(100 - rate)}</b>
         （開花前先撥 RM ${fmt(dep)}、採收後再撥 RM ${fmt(bal)}），
         <b>平台留 RM ${fmt(rate)}</b> 作為營運收入。`;
    ex.style.color = bal < 0 ? 'var(--red)' : '';
  }

  const db = Store.read();
  const orders = db.orders || [];
  const sums = orders.reduce((a, o) => {
    const s = Store.split(o);
    a.amount += s.amount; a.fee += s.fee; a.farmer += s.farmer;
    a.paidOut += s.paidOut; a.pending += s.pending;
    return a;
  }, { amount:0, fee:0, farmer:0, paidOut:0, pending:0 });

  const kpi = document.getElementById('comm-kpis');
  if (kpi) kpi.innerHTML = [
    ['認養合約總額', money(sums.amount), `${orders.length} 筆訂單`],
    ['平台佣金收入', money(sums.fee),    `佣金率 ${rate}%`],
    ['果農應得總額', money(sums.farmer), `合約的 ${fmt(100 - rate)}%`],
    ['已撥給果農',   money(sums.paidOut), `${(db.payouts || []).length} 筆撥款`],
    ['尚待撥款',     money(sums.pending), sums.pending > 0 ? '需安排轉帳' : '已結清'],
  ].map(([k, v, s]) => `
    <div class="kpi-card"><span class="k">${k}</span><b>${v}</b><small>${s}</small></div>
  `).join('');

  /* 逐筆拆帳 */
  const rows = [...orders].reverse().map(o => {
    const s = Store.split(o);
    const done = s.pending <= 0.005;
    return [
      `<b>${o.no}</b>`,
      `<span class="pill">${o.treeId}</span>`,
      o.customer,
      money(s.amount),
      `<span class="num fee">${money(s.fee)}</span>`,
      `<span class="num">${money(s.farmer)}</span>`,
      money(s.paidOut),
      done ? '<span class="badge-ok">已結清</span>'
           : `<span class="badge-wait">${money(s.pending)}</span>`,
      done ? '—'
           : `<button class="mini-btn" data-payout="${o.no}">撥款</button>`,
    ];
  });
  document.getElementById('t-commission').innerHTML = table(
    ['訂單編號', 'Tree ID', '認養人', '合約總額', `平台佣金 ${rate}%`,
     `果農應得 ${fmt(100 - rate)}%`, '已撥', '待撥', ''], rows);

  /* 撥款紀錄 */
  const pays = [...(db.payouts || [])].reverse().map(p => [
    `<b>${p.ref}</b>`, p.date, p.orderNo || '—',
    `<span class="pill">${p.treeId || '—'}</span>`,
    p.farmer || '—',
    { deposit:'開花前訂金', balance:'採收後尾款', adjust:'調整' }[p.kind] || p.kind,
    `<span class="num">${money(p.amount)}</span>`,
    p.method || '—',
    `<span class="badge-ok">${p.status || '已撥款'}</span>`,
  ]);
  document.getElementById('t-payouts').innerHTML = table(
    ['撥款編號', '日期', '訂單', 'Tree ID', '果農', '性質', '金額', '方式', '狀態'], pays);
}

/** 建立一筆撥款。優先撥「開花前訂金」，訂金撥完才輪到尾款。 */
function makePayout(orderNo) {
  const db = Store.read();
  const o = (db.orders || []).find(x => x.no === orderNo);
  if (!o) return;
  const s = Store.split(o);
  if (s.pending <= 0.005) return;

  const depDone = s.paidOut >= s.deposit - 0.005;
  const kind    = depDone ? 'balance' : 'deposit';
  const amount  = Math.round(Math.min(s.pending, depDone ? s.balance : s.deposit - s.paidOut) * 100) / 100;

  const tree   = Store.treeList().find(t => t.id === o.treeId) || {};
  const label  = kind === 'deposit' ? '開花前訂金' : '採收後尾款';
  if (!confirm(`要撥 ${money(amount)} 給「${tree.farmer || o.treeId}」嗎？\n（${o.no} · ${label}）`)) return;

  Store.addPayout({
    ref: Store.nextPayoutRef(new Date().getFullYear()),
    date: today(),
    orderNo: o.no,
    treeId: o.treeId,
    farmer: tree.farmer || '',
    kind, amount,
    method: 'DuitNow 轉帳',
    status: '已撥款',
    note: label,
  });
  renderCommission();
  renderKpis();
}

const fmt = n => (Math.round(Number(n) * 100) / 100).toLocaleString('en-MY');
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}


/** 使用者還在打字時，先算給他看，但不寫進資料庫。 */
function previewRates() {
  const c = parseFloat(document.getElementById('rate-commission').value);
  const d = parseFloat(document.getElementById('rate-deposit').value);
  const ex = document.getElementById('rate-explain');
  if (!ex || !Number.isFinite(c) || !Number.isFinite(d)) return;
  const bal = 100 - c - d;
  ex.innerHTML = bal < 0
    ? `⚠️ <b>比例不合理</b> —— 佣金 ${c}% ＋ 開花前訂金 ${d}% 超過 100%。`
    : `（未儲存）每 RM 100：果農 RM ${fmt(100 - c)}
       （開花前 RM ${fmt(d)}、採收後 RM ${fmt(bal)}），平台 RM ${fmt(c)}。`;
  ex.style.color = bal < 0 ? 'var(--red)' : '';
}


/* ---------- 側邊欄 ---------- */

/** 切到某個功能頁，同時更新左側高亮、麵包屑與網址。 */
function show(tab) {
  document.querySelectorAll('.side-item[data-tab]').forEach(b =>
    b.classList.toggle('on', b.dataset.tab === tab));
  document.querySelectorAll('.tab-pane').forEach(p =>
    p.classList.toggle('on', p.dataset.panel === tab));

  /* 麵包屑只要文字，不要選單前面那個圖示 */
  const btn = document.querySelector(`.side-item[data-tab="${tab}"]`);
  const crumb = document.getElementById('crumb');
  if (btn && crumb) {
    const label = [...btn.childNodes]
      .filter(n => n.nodeType === 3).map(n => n.nodeValue).join('').trim();
    crumb.textContent = label || btn.textContent.trim();
  }

  history.replaceState(null, '', '#' + tab);
  document.querySelector('.admin-body').scrollTop = 0;
  window.scrollTo(0, 0);
}

function closeSide() {
  const side = document.getElementById('side');
  if (!side || !side.classList.contains('open')) return;
  side.classList.remove('open');
  document.getElementById('side-veil').hidden = true;
  document.getElementById('side-toggle').setAttribute('aria-expanded', 'false');
}

/** 側邊欄上方的使用者區塊。沒登入就顯示訪客，並把登出改成登入。 */
function showMe() {
  const u = sessionStorage.getItem('rf_app_session');
  const me = u ? (Store.read().users || []).find(x => x.u === u) : null;
  const nameEl = document.getElementById('side-name');
  const roleEl = document.getElementById('side-role');
  const avEl   = document.getElementById('side-avatar');
  const outBtn = document.getElementById('logout');

  if (me) {
    nameEl.textContent = me.name || me.u;
    roleEl.textContent = { admin:'平台管理員', farmer:'果農', buyer:'收購商' }[me.role] || me.role;
    avEl.textContent = (me.name || me.u).trim().charAt(0).toUpperCase();
    outBtn.textContent = '登出';
    outBtn.onclick = () => { sessionStorage.removeItem('rf_app_session'); location.href = 'app.html'; };
  } else {
    nameEl.textContent = '訪客';
    roleEl.textContent = '未登入';
    avEl.textContent = '·';
    outBtn.textContent = '登入';
    outBtn.onclick = () => { location.href = 'app.html'; };
  }
}

/* ---------- 總覽 ---------- */

function renderOverview() {
  const db = Store.read();

  /* 最近動態：訂單、樹況回報、撥款、貼文混在一起，依時間排 */
  const feed = [
    ...(db.orders  || []).map(o => [o.date, '🧾 認養訂單', `${o.no} · ${o.treeId} · ${o.customer}`]),
    ...(db.reports || []).map(r => [r.at,   '📋 樹況回報', `${r.treeId} · ${r.stage} · ${r.health}`]),
    ...(db.payouts || []).map(p => [p.date, '💰 撥款',     `${p.ref} · ${p.farmer || p.treeId} · ${money(p.amount)}`]),
    ...(db.posts   || []).map(p => [p.at,   '📣 社群貼文', `${p.channel} · ${(p.title || '').slice(0, 24)}`]),
  ].sort((a, b) => String(b[0]).localeCompare(String(a[0]))).slice(0, 12);

  document.getElementById('t-recent').innerHTML = table(
    ['時間', '類型', '內容'], feed.map(f => [f[0], f[1], f[2]]));

  /* 這個月的幾個數字 */
  const ym = today().slice(0, 7);
  const inMonth = a => String(a || '').startsWith(ym);
  const mo = (db.orders || []).filter(o => inMonth(o.date));
  const mp = (db.payouts || []).filter(p => inMonth(p.date));
  const rate = Store.settingNum('commission_rate', 20);

  document.getElementById('t-month').innerHTML = table(
    ['項目', ''],
    [
      ['新增認養訂單', `${mo.length} 筆`],
      ['本月流水 GMV', money(mo.reduce((s, o) => s + o.amount, 0))],
      [`平台佣金（${rate}%）`, money(mo.reduce((s, o) => s + Store.split(o).fee, 0))],
      ['撥給果農', money(mp.reduce((s, p) => s + Number(p.amount), 0))],
      ['樹況回報', `${(db.reports || []).filter(r => inMonth(r.at)).length} 筆`],
      ['社群貼文', `${(db.posts || []).filter(p => inMonth(p.at)).length} 篇`],
    ]);
}

/* ============================================================
   帳號與權限
   ============================================================ */

function renderUsers() {
  const el = document.getElementById('t-perms');
  if (!el) return;

  /* 權限矩陣：橫軸是角色，縱軸是能做的事 */
  const ACTIONS = [
    ['view.all',      '看所有資料'],
    ['view.orders',   '看訂單'],
    ['view.trees',    '看果樹'],
    ['edit.trees',    '編輯果樹'],
    ['edit.orders',   '編輯訂單'],
    ['view.money',    '看金額與財務'],
    ['edit.money',    '執行撥款'],
    ['edit.settings', '改佣金比例'],
    ['edit.social',   '社群發文'],
    ['field.report',  '現場回報'],
    ['edit.users',    '管理帳號與權限'],
    ['db.reset',      '重設資料'],
  ];
  const ROLES = ['super', 'admin', 'finance', 'editor', 'coord'];

  const has = (role, action) => {
    const list = PERMS[role].can;
    if (list.includes(action)) return true;
    if (action.startsWith('view.') && list.includes('view.all')) return true;
    if (action.startsWith('view.') && list.includes('edit.' + action.slice(5))) return true;
    return false;
  };

  el.innerHTML = table(
    ['可以做的事', ...ROLES.map(r => PERMS[r].label)],
    ACTIONS.map(([a, label]) => [
      label,
      ...ROLES.map(r => has(r, a)
        ? '<span class="yes" title="可以">✓</span>'
        : '<span class="no" title="不行">—</span>'),
    ]));

  /* 帳號清單。只有具 edit.users 的人看得到下拉選單，其他人看到純文字。 */
  const editable = Perm.can('edit.users');
  const meU = (Perm.me() || {}).u;

  document.getElementById('t-users').innerHTML = table(
    ['帳號', '姓名', '單位', 'ERP 權限', '前台身分', 'Email'],
    (Store.read().users || []).map(u => {
      const cur = u.perm || (u.role === 'admin' ? 'super' : u.role);
      const picker = editable
        ? `<select class="perm-pick" data-u="${u.u}"${u.u === meU ? ' disabled title="不能改自己的權限，避免把自己鎖在門外"' : ''}>
             ${Object.entries(PERMS).map(([k, v]) =>
               `<option value="${k}"${k === cur ? ' selected' : ''}>${v.label}</option>`).join('')}
           </select>`
        : `<span class="pill">${(PERMS[cur] || {}).label || cur}</span>`;
      return [
        `<b>${u.u}</b>${u.u === meU ? ' <span class="badge-ok">你</span>' : ''}`,
        u.name || '—', u.org || '—', picker,
        { admin:'管理', farmer:'果農', buyer:'收購商' }[u.role] || u.role,
        `<span class="dim">${u.email || '—'}</span>`,
      ];
    }));

  document.querySelectorAll('.perm-pick').forEach(sel =>
    sel.addEventListener('change', () => {
      if (!Perm.can('edit.users')) return;
      Store.setUserPerm(sel.dataset.u, sel.value);
      renderUsers();
      gateMenu();
    }));
}

/** 把目前角色沒有權限的功能頁從左側選單拿掉。 */
function gateMenu() {
  let firstVisible = null;
  document.querySelectorAll('.side-item[data-tab]').forEach(b => {
    const ok = Perm.canPage(b.dataset.tab);
    b.hidden = !ok;
    if (ok && !firstVisible) firstVisible = b.dataset.tab;
  });

  Perm.apply();

  /* 如果現在停在一個沒權限的頁面上，就退到第一個看得到的頁 */
  const now = document.querySelector('.tab-pane.on');
  if (now && !Perm.canPage(now.dataset.panel) && firstVisible) show(firstVisible);

  const roleEl = document.getElementById('side-role');
  if (roleEl && Perm.me()) roleEl.textContent = Perm.roleLabel();
}
