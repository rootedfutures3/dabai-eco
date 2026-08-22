/* ============================================================
   ⚙️ 表單設定 —— 要讓預購表單真的收到資料，改這一行就好
   ------------------------------------------------------------
   1. 到 https://formspree.io 用你的 Gmail 註冊（免費方案每月 50 筆）
   2. 建立一個新表單，它會給你一個像這樣的網址：
        https://formspree.io/f/xabcdefg
   3. 把那串網址整個貼進下面的引號裡，存檔後跑 ./deploy.sh

   留空的話，表單會誠實告訴訪客「登記尚未開放」，
   而不是假裝收到資料。
   ============================================================ */
const FORM_ENDPOINT = 'https://formspree.io/f/xdaqvvro';


// 進場動畫（漸進增強：JS 不可用時內容照常顯示）
document.documentElement.classList.add('js');

/**
 * 開頁時執行。
 *
 * 這裡刻意「不」直接用 Store.onReady —— 有一半的公開頁面（平台介紹、
 * 聯絡我們、認識三寶、果園列表、產品線、永續承諾）根本不需要資料庫，
 * 所以沒有載入 store.js。直接呼叫 Store.onReady 會拋 ReferenceError，
 * 整個 site.js 就停在那裡：進場動畫不會觸發，而 .js .reveal 的
 * opacity 是 0 —— 結果訪客看到的是一片空白。
 *
 * 有 Store 就等它把雲端資料載好再跑（樹卡需要），沒有就等 DOM 就緒。
 */
function ready(fn) {
  if (typeof Store !== 'undefined' && Store.onReady) return Store.onReady(fn);
  if (document.readyState === 'loading') return document.addEventListener('DOMContentLoaded', fn);

  /* 這裡不能直接 fn() ——
     site.js 是 defer 載入的，執行時 readyState 已經是 interactive，
     直接呼叫會在「這份檔案還沒跑完」的當下就執行回呼，
     而回呼裡用到的 const ORCHARDS 是在檔案後面才宣告的，
     於是踩到暫時性死區：Cannot access 'ORCHARDS' before initialization。
     排進微任務，等整份檔案評估完再跑。 */
  queueMicrotask(fn);
}

ready(() => {
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('on'); io.unobserve(e.target); }
    });
  }, { threshold: .1 });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));

  // 手機版選單
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => {
      const open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
  }

  document.querySelectorAll('form[data-preorder]').forEach(initPreorderForm);

  if (document.getElementById('grid')) initOrchards();
  if (document.getElementById('tree-grid')) initTrees();
});

function initPreorderForm(form) {
  const okBox  = document.querySelector(form.dataset.preorder);
  const errBox = document.querySelector(form.dataset.error);
  const button = form.querySelector('button[type="submit"]');
  const label  = button ? button.textContent : '';

  const showError = msg => {
    if (!errBox) return;
    errBox.textContent = msg;
    errBox.style.display = 'block';
  };

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (errBox) errBox.style.display = 'none';

    // 蜜罐欄位：真人看不到，機器人會填
    if (form.querySelector('[name="_gotcha"]')?.value) return;

    if (!FORM_ENDPOINT) {
      showError('預購登記系統尚未開放，我們正在準備中。請稍後再回來，或直接透過上方的合作管道與我們聯繫。');
      return;
    }

    if (button) { button.disabled = true; button.textContent = '送出中…'; }

    try {
      const res = await fetch(FORM_ENDPOINT, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' }
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.errors?.map(x => x.message).join('、') || `伺服器回應 ${res.status}`);
      }

      form.style.display = 'none';
      if (okBox) okBox.style.display = 'block';
      okBox?.scrollIntoView({ behavior: 'smooth', block: 'center' });

    } catch (err) {
      showError(`送出失敗：${err.message}。請稍後再試一次。`);
      if (button) { button.disabled = false; button.textContent = label; }
    }
  });
}


