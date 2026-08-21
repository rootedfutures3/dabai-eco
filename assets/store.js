/* ============================================================
   ROOTED FUTURES — 示範資料庫（Demo Store）
   ------------------------------------------------------------
   ⚠️ 這不是真的資料庫。GitHub Pages 是靜態託管，沒有後端，
      所有資料存在瀏覽器的 localStorage，只存在你自己這台裝置上，
      清除瀏覽器資料就會消失，也不會傳送到任何伺服器。

      正式營運時，這一層應替換為真正的後端 API
      （Tree 資產表、Orders、Customers、FieldReports、Wages）。

   設計目的：讓 demo 串起來 ——
      在包樹認養頁完成一筆模擬認養 → ERP 儀表板立刻看得到那筆訂單；
      溝通者門戶回報樹況 → ERP 的樹況紀錄同步增加。
   ============================================================ */

const STORE_KEY = 'rootedfutures_demo_v1';

/* ---------- 種子資料（虛擬） ---------- */
const SEED = {

  /* 系統設定 —— 佣金比例等。存成陣列是為了直接對應資料庫的 key/value 表。 */
  settings: [
    { key:'commission_rate', value:'20', note:'平台佣金％ —— 向收購商／認養人收取，其餘給果農' },
    { key:'deposit_share',   value:'55', note:'果農在開花前先拿到的％（佔合約總額）' },
    { key:'currency',        value:'RM', note:'幣別' },
  ],

  /* 撥款紀錄 —— 實際付給果農的每一筆錢 */
  payouts: [
    { ref:'PO-2026-0001', date:'2026-01-15', orderNo:'RF-2026-0001', treeId:'DB-002', farmer:'Lim 氏果園（第二代）', kind:'deposit', amount:220, method:'DuitNow 轉帳', status:'已撥款', note:'開花前訂金' },
    { ref:'PO-2026-0002', date:'2026-01-20', orderNo:'RF-2026-0002', treeId:'DR-002', farmer:'Nyawai 家族',          kind:'deposit', amount:649, method:'DuitNow 轉帳', status:'已撥款', note:'開花前訂金' },
    { ref:'PO-2026-0003', date:'2026-02-12', orderNo:'RF-2026-0004', treeId:'DB-008', farmer:'Rumah Ugap 合作社',    kind:'deposit', amount:247.5, method:'銀行匯款', status:'已撥款', note:'企業包樹訂金' },
  ],

  /* 社群貼文 */
  posts: [
    { id:1, at:'2026-03-04 09:10', channel:'facebook',  topic:'tree',    topicId:'DB-001', lang:'zh', title:'DB-001 開花了', body:'Song 上游果園的 DB-001 今年花況密集，溝通者 Anding 剛回報完第一次追肥。這棵樹已經被認養，收成會直接寄到認養人手上。', tags:'#Dabai #砂拉越 #包樹認養 #TANJU', status:'已發布', link:'', scheduled:'' },
    { id:2, at:'2026-03-06 18:40', channel:'instagram', topic:'product', topicId:'kuaci', lang:'en', title:'Dabai Kuaci', body:'The seed everyone used to throw away. Roasted, salted, addictive. Zero-waste snacking from the Borneo rainforest.', tags:'#dabai #sarawak #zerowaste #borneo #TANJU', status:'草稿', link:'', scheduled:'' },
  ],
  /* 使用者帳號（示範）—— 密碼一律為 admin，僅供 demo */
  users: [
    { u:'admin',  pass:'admin', role:'admin',  name:'平台管理員', org:'ROOTED FUTURES', phone:'+60 82-000 000', email:'admin@example.com', area:'Song' },
    { u:'farmer', pass:'admin', role:'farmer', name:'Ak. Jelani', org:'Rumah Panjai 上游果園', phone:'+60 13-220 1188', email:'jelani@example.com', area:'Sibu' },
    { u:'buyer',  pass:'admin', role:'buyer',  name:'李采薇', org:'南洋食品工業', phone:'+60 82-334 900', email:'esg@example.com', area:'Kuching' },
  ],

  messages: [
    { id:1, treeId:'DB-002', from:'buyer', to:'farmer', at:'2026-01-15 10:22', text:'你好，想確認這棵樹今年的開花狀況，方便拍幾張照片嗎？' },
    { id:2, treeId:'DB-002', from:'farmer', to:'buyer', at:'2026-01-15 14:05', text:'沒問題，明天早上溝通者會去現場，我請他多拍幾張上傳。' },
  ],

  orders: [
    { no:'RF-2026-0001', date:'2026-01-14', treeId:'DB-002', crop:'dabai',    customer:'陳品妤', email:'ping@example.com', phone:'+60 12-330 8821', amount:400,  paid:200, channel:'FPX 網路銀行', status:'已付訂金' },
    { no:'RF-2026-0002', date:'2026-01-19', treeId:'DR-002', crop:'durian',   customer:'Ong Wei Sheng', email:'ws.ong@example.com', phone:'+60 16-772 1140', amount:1180, paid:1180, channel:'信用卡', status:'已付全額' },
    { no:'RF-2026-0003', date:'2026-02-02', treeId:'RB-003', crop:'rambutan', customer:'林嘉恩', email:'jiaen@example.com', phone:'+60 11-2098 4471', amount:230,  paid:115,  channel:'DuitNow QR', status:'已付訂金' },
    { no:'RF-2026-0004', date:'2026-02-11', treeId:'DB-008', crop:'dabai',    customer:'綠境食品有限公司', email:'purchase@example.com', phone:'+60 82-334 900', amount:450, paid:450, channel:'企業匯款', status:'已付全額' },
    { no:'RF-2026-0005', date:'2026-02-23', treeId:'DR-010', crop:'durian',   customer:'Nurul Aisyah', email:'aisyah@example.com', phone:'+60 13-448 7712', amount:960, paid:480, channel:'FPX 網路銀行', status:'已付訂金' },
    { no:'RF-2026-0006', date:'2026-03-05', treeId:'DB-014', crop:'dabai',    customer:'黃俊傑', email:'jj.wong@example.com', phone:'+60 17-556 2093', amount:410, paid:410, channel:'信用卡', status:'已付全額' },
  ],

  leads: [
    { date:'2026-01-28', company:'南洋食品工業', contact:'李采薇', title:'永續採購經理', email:'esg@example.com', need:'ESG 綠色包樹 100 棵', budget:'RM 80,000–120,000', stage:'提案中' },
    { date:'2026-02-06', company:'Borneo Fresh Export', contact:'Tan Chee Meng', title:'採購總監', email:'sourcing@example.com', need:'榴槤契作包銷（3 年）', budget:'RM 300,000+', stage:'洽談中' },
    { date:'2026-02-18', company:'綠盾保險', contact:'張書維', title:'CSR 專員', email:'csr@example.com', need:'員工認養禮 50 棵', budget:'RM 25,000–40,000', stage:'待回覆' },
    { date:'2026-03-01', company:'Sarawak Hotel Group', contact:'Adeline Lau', title:'營運副總', email:'ops@example.com', need:'餐飲食材直採 + 故事行銷', budget:'洽談中', stage:'初次接觸' },
  ],

  reports: [
    { at:'2026-03-02 09:14', treeId:'DB-001', by:'溝通者 · Anding', stage:'開花期', health:'良好', note:'花況密集，預估產量優於去年。已完成第一次追肥。', photos:1 },
    { at:'2026-03-02 10:41', treeId:'DR-004', by:'溝通者 · Anding', stage:'幼果期', health:'良好', note:'落果率正常，已疏果一次。', photos:2 },
    { at:'2026-03-03 15:08', treeId:'DR-007', by:'溝通者 · Melissa', stage:'幼果期', health:'需注意', note:'發現少量果實蠅危害，已通報顧問安排防治。', photos:3 },
    { at:'2026-03-05 08:52', treeId:'RB-004', by:'溝通者 · Melissa', stage:'成熟期', health:'良好', note:'預計兩週後可採收，已預約過磅。', photos:1 },
  ],

  wages: [
    { month:'2026-02', person:'Ak. Jelani 一家',      role:'果農',   base:1800, bonus:420,  note:'DB-001~003 認養分潤' },
    { month:'2026-02', person:'Nyawai 家族',          role:'果農',   base:1600, bonus:980,  note:'DR-001~003 認養分潤' },
    { month:'2026-02', person:'Anding',               role:'溝通者', base:1400, bonus:180,  note:'現場回報 42 筆' },
    { month:'2026-02', person:'Melissa',              role:'溝通者', base:1400, bonus:150,  note:'現場回報 35 筆' },
    { month:'2026-02', person:'Rumah Ugap 採收班',    role:'摘果者', base:2200, bonus:0,    note:'Betong 果園採收 8 日' },
  ],
};

