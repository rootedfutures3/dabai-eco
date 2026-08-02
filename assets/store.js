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
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* localStorage 不可用時退回種子資料 */ }
    return JSON.parse(JSON.stringify(SEED));
  },

  write(db) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); }
    catch (e) { /* 無痕模式等情況下寫入會失敗，忽略即可 */ }
    return db;
  },

  addOrder(order) {
    const db = Store.read();
    db.orders.push(order);
    return Store.write(db).orders;
  },

  addReport(report) {
    const db = Store.read();
    db.reports.unshift(report);
    return Store.write(db).reports;
  },

  addLead(lead) {
    const db = Store.read();
    db.leads.unshift(lead);
    return Store.write(db).leads;
  },

  reset() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
    return Store.read();
  },

  /** 下一個訂單編號，格式 RF-YYYY-NNNN */
  nextOrderNo(year) {
    const db = Store.read();
    const n = db.orders.length + 1;
    return `RF-${year}-${String(n).padStart(4, '0')}`;
  },
};
