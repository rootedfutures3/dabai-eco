/* ============================================================
   ERP 儀表板（示範）
   ------------------------------------------------------------
   資料全部來自 assets/store.js 的 localStorage 示範資料庫，
   樹體資產透過 Store.treeList() 取得（資料庫優先，否則用種子）。
   沒有後端、沒有權限控管 —— 這是給 demo 看流程用的。
   ============================================================ */

Store.onReady((info) => {
  // 用總覽的月度卡片當「這頁是不是後台」的判斷。
  // （以前是看 #kpis，那個容器已經拆進三個視角了。）
  if (!document.getElementById('month-kpis')) return;
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

  initOverviewSwitch();

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
  mountPlatformSwitch(Perm.role());

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
    const t = parseFloat(document.getElementById('rate-sst').value);
    if (!Number.isFinite(t) || t < 0 || t > 100) return alert('SST％請填 0–100 之間的數字。');
    Store.saveSetting('commission_rate', c);
    Store.saveSetting('deposit_share', d);
    Store.saveSetting('sst_rate', t);
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

  // 單據：發票與合約（所有進得了後台的角色都能開，這是唯讀輸出）
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-invoice],[data-contract]');
    if (!b) return;
    if (b.dataset.invoice)  invoiceFor(b.dataset.invoice);
    if (b.dataset.contract) contractFor(b.dataset.contract);
  });

  // 編輯（只有超管看得到按鈕，這裡再擋一次 —— 按鈕藏起來不算權限控制）
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-tree-edit],[data-cust-edit],[data-lead-edit],[data-order-edit]');
    if (!b || !Perm.isSuper()) return;
    if (b.dataset.treeEdit)  editTree(b.dataset.treeEdit);
    if (b.dataset.custEdit)  editCustomer(b.dataset.custEdit);
    if (b.dataset.leadEdit)  editLead(b.dataset.leadEdit);
    if (b.dataset.orderEdit) editOrder(b.dataset.orderEdit);
  });

  document.getElementById('db-reset').addEventListener('click', () => {
    if (confirm('確定要清除本機的示範資料，回到初始狀態嗎？')) {
      Store.reset();
      renderAll();
    }
  });
});

/* 資料庫連線狀態不再顯示在畫面上。
   原本這裡會畫一條橫幅說「已連線到雲端」或「連線錯誤：…」，
   但那條紅字出現在後台每一頁的最上面，示範的時候看起來像壞掉了。
   狀態本身還是有用，所以改成寫進 console —— 要查的時候打開開發者工具就看得到，
   使用者不會看到。 */
function showDbStatus(info) {
  const box = document.querySelector('.demo-banner');
  if (box) box.hidden = true;

  const cloud = info && info.mode === 'cloud';
  const missing = (info && info.missing) || [];
  console.info(cloud
    ? `[TANJU] 雲端資料庫已連線 · ${info.trees || 0} 棵樹 / ${info.orders || 0} 筆訂單 / ${info.users || 0} 個帳號`
      + (missing.length ? ` · 尚未建立的資料表：${missing.join('、')}` : '')
    : `[TANJU] 使用本機儲存${info && info.error ? ` · ${info.error}` : ''}`);

  showAuthMode();
}

/* 金額一律兩位小數。真的帳務系統不會一行寫 RM 410、下一行寫 RM 1,180 ——
   位數對不齊就沒辦法用眼睛掃過去核對。 */