/* ---------- 存取層 ---------- */
const Store = {
  read() {
    const fresh = JSON.parse(JSON.stringify(SEED));
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return fresh;
      const saved = JSON.parse(raw);
      // 舊版存檔可能缺少後來才新增的欄位（例如 users、messages），
      // 這裡補齊缺項，避免升級後讀到 undefined 而整個壞掉。
      for (const k of Object.keys(fresh)) {
        if (saved[k] === undefined) saved[k] = fresh[k];
      }
      return saved;
    } catch (e) { /* localStorage 不可用或內容毀損時退回種子資料 */ }
    return fresh;
  },

  write(db) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); }
    catch (e) { /* 無痕模式等情況下寫入會失敗，忽略即可 */ }
    return db;
  },

  addOrder(order) {
    const db = Store.read();
    db.orders.push(order);
    Store.write(db);
    push('orders', order);
    return db.orders;
  },

  addReport(report) {
    const db = Store.read();
    db.reports.unshift(report);
    Store.write(db);
    push('reports', report);
    return db.reports;
  },

  addLead(lead) {
    const db = Store.read();
    db.leads.unshift(lead);
    Store.write(db);
    push('leads', lead);
    return db.leads;
  },

  reset() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
    return Store.read();
  },

  /* ---- 使用者 ---- */
  findUser(u, pass) {
    return Store.read().users.find(x =>
      x.u.toLowerCase() === String(u).trim().toLowerCase() && x.pass === pass) || null;
  },
  userExists(u) {
    return Store.read().users.some(x => x.u.toLowerCase() === String(u).trim().toLowerCase());
  },
  addUser(user) {
    const db = Store.read();
    db.users.push(user);
    Store.write(db);
    push('users', user);
    return user;
  },

  /**
   * 目前的樹木清單 —— 資料庫裡有就用資料庫的，否則退回 site.js 的靜態種子。
   * ERP 與溝通者門戶都應該用這個，直接讀 TREES 會看到過時資料。
   */
  treeList() {
    const db = Store.read();
    if (db.trees && db.trees.length) return db.trees;
    return (typeof TREES !== 'undefined') ? TREES : [];
  },

  /* ---- 樹木資產（首次由 site.js 的 TREES 種子化，之後可編輯） ---- */
  trees(seedFn) {
    const db = Store.read();
    if (!db.trees && typeof seedFn === 'function') {
      db.trees = seedFn();
      Store.write(db);
    }
    return db.trees || [];
  },
  saveTrees(trees) {
    const db = Store.read();
    db.trees = trees;
    return Store.write(db).trees;
  },
  upsertTree(tree) {
    const db = Store.read();
    db.trees = db.trees || [];
    const i = db.trees.findIndex(t => t.id === tree.id);
    if (i >= 0) {
      db.trees[i] = { ...db.trees[i], ...tree };
      if (SB.on) SB.patch('trees', 'id', tree.id, MAP.trees.out(db.trees[i]))
        .catch(e => console.warn('[雲端更新失敗] trees', e.message));
    } else {
      db.trees.push(tree);
      push('trees', tree);
    }
    return Store.write(db).trees;
  },

  /* ---- 訊息 ---- */
  addMessage(m) {
    const db = Store.read();
    db.messages = db.messages || [];
    m.id = (db.messages.at(-1)?.id || 0) + 1;
    db.messages.push(m);
    Store.write(db);
    push('messages', m);
    return db.messages;
  },

  /** 下一個訂單編號，格式 RF-YYYY-NNNN */
  nextOrderNo(year) {
    const db = Store.read();
    const n = db.orders.length + 1;
    return `RF-${year}-${String(n).padStart(4, '0')}`;
  },

  /* ---------- 系統設定（佣金比例等） ---------- */

  /** 讀一個設定值。查不到就回傳 fallback，不會讓畫面炸掉。 */
  setting(key, fallback) {
    const row = (Store.read().settings || []).find(s => s.key === key);
    return row === undefined ? fallback : row.value;
  },

  /** 數字型設定（佣金％之類）。非數字一律退回 fallback。 */
  settingNum(key, fallback) {
    const n = parseFloat(Store.setting(key, ''));
    return Number.isFinite(n) ? n : fallback;
  },

  saveSetting(key, value) {
    const db = Store.read();
    db.settings = db.settings || [];
    const row = db.settings.find(s => s.key === key);
    if (row) { row.value = String(value); }
    else { db.settings.push({ key, value: String(value), note: '' }); }
    Store.write(db);
    if (row) patchRow('settings', 'key', key, { value: String(value) });
    else push('settings', { key, value: String(value), note: '' });
  },

  /* ---------- 佣金拆帳 ---------- */

  /**
   * 一筆訂單的錢怎麼分。
   *   平台佣金 = 合約總額 × commission_rate%
   *   果農應得 = 合約總額 − 平台佣金
   * 果農那份再拆兩段：開花前訂金（佔合約總額 deposit_share%）與採收後尾款。
   * 全部以「合約總額」為基準，而不是「已收金額」——
   * 因為認養制的重點就是錢要在開花前先到果農手上。
   */
  split(order) {
    const rate = Store.settingNum('commission_rate', 20);
    const dep  = Store.settingNum('deposit_share', 55);
    const amount = Number(order.amount) || 0;
    const fee    = round2(amount * rate / 100);
    const farmer = round2(amount - fee);
    const deposit = round2(Math.min(farmer, amount * dep / 100));
    const balance = round2(farmer - deposit);
    const paidOut = round2(Store.payoutsFor(order.no).reduce((s, p) => s + Number(p.amount), 0));
    return { rate, amount, fee, farmer, deposit, balance, paidOut,
             pending: round2(farmer - paidOut) };
  },

  payoutsFor(orderNo) {
    return (Store.read().payouts || []).filter(p => p.orderNo === orderNo);
  },

  nextPayoutRef(year) {
    const n = (Store.read().payouts || []).length + 1;
    return `PO-${year}-${String(n).padStart(4, '0')}`;
  },

  addPayout(p) {
    const db = Store.read();
    db.payouts = db.payouts || [];
    db.payouts.push(p);
    Store.write(db);
    push('payouts', p);
    return p;
  },

  /* ---------- 社群貼文 ---------- */

  addPost(post) {
    const db = Store.read();
    db.posts = db.posts || [];
    post.id = db.posts.reduce((m, p) => Math.max(m, p.id || 0), 0) + 1;
    db.posts.push(post);
    Store.write(db);
    push('posts', post);
    return post;
  },

  /** 更新貼文狀態。雲端用 id 當主鍵，本機同步改一份。 */
  updatePost(id, patch) {
    const db = Store.read();
    const p = (db.posts || []).find(x => x.id === id);
    if (!p) return;
    Object.assign(p, patch);
    Store.write(db);
    patchRow('posts', 'id', id, MAP.posts.out(p));
  },
};