/* ============================================================
   果園列表（媒合平台）
   ------------------------------------------------------------
   ⚠️ 以下為示範資料（Demo Data），用於展示平台功能，
      非真實果農或果園資訊。正式上線後應改為從後端 API 取得
      經農務顧問查核的實際果園檔案。
   ============================================================ */
const ORCHARDS = [
  { id:'SBW-01', name:'Rumah Panjai 上游果園', area:'Sibu',    crop:'dabai',  variety:'在地原生種',      age:34, trees:120, yield:'2.4 噸', health:'A', status:'open',
    note:'河岸沖積土，老欉果肉油脂含量高，歷年是當地公認品質最好的一批。' , farmer:'Ak. Jelani 一家', farmYears:28, household:6, need:'希望有穩定買家，不必每年被中盤商殺價' },
  { id:'KPT-02', name:'Nanga Sepit 河谷果園',  area:'Kapit',   crop:'dabai',  variety:'在地原生種',      age:18, trees:260, yield:'4.1 噸', health:'A', status:'open',
    note:'盛產期樹群，樹勢整齊、產量穩定，適合需要規格一致的加工廠。' , farmer:'Lim 氏果園（第二代）', farmYears:15, household:4, need:'想擴大種植，但需要資金與技術指導' },
  { id:'KNW-03', name:'Kanowit 坡地果園',      area:'Kanowit', crop:'durian', variety:'貓山王 Musang King', age:12, trees:85,  yield:'1.8 噸', health:'B', status:'open',
    note:'排水良好的緩坡地，去年開始進入穩定產期，需補強施肥管理。' , farmer:'Nyawai 家族', farmYears:9, household:5, need:'首次嘗試商業化經營，需要施肥與病蟲害輔導' },
  { id:'SRK-04', name:'Sarikei 老欉園',        area:'Sarikei', crop:'dabai',  variety:'在地原生種',      age:41, trees:75,  yield:'1.3 噸', health:'B', status:'talking',
    note:'四十年以上老樹，果實風味濃郁，但部分樹勢衰退，顧問建議修枝更新。' , farmer:'Tan 老先生', farmYears:41, household:3, need:'年事已高，希望有人接手管理老欉' },
  { id:'BTG-05', name:'Betong 平原果園',       area:'Betong',  crop:'durian', variety:'D24',             age:22, trees:140, yield:'3.2 噸', health:'A', status:'open',
    note:'管理紀錄完整，連續三年產量穩定，已建立完整產銷履歷可供出口稽核。' , farmer:'Rumah Ugap 合作社', farmYears:22, household:12, need:'已有管理紀錄，尋求長期契作夥伴' },
  { id:'SRN-06', name:'Serian 混作果園',       area:'Serian',  crop:'dabai',  variety:'在地原生種',      age:9,  trees:310, yield:'1.1 噸', health:'A', status:'open',
    note:'新植幼齡樹群，尚未進入盛產期，適合契作包銷、長期鎖定未來產量。' , farmer:'Anak Bunsu', farmYears:6, household:4, need:'新植果園，想在盛產前先鎖定買家' },
  { id:'SNG-07', name:'Song 支流果園',         area:'Song',    crop:'dabai',  variety:'在地原生種',      age:27, trees:190, yield:'3.5 噸', health:'B', status:'open',
    note:'交通需經水路，運輸成本略高，但果實品質佳、收購價具競爭力。' , farmer:'Empaling 一家', farmYears:27, household:7, need:'水路運輸成本高，需要共同分攤物流的夥伴' },
  { id:'JLU-08', name:'Julau 山腰果園',        area:'Julau',   crop:'durian', variety:'紅蝦 Udang Merah', age:16, trees:95,  yield:'2.0 噸', health:'C', status:'open',
    note:'去年受病蟲害影響產量下滑，顧問已介入輔導，適合願意共同改善的長期夥伴。' , farmer:'Chan 氏兄弟', farmYears:16, household:5, need:'去年病蟲害損失慘重，需要顧問長期協助' },
  { id:'MRD-09', name:'Meradong 家族果園',     area:'Meradong',crop:'dabai',  variety:'在地原生種',      age:31, trees:150, yield:'2.8 噸', health:'A', status:'taken',
    note:'本季已由加工廠整片認養，明年度開放續約前的優先洽談。' , farmer:'Rumah Belaja 長屋', farmYears:31, household:15, need:'本季已認養，明年續約前優先洽談' },
  { id:'BTU-10', name:'Bintulu 沿海果園',      area:'Bintulu', crop:'durian', variety:'黑刺 Black Thorn', age:14, trees:70,  yield:'1.5 噸', health:'B', status:'talking',
    note:'鄰近港口，出口物流便利，目前與兩家出口商洽談中。' , farmer:'Ngu 家果園', farmYears:14, household:4, need:'鄰近港口，想拓展出口通路' },
  { id:'KPT-11', name:'Kapit 高地老欉',        area:'Kapit',   crop:'dabai',  variety:'在地原生種',      age:38, trees:60,  yield:'1.0 噸', health:'B', status:'open',
    note:'產量不大但風味突出，適合小量高價的精品加工或禮盒客戶。' , farmer:'Bujang 老欉園', farmYears:38, household:2, need:'產量不大，想找重視風味的精品買家' },
  { id:'SBW-12', name:'Sibu 近郊示範園',       area:'Sibu',    crop:'durian', variety:'D101',            age:7,  trees:200, yield:'0.9 噸', health:'A', status:'open',
    note:'平台輔導的標準化示範果園，全程導入顧問農法，資料最完整。' , farmer:'平台示範園（契作）', farmYears:7, household:8, need:'全程導入顧問農法，作為標準化示範' },
];

