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
  Perm.load();          // 自訂角色要先讀進來，renderAll 才畫得出角色欄位
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

  // 這段是連上雲端之後才換掉的內容，i18n 先前快取的原文已經過期，
  // 要它重新抓一次，否則切語言會跳回上面那段示範系統的舊文字。
  if (typeof I18N !== 'undefined') I18N.refresh(box);

  showAuthMode();
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
  renderOverview();
  renderUsers();
  initNewUser();
  initRoleEditor();
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
    // 同樣用中文原文，交給 i18n 翻，不要抓畫面上已經翻好的字
    crumb.textContent = btn.dataset.zh
      || [...btn.childNodes].filter(n => n.nodeType === 3).map(n => n.nodeValue).join('').trim();
    if (typeof I18N !== 'undefined') I18N.refresh(crumb);
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
    outBtn.onclick = () => {
      sessionStorage.removeItem('rf_app_session');
      if (typeof Auth !== 'undefined' && Auth.on) Auth.signOut();
      location.href = 'app.html';
    };
  } else {
    nameEl.textContent = '訪客';
    roleEl.textContent = '未登入';
    avEl.textContent = '·';
    outBtn.textContent = '登入';
    outBtn.onclick = () => { location.href = 'app.html'; };
  }
}

/* ============================================================
   營運總覽 Dashboard
   ------------------------------------------------------------
   回答三個問題：這個月賺了多少、花了多少、比上個月成長多少。

   會計上要分清楚兩件事：
     · 平台收入 —— 只有佣金是我們的錢
     · 代收代付 —— 認養金裡果農那 80% 只是流過我們手上，
       它不是我們的收入，撥出去也不是我們的成本
   所以下面把「代收代付」單獨列出來，不混進損益。
   ============================================================ */

