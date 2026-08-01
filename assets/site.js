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

document.addEventListener('DOMContentLoaded', () => {
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
};
const CROP_NAME = { dabai:'Dabai 黑橄欖', durian:'榴槤' };

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
