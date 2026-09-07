/* ============================================================
   單據：發票與認養合約
   ------------------------------------------------------------
   兩份都是從資料庫現有的資料直接長出來的，不另外存一份 ——
   單據要跟訂單、樹況一致，多存一份就有對不上的風險。

   編號規則刻意跟來源綁死：
     訂單 RF-2026-0007 → 發票 INV-2026-0007
     樹   DB-014       → 合約 AGR-DB-014
   這樣拿到任何一張紙都知道要回系統裡查哪一筆，不必再開一張對照表。
   ============================================================ */

const ORG = {
  name:  'ROOTED FUTURES 根築新局',
  sub:   'Social Enterprise · Song, Sarawak, Malaysia',
  email: 'hello@rootedfutures.example',
};

/** 單據上的金額格式，跟後台表格一致：兩位小數 + 千分位。 */
const dmoney = n => 'RM ' + Number(n || 0).toLocaleString('en-MY',
  { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dEsc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** yyyy-mm-dd 加上天數，回傳同樣格式。 */
function addDays(dateStr, days) {
  const d = new Date(dateStr);
  if (isNaN(d)) return '—';
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * 把一份單據開起來。整份文件放在 #doc-sheet 裡，
 * 列印時 CSS 只讓這個容器可見，所以印出來不會有側邊欄和按鈕。
 */
function openDoc(inner) {
  document.querySelector('.doc-back')?.remove();

  const back = document.createElement('div');
  back.className = 'doc-back';
  back.innerHTML = `
    <div class="doc-wrap">
      <div class="doc-bar">
        <button class="btn btn-outline" data-doc-close type="button">關閉</button>
        <button class="btn btn-gold" data-doc-print type="button">列印 / 存成 PDF</button>
      </div>
      <div class="doc-sheet" id="doc-sheet">${inner}</div>
    </div>`;
  document.body.appendChild(back);

  const close = () => back.remove();
  back.querySelector('[data-doc-close]').addEventListener('click', close);
  back.querySelector('[data-doc-print]').addEventListener('click', () => window.print());
  back.addEventListener('click', e => { if (e.target === back) close(); });
  document.addEventListener('keydown', function esc2(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc2); }
  });
}

/** 單據共用的抬頭。 */
const docHead = (title, en, no, meta) => `
  <div class="doc-head">
    <div class="doc-org">
      <b>${ORG.name}</b>
      <span>${ORG.sub}</span>
      <span>${ORG.email}</span>
    </div>
    <div class="doc-id">
      <b>${title}</b>
      <span class="doc-en">${en}</span>
      <span class="doc-no">${no}</span>
    </div>
  </div>
  <div class="doc-meta">
    ${meta.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}
  </div>`;

/* ============================================================
   發票
   ============================================================ */

/**
 * 一筆認養訂單的發票。
 * SST 稅率放在設定裡，預設 0 —— 沒有註冊稅籍就不該憑空印一行稅額出來。
 * 之後真的登記了，到「佣金分潤」把稅率填進去，這裡自動會多一列。
 */
function invoiceFor(orderNo) {
  const db = Store.read();
  const o  = (db.orders || []).find(x => x.no === orderNo);
  if (!o) return;

  const tree = Store.treeList().find(t => t.id === o.treeId) || {};
  const sst  = Store.settingNum('sst_rate', 0);
  const rate = Store.settingNum('commission_rate', 20);

  const sub     = Number(o.amount) || 0;
  const tax     = sub * sst / 100;
  const total   = sub + tax;
  const balance = total - (Number(o.paid) || 0);

  const invNo = 'INV-' + orderNo.replace(/^RF-/, '');
  const due   = addDays(o.date, 14);

  const item = `Dabai 果樹認養 · ${dEsc(o.treeId)}`
    + (tree.orchard ? `<br><span class="doc-dim">${dEsc(tree.orchard)}${tree.area ? ' · ' + dEsc(tree.area) : ''}`
        + `${tree.farmer ? ' · 果農 ' + dEsc(tree.farmer) : ''}</span>` : '');

  openDoc(`
    ${docHead('發票', 'INVOICE', invNo, [
      ['開立日期', dEsc(o.date)],
      ['付款到期', dEsc(due)],
      ['來源訂單', dEsc(o.no)],
    ])}

    <div class="doc-parties">
      <div>
        <span class="doc-lab">賣方 From</span>
        <b>${ORG.name}</b>
        <span>${ORG.sub}</span>
      </div>
      <div>
        <span class="doc-lab">買方 Bill to</span>
        <b>${dEsc(o.customer)}</b>
        <span>${dEsc(o.email || '')}</span>
        <span>${dEsc(o.phone || '')}</span>
      </div>
    </div>

    <table class="doc-table">
      <thead><tr>
        <th>品項 Description</th>
        <th class="num">數量</th>
        <th class="num">單價</th>
        <th class="num">小計</th>
      </tr></thead>
      <tbody><tr>
        <td>${item}</td>
        <td class="num">1 年</td>
        <td class="num">${dmoney(sub)}</td>
        <td class="num">${dmoney(sub)}</td>
      </tr></tbody>
    </table>

    <div class="doc-sum">
      <div><span>小計 Subtotal</span><b>${dmoney(sub)}</b></div>
      ${sst ? `<div><span>SST ${sst}%</span><b>${dmoney(tax)}</b></div>` : ''}
      <div class="doc-total"><span>應付總額 Total</span><b>${dmoney(total)}</b></div>
      <div><span>已收 Paid</span><b>${dmoney(o.paid)}</b></div>
      <div class="doc-due"><span>應付餘額 Balance due</span><b>${dmoney(balance)}</b></div>
    </div>

    <div class="doc-note">
      <p><b>付款方式：</b>${dEsc(o.channel || '—')}</p>
      <p><b>這筆錢怎麼分：</b>認養金的 ${100 - rate}% 撥付果農，${rate}% 為平台服務費。
         果農那份再拆成開花前訂金與採收後尾款，每一筆撥款在系統裡都留有紀錄。</p>
      ${sst ? '' : '<p class="doc-dim">本單未計 SST。稅率可於後台「佣金分潤」設定。</p>'}
    </div>
  `);
}

/* ============================================================
   認養合約（範本）
   ============================================================ */

/**
 * 一棵樹的認養合約範本。
 * 這是**範本**，不是律師擬的定稿 —— 條款是依平台實際運作方式寫的，
 * 正式對外簽署前請找法律專業看過。單據上也印了同一句話。
 */
function contractFor(treeId) {
  const db   = Store.read();
  const tree = Store.treeList().find(t => t.id === treeId);
  if (!tree) return;

  const order = (db.orders || []).find(o => o.treeId === treeId);
  const rate  = Store.settingNum('commission_rate', 20);
  const dep   = Store.settingNum('deposit_share', 55);
  const fee   = Number(order?.amount ?? tree.price) || 0;

  const farmerCut  = fee * (100 - rate) / 100;
  const platformCut = fee * rate / 100;
  const depositAmt = fee * dep / 100;
  const balanceAmt = farmerCut - depositAmt;

  const today = new Date().toISOString().slice(0, 10);

  openDoc(`
    ${docHead('果樹認養合約', 'TREE ADOPTION AGREEMENT', 'AGR-' + dEsc(treeId), [
      ['擬定日期', today],
      ['合約期間', '簽署日起 1 年'],
      ['對應訂單', order ? dEsc(order.no) : '尚未成立'],
    ])}

    <div class="doc-parties doc-three">
      <div>
        <span class="doc-lab">甲方 · 平台</span>
        <b>${ORG.name}</b>
        <span>${ORG.sub}</span>
      </div>
      <div>
        <span class="doc-lab">乙方 · 認養人</span>
        <b>${order ? dEsc(order.customer) : '＿＿＿＿＿＿＿＿'}</b>
        <span>${order ? dEsc(order.email || '') : '聯絡方式＿＿＿＿＿＿'}</span>
      </div>
      <div>
        <span class="doc-lab">丙方 · 果農</span>
        <b>${dEsc(tree.farmer || '＿＿＿＿＿＿')}</b>
        <span>${dEsc(tree.orchard || '')}${tree.area ? ' · ' + dEsc(tree.area) : ''}</span>
      </div>
    </div>

    <h4 class="doc-h">一、認養標的</h4>
    <table class="doc-table">
      <tbody>
        <tr><td>樹體編號 Tree ID</td><td><b>${dEsc(tree.id)}</b></td></tr>
        <tr><td>品種</td><td>${dEsc(tree.variety || '—')}</td></tr>
        <tr><td>樹齡</td><td>${dEsc(tree.age ?? '—')} 年</td></tr>
        <tr><td>所在果園</td><td>${dEsc(tree.orchard || '—')}${tree.area ? ' · ' + dEsc(tree.area) : ''}</td></tr>
        <tr><td>預估年產量</td><td>${dEsc(tree.kg ?? '—')} kg（依樹齡與歷年紀錄推算，非保證產量）</td></tr>
      </tbody>
    </table>

    <h4 class="doc-h">二、認養金與分配</h4>
    <table class="doc-table">
      <thead><tr><th>項目</th><th class="num">比例</th><th class="num">金額</th></tr></thead>
      <tbody>
        <tr><td>認養金總額</td><td class="num">100%</td><td class="num"><b>${dmoney(fee)}</b></td></tr>
        <tr><td>丙方（果農）應得</td><td class="num">${100 - rate}%</td><td class="num">${dmoney(farmerCut)}</td></tr>
        <tr><td class="doc-ind">— 開花前先撥</td><td class="num">${dep}%</td><td class="num">${dmoney(depositAmt)}</td></tr>
        <tr><td class="doc-ind">— 採收後結清</td><td class="num">${(100 - rate - dep).toFixed(0)}%</td><td class="num">${dmoney(balanceAmt)}</td></tr>
        <tr><td>甲方（平台）服務費</td><td class="num">${rate}%</td><td class="num">${dmoney(platformCut)}</td></tr>
      </tbody>
    </table>

    <h4 class="doc-h">三、三方權利義務</h4>
    <ol class="doc-list">
      <li><b>丙方（果農）</b>依既有農法照顧本樹，配合溝通者現場查看，並於採收後交付本樹產出。</li>
      <li><b>甲方（平台）</b>安排顧問提供栽培建議、指派溝通者定期回報樹況與照片、依第二條時程撥款，
          並將每一筆紀錄留存於系統供乙方查閱。</li>
      <li><b>乙方（認養人）</b>於本合約成立時支付認養金，得取得本樹當期產出及完整生產履歷。</li>
      <li>本樹之所有權仍屬丙方，認養係取得當期收成之權利，不涉及土地或樹體所有權移轉。</li>
    </ol>

    <h4 class="doc-h">四、歉收與不可抗力</h4>
    <ol class="doc-list">
      <li>Dabai 為季節性作物，產量受氣候影響。預估產量為推算值，<b>非保證產量</b>。</li>
      <li>因天候、病蟲害等不可歸責於丙方之事由導致歉收時，已撥付之開花前訂金不予追回；
          採收後尾款依實際產出比例結算。</li>
      <li>本樹於合約期間內死亡且非因丙方疏於照顧者，甲方應協助乙方改認養同等級之其他樹體。</li>
    </ol>

    <h4 class="doc-h">五、其他</h4>
    <ol class="doc-list">
      <li>本合約一式三份，三方各執一份。</li>
      <li>未盡事宜依馬來西亞相關法令及三方另行議定之補充條款辦理。</li>
    </ol>

    <div class="doc-sign">
      <div><span>甲方 · 平台</span><i></i></div>
      <div><span>乙方 · 認養人</span><i></i></div>
      <div><span>丙方 · 果農</span><i></i></div>
    </div>

    <p class="doc-warn">
      ⚠️ 這是<b>合約範本</b>，依平台目前的運作方式擬定，供快速產出與內部討論使用。
      正式對外簽署前請由法律專業審閱，本文件不構成法律意見。
    </p>
  `);
}