const money = n => 'RM ' + Number(n || 0).toLocaleString('en-MY',
  { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** 數量用的格式：不補小數，但一樣有千分位。 */
const qty = n => Number(n || 0).toLocaleString('en-MY');

/** 把一個數字包成「數字儲存格」：右對齊、等寬數字，而且可以被合計。 */
const num = (n, fmt = money) => ({ n: Number(n) || 0, html: fmt(n) });

/**
 * 表格。欄位可以只給標題字串，也可以給 { h, num, sum } ——
 *   num: 這欄是數字，右對齊 + 等寬數字，位數才對得齊
 *   sum: 這欄要出現在最下面的合計列
 * 儲存格用 num(值) 包起來的話，才知道要怎麼加總。
 *
 * 每個 td 都帶 data-label。窄螢幕上 CSS 會把表格拆成一張張卡片，
 * 用這個屬性當欄位名 —— 手機上就不必左右滑了。
 */
function table(cols, rows) {
  const spec = cols.map(c => (typeof c === 'string' ? { h: c } : c));
  const esc  = t => String(t).replace(/"/g, '&quot;');

  if (!rows.length) {
    return `<tbody><tr><td colspan="${spec.length}" style="text-align:center;padding:34px" class="dim">目前沒有資料</td></tr></tbody>`;
  }

  const head = `<thead><tr>${spec.map(c =>
    `<th${c.num ? ' class="num"' : ''}>${c.h}</th>`).join('')}</tr></thead>`;

  const body = `<tbody>${rows.map(r => `<tr>${r.map((c, i) => {
    const sp   = spec[i] || {};
    const html = (c && typeof c === 'object' && 'html' in c) ? c.html : c;
    return `<td data-label="${esc(sp.h || '')}"${sp.num ? ' class="num"' : ''}>${html}</td>`;
  }).join('')}</tr>`).join('')}</tbody>`;

  // 合計列：只在真的有欄位要加總時才出現
  const sums = spec.map((c, i) => c.sum
    ? rows.reduce((t, r) => t + ((r[i] && typeof r[i] === 'object' && 'n' in r[i]) ? r[i].n : 0), 0)
    : null);
  const foot = sums.some(v => v !== null)
    ? `<tfoot><tr>${spec.map((c, i) => {
        if (i === 0) return `<td data-label="">合計 · ${rows.length} 筆</td>`;
        return `<td data-label="${esc(c.h || '')}"${c.num ? ' class="num"' : ''}>${
          sums[i] === null ? '' : `<b>${money(sums[i])}</b>`}</td>`;
      }).join('')}</tr></tfoot>`
    : '';

  return head + body + foot;
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
  // 「累計」那一欄已經拆進總覽的三個視角，這個容器不再存在
  if (!document.getElementById('kpis')) return;
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


/* ============================================================
   編輯視窗
   ------------------------------------------------------------
   樹、客戶、金額這幾樣改下去會動到資產與帳，所以只開放給超級管理員。
   權限不是用旗標判斷的 —— 旗標可以被自訂角色勾起來，
   這幾項希望它固定綁在 super 身上。
   ============================================================ */

/**
 * 開一個編輯視窗。
 * fields: [{ k, label, type:'text'|'number'|'select', opts, hint, step }]
 * onSave(值物件) 回傳 falsy 就不關窗（可以拿來擋驗證）。
 */
function openEditor({ title, sub, fields, values, onSave }) {
  document.querySelector('.ed-back')?.remove();

  const input = f => {
    const v = values[f.k] ?? '';
    if (f.type === 'select') {
      return `<select id="ed-${f.k}">${f.opts.map(([val, lab]) =>
        `<option value="${val}"${String(val) === String(v) ? ' selected' : ''}>${lab}</option>`).join('')}</select>`;
    }
    return `<input id="ed-${f.k}" type="${f.type || 'text'}"
              ${f.step ? `step="${f.step}"` : ''} value="${String(v).replace(/"/g, '&quot;')}">`;
  };

  const back = document.createElement('div');
  back.className = 'ed-back';
  back.innerHTML = `
    <div class="ed" role="dialog" aria-modal="true" aria-label="${title}">
      <h3>${title}</h3>
      ${sub ? `<p class="ed-sub">${sub}</p>` : ''}
      <div class="ed-grid">
        ${fields.map(f => `
          <label class="fld">
            <span>${f.label}</span>
            ${input(f)}
            ${f.hint ? `<small class="dim">${f.hint}</small>` : ''}
          </label>`).join('')}
      </div>
      <div class="ed-err form-error" role="alert"></div>
      <div class="ed-actions">
        <button class="btn btn-outline" data-ed-cancel type="button">取消</button>
        <button class="btn btn-gold" data-ed-save type="button">儲存</button>
      </div>
    </div>`;
  document.body.appendChild(back);

  const close = () => back.remove();
  back.addEventListener('click', e => { if (e.target === back) close(); });
  back.querySelector('[data-ed-cancel]').addEventListener('click', close);
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });

  back.querySelector('[data-ed-save]').addEventListener('click', () => {
    const out = {};
    fields.forEach(f => {
      const el = back.querySelector(`#ed-${f.k}`);
      out[f.k] = f.type === 'number' ? Number(el.value) : el.value.trim();
    });
    const err = onSave(out);
    if (typeof err === 'string') { back.querySelector('.ed-err').textContent = err; return; }
    close();
  });

  back.querySelector('input,select')?.focus();
}

/** 表格裡的「編輯」按鈕。不是超管就完全不畫，不留一顆按不動的按鈕。 */
const editBtn = (attr, id) =>
  Perm.isSuper() ? `<button class="mini-btn" data-${attr}="${id}">編輯</button>` : '';


/* ---------- 各表的編輯動作 ---------- */

function editTree(id) {
  const t = Store.treeList().find(x => x.id === id);
  if (!t) return;
  openEditor({
    title: `編輯樹體 ${id}`,
    sub: 'Tree ID 是主鍵，不開放修改 —— 改編號等於換一棵樹，撥款與回報就對不上了。',
    values: t,
    fields: [
      { k:'variety', label:'品種' },
      { k:'age',     label:'樹齡（年）',    type:'number' },
      { k:'kg',      label:'預估產量（kg）', type:'number' },
      { k:'price',   label:'年認養金（RM）', type:'number', step:'0.01' },
      { k:'orchard', label:'果園' },
      { k:'area',    label:'地區' },
      { k:'farmer',  label:'果農' },
      { k:'status',  label:'狀態', type:'select',
        opts:[['available','開放認養'], ['reserved','保留中'], ['adopted','已認養']] },
    ],
    onSave(v) {
      if (!v.variety) return '品種不能空白。';
      if (v.price < 0) return '年認養金不能是負數。';
      Store.upsertTree({ id, ...v });
      renderAll();
    },
  });
}

/** 認養人資料存在他名下的每一筆訂單裡，所以要一起改。 */
function editCustomer(email) {
  const db = Store.read();
  const mine = db.orders.filter(o => o.email === email);
  if (!mine.length) return;
  const first = mine[0];
  openEditor({
    title: `編輯認養人 ${first.customer}`,
    sub: `這個人名下有 ${mine.length} 筆訂單，改動會一起套用到全部。`,
    values: { customer: first.customer, email: first.email, phone: first.phone || '' },
    fields: [
      { k:'customer', label:'姓名' },
      { k:'email',    label:'Email', type:'email' },
      { k:'phone',    label:'電話' },
    ],
    onSave(v) {
      if (!v.customer) return '姓名不能空白。';
      if (!v.email)    return 'Email 不能空白。';
      mine.forEach(o => Store.updateOrder(o.no, v));
      renderAll();
    },
  });
}

function editLead(id) {
  const l = (Store.read().leads || []).find(x => String(x.id) === String(id));
  if (!l) return;
  openEditor({
    title: `編輯企業名單 ${l.company}`,
    values: l,
    fields: [
      { k:'company', label:'公司' },
      { k:'contact', label:'窗口' },
      { k:'title',   label:'職稱' },
      { k:'email',   label:'Email', type:'email' },
      { k:'need',    label:'需求' },
      { k:'budget',  label:'預算' },
      { k:'stage',   label:'階段', type:'select',
        opts:[['初次接觸','初次接觸'], ['洽談中','洽談中'], ['提案中','提案中'],
              ['待回覆','待回覆'], ['已成交','已成交'], ['已擱置','已擱置']] },
    ],
    onSave(v) { Store.updateLead(id, v); renderAll(); },
  });
}

/** 改金額會直接改變佣金拆帳，所以視窗裡先把新的拆法算給你看。 */
function editOrder(no) {
  const o = (Store.read().orders || []).find(x => x.no === no);
  if (!o) return;
  const rate = Store.settingNum('commission_rate', 20);
  openEditor({
    title: `編輯訂單 ${no}`,
    sub: `平台佣金 ${rate}%。改動合約金額會重新計算佣金與果農應得，已撥出去的金額不會變。`,
    values: o,
    fields: [
      { k:'customer', label:'認養人' },
      { k:'amount',   label:'合約金額（RM）', type:'number', step:'0.01',
        hint:`目前佣金 ${money(o.amount * rate / 100)}、果農應得 ${money(o.amount * (100 - rate) / 100)}` },
      { k:'paid',     label:'已收（RM）', type:'number', step:'0.01' },
      { k:'channel',  label:'付款方式' },
      { k:'status',   label:'狀態', type:'select',
        opts:[['已付訂金','已付訂金'], ['已付全額','已付全額'], ['待付款','待付款']] },
    ],
    onSave(v) {
      if (v.amount <= 0) return '合約金額要大於 0。';
      if (v.paid < 0)    return '已收不能是負數。';
      if (v.paid > v.amount) return '已收不能超過合約金額。';
      Store.updateOrder(no, v);
      renderAll();
    },
  });
}

/* ---------- 訂單 ---------- */
function renderOrders() {
  const db = Store.read();
  const rows = [...db.orders].reverse().map(o => [
    `<b>${o.no}</b>`, o.date,
    `<span class="pill">${o.treeId}</span>`,
    o.customer,
    `<span class="dim">${o.email}</span>`,
    num(o.amount), num(o.paid), num(o.amount - o.paid),
    o.channel,
    `<span class="badge-${o.status === '已付全額' ? 'ok' : 'wait'}">${o.status}</span>`,
    `<button class="mini-btn" data-invoice="${o.no}">發票</button>`,
  ]);
  document.getElementById('t-orders').innerHTML = table([
    '訂單編號', '日期', 'Tree ID', '認養人', 'Email',
    { h:'合約金額', num:true, sum:true },
    { h:'已收',     num:true, sum:true },
    { h:'待收',     num:true, sum:true },
    '付款方式', '狀態', ''], rows);
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
        `<b>${t.id}</b>`, CROP_NAME[t.crop], t.variety,
        num(t.age, n => qty(n) + ' 年'),
        num(t.kg,  n => qty(n) + ' kg'),
        num(t.price), t.orchard, t.area, t.farmer,
        `<span class="badge-${stat[1]}">${stat[0]}</span>`,
        o ? `<span class="pill">${o.no}</span>` : '<span class="dim">—</span>',
        `<button class="mini-btn" data-contract="${t.id}">合約</button>`
          + editBtn('tree-edit', t.id),
      ];
    });

  document.getElementById('t-trees').innerHTML = table([
    'Tree ID', '作物', '品種',
    { h:'樹齡',    num:true },
    { h:'預估產量', num:true },
    { h:'年認養金', num:true, sum:true },
    '果園', '地區', '果農', '狀態', '綁定訂單', ''], rows);
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
    num(c.trees.length, n => qty(n) + ' 棵'), num(c.paid),
    editBtn('cust-edit', c.email),
  ]);
  document.getElementById('t-b2c').innerHTML = table([
    '認養人', 'Email', '電話', '認養樹',
    { h:'棵數',     num:true },
    { h:'累計已付', num:true, sum:true }, ''], b2c);

  const b2b = db.leads.map(l => [
    l.date, `<b>${l.company}</b>`, l.contact, `<span class="dim">${l.title}</span>`,
    `<span class="dim">${l.email}</span>`, l.need, l.budget,
    `<span class="badge-wait">${l.stage}</span>`,
    editBtn('lead-edit', l.id),
  ]);
  document.getElementById('t-b2b').innerHTML = table(
    ['日期', '公司', '窗口', '職稱', 'Email', '需求', '預算', '階段', ''], b2b);
}