/* 作物圖示：Unicode 沒有榴槤 emoji（🥭 是芒果），
   且 emoji 自帶的鮮豔色彩與品牌色票衝突，故改用自繪 SVG。 */
const CROP_ICON = {
  dabai: `<svg viewBox="0 0 40 40" width="34" height="34" aria-hidden="true">
    <ellipse cx="20" cy="24" rx="11" ry="14" fill="currentColor" opacity=".9"/>
    <ellipse cx="16" cy="18" rx="3" ry="4.5" fill="#FFFBFF" opacity=".35"/>
    <path d="M20 11c0-4 2-7 5-8-1 4-2 6-5 8z" fill="currentColor" opacity=".65"/>
  </svg>`,
  durian: `<svg viewBox="0 0 40 40" width="34" height="34" aria-hidden="true">
    <circle cx="20" cy="22" r="12.5" fill="currentColor" opacity=".9"/>
    <g fill="#FFFBFF" opacity=".45">
      <path d="M20 6.5l2.2 4.2h-4.4z"/><path d="M33.5 20.5l-4.2 2.2v-4.4z"/>
      <path d="M6.5 22.5l4.2-2.2v4.4z"/><path d="M20 37.5l-2.2-4.2h4.4z"/>
      <path d="M29.6 12.4l-1.3 4.5-3.1-3.1z"/><path d="M10.4 32.6l1.3-4.5 3.1 3.1z"/>
      <path d="M29.6 32.6l-4.5-1.3 3.1-3.1z"/><path d="M10.4 12.4l4.5 1.3-3.1 3.1z"/>
    </g>
    <path d="M20 9.5V4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" opacity=".7"/>
  </svg>`,
  rambutan: `<svg viewBox="0 0 40 40" width="34" height="34" aria-hidden="true">
    <g stroke="currentColor" stroke-width="1.7" stroke-linecap="round" opacity=".75">
      <path d="M20 21l-1 -12M20 21l7 -10M20 21l11 -6M20 21l12 3M20 21l9 9
               M20 21l1 12M20 21l-7 10M20 21l-11 6M20 21l-12 -3M20 21l-9 -9"/>
    </g>
    <ellipse cx="20" cy="21" rx="10.5" ry="9.5" fill="currentColor" opacity=".92"/>
    <ellipse cx="16.5" cy="17.5" rx="2.8" ry="2.2" fill="#FFFBFF" opacity=".35"/>
  </svg>`,
};
const CROP_NAME = { dabai:'Dabai 黑橄欖', durian:'榴槤', rambutan:'紅毛丹' };