/** 取近 n 個月（含本月）的 YYYY-MM 清單，舊到新。 */
function recentMonths(n) {
  const out = [];
  const d = new Date();
  d.setDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

/** 某個月份的收入、支出與代收代付。 */
function monthStats(ym) {
  const db = Store.read();
  const inM = a => String(a || '').startsWith(ym);

  const orders = (db.orders || []).filter(o => inM(o.date));
  const gmv    = orders.reduce((s, o) => s + Number(o.amount || 0), 0);
  const fee    = orders.reduce((s, o) => s + Store.split(o).fee, 0);

  // 平台自己的支出：工資與津貼。撥給果農的錢是代收代付，不算。
  const wages   = (db.wages || []).filter(w => inM(w.month))
                    .reduce((s, w) => s + Number(w.base || 0) + Number(w.bonus || 0), 0);
  const payouts = (db.payouts || []).filter(p => inM(p.date))
                    .reduce((s, p) => s + Number(p.amount || 0), 0);

  return {
    ym, gmv, revenue: fee, cost: wages, passthrough: payouts,
    net: fee - wages,
    orders: orders.length,
    reports: (db.reports || []).filter(r => inM(r.at)).length,
    posts:   (db.posts   || []).filter(p => inM(p.at)).length,
  };
}

/** 成長率。上個月是 0 的時候沒有百分比可言，回傳 null 讓畫面顯示「—」。 */
function growth(now, prev) {
  if (!prev) return null;
  return (now - prev) / Math.abs(prev) * 100;
}

function renderOverview() {
  const months = recentMonths(12).map(monthStats);
  const cur  = months[months.length - 1];
  const prev = months[months.length - 2] || { revenue: 0, cost: 0, net: 0, gmv: 0 };

  drawMonthKpis(cur, prev);
  drawMonthChart(months);
  drawMonthTable(months);
  drawRecent();
}

/** 大字卡：收入、支出、淨利、流水，各自帶一個和上月比較的箭頭。 */
function drawMonthKpis(cur, prev) {
  const box = document.getElementById('month-kpis');
  if (!box) return;

  const card = (label, value, g, hint, tone) => {
    const arrow = g === null ? ''
      : `<span class="delta ${g >= 0 ? 'up' : 'down'}">
           ${g >= 0 ? '▲' : '▼'} ${Math.abs(g).toFixed(0)}%
         </span>`;
    return `
      <div class="big-kpi ${tone || ''}">
        <span class="bk-k">${label}</span>
        <b class="bk-v">${money(value)}</b>
        <span class="bk-s" data-i18n-keep>${arrow}<span class="bk-hint">${hint}</span></span>
      </div>`;
  };

  box.innerHTML =
      card('本月平台收入', cur.revenue, growth(cur.revenue, prev.revenue), '認養佣金', 'rev')
    + card('本月平台支出', cur.cost,    growth(cur.cost, prev.cost),       '工資與津貼', 'cost')
    + card('本月淨利',     cur.net,     growth(cur.net, prev.net),
           cur.net >= 0 ? '收入減支出' : '尚未打平', cur.net >= 0 ? 'net' : 'neg')
    + card('本月平台流水', cur.gmv,     growth(cur.gmv, prev.gmv),
           `認養訂單 ${cur.orders} 筆`, 'gmv');
}

/**
 * 逐月長條圖。用純 SVG 畫，不拉任何圖表函式庫 ——
 * 這樣沒有額外的載入成本，也不會有 CDN 連不上的問題。
 */
function drawMonthChart(months) {
  const box = document.getElementById('month-chart');
  if (!box) return;

  const W = Math.max(680, months.length * 76);
  const H = 260, PAD_B = 44, PAD_T = 18, PAD_L = 8;
  const top = Math.max(
    ...months.map(m => Math.max(m.revenue, m.cost, Math.abs(m.net))), 1);
  const plotH = H - PAD_B - PAD_T;
  const slot  = (W - PAD_L * 2) / months.length;
  const bw    = Math.min(16, slot / 4.4);
  const y     = v => PAD_T + plotH - (v / top) * plotH;

  const bars = months.map((m, i) => {
    const cx = PAD_L + slot * i + slot / 2;
    const one = (v, off, cls, label) => {
      const h = Math.max(Math.abs(v) / top * plotH, v === 0 ? 0 : 1.5);
      const yy = v >= 0 ? y(Math.abs(v)) : PAD_T + plotH;
      return `<rect class="${cls}" x="${(cx + off - bw / 2).toFixed(1)}" y="${yy.toFixed(1)}"
                    width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="2">
                <title>${m.ym}｜${label}：${money(v)}</title></rect>`;
    };
    return one(m.revenue, -bw - 2, 'b-rev', '收入')
         + one(m.cost, 0, 'b-cost', '支出')
         + one(m.net, bw + 2, m.net >= 0 ? 'b-net' : 'b-neg', '淨利')
         + `<text class="x-lab" x="${cx.toFixed(1)}" y="${H - PAD_B + 18}"
                  text-anchor="middle">${m.ym.slice(5)}</text>`
         + (i === 0 || m.ym.slice(5) === '01'
             ? `<text class="x-yr" x="${cx.toFixed(1)}" y="${H - PAD_B + 33}"
                      text-anchor="middle">${m.ym.slice(0, 4)}</text>` : '');
  }).join('');

  // 三條水平參考線，讓高度可以被讀出數量級
  const grid = [0, 0.5, 1].map(f => `
    <line class="grid" x1="${PAD_L}" x2="${W - PAD_L}"
          y1="${y(top * f).toFixed(1)}" y2="${y(top * f).toFixed(1)}"/>
    <text class="y-lab" x="${PAD_L}" y="${(y(top * f) - 4).toFixed(1)}">${money(top * f)}</text>`).join('');

  box.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img"
         aria-label="逐月平台收入、支出與淨利長條圖">
      ${grid}
      <line class="axis" x1="${PAD_L}" x2="${W - PAD_L}"
            y1="${PAD_T + plotH}" y2="${PAD_T + plotH}"/>
      ${bars}
    </svg>`;
}

function drawMonthTable(months) {
  const el = document.getElementById('t-months');
  if (!el) return;

  const pct = g => g === null
    ? '<span class="dim">—</span>'
    : `<span class="delta ${g >= 0 ? 'up' : 'down'}">${g >= 0 ? '▲' : '▼'} ${Math.abs(g).toFixed(0)}%</span>`;

  // 新的在上面，比較符合看報表的習慣
  const rows = [...months].reverse().map((m, i, arr) => {
    const prev = arr[i + 1];
    return [
      `<b>${m.ym}</b>`,
      `<span class="num">${money(m.gmv)}</span>`,
      `<span class="num">${money(m.revenue)}</span>`,
      `<span class="num">${money(m.cost)}</span>`,
      `<span class="num ${m.net < 0 ? 'neg' : 'pos'}">${money(m.net)}</span>`,
      pct(prev ? growth(m.revenue, prev.revenue) : null),
      `<span class="dim num">${money(m.passthrough)}</span>`,
      `${m.orders} / ${m.reports} / ${m.posts}`,
    ];
  });

  el.innerHTML = table(
    ['月份', '平台流水 GMV', '平台收入', '平台支出', '淨利',
     '收入成長', '代撥果農', '訂單/回報/貼文'], rows);
}

function drawRecent() {
  const db = Store.read();
  const feed = [
    ...(db.orders  || []).map(o => [o.date, '🧾 認養訂單', `${o.no} · ${o.treeId} · ${o.customer}`]),
    ...(db.reports || []).map(r => [r.at,   '📋 樹況回報', `${r.treeId} · ${r.stage} · ${r.health}`]),
    ...(db.payouts || []).map(p => [p.date, '💰 撥款',     `${p.ref} · ${p.farmer || p.treeId} · ${money(p.amount)}`]),
    ...(db.posts   || []).map(p => [p.at,   '📣 社群貼文', `${p.channel} · ${(p.title || '').slice(0, 24)}`]),
  ].sort((a, b) => String(b[0]).localeCompare(String(a[0]))).slice(0, 10);

  document.getElementById('t-recent').innerHTML =
    table(['時間', '類型', '內容'], feed);
}

/* ============================================================
   帳號與權限
   ============================================================ */

function renderUsers() {
  const el = document.getElementById('t-perms');
  if (!el) return;

  /* 權限矩陣：橫軸是角色，縱軸是能做的事。
     果農與收購商是前台身分，不進這張表；自訂角色會自動接在後面。 */
  const ACTIONS = ALL_PERMS;
  const ROLES = Object.keys(PERMS).filter(k => !['farmer', 'buyer'].includes(k));

  const has = (role, action) => {
    const list = PERMS[role].can;
    if (list.includes(action)) return true;
    if (action.startsWith('view.') && list.includes('view.all')) return true;
    if (action.startsWith('view.') && list.includes('edit.' + action.slice(5))) return true;
    return false;
  };

  el.innerHTML = table(
    ['可以做的事', ...ROLES.map(r => PERMS[r].label + (PERMS[r].custom ? ' ✎' : ''))],
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
    ['帳號', '姓名', '單位', 'ERP 權限', '前台身分', 'Email', ''],
    (Store.read().users || []).map(u => {
      const cur = u.perm || (u.role === 'admin' ? 'super' : u.role);
      const picker = editable
        ? `<select class="perm-pick" data-u="${u.u}"${u.u === meU ? ' disabled title="不能改自己的權限，避免把自己鎖在門外"' : ''}>
             ${Object.entries(PERMS).map(([k, v]) =>
               `<option value="${k}"${k === cur ? ' selected' : ''}>${v.label}${v.custom ? ' ✎' : ''}</option>`).join('')}
           </select>`
        : `<span class="pill">${(PERMS[cur] || {}).label || cur}</span>`;
      return [
        `<b>${u.u}</b>${u.u === meU ? ' <span class="badge-ok">你</span>' : ''}`,
        u.name || '—', u.org || '—', picker,
        { admin:'管理', farmer:'果農', buyer:'收購商' }[u.role] || u.role,
        u.email
          ? `<a href="mailto:${u.email}">${u.email}</a>`
          : '<span class="dim">未填</span>',
        editable ? `<button class="mini-btn" data-user-edit="${u.u}">編輯</button>` : '',
      ];
    }));

  document.querySelectorAll('.perm-pick').forEach(sel =>
    sel.addEventListener('change', () => {
      if (!Perm.can('edit.users')) return;
      Store.setUserPerm(sel.dataset.u, sel.value);
      renderUsers();
      gateMenu();
    }));

  document.querySelectorAll('[data-user-edit]').forEach(b =>
    b.addEventListener('click', () => {
      const u = (Store.read().users || []).find(x => x.u === b.dataset.userEdit);
      if (u) userFormMode(u);
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

/* ============================================================
   新增帳號
   ------------------------------------------------------------
   只有具 edit.users 權限（超級管理員）能用。表單本身在 HTML 上
   標了 data-perm="edit.users"，沒權限的人畫面上看不到；
   這裡再擋一次，避免有人直接呼叫這個函式。

   ⚠️ 密碼是明文存的，和整個 demo 一致。畫面上有明說不要用真實密碼。
   正式營運要改成後端雜湊（Supabase Auth 就有現成的）。
   ============================================================ */

function initNewUser() {
  const form = document.getElementById('new-user-form');
  if (!form || form.dataset.bound) return;
  form.dataset.bound = '1';

  // 權限下拉：直接由 PERMS 產生，之後加角色不必再改這裡
  const sel = document.getElementById('nu-perm');
  fillPermOptions(sel, 'editor');             // 預設給最小的權限，不預設超管

  const hint = document.getElementById('nu-perm-hint');
  const showHint = () => {
    const p = PERMS[sel.value];
    // 每一項各自一個 <span>，i18n 才翻得到 ——
    // 串成一整句再塞進去的話，那句合成字串不會在字典裡。
    hint.innerHTML = p
      ? '<span>可以：</span>' + p.can.map(a => `<span>${describeAction(a)}</span>`).join(' · ')
      : '';
    if (typeof I18N !== 'undefined') I18N.refresh(hint);
  };
  sel.addEventListener('change', () => { showHint(); syncRole(); });
  showHint();

  /* 前台身分跟著 ERP 權限走，但仍可手動改 —— 例如果農也可能兼溝通者 */
  const roleSel = document.getElementById('nu-role');
  const syncRole = () => {
    const map = { farmer: 'farmer', buyer: 'buyer' };
    roleSel.value = map[sel.value] || 'admin';
  };
  syncRole();

  document.getElementById('nu-cancel').addEventListener('click', () => userFormMode(null));

  form.addEventListener('submit', e => {
    e.preventDefault();
    const err = document.getElementById('nu-err');
    const ok  = document.getElementById('nu-ok');
    const fail = msg => {
      err.textContent = msg; err.style.display = 'block'; ok.style.display = 'none';
    };

    if (!Perm.can('edit.users')) return fail('你的角色沒有管理帳號的權限。');

    const val = id => document.getElementById(id).value.trim();
    const editing = form.dataset.editing || '';
    const u = editing || val('nu-user').toLowerCase();
    const pass = val('nu-pass');

    if (!editing) {
      if (!/^[a-z0-9._-]{3,20}$/.test(u)) {
        return fail('帳號請用 3–20 個英文小寫字母、數字或 . _ - ，不要有空白或中文。');
      }
      if (Store.userExists(u)) return fail(`帳號「${u}」已經有人用了，換一個。`);
      if (pass.length < 4) return fail('臨時密碼至少 4 個字元。');
    } else if (pass && pass.length < 4) {
      // 編輯時密碼可以留空（代表不改），但真的填了就要夠長
      return fail('臨時密碼至少 4 個字元。留空就不改密碼。');
    }

    if (!val('nu-name')) return fail('請填姓名。');

    const email = val('nu-email');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return fail('Email 格式看起來不對，請再檢查一次。');
    }
    // 同一個 Email 給兩個帳號用，之後要靠 Email 找人就會分不出來
    const clash = (Store.read().users || []).find(
      x => email && x.email && x.email.toLowerCase() === email.toLowerCase() && x.u !== u);
    if (clash) return fail(`這個 Email 已經是帳號「${clash.u}」在用了。`);

    const perm = sel.value;
    const me = Perm.me();
    if (editing && me && me.u === editing && perm !== (me.perm || 'super')) {
      return fail('不能改自己的權限，避免把自己鎖在門外。請另一位超級管理員幫忙改。');
    }
    if (perm === 'super' && (!editing || PERMS[perm]) &&
        !confirm(`確定要把「${val('nu-name')}」設成超級管理員嗎？\n\n`
               + '超級管理員可以改佣金比例、執行撥款，也能修改其他人的權限。')) return;

    const data = {
      perm,
      role:  roleSel.value,
      name:  val('nu-name'),
      org:   val('nu-org')   || '',
      phone: val('nu-phone') || '',
      email: email || '',
    };
    data.area = val('nu-area') || '';

    if (editing) {
      Store.updateUser(editing, { ...data, pass });
      ok.innerHTML = `✅ 已更新帳號 <b>${editing}</b>。`
                   + (pass ? '密碼也一併改了，記得通知本人。' : '');
    } else {
      Store.addUser({ u, pass, ...data });
      ok.innerHTML = `✅ 已建立帳號 <b>${u}</b>（${PERMS[perm].label}）。
                      請把帳號與臨時密碼交給本人，並提醒他這是示範系統。`;
    }

    err.style.display = 'none';
    ok.style.display = 'block';

    userFormMode(null);
    renderUsers();
    renderKpis();
    showMe();
  });
}

/**
 * 切換表單的「新增」與「編輯」兩種狀態。
 * 傳 null 就回到新增模式並清空。
 */
function userFormMode(user) {
  const form = document.getElementById('new-user-form');
  if (!form) return;
  const $ = id => document.getElementById(id);

  if (!user) {
    delete form.dataset.editing;
    form.reset();
    $('nu-user').disabled = false;
    $('nu-pass').required = true;
    $('nu-pass-hint').hidden = true;
    $('nu-cancel').hidden = true;
    $('nu-heading').innerHTML = '新增帳號 <small>Add a User</small>';
    $('nu-submit').textContent = '建立帳號';
    $('nu-perm').value = 'editor';
  } else {
    form.dataset.editing = user.u;
    $('nu-user').value = user.u;
    $('nu-user').disabled = true;              // 帳號是主鍵，不給改
    $('nu-pass').value = '';
    $('nu-pass').required = false;
    $('nu-pass-hint').hidden = false;
    $('nu-name').value  = user.name  || '';
    $('nu-org').value   = user.org   || '';
    $('nu-email').value = user.email || '';
    $('nu-phone').value = user.phone || '';
    $('nu-area').value  = user.area  || '';
    $('nu-perm').value  = user.perm || (user.role === 'admin' ? 'super' : user.role) || 'editor';
    $('nu-role').value  = user.role || 'admin';
    $('nu-cancel').hidden = false;
    $('nu-heading').innerHTML = '編輯帳號 <small>Edit User</small>';
    $('nu-submit').textContent = '儲存變更';
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  $('nu-err').style.display = 'none';
  $('nu-perm').dispatchEvent(new Event('change'));
  if (typeof I18N !== 'undefined') I18N.refresh(document.getElementById('nu-heading'));
}

/** 把某個角色能做的事寫成一句話，讓選權限的人知道自己在給什麼。 */
/** 權限下拉的選項。自訂角色也要出現，所以每次重繪都重建一次。 */
function fillPermOptions(sel, keep) {
  const want = keep || sel.value;
  sel.innerHTML = Object.entries(PERMS)
    .map(([k, v]) => `<option value="${k}">${v.label}${v.custom ? ' ✎' : ''}</option>`).join('');
  sel.value = PERMS[want] ? want : 'editor';
}

function describePerm(role) {
  return (PERMS[role]?.can || []).map(describeAction).join('、');
}

/* ============================================================
   自訂角色
   ------------------------------------------------------------
   內建角色不給改也不給刪 —— 讓人把超級管理員的權限拿掉之後，
   就沒有人能改回來了，系統等於被鎖死。
   自訂角色存在 settings 表的 custom_roles（一個 JSON 字串），
   角色數量不會多到需要獨立資料表。
   ============================================================ */

function initRoleEditor() {
  const form = document.getElementById('role-form');
  if (!form) return;

  // 權限勾選清單
  const box = document.getElementById('rl-perms');
  if (!box.dataset.built) {
    box.dataset.built = '1';
    box.innerHTML = ALL_PERMS.map(([key, label]) => `
      <label class="perm-pick-row">
        <input type="checkbox" value="${key}">
        <span><b>${label}</b><i>${key}</i></span>
      </label>`).join('');
  }

  if (!form.dataset.bound) {
    form.dataset.bound = '1';

    form.addEventListener('submit', e => {
      e.preventDefault();
      const err = document.getElementById('rl-err');
      const ok  = document.getElementById('rl-ok');
      const can = [...box.querySelectorAll('input:checked')].map(i => i.value);

      const msg = Perm.saveRole(
        document.getElementById('rl-key').value,
        document.getElementById('rl-label').value,
        can);

      if (msg) {
        err.textContent = msg; err.style.display = 'block'; ok.style.display = 'none';
        return;
      }
      err.style.display = 'none';
      ok.textContent = `✅ 已儲存角色「${document.getElementById('rl-label').value}」。`
                     + '現在可以在上面的帳號清單把人指派成這個角色了。';
      ok.style.display = 'block';
      form.reset();
      drawRoles();
      renderUsers();
      gateMenu();
      fillPermOptions(document.getElementById('nu-perm'));
    });

    document.getElementById('rl-reset').addEventListener('click', () => {
      form.reset();
      document.getElementById('rl-err').style.display = 'none';
      document.getElementById('rl-ok').style.display = 'none';
    });

    // 編輯／刪除既有的自訂角色
    document.getElementById('t-roles').addEventListener('click', e => {
      const edit = e.target.closest('[data-role-edit]');
      const del  = e.target.closest('[data-role-del]');

      if (edit) {
        const key = edit.dataset.roleEdit;
        const r = PERMS[key];
        document.getElementById('rl-key').value = key;
        document.getElementById('rl-label').value = r.label;
        box.querySelectorAll('input').forEach(i => { i.checked = r.can.includes(i.value); });
        document.getElementById('rl-err').style.display = 'none';
        document.getElementById('rl-ok').style.display = 'none';
        form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      if (del) {
        const key = del.dataset.roleDel;
        if (!confirm(`確定要刪除角色「${PERMS[key].label}」嗎？`)) return;
        const msg = Perm.deleteRole(key);
        if (msg) { alert(msg); return; }
        drawRoles();
        renderUsers();
        gateMenu();
        fillPermOptions(document.getElementById('nu-perm'));
      }
    });
  }

  drawRoles();
}

function drawRoles() {
  const el = document.getElementById('t-roles');
  if (!el) return;
  const users = Store.read().users || [];
  const rows = Perm.customRoles().map(([key, r]) => [
    `<b>${r.label}</b>`,
    `<span class="pill">${key}</span>`,
    r.can.map(a => `<span class="perm-chip">${describeAction(a)}</span>`).join(' '),
    `${users.filter(u => u.perm === key).length} 人`,
    `<button class="mini-btn" data-role-edit="${key}">編輯</button>
     <button class="mini-btn" data-role-del="${key}">刪除</button>`,
  ]);
  el.innerHTML = rows.length
    ? table(['角色名稱', '代號', '可以做的事', '使用中', ''], rows)
    : '<tbody><tr><td style="text-align:center;padding:28px">'
      + '還沒有自訂角色。用上面的表單開一個。</td></tr></tbody>';
}

const describeAction = a =>
  (ALL_PERMS.find(([k]) => k === a) || [a, a])[1];


/**
 * 在帳號頁標明現在是哪一種登入模式。
 * 兩種模式的安全性差很多，畫面上不講清楚，很容易誤以為已經安全了。
 */
function showAuthMode() {
  const box = document.querySelector('[data-panel="users"] .demo-banner');
  if (!box) return;
  const on = typeof Auth !== 'undefined' && Auth.on;

  box.innerHTML = on
    ? `🔐 <b>已啟用 Supabase Auth</b> ——
       密碼由伺服器加鹽雜湊保管，前端拿不到；登入後帶著 JWT 讀寫資料庫，
       <b>權限由資料庫的 RLS 政策強制執行</b>，不是只有前端把按鈕藏起來。
       <br><br>
       這裡改角色會直接影響那個人在資料庫層能讀寫什麼。
       替別人開帳號需要 service_role 金鑰，那一把不能放在前端 ——
       所以請對方自己到登入頁註冊，註冊完你再在這裡指派角色。`
    : `⚠️ <b>目前是示範模式（前端權限控制）</b> ——
       它決定每個角色看得到哪些功能、按不按得到哪些按鈕，足以支撐日常分工，
       但<b>擋不住懂技術的人</b>：任何人打開瀏覽器主控台都能改，
       密碼也是明文存放的。
       <br><br>
       要換成真正的登入：到 Supabase 跑一次 <code>supabase-setup-v3.sql</code>，
       建立第一個管理員帳號，再把 <code>assets/config.js</code> 裡的
       <code>AUTH_MODE</code> 改成 <code>'supabase'</code>。`;

  box.style.borderLeftColor = on ? 'var(--gold)' : 'var(--red)';
  if (typeof I18N !== 'undefined') I18N.refresh(box);
}