/** 金額一律進位到分，避免 0.1+0.2 這種浮點誤差寫進帳本。 */
function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }


/* ============================================================
   雲端資料庫（Supabase）
   ------------------------------------------------------------
   設計原則：不改動既有程式碼的呼叫方式。
   - 開頁時先把雲端資料一次載入記憶體快取
   - Store.read() 維持同步，回傳快取
   - 寫入時先更新快取（畫面立即反應），再非同步推到雲端
   沒設定 config.js 時完全走 localStorage，行為與過去相同。
   ============================================================ */

const SB = {
  on: typeof CLOUD_ON !== 'undefined' && CLOUD_ON,
  url: typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : '',
  key: typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : '',

  head(extra) {
    return Object.assign({
      apikey: SB.key,
      Authorization: 'Bearer ' + SB.key,
      'Content-Type': 'application/json',
    }, extra || {});
  },

  async get(tableName) {
    const r = await fetch(`${SB.url}/rest/v1/${tableName}?select=*`, { headers: SB.head() });
    if (!r.ok) throw new Error(`讀取 ${tableName} 失敗（${r.status}）`);
    return r.json();
  },

  async insert(tableName, rows) {
    const r = await fetch(`${SB.url}/rest/v1/${tableName}`, {
      method: 'POST',
      headers: SB.head({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(rows),
    });
    if (!r.ok) throw new Error(`寫入 ${tableName} 失敗（${r.status}）：${await r.text()}`);
  },

  async patch(tableName, pk, pkVal, patch) {
    const r = await fetch(`${SB.url}/rest/v1/${tableName}?${pk}=eq.${encodeURIComponent(pkVal)}`, {
      method: 'PATCH',
      headers: SB.head({ Prefer: 'return=minimal' }),
      body: JSON.stringify(patch),
    });
    if (!r.ok) throw new Error(`更新 ${tableName} 失敗（${r.status}）`);
  },
};

/* 欄位對應：資料庫用 snake_case，前端沿用既有的 camelCase */
const MAP = {
  trees: {
    out: t => ({ id:t.id, crop:t.crop, variety:t.variety, age:t.age, kg:t.kg, price:t.price,
                 orchard:t.orchard, area:t.area, farmer:t.farmer, owner:t.owner,
                 listed:t.listed, status:t.status }),
    in:  r => ({ ...r }),
  },
  orders: {
    out: o => ({ no:o.no, date:o.date, tree_id:o.treeId, crop:o.crop, customer:o.customer,
                 email:o.email, phone:o.phone, amount:o.amount, paid:o.paid,
                 channel:o.channel, status:o.status, buyer:o.buyer || null }),
    in:  r => ({ no:r.no, date:r.date, treeId:r.tree_id, crop:r.crop, customer:r.customer,
                 email:r.email, phone:r.phone, amount:r.amount, paid:r.paid,
                 channel:r.channel, status:r.status, buyer:r.buyer }),
  },
  reports: {
    out: r => ({ at:r.at, tree_id:r.treeId, by_who:r.by, stage:r.stage,
                 health:r.health, note:r.note, photos:r.photos }),
    in:  r => ({ at:r.at, treeId:r.tree_id, by:r.by_who, stage:r.stage,
                 health:r.health, note:r.note, photos:r.photos }),
  },
  leads: {
    out: l => ({ date:l.date, company:l.company, contact:l.contact, title:l.title,
                 email:l.email, need:l.need, budget:l.budget, stage:l.stage }),
    in:  r => ({ ...r }),
  },
  messages: {
    out: m => ({ tree_id:m.treeId, from_who:m.from, to_who:m.to, at:m.at, text:m.text }),
    in:  r => ({ id:r.id, treeId:r.tree_id, from:r.from_who, to:r.to_who, at:r.at, text:r.text }),
  },
  users: {
    out: u => ({ u:u.u, pass:u.pass, role:u.role, name:u.name,
                 org:u.org, phone:u.phone, email:u.email, area:u.area }),
    in:  r => ({ u:r.u, pass:r.pass, role:r.role, name:r.name,
                 org:r.org, phone:r.phone, email:r.email, area:r.area }),
  },
  settings: {
    out: x => ({ key:x.key, value:x.value, note:x.note }),
    in:  r => ({ key:r.key, value:r.value, note:r.note }),
  },
  payouts: {
    out: p => ({ ref:p.ref, date:p.date, order_no:p.orderNo, tree_id:p.treeId, farmer:p.farmer,
                 kind:p.kind, amount:p.amount, method:p.method, status:p.status, note:p.note }),
    in:  r => ({ ref:r.ref, date:r.date, orderNo:r.order_no, treeId:r.tree_id, farmer:r.farmer,
                 kind:r.kind, amount:Number(r.amount), method:r.method, status:r.status, note:r.note }),
  },
  posts: {
    /* id 交給資料庫的 bigserial 產生，所以 out 不送 id */
    out: p => ({ at:p.at, channel:p.channel, topic:p.topic, topic_id:p.topicId, lang:p.lang,
                 title:p.title, body:p.body, tags:p.tags, status:p.status,
                 link:p.link, scheduled:p.scheduled }),
    in:  r => ({ id:r.id, at:r.at, channel:r.channel, topic:r.topic, topicId:r.topic_id, lang:r.lang,
                 title:r.title, body:r.body, tags:r.tags, status:r.status,
                 link:r.link, scheduled:r.scheduled }),
  },
  wages: {
    out: w => ({ month:w.month, person:w.person, role:w.role,
                 base:w.base, bonus:w.bonus, note:w.note }),
    in:  r => ({ month:r.month, person:r.person, role:r.role,
                 base:r.base, bonus:r.bonus, note:r.note }),
  },
};

/** 寫入雲端（失敗只記錄，不阻斷畫面 —— 資料仍在本機快取） */
function push(tableName, row) {
  if (!SB.on) return;
  SB.insert(tableName, [MAP[tableName].out(row)])
    .catch(e => console.warn('[雲端寫入失敗]', tableName, e.message));
}

/** 更新雲端既有的一列（失敗只記錄，本機快取已經改好了） */
function patchRow(tableName, pk, pkVal, patch) {
  if (!SB.on) return;
  SB.patch(tableName, pk, pkVal, patch)
    .catch(e => console.warn('[雲端更新失敗]', tableName, e.message));
}

/** 開機：載入雲端資料。沒設定 config.js 就直接沿用 localStorage。 */
Store.boot = async function () {
  if (!SB.on) return { mode: 'local' };

  const TABLES = ['users', 'trees', 'orders', 'reports', 'leads', 'wages', 'messages',
                  'settings', 'payouts', 'posts'];
  try {
    /* 有些資料表可能還沒建（例如剛加的 settings / payouts / posts，
       要先到 Supabase 跑 supabase-setup-v2.sql）。
       單一張表讀不到就當作空的，不要讓整個雲端連線垮掉。 */
    const rows = {};
    const missing = [];
    await Promise.all(TABLES.map(async t => {
      try { rows[t] = await SB.get(t); }
      catch (e) { rows[t] = []; missing.push(t); }
    }));
    if (missing.length) console.warn('[資料表尚未建立，改用本機種子]', missing.join(', '));

    const db = Store.read();
    const stats = {};

    // trees 的種子來自 site.js 的 TREES（帶 owner / listed 欄位）
    if (!rows.trees.length && typeof TREES !== 'undefined') {
      const seed = (db.trees && db.trees.length)
        ? db.trees
        : TREES.map(t => ({ ...t, owner: 'system', listed: true }));
      await SB.insert('trees', seed.map(MAP.trees.out));
      db.trees = seed;
    } else if (rows.trees.length) {
      db.trees = rows.trees.map(MAP.trees.in);
    }
    stats.trees = (db.trees || []).length;

    // 其餘表：雲端空的就把本機種子推上去，否則以雲端為準
    for (const t of ['users', 'orders', 'reports', 'leads', 'wages', 'messages',
                     'settings', 'payouts', 'posts']) {
      if (!rows[t].length) {
        const local = db[t] || [];
        if (local.length && !missing.includes(t)) {
          try { await SB.insert(t, local.map(MAP[t].out)); }
          catch (e) { console.warn('[種子寫入失敗]', t, e.message); }
        }
      } else {
        db[t] = rows[t].map(MAP[t].in);
      }
      stats[t] = (db[t] || []).length;
    }

    Store.write(db);
    return { mode: 'cloud', missing, ...stats };

  } catch (e) {
    console.warn('[雲端連線失敗，改用本機資料]', e.message);
    return { mode: 'local', error: e.message };
  }
};

/**
 * 等「DOM 就緒且資料庫載入完成」後再執行。
 * 取代直接綁 DOMContentLoaded —— 否則雲端資料還沒回來就先渲染，
 * 畫面會閃一次舊資料。boot() 只會執行一次，多個腳本共用同一個 Promise。
 */
Store._boot = null;
Store.onReady = function (fn) {
  const start = () => {
    if (!Store._boot) Store._boot = Store.boot().catch(e => ({ mode: 'local', error: String(e) }));
    return Store._boot;
  };
  const go = () => start().then(info => { try { fn(info); } catch (e) { console.error(e); } });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
  else go();
};