const STATUS_TEXT  = { open:'可認養', talking:'洽談中', taken:'已認養' };
const STATUS_CLASS = { open:'st-open', talking:'st-talking', taken:'st-taken' };
const HEALTH_TEXT  = { A:'A · 樹況良好', B:'B · 需部分改善', C:'C · 顧問輔導中' };

function ageBand(age) {
  if (age < 10) return 'young';
  if (age <= 30) return 'prime';
  return 'old';
}

function initOrchards() {
  const grid   = document.getElementById('grid');
  const count  = document.getElementById('count');
  const fCrop  = document.getElementById('f-crop');
  const fArea  = document.getElementById('f-area');
  const fAge   = document.getElementById('f-age');
  const fStat  = document.getElementById('f-status');
  const fReset = document.getElementById('f-reset');

  // 地區選項由資料自動產生，避免資料與選單不同步
  [...new Set(ORCHARDS.map(o => o.area))].sort().forEach(area => {
    fArea.insertAdjacentHTML('beforeend', `<option value="${area}">${area}</option>`);
  });

  const render = () => {
    const list = ORCHARDS.filter(o =>
      (!fCrop.value || o.crop === fCrop.value) &&
      (!fArea.value || o.area === fArea.value) &&
      (!fAge.value  || ageBand(o.age) === fAge.value) &&
      (!fStat.value || o.status === fStat.value)
    );

    count.innerHTML = `符合條件的果園：<b>${list.length}</b> 座　（共 ${ORCHARDS.length} 座）`;

    if (!list.length) {
      grid.innerHTML = `<div class="no-result">
        找不到符合條件的果園。<br>試著放寬篩選條件，或
        <a href="contact.html" style="color:var(--gold);text-decoration:underline">直接告訴我們你的需求</a>。
      </div>`;
      return;
    }

    grid.innerHTML = list.map(o => `
      <article class="orchard">
        <div class="orchard-top ${o.crop}">
          <div>
            <h3>${o.name}</h3>
            <div class="loc">${o.area}, Sarawak · ${o.id}</div>
          </div>
          <span class="crop" title="${CROP_NAME[o.crop]}">${CROP_ICON[o.crop]}</span>
          <span class="status ${STATUS_CLASS[o.status]}">${STATUS_TEXT[o.status]}</span>
        </div>
        <div class="orchard-body">
          <dl class="spec">
            <div><dt>作物品種</dt><dd>${o.variety}</dd></div>
            <div><dt>平均樹齡</dt><dd>${o.age} 年</dd></div>
            <div><dt>果樹數量</dt><dd>${o.trees} 棵</dd></div>
            <div><dt>年均產量</dt><dd>${o.yield}</dd></div>
          </dl>
          <span class="health h-${o.health.toLowerCase()}">顧問評級 ${HEALTH_TEXT[o.health]}</span>

          <div class="farmer">
            <div class="farmer-head">
              <span class="farmer-avatar" aria-hidden="true">${o.farmer.slice(0,1)}</span>
              <div>
                <b>${o.farmer}</b>
                <span class="farmer-meta">務農 ${o.farmYears} 年 · 家戶 ${o.household} 人</span>
              </div>
            </div>
            <p class="farmer-need">「${o.need}」</p>
          </div>

          <p class="orchard-note">${o.note}</p>
          <button class="btn-claim" data-claim="${o.id}" ${o.status === 'taken' ? 'disabled' : ''}>
            ${o.status === 'taken' ? '本季已認養' : '登記認養意向'}
          </button>
        </div>
      </article>
    `).join('');
  };

  [fCrop, fArea, fAge, fStat].forEach(el => el.addEventListener('change', render));
  fReset.addEventListener('click', () => {
    [fCrop, fArea, fAge, fStat].forEach(el => el.value = '');
    render();
  });

  render();
  initClaimModal(grid);
}

