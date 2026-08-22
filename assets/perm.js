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
     coord   溝通者     —— 只有現場回報
     farmer  果農 / buyer 收購商 —— 前台使用者，不進 ERP
   ============================================================ */

/* 每一項權限代表「可以做什麼」，不是「可以看哪一頁」——
   頁面由權限推導出來，這樣加新頁時不必到處改。 */
const PERMS = {
  super: {
    label: '超級管理員', en: 'Super Admin',
    can: ['view.all', 'edit.trees', 'edit.orders', 'view.money', 'edit.money',
          'edit.settings', 'edit.social', 'edit.users', 'field.report', 'db.reset'],
  },
  admin: {
    label: '一般管理員', en: 'Admin',
    can: ['view.all', 'edit.trees', 'edit.orders', 'view.money',
          'edit.social', 'field.report'],
  },
  finance: {
    label: '財務', en: 'Finance',
    can: ['view.money', 'edit.money', 'edit.settings', 'view.orders'],
  },
  editor: {
    label: '編輯', en: 'Editor',
    can: ['edit.trees', 'edit.social', 'view.trees'],
  },
  coord: {
    label: '溝通者', en: 'Coordinator',
    can: ['field.report', 'view.trees'],
  },
  farmer: { label: '果農',   en: 'Farmer', can: ['view.trees'] },
  buyer:  { label: '收購商', en: 'Buyer',  can: ['view.trees'] },
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
