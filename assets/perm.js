/* ============================================================
   權限（Roles & Permissions）
   ------------------------------------------------------------
   ⚠️ 先講清楚：這是<b>前端</b>的權限控制。它讓不同角色看到不同的
      功能、按不到不該按的按鈕，足以支撐日常分工與示範，
      但擋不住懂技術的人 —— 任何人打開瀏覽器主控台都能改。

      真正的權限必須在伺服器端：Supabase 的 RLS 政策要依
      auth.uid() 判斷角色，而不是依前端送來的欄位。
      目前 demo 的 RLS 對 anon 全開，所以這一層只是分工，不是防護。
      正式營運前一定要補上，介面上也會照實說明。

   角色設計：
     super   超級管理員 —— 全部權限，含帳號與權限管理
     admin   一般管理員 —— 日常營運，不能改權限與佣金比例
     finance 財務       —— 佣金與撥款；看不到帳號管理
     editor  編輯       —— 樹體資料與社群發文；看不到錢
     coord   溝通者     —— 只用溝通者平台（coordinator.html），進不了 TANJU Portal
     farmer  果農 / buyer 收購商 —— 前台使用者，不進 ERP
   ============================================================ */

/* 每一項權限代表「可以做什麼」，不是「可以看哪一頁」——
   頁面由權限推導出來，這樣加新頁時不必到處改。 */
/* 系統裡總共有哪些權限。角色編輯器的勾選清單、權限矩陣都讀這一份，
   之後要加新權限只要動這裡。 */