function initClaimModal(grid) {
  const modal   = document.getElementById('claim-modal');
  const target  = document.getElementById('claim-target');
  const hidden  = document.getElementById('claim-orchard');
  const closeEl = document.getElementById('claim-close');
  if (!modal) return;

  const close = () => {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  };

  grid.addEventListener('click', e => {
    const btn = e.target.closest('[data-claim]');
    if (!btn || btn.disabled) return;

    const o = ORCHARDS.find(x => x.id === btn.dataset.claim);
    if (!o) return;

    target.innerHTML = `
      <b>${o.name}（${o.id}）</b>
      ${o.area}, Sarawak · ${CROP_NAME[o.crop]} ${o.variety}<br>
      樹齡 ${o.age} 年 · ${o.trees} 棵 · 年均產量 ${o.yield} · 顧問評級 ${o.health}<br>
      果農：${o.farmer}（務農 ${o.farmYears} 年）
    `;
    hidden.value = `${o.name}（${o.id}）`;

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    modal.querySelector('input[name="name"]').focus();
  });

  closeEl.addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.classList.contains('open')) close();
  });
}


/* ============================================================
   單株果樹資產（Tree ID）—— B2C 包樹認養
   ------------------------------------------------------------
   ⚠️ 示範資料（Demo Data）。Phase 1 MVP 先放 36 棵示範樹。
      正式營運時此陣列應改為由 ERP 後端提供，
      Tree ID 為資產綁定的唯一鍵（DB=Dabai / DR=榴槤 / RB=紅毛丹）。
   欄位：[樹號, 作物, 品種, 樹齡, 果園, 地區, 果農, 預估年產量kg, 年認養金RM, 狀態]
   ============================================================ */