/* ---------- 樹況回報 ---------- */
function renderReports() {
  const db = Store.read();
  const rows = db.reports.map(r => [
    r.at, `<span class="pill">${r.treeId}</span>`, r.by, r.stage,
    `<span class="badge-${r.health === '良好' ? 'ok' : 'wait'}">${r.health}</span>`,
    r.note, num(r.photos, n => qty(n) + ' 張'),
  ]);
  document.getElementById('t-reports').innerHTML = table([
    '時間', 'Tree ID', '回報人', '生長階段', '樹況', '備註',
    { h:'照片', num:true }], rows);
}

/* ---------- 工資 ---------- */
function renderWages() {
  const db = Store.read();
  const rows = db.wages.map(w => [
    w.month, `<b>${w.person}</b>`, w.role,
    num(w.base), num(w.bonus), num(w.base + w.bonus), `<span class="dim">${w.note}</span>`,
  ]);
  document.getElementById('t-wages').innerHTML = table([
    '月份', '對象', '身分',
    { h:'基本',      num:true, sum:true },
    { h:'分潤／獎金', num:true, sum:true },
    { h:'合計',      num:true, sum:true },
    '備註'], rows);
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
  const rs = document.getElementById('rate-sst');
  if (rc && document.activeElement !== rc) rc.value = rate;
  if (rd && document.activeElement !== rd) rd.value = dep;
  if (rs && document.activeElement !== rs) rs.value = Store.settingNum('sst_rate', 0);

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
      num(s.amount),
      { n: s.fee,    html: `<span class="fee">${money(s.fee)}</span>` },
      num(s.farmer),
      num(s.paidOut),
      { n: s.pending, html: done ? '<span class="badge-ok">已結清</span>'
                                 : `<span class="badge-wait">${money(s.pending)}</span>` },
      (done ? '—' : `<button class="mini-btn" data-payout="${o.no}">撥款</button>`)
        + `<button class="mini-btn" data-invoice="${o.no}">發票</button>`
        + editBtn('order-edit', o.no),
    ];
  });
  document.getElementById('t-commission').innerHTML = table([
    '訂單編號', 'Tree ID', '認養人',
    { h:'合約總額', num:true, sum:true },
    { h:`平台佣金 ${rate}%`, num:true, sum:true },
    { h:`果農應得 ${fmt(100 - rate)}%`, num:true, sum:true },
    { h:'已撥', num:true, sum:true },
    { h:'待撥', num:true, sum:true },
    ''], rows);

  /* 撥款紀錄 */
  const pays = [...(db.payouts || [])].reverse().map(p => [
    `<b>${p.ref}</b>`, p.date, p.orderNo || '—',
    `<span class="pill">${p.treeId || '—'}</span>`,
    p.farmer || '—',
    { deposit:'開花前訂金', balance:'採收後尾款', adjust:'調整' }[p.kind] || p.kind,
    num(p.amount),
    p.method || '—',
    `<span class="badge-ok">${p.status || '已撥款'}</span>`,
  ]);
  document.getElementById('t-payouts').innerHTML = table([
    '撥款編號', '日期', '訂單', 'Tree ID', '果農', '性質',
    { h:'金額', num:true, sum:true },
    '方式', '狀態'], pays);
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

  /* 只換按鈕裡的文字標籤 —— 直接寫 textContent 會把圖示那個 span 一起吃掉 */
  const setLabel = t => {
    const el = outBtn.querySelector('.signout-label');
    if (el) el.textContent = t; else outBtn.textContent = t;
  };

  if (me) {
    nameEl.textContent = me.name || me.u;
    roleEl.textContent = { admin:'平台管理員', farmer:'果農', buyer:'收購商' }[me.role] || me.role;
    avEl.textContent = (me.name || me.u).trim().charAt(0).toUpperCase();
    setLabel('登出');
    outBtn.onclick = () => {
      sessionStorage.removeItem('rf_app_session');
      if (typeof Auth !== 'undefined' && Auth.on) Auth.signOut();
      location.href = 'app.html';
    };
  } else {
    nameEl.textContent = '訪客';
    roleEl.textContent = '未登入';
    avEl.textContent = '·';
    setLabel('登入');
    outBtn.onclick = () => { location.href = 'app.html?next=erp.html'; };
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
  drawAR();
  drawSocialOverview();
  drawTreeOverview();
}

