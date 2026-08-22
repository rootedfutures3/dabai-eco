/* ============================================================
   ROOTED FUTURES — 平台應用（果農 × 收購商）
   ------------------------------------------------------------
   ⚠️ 示範系統。沒有伺服器，帳號與資料全部存在瀏覽器的
      localStorage，只存在這台裝置上；密碼以明文存放，
      因此登入畫面明確要求不要使用真實密碼。
      正式營運必須改為後端驗證 + 加密儲存 + 權限控管。
   ============================================================ */

const SESSION = 'rf_app_session';
let me = null;

/* ---------- 樹木資產：首次由 site.js 的 TREES 種子化 ---------- */
/* 果農帳號持有哪些樹 —— 對應表放在 store.js 的 FARMER_ACCOUNT，
   這裡沿用同一份，兩邊各寫一份遲早會對不上。 */
function seedTrees() {
  return TREES.map(t => ({ ...t, owner: ownerOf(t), listed: true }));
}
const allTrees = () => Store.trees(seedTrees);

/* ---------- 小工具 ---------- */
const money = n => 'RM ' + Number(n).toLocaleString('en-MY');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
function now() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
const ROLE_LABEL = { admin:'平台管理員', farmer:'果農', buyer:'收購商' };
const T_STATUS = {
  available:{ t:'開放認養', c:'st-open' },
  reserved :{ t:'保留中',   c:'st-talking' },
  adopted  :{ t:'已認養',   c:'st-taken' },
};

/* ============================================================
   啟動
   ============================================================ */
Store.onReady(() => {
  const shell = document.getElementById('app-nav');
  if (!shell) return;

  // 沒有有效登入就導回登入頁
  const saved = sessionStorage.getItem(SESSION);
  const user = saved ? Store.read().users.find(x => x.u === saved) : null;
  if (!user) { location.replace('app.html'); return; }


  document.getElementById('logout').addEventListener('click', () => {
    sessionStorage.removeItem(SESSION);
    if (typeof Auth !== 'undefined' && Auth.on) Auth.signOut();
    location.assign('app.html');
  });

  // 手機：漢堡開合左側功能列
  const tog = document.getElementById('side-toggle'), links = document.getElementById('side');
  tog?.addEventListener('click', () => {
    const open = links.classList.toggle('open');
    document.getElementById('side-veil').hidden = !open;
    tog.setAttribute('aria-expanded', String(open));
  });

  // 彈窗
  const modal = document.getElementById('app-modal');
  document.getElementById('app-modal-close').addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
  });

  signIn(user);
});

function signIn(user) {
  me = user;
  sessionStorage.setItem(SESSION, user.u);
  document.getElementById('me-role').textContent = ROLE_LABEL[user.role];
  document.getElementById('me-name').textContent = user.name;
  document.getElementById('me-org').textContent = user.org;
  const av = document.getElementById('side-avatar');
  if (av) av.textContent = (user.name || user.u).trim().charAt(0).toUpperCase();

  // 遮罩與 Esc 都能關掉手機上的側邊抽屜
  document.getElementById('side-veil')?.addEventListener('click', closeSide);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSide(); });
  buildNav();
}

/* ---------- 導覽 ---------- */
/* 管理員沒有列在這裡 —— 總覽、所有果樹、所有訂單、帳號管理
   全部都在 TANJU Portal（erp.html）裡了，兩邊各做一份只會分岔。
   管理端登入後看到的是一個入口頁，自己選要去哪，不再自動跳轉。 */
const NAVS = {
  farmer: [['trees','我的果樹'], ['adoptions','認養狀況'], ['income','收益'], ['msgs','訊息']],
  buyer:  [['browse','找果樹'], ['mine','我的認養'], ['track','樹況追蹤'], ['msgs','訊息']],
};