const TREE_ROWS = [
  ['DB-001','dabai','在地原生種',34,'Rumah Panjai 上游果園','Sibu','Ak. Jelani 一家',85,420,'available'],
  ['DB-002','dabai','在地原生種',34,'Rumah Panjai 上游果園','Sibu','Ak. Jelani 一家',78,400,'adopted'],
  ['DB-003','dabai','在地原生種',31,'Rumah Panjai 上游果園','Sibu','Ak. Jelani 一家',72,390,'available'],
  ['DB-004','dabai','在地原生種',18,'Nanga Sepit 河谷果園','Kapit','Lim 氏果園（第二代）',64,350,'available'],
  ['DB-005','dabai','在地原生種',18,'Nanga Sepit 河谷果園','Kapit','Lim 氏果園（第二代）',61,350,'available'],
  ['DB-006','dabai','在地原生種',17,'Nanga Sepit 河谷果園','Kapit','Lim 氏果園（第二代）',58,340,'reserved'],
  ['DB-007','dabai','在地原生種',41,'Sarikei 老欉園','Sarikei','Tan 老先生',92,460,'available'],
  ['DB-008','dabai','在地原生種',41,'Sarikei 老欉園','Sarikei','Tan 老先生',88,450,'adopted'],
  ['DB-009','dabai','在地原生種',27,'Song 支流果園','Song','Empaling 一家',70,380,'available'],
  ['DB-010','dabai','在地原生種',27,'Song 支流果園','Song','Empaling 一家',66,370,'available'],
  ['DB-011','dabai','在地原生種',38,'Kapit 高地老欉','Kapit','Bujang 老欉園',80,440,'available'],
  ['DB-012','dabai','在地原生種',9,'Serian 混作果園','Serian','Anak Bunsu',32,260,'available'],
  ['DB-013','dabai','在地原生種',9,'Serian 混作果園','Serian','Anak Bunsu',30,260,'available'],
  ['DB-014','dabai','在地原生種',31,'Meradong 家族果園','Meradong','Rumah Belaja 長屋',75,410,'adopted'],

  ['DR-001','durian','貓山王 Musang King',12,'Kanowit 坡地果園','Kanowit','Nyawai 家族',48,1200,'available'],
  ['DR-002','durian','貓山王 Musang King',12,'Kanowit 坡地果園','Kanowit','Nyawai 家族',45,1180,'adopted'],
  ['DR-003','durian','貓山王 Musang King',11,'Kanowit 坡地果園','Kanowit','Nyawai 家族',42,1150,'available'],
  ['DR-004','durian','D24',22,'Betong 平原果園','Betong','Rumah Ugap 合作社',66,820,'available'],
  ['DR-005','durian','D24',22,'Betong 平原果園','Betong','Rumah Ugap 合作社',63,810,'available'],
  ['DR-006','durian','D24',21,'Betong 平原果園','Betong','Rumah Ugap 合作社',60,800,'reserved'],
  ['DR-007','durian','紅蝦 Udang Merah',16,'Julau 山腰果園','Julau','Chan 氏兄弟',38,760,'available'],
  ['DR-008','durian','紅蝦 Udang Merah',16,'Julau 山腰果園','Julau','Chan 氏兄弟',35,750,'available'],
  ['DR-009','durian','黑刺 Black Thorn',14,'Bintulu 沿海果園','Bintulu','Ngu 家果園',40,980,'available'],
  ['DR-010','durian','黑刺 Black Thorn',14,'Bintulu 沿海果園','Bintulu','Ngu 家果園',37,960,'adopted'],
  ['DR-011','durian','D101',7,'Sibu 近郊示範園','Sibu','平台示範園（契作）',22,600,'available'],
  ['DR-012','durian','D101',7,'Sibu 近郊示範園','Sibu','平台示範園（契作）',20,600,'available'],

  ['RB-001','rambutan','R156 黃金紅毛丹',15,'Serian 混作果園','Serian','Anak Bunsu',110,240,'available'],
  ['RB-002','rambutan','R156 黃金紅毛丹',15,'Serian 混作果園','Serian','Anak Bunsu',105,240,'available'],
  ['RB-003','rambutan','R156 黃金紅毛丹',14,'Serian 混作果園','Serian','Anak Bunsu',98,230,'adopted'],
  ['RB-004','rambutan','R191 甜紅毛丹',19,'Sarikei 老欉園','Sarikei','Tan 老先生',125,260,'available'],
  ['RB-005','rambutan','R191 甜紅毛丹',19,'Sarikei 老欉園','Sarikei','Tan 老先生',120,260,'available'],
  ['RB-006','rambutan','R191 甜紅毛丹',18,'Sarikei 老欉園','Sarikei','Tan 老先生',115,250,'reserved'],
  ['RB-007','rambutan','在地原生種',26,'Song 支流果園','Song','Empaling 一家',140,270,'available'],
  ['RB-008','rambutan','在地原生種',26,'Song 支流果園','Song','Empaling 一家',132,270,'available'],
  ['RB-009','rambutan','在地原生種',8,'Sibu 近郊示範園','Sibu','平台示範園（契作）',55,190,'available'],
  ['RB-010','rambutan','在地原生種',8,'Sibu 近郊示範園','Sibu','平台示範園（契作）',52,190,'available'],
];

const TREES = TREE_ROWS.map(([id,crop,variety,age,orchard,area,farmer,kg,price,status]) =>
  ({id,crop,variety,age,orchard,area,farmer,kg,price,status}));

const TREE_STATUS = {
  available:{t:'開放認養', c:'st-open'},
  reserved :{t:'保留中',   c:'st-talking'},
  adopted  :{t:'已認養',   c:'st-taken'},
};