/** 總覽的三個視角：財務／社群／樹況。一次只顯示一個。 */
function initOverviewSwitch() {
  const bar = document.getElementById('ov-switch');
  if (!bar) return;
  bar.addEventListener('click', e => {
    const btn = e.target.closest('.ovs');
    if (!btn) return;
    const want = btn.dataset.ov;
    bar.querySelectorAll('.ovs').forEach(b => {
      const on = b.dataset.ov === want;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
    document.querySelectorAll('.ov-view').forEach(v =>
      v.classList.toggle('on', v.dataset.ov === want));
  });
}

/* ---------- 財務：應收帳款 ---------- */
/** 合約成立但還沒收足的訂單。帳齡從訂單日算起 —— 越久沒收越該追。 */
function drawAR() {
  const el = document.getElementById('t-ar');
  if (!el) return;
  const today = new Date();
  const rows = (Store.read().orders || [])
    .filter(o => o.amount - o.paid > 0.005)
    .map(o => {
      const days = Math.max(0, Math.round((today - new Date(o.date)) / 86400000));
      const band = days > 90 ? 'over' : days > 30 ? 'wait' : 'ok';
      return {
        days,
        row: [
          `<b>${o.no}</b>`, o.date, o.customer,
          num(o.amount), num(o.paid), num(o.amount - o.paid),
          { n: days, html: `<span class="badge-${band === 'ok' ? 'ok' : 'wait'}">${qty(days)} 天</span>` },
        ],
      };
    })
    .sort((a, b) => b.days - a.days)
    .map(x => x.row);

  el.innerHTML = table([
    '訂單編號', '訂單日期', '認養人',
    { h:'合約金額', num:true, sum:true },
    { h:'已收',     num:true, sum:true },
    { h:'未收',     num:true, sum:true },
    { h:'帳齡',     num:true },
  ], rows);
}

/* ---------- 社群視角 ---------- */
const CH_NAME = { facebook:'Facebook', instagram:'Instagram', youtube:'YouTube', rednote:'小紅書' };
const LANG_NAME = { zh:'中文', ms:'Bahasa Melayu', en:'English' };

function drawSocialOverview() {
  const posts = Store.read().posts || [];
  const kpi = document.getElementById('social-kpis');
  if (kpi) {
    const done  = posts.filter(p => p.status === '已發布').length;
    const draft = posts.filter(p => p.status === '草稿').length;
    const plan  = posts.filter(p => p.scheduled).length;
    kpi.innerHTML = [
      ['貼文總數', qty(posts.length) + ' 篇', '所有平台合計'],
      ['已發布',   qty(done) + ' 篇',  posts.length ? Math.round(done / posts.length * 100) + '% 完成' : '—'],
      ['草稿',     qty(draft) + ' 篇', '等待送出'],
      ['已排程',   qty(plan) + ' 篇',  '排在行事曆上'],
    ].map(([k, v, sub]) =>
      `<div class="kpi-card"><span class="k">${k}</span><b>${v}</b><small>${sub}</small></div>`).join('');
  }

  const byCh = {};
  posts.forEach(p => {
    const c = byCh[p.channel] || (byCh[p.channel] = { all:0, done:0, langs:new Set() });
    c.all++; if (p.status === '已發布') c.done++; if (p.lang) c.langs.add(p.lang);
  });
  const chRows = Object.entries(byCh).map(([ch, c]) => [
    `<b>${CH_NAME[ch] || ch}</b>`,
    num(c.all,  n => qty(n) + ' 篇'),
    num(c.done, n => qty(n) + ' 篇'),
    [...c.langs].map(l => `<span class="pill">${LANG_NAME[l] || l}</span>`).join(' ') || '—',
  ]);
  const chEl = document.getElementById('t-ov-channels');
  if (chEl) chEl.innerHTML = table(
    ['平台', { h:'貼文數', num:true }, { h:'已發布', num:true }, '語言'], chRows);

  const postRows = [...posts].reverse().slice(0, 8).map(p => [
    p.at, `<span class="pill">${CH_NAME[p.channel] || p.channel}</span>`,
    `<b>${p.title || '—'}</b>`,
    `<span class="pill">${LANG_NAME[p.lang] || p.lang || '—'}</span>`,
    `<span class="badge-${p.status === '已發布' ? 'ok' : 'wait'}">${p.status}</span>`,
  ]);
  const pEl = document.getElementById('t-ov-posts');
  if (pEl) pEl.innerHTML = table(['時間', '平台', '標題', '語言', '狀態'], postRows);
}

/* ---------- 樹況視角 ---------- */
function drawTreeOverview() {
  const db = Store.read();
  const trees = Store.treeList();
  const adopted = trees.filter(t =>
    t.status === 'adopted' || db.orders.some(o => o.treeId === t.id));
  const reports = db.reports || [];

  // 超過 14 天沒有現場回報的樹 —— 這是要派工的名單
  const last = {};
  reports.forEach(r => { if (!last[r.treeId] || r.at > last[r.treeId]) last[r.treeId] = r.at; });
  const stale = trees.filter(t => {
    const at = last[t.id];
    if (!at) return true;
    return (Date.now() - new Date(at.replace(' ', 'T'))) / 86400000 > 14;
  }).length;

  const kpi = document.getElementById('tree-kpis');
  if (kpi) kpi.innerHTML = [
    ['樹體資產', qty(trees.length) + ' 棵', '一樹一碼'],
    ['已認養',   qty(adopted.length) + ' 棵',
      trees.length ? '認養率 ' + Math.round(adopted.length / trees.length * 100) + '%' : '—'],
    ['現場回報', qty(reports.length) + ' 筆', '溝通者累計紀錄'],
    ['待回報',   qty(stale) + ' 棵', '超過 14 天沒有紀錄'],
  ].map(([k, v, sub]) =>
    `<div class="kpi-card"><span class="k">${k}</span><b>${v}</b><small>${sub}</small></div>`).join('');

  const byOrch = {};
  trees.forEach(t => {
    const o = byOrch[t.orchard] || (byOrch[t.orchard] = { all:0, adopted:0, value:0, area:t.area });
    o.all++; o.value += Number(t.price) || 0;
    if (t.status === 'adopted' || db.orders.some(x => x.treeId === t.id)) o.adopted++;
  });
  const orchRows = Object.entries(byOrch).map(([name, o]) => [
    `<b>${name}</b>`, o.area,
    num(o.all,     n => qty(n) + ' 棵'),
    num(o.adopted, n => qty(n) + ' 棵'),
    num(o.value),
  ]);
  const oEl = document.getElementById('t-ov-orchards');
  if (oEl) oEl.innerHTML = table([
    '果園', '地區',
    { h:'樹數',   num:true, },
    { h:'已認養', num:true },
    { h:'年認養金總額', num:true, sum:true },
  ], orchRows);

  const repRows = [...reports].reverse().slice(0, 8).map(r => [
    r.at, `<span class="pill">${r.treeId}</span>`, r.by, r.stage,
    `<span class="badge-${r.health === '良好' ? 'ok' : 'wait'}">${r.health}</span>`,
  ]);
  const rEl = document.getElementById('t-ov-reports');
  if (rEl) rEl.innerHTML = table(['時間', 'Tree ID', '回報人', '生長階段', '樹況'], repRows);
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
  /* 沒有 portal 權限的人（溝通者、果農、收購商）不該停在這一頁。
     直接送去他該去的地方，而不是讓他看到一個空的後台。 */
  if (Perm.me() && !Perm.canPortal()) {
    location.replace(Perm.home());
    return;
  }

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
       <span>要換成真正的登入：先到 Supabase 的 SQL Editor 跑一次
       supabase-setup-v3.sql，建立第一個管理員帳號，
       再把 assets/config.js 的 AUTH_MODE 改成 supabase。</span>`;

  box.style.borderLeftColor = on ? 'var(--gold)' : 'var(--red)';
  if (typeof I18N !== 'undefined') I18N.refresh(box);
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
