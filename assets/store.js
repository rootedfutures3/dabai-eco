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
    return user;
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
};


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
};

/** 寫入雲端（失敗只記錄，不阻斷畫面 —— 資料仍在本機快取） */
function push(tableName, row) {
  if (!SB.on) return;
  SB.insert(tableName, [MAP[tableName].out(row)])
    .catch(e => console.warn('[雲端寫入失敗]', tableName, e.message));
}

/** 開機：載入雲端資料。沒設定就直接沿用 localStorage。 */
Store.boot = async function () {
  if (!SB.on) return { mode: 'local' };

  try {
    const [trees, orders, reports, leads, messages] = await Promise.all(
      ['trees','orders','reports','leads','messages'].map(t => SB.get(t)));

    const db = Store.read();

    // 首次連線：雲端還是空的 → 把示範資料推上去
    if (!trees.length && typeof TREES !== 'undefined') {
      const seed = TREES.map(t => ({ ...t, owner:'system', listed:true }));
      await SB.insert('trees', seed.map(MAP.trees.out));
      db.trees = seed;
    } else {
      db.trees = trees.map(MAP.trees.in);
    }

    if (!orders.length && db.orders?.length) {
      await SB.insert('orders', db.orders.map(MAP.orders.out));
    } else if (orders.length) {
      db.orders = orders.map(MAP.orders.in);
    }

    if (reports.length)  db.reports  = reports.map(MAP.reports.in);
    if (leads.length)    db.leads    = leads.map(MAP.leads.in);
    if (messages.length) db.messages = messages.map(MAP.messages.in);

    Store.write(db);
    return { mode: 'cloud', trees: db.trees.length, orders: db.orders.length };

  } catch (e) {
    console.warn('[雲端連線失敗，改用本機資料]', e.message);
    return { mode: 'local', error: e.message };
  }
};

/** 等資料庫就緒後再執行（取代直接綁 DOMContentLoaded） */
Store.onReady = function (fn) {
  const go = () => Store.boot().then(info => fn(info)).catch(() => fn({ mode: 'local' }));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
  else go();
};