/* 選單圖示 —— 純裝飾，不影響翻譯（翻譯抓的是文字節點） */
const NAV_ICON = {
  trees:'🌳', adoptions:'🤝', income:'💰', msgs:'✉️',
  browse:'🔍', mine:'📗', track:'📈',
};

function buildNav() {
  const nav = document.getElementById('app-nav');

  /* 管理端的角色在這一頁沒有專屬功能（都在 TANJU Portal），
     但也不該把人硬跳走 —— 給一個入口頁，自己決定要去哪。 */
  if (!NAVS[me.role]) return buildStaffLanding();

  nav.innerHTML = NAVS[me.role].map(([k, t], i) =>
    `<a class="side-item${i === 0 ? ' on' : ''}" href="#" data-view="${k}" data-zh="${t}">
       <span class="si">${NAV_ICON[k] || '•'}</span>${t}</a>`).join('');

  nav.querySelectorAll('a').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    nav.querySelectorAll('a').forEach(x => x.classList.toggle('on', x === a));
    closeSide();
    setCrumb(a);
    render(a.dataset.view);
  }));

  /* 「其他」區：果農與收購商需要的出口。 */
  const extra = document.getElementById('app-extra');
  if (extra) {
    extra.innerHTML =
      `<a class="side-item" href="index.html"><span class="si">↩</span>回官網</a>`;
  }

  const first = nav.querySelector('a');
  setCrumb(first);
  render(NAVS[me.role][0][0]);
}

/** 管理端的入口頁：列出可以去的地方，不自動跳轉。 */
function buildStaffLanding() {
  const nav = document.getElementById('app-nav');
  const perm = me.perm || (me.role === 'admin' ? 'super' : me.role);
  const label = { super:'超級管理員', admin:'一般管理員', finance:'財務',
                  editor:'編輯', coord:'溝通者' }[perm] || perm;

  const links = [
    ['erp.html', '📊', 'TANJU Portal', '訂單、果樹、客戶、佣金、社群發文與帳號權限，全部在這裡。'],
    ['coordinator.html', '📍', '溝通者門戶', '現場派工、樹況回報與採收標籤。'],
    ['index.html', '↩', '回官網', '看訪客看到的前台。'],
  ];

  nav.innerHTML = links.map(([href, icon, title]) =>
    `<a class="side-item" href="${href}"><span class="si">${icon}</span>${title}</a>`).join('');
  const extra = document.getElementById('app-extra');
  if (extra) extra.innerHTML = '';

  const crumb = document.getElementById('crumb');
  if (crumb) crumb.textContent = '選擇要去哪裡';
  const root = document.getElementById('crumb-root');
  if (root) root.textContent = '後台';

  document.getElementById('view').innerHTML = `
    <h3 class="panel-h">歡迎回來，${me.name || me.u} <small>${label}</small></h3>
    <p class="panel-note">
      你的權限是<b>${label}</b>。這一頁不放功能 —— 日常工作都在 TANJU Portal，
      挑一個要去的地方就好。
    </p>
    <div class="hub-grid">
      ${links.map(([href, icon, title, desc]) => `
        <a class="hub-card" href="${href}">
          <span class="hub-ico" aria-hidden="true">${icon}</span>
          <b>${title}</b>
          <span class="hub-desc">${desc}</span>
        </a>`).join('')}
    </div>`;
  if (typeof I18N !== 'undefined') I18N.apply(document.getElementById('view'));
}

/** 麵包屑只取文字，不含前面的圖示 */
function setCrumb(a) {
  const crumb = document.getElementById('crumb');
  if (!crumb || !a) return;
  // 用中文原文，不要抓畫面上已經翻好的字 ——
  // 否則切過語言之後，麵包屑會卡在切換當下的那個語言。
  crumb.textContent = a.dataset.zh
    || [...a.childNodes].filter(n => n.nodeType === 3).map(n => n.nodeValue).join('').trim();
  const root = document.getElementById('crumb-root');
  if (root) root.textContent =
    { farmer:'果農後台', buyer:'收購商後台', admin:'管理後台' }[me.role] || '後台';

  // 這兩段是 i18n 跑完之後才寫進去的，要它重新翻一次，
  // 否則選單已經是英文、麵包屑還留著中文。
  if (typeof I18N !== 'undefined') I18N.refresh(document.getElementById('crumb-wrap'));
}