const ALL_PERMS = [
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

/* 內建角色。使用者自訂的角色存在資料庫（settings 的 custom_roles），
   開機時由 Perm.load() 併進來。 */
const PERMS = {
  super: {
    portal: true,
    label: '超級管理員', en: 'Super Admin',
    can: ['view.all', 'edit.trees', 'edit.orders', 'view.money', 'edit.money',
          'edit.settings', 'edit.social', 'edit.users', 'field.report', 'db.reset'],
  },
  admin: {
    portal: true,
    label: '一般管理員', en: 'Admin',
    can: ['view.all', 'edit.trees', 'edit.orders', 'view.money',
          'edit.social', 'field.report'],
  },
  finance: {
    portal: true,
    label: '財務', en: 'Finance',
    can: ['view.money', 'edit.money', 'edit.settings', 'view.orders'],
  },
  editor: {
    portal: true,
    label: '編輯', en: 'Editor',
    can: ['edit.trees', 'edit.social', 'view.trees'],
  },
  /* 溝通者不給 portal.access —— 他的工作在溝通者平台完成，
     不需要也不應該看到訂單、客戶與金額。 */
  coord: {
    label: '溝通者', en: 'Coordinator',
    can: ['field.report', 'view.trees'],
    home: 'coordinator.html',
  },
  /* 果農也在溝通者平台工作 —— 現場的人用手機，不會去碰後台。
     他只看得到掛在自己名下的樹（見 coordinator.js 的 myTrees）。 */
  farmer: { label: '果農',   en: 'Farmer', can: ['view.trees', 'field.report'],
            home: 'coordinator.html' },
  buyer:  { label: '收購商', en: 'Buyer',  can: ['view.trees'], home: 'dashboard.html' },
};

/* 每個 ERP 功能頁需要的權限。列在這裡才會出現在左側選單。 */
const PAGE_PERM = {
  overview:   'view.all',
  orders:     'view.orders',
  trees:      'view.trees',
  customers:  'view.all',
  reports:    'view.trees',
  commission: 'view.money',
  social:     'edit.social',
  wages:      'view.money',
  users:      'edit.users',
};

const Perm = {
  /** 內建角色不能改也不能刪，避免有人把超級管理員的權限拿掉後鎖死系統。 */
  BUILTIN: ['super', 'admin', 'finance', 'editor', 'coord', 'farmer', 'buyer'],

  /**
   * 把資料庫裡的自訂角色併進 PERMS。
   * 存成一個 JSON 字串放在 settings 表，不另外開一張表 ——
   * 角色不會多到需要獨立資料表，而且這樣一次讀寫就好。
   */
  load() {
    let raw;
    try { raw = JSON.parse(Store.setting('custom_roles', '{}')); }
    catch (e) { console.warn('[自訂角色解析失敗，忽略]', e.message); return; }
    if (!raw || typeof raw !== 'object') return;
    for (const [key, def] of Object.entries(raw)) {
      if (Perm.BUILTIN.includes(key)) continue;          // 不讓自訂角色蓋掉內建的
      if (!def || !Array.isArray(def.can)) continue;
      PERMS[key] = { label: def.label || key, en: def.en || key, can: def.can, custom: true };
    }
  },

  customRoles() {
    return Object.entries(PERMS).filter(([, v]) => v.custom);
  },

  /** 新增或修改一個自訂角色。回傳錯誤訊息字串，成功回傳 null。 */
  saveRole(key, label, can) {
    if (!Perm.can('edit.users')) return '你的角色沒有管理權限的權限。';
    key = String(key || '').trim().toLowerCase();
    if (!/^[a-z0-9_-]{2,20}$/.test(key)) return '角色代號請用 2–20 個英文小寫字母、數字或 _ - 。';
    if (Perm.BUILTIN.includes(key)) return `「${key}」是內建角色，不能覆蓋。請換一個代號。`;
    if (!String(label || '').trim()) return '請填角色名稱。';
    if (!can.length) return '至少要勾一項權限。';

    PERMS[key] = { label: String(label).trim(), en: key, can, custom: true };
    Perm.persist();
    return null;
  },

  deleteRole(key) {
    if (!Perm.can('edit.users')) return '你的角色沒有管理權限的權限。';
    if (Perm.BUILTIN.includes(key)) return '內建角色不能刪除。';
    const inUse = (Store.read().users || []).filter(u => u.perm === key);
    if (inUse.length) {
      return `還有 ${inUse.length} 個帳號在用這個角色（${inUse.map(u => u.u).join('、')}），`
           + '請先把他們改成別的角色。';
    }
    delete PERMS[key];
    Perm.persist();
    return null;
  },

  persist() {
    const out = {};
    for (const [k, v] of Object.entries(PERMS)) {
      if (v.custom) out[k] = { label: v.label, en: v.en, can: v.can };
    }
    Store.saveSetting('custom_roles', JSON.stringify(out));
  },

  /** 目前登入的人。沒登入回傳 null。 */
  me() {
    const u = sessionStorage.getItem('rf_app_session');
    if (!u) return null;
    return (Store.read().users || []).find(x => x.u === u) || null;
  },

  /** 目前角色代號。沒登入當訪客。 */
  role() {
    const me = Perm.me();
    if (!me) return null;
    /* 舊資料只有 role:'admin'，沿用時視為超級管理員，
       這樣升級後原本的管理員不會突然被鎖在門外。 */
    return me.perm || (me.role === 'admin' ? 'super' : me.role) || null;
  },

  roleLabel() {
    const r = Perm.role();
    return r && PERMS[r] ? PERMS[r].label : '訪客';
  },

  /** 能不能做某件事。'view.all' 自動涵蓋所有 view.* */
  can(action) {
    const r = Perm.role();
    if (!r || !PERMS[r]) return false;
    const list = PERMS[r].can;
    if (list.includes(action)) return true;
    if (action.startsWith('view.') && list.includes('view.all')) return true;
    /* 有編輯權就一定看得到自己編輯的東西 */
    if (action.startsWith('view.')) {
      const editing = 'edit.' + action.slice(5);
      if (list.includes(editing)) return true;
    }
    return false;
  },

  /** 這個角色能不能進 TANJU Portal（管理後台）。 */
  canPortal() {
    const r = Perm.role();
    return !!(r && PERMS[r] && PERMS[r].portal);
  },

  /** 這個角色登入後該去哪一頁。 */
  home() {
    const r = Perm.role();
    if (!r) return 'app.html';
    if (PERMS[r] && PERMS[r].portal) return 'erp.html';
    return (PERMS[r] && PERMS[r].home) || 'dashboard.html';
  },

  canPage(tab) {
    const need = PAGE_PERM[tab];
    return need ? Perm.can(need) : true;
  },

  /** 把畫面上不該出現的東西藏起來。data-perm="edit.money" 就會被檢查。 */
  apply(root) {
    (root || document).querySelectorAll('[data-perm]').forEach(el => {
      const ok = el.dataset.perm.split(',').some(p => Perm.can(p.trim()));
      el.hidden = !ok;
    });
    (root || document).querySelectorAll('[data-perm-disable]').forEach(el => {
      const ok = el.dataset.permDisable.split(',').some(p => Perm.can(p.trim()));
      el.disabled = !ok;
      if (!ok) el.title = '你的角色沒有這項權限';
    });
  },
};