function initTrees() {
  const grid  = document.getElementById('tree-grid');
  const count = document.getElementById('tree-count');
  const fCrop = document.getElementById('t-crop');
  const fArea = document.getElementById('t-area');
  const fPrice= document.getElementById('t-price');
  const fStat = document.getElementById('t-status');
  const reset = document.getElementById('t-reset');

  [...new Set(TREES.map(t => t.area))].sort().forEach(a =>
    fArea.insertAdjacentHTML('beforeend', `<option value="${a}">${a}</option>`));

  const inBand = (p, b) =>
    !b || (b === 'low' ? p < 400 : b === 'mid' ? p >= 400 && p < 800 : p >= 800);

  const render = () => {
    const list = TREES.filter(t =>
      (!fCrop.value || t.crop === fCrop.value) &&
      (!fArea.value || t.area === fArea.value) &&
      inBand(t.price, fPrice.value) &&
      (!fStat.value || t.status === fStat.value));

    const open = list.filter(t => t.status === 'available').length;
    count.innerHTML = `符合條件：<b>${list.length}</b> 棵　·　其中 <b>${open}</b> 棵開放認養　（示範樹共 ${TREES.length} 棵）`;

    if (!list.length) {
      grid.innerHTML = `<div class="no-result">找不到符合條件的果樹。試著放寬條件，或
        <a href="contact.html" style="color:var(--accent);text-decoration:underline">告訴我們你想認養什麼</a>。</div>`;
      return;
    }

    grid.innerHTML = list.map(t => `
      <article class="tree">
        <div class="tree-photo ${t.crop}">
          <span class="tree-ico">${CROP_ICON[t.crop]}</span>
          <span class="tree-id">${t.id}</span>
          <span class="status ${TREE_STATUS[t.status].c}">${TREE_STATUS[t.status].t}</span>
        </div>
        <div class="tree-body">
          <h3>${CROP_NAME[t.crop]}<span class="tree-variety">${t.variety}</span></h3>
          <dl class="spec">
            <div><dt>樹齡</dt><dd>${t.age} 年</dd></div>
            <div><dt>預估年產量</dt><dd>${t.kg} kg</dd></div>
          </dl>
          <p class="tree-where">📍 ${t.orchard}<br>${t.area}, Sarawak · 果農：${t.farmer}</p>
          <div class="tree-foot">
            <div class="tree-price"><b>RM ${t.price}</b><span>／年</span></div>
            <button class="btn-claim" data-tree="${t.id}" ${t.status !== 'available' ? 'disabled' : ''}>
              ${t.status === 'available' ? '認養這棵' : TREE_STATUS[t.status].t}
            </button>
          </div>
        </div>
      </article>`).join('');
  };

  [fCrop, fArea, fPrice, fStat].forEach(el => el.addEventListener('change', render));
  reset.addEventListener('click', () => {
    [fCrop, fArea, fPrice, fStat].forEach(el => el.value = '');
    render();
  });

  render();
  initTreeModal(grid);
}