function closeSide() {
  const side = document.getElementById('side');
  if (!side || !side.classList.contains('open')) return;
  side.classList.remove('open');
  const veil = document.getElementById('side-veil');
  if (veil) veil.hidden = true;
  document.getElementById('side-toggle')?.setAttribute('aria-expanded', 'false');
}

/* ---------- 彈窗 ---------- */
function openModal(html) {
  document.getElementById('app-modal-body').innerHTML = html;
  document.getElementById('app-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  document.getElementById('app-modal').classList.remove('open');
  document.body.style.overflow = '';
}

/* ============================================================
   視圖
   ============================================================ */
function render(view) {
  const el = document.getElementById('view');
  ({
    trees: vFarmerTrees, adoptions: vFarmerAdoptions, income: vFarmerIncome,
    browse: vBrowse, mine: vMine, track: vTrack,
    msgs: vMessages,
  }[view] || (() => { el.innerHTML = ''; }))(el);
}

function kpis(list) {
  return `<div class="kpi-row">${list.map(([k, v, s]) =>
    `<div class="kpi-card"><span class="k">${k}</span><b>${v}</b><small>${s}</small></div>`).join('')}</div>`;
}
function table(headers, rows) {
  if (!rows.length) return `<div class="no-result">目前沒有資料</div>`;
  return `<div class="table-scroll"><table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
const treeCard = (t, actions) => `
  <article class="tree">
    <div class="tree-photo ${t.crop}">
      <span class="tree-ico">${CROP_ICON[t.crop]}</span>
      <span class="tree-id">${t.id}</span>
      <span class="status ${T_STATUS[t.status].c}">${T_STATUS[t.status].t}</span>
    </div>
    <div class="tree-body">
      <h3>${CROP_NAME[t.crop]}<span class="tree-variety">${esc(t.variety)}</span></h3>
      <dl class="spec">
        <div><dt>樹齡</dt><dd>${t.age} 年</dd></div>
        <div><dt>預估年產量</dt><dd>${t.kg} kg</dd></div>
      </dl>
      <p class="tree-where">📍 ${esc(t.orchard)}<br>${esc(t.area)} · ${esc(t.farmer)}</p>
      <div class="tree-foot">
        <div class="tree-price"><b>${money(t.price)}</b><span>／年</span></div>
        ${actions}
      </div>
    </div>
  </article>`;

/* ---------- 果農：我的果樹 ---------- */
function vFarmerTrees(el) {
  const mine = allTrees().filter(t => t.owner === me.u);
  const listed = mine.filter(t => t.listed).length;

  el.innerHTML = `
    ${kpis([
      ['我的果樹', mine.length + ' 棵', '含未上架'],
      ['已上架', listed + ' 棵', '收購商看得到'],
      ['已被認養', mine.filter(t => t.status === 'adopted').length + ' 棵', ''],
      ['潛在年收入', money(mine.reduce((s, t) => s + t.price, 0)), '全部認養時'],
    ])}
    <h3 class="panel-h">我的果樹 <small>可新增、編輯、上下架</small></h3>
    <button class="btn btn-gold" id="add-tree" style="border:none;cursor:pointer;margin-bottom:20px">＋ 新增一棵果樹</button>
    <div class="tree-grid">${
      mine.length ? mine.map(t => treeCard(t, `
        <button class="btn-claim" data-edit="${t.id}" style="flex:1 1 90px;width:auto;padding:11px 12px">編輯</button>
        <button class="btn-claim" data-toggle="${t.id}" style="flex:1 1 90px;width:auto;padding:11px 12px;background:${t.listed ? 'var(--coffee-mid)' : 'var(--coffee)'}">
          ${t.listed ? '下架' : '上架'}</button>`)).join('')
        : '<div class="no-result">你還沒有果樹。點上面的「新增一棵果樹」開始。</div>'
    }</div>`;

  document.getElementById('add-tree').addEventListener('click', () => treeForm(null));
  el.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click',
    () => treeForm(allTrees().find(t => t.id === b.dataset.edit))));
  el.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', () => {
    const t = allTrees().find(x => x.id === b.dataset.toggle);
    Store.upsertTree({ id: t.id, listed: !t.listed });
    vFarmerTrees(el);
  }));
}

/* 新增／編輯果樹 */
function treeForm(t) {
  const isNew = !t;
  openModal(`
    <h3>${isNew ? '新增果樹' : '編輯 ' + t.id}</h3>
    <form id="tree-edit">
      <div class="form-row">
        <div><label>作物</label>
          <select name="crop">${['dabai','durian','rambutan'].map(c =>
            `<option value="${c}" ${t?.crop === c ? 'selected' : ''}>${CROP_NAME[c]}</option>`).join('')}</select></div>
        <div><label>品種</label><input name="variety" value="${esc(t?.variety || '在地原生種')}" required></div>
      </div>
      <div class="form-row">
        <div><label>樹齡（年）</label><input name="age" type="number" min="1" max="99" value="${t?.age || 10}" required></div>
        <div><label>預估年產量（kg）</label><input name="kg" type="number" min="1" value="${t?.kg || 50}" required></div>
      </div>
      <div class="form-row">
        <div><label>果園名稱</label><input name="orchard" value="${esc(t?.orchard || me.org)}" required></div>
        <div><label>地區</label><input name="area" value="${esc(t?.area || me.area)}" required></div>
      </div>
      <div class="form-row">
        <div><label>年認養金（RM）</label><input name="price" type="number" min="1" value="${t?.price || 350}" required></div>
        <div><label>狀態</label>
          <select name="status">${Object.entries(T_STATUS).map(([k, v]) =>
            `<option value="${k}" ${t?.status === k ? 'selected' : ''}>${v.t}</option>`).join('')}</select></div>
      </div>
      <button class="btn btn-gold" type="submit" style="border:none;cursor:pointer;width:100%">
        ${isNew ? '建立並上架' : '儲存變更'}</button>
    </form>
    <div class="form-error" id="tf-err" role="alert"></div>`);

  document.getElementById('tree-edit').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    const crop = f.crop.value;
    const id = isNew ? nextTreeId(crop) : t.id;
    Store.upsertTree({
      id, crop, variety: f.variety.value.trim(),
      age: +f.age.value, kg: +f.kg.value, price: +f.price.value,
      orchard: f.orchard.value.trim(), area: f.area.value.trim(),
      farmer: me.name, owner: me.u,
      status: f.status.value, listed: t?.listed ?? true,
    });
    closeModal();
    render('trees');
    document.querySelector('[data-view="trees"]')?.classList.add('active');
  });
}

function nextTreeId(crop) {
  const pre = { dabai:'DB', durian:'DR', rambutan:'RB' }[crop];
  const nums = allTrees().filter(t => t.id.startsWith(pre))
    .map(t => +t.id.slice(3)).filter(n => !isNaN(n));
  return `${pre}-${String(Math.max(0, ...nums) + 1).padStart(3, '0')}`;
}

/* ---------- 果農：認養狀況 ---------- */
function vFarmerAdoptions(el) {
  const mine = allTrees().filter(t => t.owner === me.u).map(t => t.id);
  const db = Store.read();
  const orders = db.orders.filter(o => mine.includes(o.treeId));
  el.innerHTML = `
    ${kpis([
      ['被認養的樹', orders.length + ' 棵', ''],
      ['認養總額', money(orders.reduce((s, o) => s + o.amount, 0)), '合約金額'],
      ['已入帳', money(orders.reduce((s, o) => s + o.paid, 0)), '含訂金'],
    ])}
    <h3 class="panel-h">誰認養了我的樹 <small>Adoptions</small></h3>
    ${table(['訂單', 'Tree ID', '認養人', '聯絡方式', '合約金額', '已付', '狀態'],
      orders.map(o => [`<b>${o.no}</b>`, `<span class="pill">${o.treeId}</span>`,
        esc(o.customer), `<span class="dim">${esc(o.phone)}</span>`,
        money(o.amount), `<b>${money(o.paid)}</b>`,
        `<span class="badge-${o.status === '已付全額' ? 'ok' : 'wait'}">${o.status}</span>`]))}`;
}

/* ---------- 果農：收益 ---------- */
/* ============================================================
   果農：收益
   ------------------------------------------------------------
   數字全部走 Store.split()，和 TANJU Portal 的佣金頁用同一套算法 ——
   比例在後台改了，這裡立刻跟著變，不會兩邊講不一樣的話。
   已撥／待撥則讀真正的撥款紀錄（payouts），不是用比例估的。
   ============================================================ */
function vFarmerIncome(el) {
  const mineIds = allTrees().filter(t => t.owner === me.u).map(t => t.id);
  const orders  = Store.read().orders.filter(o => mineIds.includes(o.treeId));
  const rate    = Store.settingNum('commission_rate', 20);
  const depPct  = Store.settingNum('deposit_share', 55);

  const sum = orders.reduce((a, o) => {
    const sp = Store.split(o);
    a.contract += sp.amount; a.mine += sp.farmer;
    a.paidOut  += sp.paidOut; a.pending += sp.pending;
    a.fee      += sp.fee;
    return a;
  }, { contract:0, mine:0, paidOut:0, pending:0, fee:0 });

  el.innerHTML = `
    ${kpis([
      ['認養合約總額', money(sum.contract), `${orders.length} 筆訂單`],
      [`我的收益 ${100 - rate}%`, money(sum.mine), '扣除平台佣金後'],
      ['已入帳', money(sum.paidOut), '已經撥給我的'],
      ['尚待撥款', money(sum.pending), sum.pending > 0 ? '採收後結清' : '已結清'],
    ])}

    <div class="card" style="margin-bottom:22px">
      <h3 style="font-size:1.12rem;margin-bottom:6px">認養金怎麼分</h3>
      <p class="dim" style="font-size:.92rem;margin-bottom:16px">
        每 RM 100 的認養金，我拿 RM ${100 - rate}，平台留 RM ${rate}。
        我那份大部分在<b>開花前</b>就先撥，不必等收成。
      </p>
      <div class="split-row"><span>我的收益</span><b>${100 - rate}%　${money(sum.mine)}</b></div>
      <div class="split-bar"><i style="width:${100 - rate}%"></i></div>
      <div class="split-row sub"><span>— 開花前先撥</span><b>${depPct}%　${money(sum.contract * depPct / 100)}</b></div>
      <div class="split-row sub"><span>— 採收後結清</span><b>${100 - rate - depPct}%　${money(sum.contract * (100 - rate - depPct) / 100)}</b></div>
      <div class="split-row"><span>平台佣金</span><b>${rate}%　${money(sum.fee)}</b></div>
      <div class="split-bar"><i style="width:${rate}%"></i></div>
      <p class="split-note">
        平台的 ${rate}% 用來支付農務顧問、系統營運與社區永續基金。
        採收與物流的運費另計，向收購方收取，不從我的 ${100 - rate}% 裡扣。
      </p>
    </div>

    <h3 class="panel-h">逐筆明細 <small>依訂單</small></h3>
    ${table(['訂單', 'Tree ID', '合約總額', `我的 ${100 - rate}%`, '已入帳', '待撥'],
      orders.map(o => {
        const sp = Store.split(o);
        return [
          `<b>${o.no}</b>`,
          `<span class="pill">${o.treeId}</span>`,
          money(sp.amount),
          `<b>${money(sp.farmer)}</b>`,
          money(sp.paidOut),
          sp.pending <= 0.005
            ? '<span class="badge-ok">已結清</span>'
            : `<span class="badge-wait">${money(sp.pending)}</span>`,
        ];
      }))}

    <h3 class="panel-h" style="margin-top:28px">入帳紀錄 <small>實際撥款</small></h3>
    ${(() => {
      const pays = (Store.read().payouts || []).filter(p => mineIds.includes(p.treeId));
      return table(['日期', '撥款編號', 'Tree ID', '性質', '金額', '方式'],
        [...pays].reverse().map(p => [
          p.date, `<b>${p.ref}</b>`, `<span class="pill">${p.treeId}</span>`,
          { deposit:'開花前訂金', balance:'採收後尾款', adjust:'調整' }[p.kind] || p.kind,
          `<b>${money(p.amount)}</b>`, p.method || '—',
        ]));
    })()}`;
}

function vBrowse(el) {
  const open = allTrees().filter(t => t.listed && t.status === 'available');
  el.innerHTML = `
    <h3 class="panel-h">開放認養的果樹 <small>${open.length} 棵</small></h3>
    <div class="filters" style="margin-bottom:20px">
      <div class="fld"><label for="b-crop">作物</label>
        <select id="b-crop"><option value="">全部</option>${Object.entries(CROP_NAME)
          .map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div class="fld"><label for="b-area">地區</label>
        <select id="b-area"><option value="">全部</option>${[...new Set(open.map(t => t.area))].sort()
          .map(a => `<option>${a}</option>`).join('')}</select></div>
      <button class="filter-reset" id="b-reset">清除</button>
    </div>
    <div class="tree-grid" id="b-grid"></div>`;

  const draw = () => {
    const c = document.getElementById('b-crop').value, a = document.getElementById('b-area').value;
    const list = open.filter(t => (!c || t.crop === c) && (!a || t.area === a));
    document.getElementById('b-grid').innerHTML = list.length
      ? list.map(t => treeCard(t, `<button class="btn-claim" data-adopt="${t.id}" style="flex:1 1 120px;width:auto">認養這棵</button>`)).join('')
      : '<div class="no-result">找不到符合條件的果樹。</div>';
    document.querySelectorAll('[data-adopt]').forEach(b =>
      b.addEventListener('click', () => adoptForm(allTrees().find(t => t.id === b.dataset.adopt))));
  };
  ['b-crop','b-area'].forEach(id => document.getElementById(id).addEventListener('change', draw));
  document.getElementById('b-reset').addEventListener('click', () => {
    document.getElementById('b-crop').value = ''; document.getElementById('b-area').value = ''; draw();
  });
  draw();
}

function adoptForm(t) {
  openModal(`
    <h3>認養 ${t.id}</h3>
    <div class="target">
      <b>${CROP_NAME[t.crop]}（${esc(t.variety)}）</b>
      樹齡 ${t.age} 年 · 預估年產量 ${t.kg} kg<br>
      ${esc(t.orchard)}，${esc(t.area)} · 果農：${esc(t.farmer)}
      <span class="modal-price">年認養金 ${money(t.price)}</span>
    </div>
    <div class="sim-note">🧪 <b>模擬付款</b> —— 不會產生實際扣款，也不會要求信用卡資訊。</div>
    <form id="adopt-form">
      <div class="pay-opts">
        <label class="pay-opt"><input type="radio" name="amt" value="deposit" checked>
          <span><b>先付訂金 50%</b><em>${money(Math.round(t.price/2))}</em><small>尾款採收前繳清</small></span></label>
        <label class="pay-opt"><input type="radio" name="amt" value="full">
          <span><b>一次付清</b><em>${money(t.price)}</em><small>享次季續約 5% 折扣</small></span></label>
      </div>
      <div><label>付款方式</label>
        <select name="ch"><option>FPX 網路銀行</option><option>DuitNow QR</option>
          <option>信用卡</option><option>企業匯款</option></select></div>
      <label class="check" style="margin:16px 0">
        <input type="checkbox" id="ad-agree">
        <span>我已了解預估產量非保證產量，且認養金撥付後不可退款</span>
      </label>
      <button class="btn btn-gold" type="submit" style="border:none;cursor:pointer;width:100%">確認認養</button>
    </form>
    <div class="form-error" id="ad-err" role="alert"></div>`);

  document.getElementById('adopt-form').addEventListener('submit', async e => {
    e.preventDefault();
    const err = document.getElementById('ad-err');
    if (!document.getElementById('ad-agree').checked) {
      err.textContent = '請先勾選同意上述條款。'; err.style.display = 'block'; return;
    }
    err.style.display = 'none';
    const f = e.target;
    const full = f.amt.value === 'full';
    const paid = full ? t.price : Math.round(t.price / 2);
    const btn = f.querySelector('button');
    btn.disabled = true; btn.textContent = '處理中…';
    await new Promise(r => setTimeout(r, 900));

    const today = now().slice(0, 10);
    Store.addOrder({
      no: Store.nextOrderNo(today.slice(0, 4)), date: today,
      treeId: t.id, crop: t.crop,
      customer: me.org || me.name, email: me.email || '', phone: me.phone || '',
      amount: t.price, paid, channel: f.ch.value,
      status: full ? '已付全額' : '已付訂金', buyer: me.u,
    });
    Store.upsertTree({ id: t.id, status: 'adopted' });

    openModal(`<div class="cert">
        <div class="cert-top"><span class="cert-ico">${CROP_ICON[t.crop]}</span>
          <div><span class="cert-label">認養成立</span><b>${t.id}</b></div></div>
        <dl class="cert-rows">
          <div><dt>認養人</dt><dd>${esc(me.org || me.name)}</dd></div>
          <div><dt>果農</dt><dd>${esc(t.farmer)}</dd></div>
          <div><dt>本次支付</dt><dd><b>${money(paid)}</b></dd></div>
          <div><dt>認養期間</dt><dd>${today} 起 12 個月</dd></div>
        </dl>
        <p class="cert-sim">🧪 模擬交易 — 未發生實際扣款</p>
      </div>
      <button class="btn btn-gold" id="ad-done" style="border:none;cursor:pointer;width:100%;margin-top:14px">完成</button>`);
    document.getElementById('ad-done').addEventListener('click', () => { closeModal(); render('browse'); });
  });
}

/* ---------- 收購商：我的認養 / 樹況追蹤 ---------- */
const myOrders = () => Store.read().orders.filter(o => o.buyer === me.u);

function vMine(el) {
  const os = myOrders();
  const trees = allTrees();
  el.innerHTML = `
    ${kpis([
      ['我認養的樹', os.length + ' 棵', ''],
      ['已支付', money(os.reduce((s, o) => s + o.paid, 0)), ''],
      ['待付尾款', money(os.reduce((s, o) => s + (o.amount - o.paid), 0)), ''],
      ['預估收成', os.reduce((s, o) => s + (trees.find(t => t.id === o.treeId)?.kg || 0), 0) + ' kg', '本季合計'],
    ])}
    <h3 class="panel-h">我的認養 <small>My Adoptions</small></h3>
    ${os.length ? `<div class="tree-grid">${os.map(o => {
      const t = trees.find(x => x.id === o.treeId); if (!t) return '';
      return treeCard(t, `<button class="btn-claim" data-msg="${t.id}" style="flex:1 1 120px;width:auto">聯絡果農</button>`);
    }).join('')}</div>` : '<div class="no-result">你還沒有認養任何果樹。到「找果樹」挑一棵。</div>'}

    ${os.length ? `
    <h3 class="panel-h" style="margin-top:30px">你的錢去了哪裡 <small>Where Your Money Went</small></h3>
    <p class="dim" style="font-size:.95rem;margin-bottom:16px;max-width:70ch">
      這是我們和一般農產電商最大的差別 —— 你付的每一筆都攤開給你看，
      而且果農那份大部分在<b>開花前</b>就已經撥出去了。
    </p>
    ${table(['訂單', 'Tree ID', '果園', '我付的', `果農實拿 ${100 - Store.settingNum('commission_rate', 20)}%`, '其中開花前已撥'],
      os.map(o => {
        const sp = Store.split(o);
        const t  = trees.find(x => x.id === o.treeId) || {};
        return [
          `<b>${o.no}</b>`,
          `<span class="pill">${o.treeId}</span>`,
          t.orchard || '—',
          money(sp.amount),
          `<b>${money(sp.farmer)}</b>`,
          `<span class="badge-ok">${money(sp.paidOut)}</span>`,
        ];
      }))}` : ''}`;
  el.querySelectorAll('[data-msg]').forEach(b =>
    b.addEventListener('click', () => { render('msgs'); }));
}

function vTrack(el) {
  const ids = myOrders().map(o => o.treeId);
  const reports = Store.read().reports.filter(r => ids.includes(r.treeId));
  el.innerHTML = `
    <h3 class="panel-h">樹況追蹤 <small>溝通者現場回報</small></h3>
    ${ids.length ? table(['時間', 'Tree ID', '回報人', '生長階段', '樹況', '備註', '照片'],
      reports.map(r => [r.at, `<span class="pill">${r.treeId}</span>`, esc(r.by), r.stage,
        `<span class="badge-${r.health === '良好' ? 'ok' : 'wait'}">${r.health}</span>`,
        esc(r.note), r.photos + ' 張']))
      : '<div class="no-result">認養果樹後，這裡會顯示現場回報紀錄。</div>'}`;
}

/* ---------- 訊息 ---------- */
function vMessages(el) {
  const db = Store.read();
  const other = me.role === 'farmer' ? 'buyer' : 'farmer';
  const list = (db.messages || []).filter(m => m.from === me.u || m.to === me.u
    || m.from === other || m.to === other);

  el.innerHTML = `
    <h3 class="panel-h">訊息 <small>與${me.role === 'farmer' ? '認養人' : '果農'}聯繫</small></h3>
    <div class="card" style="margin-bottom:20px">
      <div class="chat" id="chat">${
        list.length ? list.map(m => `
          <div class="bubble ${m.from === me.u ? 'mine' : ''}">
            <span class="dim">${m.from === me.u ? '我' : esc(m.from)} · ${m.at} · <span class="pill">${m.treeId}</span></span>
            <p>${esc(m.text)}</p>
          </div>`).join('') : '<div class="no-result">還沒有訊息。</div>'
      }</div>
      <form id="msg-form" style="margin-top:16px">
        <div class="form-row">
          <div><label>關於哪棵樹</label>
            <select name="treeId">${allTrees().slice(0, 40).map(t =>
              `<option value="${t.id}">${t.id} · ${CROP_NAME[t.crop]}</option>`).join('')}</select></div>
          <div><label>傳給</label><input value="${other === 'buyer' ? '認養人' : '果農'}" disabled></div>
        </div>
        <div><label>訊息內容</label><textarea name="text" rows="2" required placeholder="輸入訊息…"></textarea></div>
        <button class="btn btn-gold" type="submit" style="border:none;cursor:pointer">送出訊息</button>
      </form>
    </div>`;

  document.getElementById('msg-form').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    Store.addMessage({ treeId: f.treeId.value, from: me.u, to: other, at: now(), text: f.text.value.trim() });
    vMessages(el);
  });
}

/* ---------- 管理員 ---------- */
