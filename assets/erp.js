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

  // 分頁切換
  document.getElementById('tabs').addEventListener('click', e => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t === btn));
    document.querySelectorAll('.tab-pane').forEach(p =>
      p.classList.toggle('on', p.dataset.panel === btn.dataset.tab));
  });

  // 樹體資產篩選
  ['erp-crop', 'erp-status'].forEach(id =>
    document.getElementById(id).addEventListener('change', renderTrees));

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
  box.innerHTML = cloud
    ? `☁️ <b>已連線到雲端資料庫</b> —— 資料存在 Supabase，所有裝置共用同一份。
       目前有 ${info.trees || 0} 棵樹、${info.orders || 0} 筆訂單、${info.users || 0} 個帳號。`
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