function initTreeModal(grid) {
  const modal  = document.getElementById('tree-modal');
  if (!modal) return;
  const target = document.getElementById('tree-target');
  const hidden = document.getElementById('tree-hidden');
  const form   = document.getElementById('tree-form');
  const agree  = document.getElementById('agree');
  const errBox = document.getElementById('tree-err');
  const payBtn = document.getElementById('pay-btn');
  let current  = null;   // 目前選中的樹

  const panes = [...modal.querySelectorAll('[data-pane]')];
  const steps = [...modal.querySelectorAll('.step')];
  const goStep = n => {
    panes.forEach(p => p.classList.toggle('on', p.dataset.pane === String(n)));
    steps.forEach(p => p.classList.toggle('on', Number(p.dataset.step) <= n));
  };

  const close = () => { modal.classList.remove('open'); document.body.style.overflow = ''; };

  /* ---- 開啟：從樹卡帶入資料 ---- */
  grid.addEventListener('click', e => {
    const btn = e.target.closest('[data-tree]');
    if (!btn || btn.disabled) return;
    const t = TREES.find(x => x.id === btn.dataset.tree);
    if (!t) return;
    current = t;

    target.innerHTML = `
      <b>${t.id} · ${CROP_NAME[t.crop]}（${t.variety}）</b>
      樹齡 ${t.age} 年 · 預估年產量 ${t.kg} kg<br>
      ${t.orchard}，${t.area} · 果農：${t.farmer}<br>
      <span class="modal-price">年認養金 RM ${t.price}</span>`;
    hidden.value = `${t.id}｜${CROP_NAME[t.crop]} ${t.variety}｜RM ${t.price}/年`;
    document.getElementById('amt-deposit').textContent = `RM ${Math.round(t.price / 2)}`;
    document.getElementById('amt-full').textContent    = `RM ${t.price}`;

    form.reset(); agree.checked = false;
    errBox.style.display = 'none';
    form.style.display = 'grid';
    goStep(1);
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    form.querySelector('input[name="name"]').focus();
  });

  /* ---- 步驟 1 → 2：驗證合約勾選 ---- */
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (form.querySelector('[name="_gotcha"]').value) return;
    if (!agree.checked) {
      errBox.textContent = '請先閱讀並勾選同意認養合約要點，才能繼續。';
      errBox.style.display = 'block';
      agree.focus();
      return;
    }
    errBox.style.display = 'none';
    goStep(2);
    modal.scrollTop = 0;
  });

  document.getElementById('pay-back').addEventListener('click', () => goStep(1));

  /* ---- 步驟 2 → 3：模擬付款 ---- */
  payBtn.addEventListener('click', async () => {
    if (!current) return;
    const amtMode = modal.querySelector('input[name="payamt"]:checked').value;
    const channel = modal.querySelector('input[name="paych"]:checked').value;
    const paid    = amtMode === 'full' ? current.price : Math.round(current.price / 2);

    payBtn.disabled = true;
    payBtn.textContent = '模擬付款處理中…';
    await new Promise(r => setTimeout(r, 1100));   // 模擬金流往返

    const fd    = new FormData(form);
    const today = new Date().toISOString().slice(0, 10);
    const order = {
      no: Store.nextOrderNo(today.slice(0, 4)),
      date: today,
      treeId: current.id,
      crop: current.crop,
      customer: fd.get('name'),
      email: fd.get('email'),
      phone: fd.get('phone'),
      amount: current.price,
      paid,
      channel,
      status: amtMode === 'full' ? '已付全額' : '已付訂金',
    };
    Store.addOrder(order);

    // 讓列表即時反映（僅本次瀏覽，重整後回到示範狀態）
    current.status = 'adopted';

    document.getElementById('cert').innerHTML = `
      <div class="cert-top">
        <span class="cert-ico">${CROP_ICON[current.crop]}</span>
        <div>
          <span class="cert-label">認養證書 · Adoption Certificate</span>
          <b>${current.id}</b>
        </div>
      </div>
      <dl class="cert-rows">
        <div><dt>認養人</dt><dd>${order.customer}</dd></div>
        <div><dt>果樹</dt><dd>${CROP_NAME[current.crop]}　${current.variety}</dd></div>
        <div><dt>果園</dt><dd>${current.orchard}，${current.area}</dd></div>
        <div><dt>果農</dt><dd>${current.farmer}</dd></div>
        <div><dt>認養期間</dt><dd>${today} 起 12 個月</dd></div>
        <div><dt>訂單編號</dt><dd>${order.no}</dd></div>
        <div><dt>付款方式</dt><dd>${channel}</dd></div>
        <div><dt>本次支付</dt><dd><b>RM ${paid}</b>${amtMode === 'full' ? '（全額）' : ` / RM ${current.price}（訂金）`}</dd></div>
      </dl>
      <p class="cert-sim">🧪 模擬交易 — 未發生任何實際扣款</p>`;

    payBtn.disabled = false;
    payBtn.textContent = '模擬付款';
    goStep(3);
    modal.scrollTop = 0;
  });

  document.getElementById('cert-done').addEventListener('click', () => { close(); initTrees(); });

  document.getElementById('tree-close').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.classList.contains('open')) close();
  });
}
