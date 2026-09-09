/* ============================================================
   單據：發票與認養合約
   ------------------------------------------------------------
   兩份都是從資料庫現有的資料直接長出來的，不另外存一份 ——
   單據要跟訂單、樹況一致，多存一份就有對不上的風險。

   編號規則刻意跟來源綁死：
     訂單 RF-2026-0007 → 發票 INV-2026-0007
     樹   DB-000014       → 合約 AGR-DB-000014
   這樣拿到任何一張紙都知道要回系統裡查哪一筆，不必再開一張對照表。
   ============================================================ */

/* 單據的三種語言。
   為什麼不交給 i18n 逐句翻：那是替介面文字做的，字典裡有的換掉、
   沒有的留著。用在合約上就會變成「甲方 · Platform」「Variety…所在果園」
   ——一份半中半英的法律文件。單據要嘛整份中文、要嘛整份英文，
   所以整份一起產出，i18n 那邊也把 .doc-sheet 排除掉了。 */
const docLang = () => (typeof I18N !== 'undefined' && ['zh', 'en', 'ms'].includes(I18N.lang))
  ? I18N.lang : 'zh';

const D = {
  invoice:      { zh:'發票',       en:'Invoice',            ms:'Invois' },
  invoiceEn:    { zh:'INVOICE',    en:'INVOICE',            ms:'INVOIS' },
  issued:       { zh:'開立日期',   en:'Issue date',         ms:'Tarikh dikeluarkan' },
  dueDate:      { zh:'付款到期',   en:'Payment due',        ms:'Tempoh bayaran' },
  srcOrder:     { zh:'來源訂單',   en:'Order',              ms:'Pesanan' },
  from:         { zh:'賣方',       en:'From',               ms:'Daripada' },
  billTo:       { zh:'買方',       en:'Bill to',            ms:'Bil kepada' },
  desc:         { zh:'品項',       en:'Description',        ms:'Perihal' },
  qty:          { zh:'數量',       en:'Qty',                ms:'Kuantiti' },
  unit:         { zh:'單價',       en:'Unit price',         ms:'Harga seunit' },
  lineTotal:    { zh:'小計',       en:'Amount',             ms:'Amaun' },
  oneYear:      { zh:'1 年',       en:'1 year',             ms:'1 tahun' },
  adoption:     { zh:'Dabai 果樹認養', en:'Dabai tree adoption', ms:'Pengangkatan pokok Dabai' },
  farmerLbl:    { zh:'果農',       en:'grower',             ms:'petani' },
  subtotal:     { zh:'小計',       en:'Subtotal',           ms:'Jumlah kecil' },
  total:        { zh:'應付總額',   en:'Total',              ms:'Jumlah' },
  paid:         { zh:'已收',       en:'Paid',               ms:'Telah dibayar' },
  balance:      { zh:'應付餘額',   en:'Balance due',        ms:'Baki perlu dibayar' },
  payBy:        { zh:'付款方式',   en:'Payment method',     ms:'Kaedah pembayaran' },
  splitTitle:   { zh:'這筆錢怎麼分',  en:'How this is divided', ms:'Bagaimana ia dibahagi' },
  noSst:        { zh:'本單未計 SST。稅率可於後台「佣金分潤」設定。',
                  en:'No SST applied. The rate can be set under Commission in the back office.',
                  ms:'Tiada SST dikenakan. Kadar boleh ditetapkan di bawah Komisen dalam pejabat belakang.' },

  agr:          { zh:'果樹認養合約', en:'Tree Adoption Agreement', ms:'Perjanjian Pengangkatan Pokok' },
  agrEn:        { zh:'TREE ADOPTION AGREEMENT', en:'TREE ADOPTION AGREEMENT', ms:'PERJANJIAN PENGANGKATAN POKOK' },
  drafted:      { zh:'擬定日期',   en:'Drafted',            ms:'Tarikh draf' },
  term:         { zh:'合約期間',   en:'Term',               ms:'Tempoh' },
  termVal:      { zh:'簽署日起 1 年', en:'1 year from signing', ms:'1 tahun dari tarikh tandatangan' },
  linkedOrder:  { zh:'對應訂單',   en:'Linked order',       ms:'Pesanan berkaitan' },
  notYet:       { zh:'尚未成立',   en:'not yet created',    ms:'belum diwujudkan' },
  partyA:       { zh:'甲方 · 平台',   en:'Party A · Platform', ms:'Pihak A · Platform' },
  partyB:       { zh:'乙方 · 認養人', en:'Party B · Adopter',  ms:'Pihak B · Pengangkat' },
  partyC:       { zh:'丙方 · 果農',   en:'Party C · Grower',   ms:'Pihak C · Petani' },
  contactBlank: { zh:'聯絡方式＿＿＿＿＿＿', en:'Contact ______________', ms:'Hubungan ______________' },

  s1:           { zh:'一、認養標的', en:'1 · The tree', ms:'1 · Pokok yang diangkat' },
  treeNo:       { zh:'樹體編號',   en:'Tree ID',            ms:'ID Pokok' },
  variety:      { zh:'品種',       en:'Variety',            ms:'Varieti' },
  age:          { zh:'樹齡',       en:'Age',                ms:'Usia' },
  years:        { zh:'年',         en:'years',              ms:'tahun' },
  orchard:      { zh:'所在果園',   en:'Orchard',            ms:'Dusun' },
  estYield:     { zh:'預估年產量', en:'Estimated annual yield', ms:'Anggaran hasil tahunan' },
  yieldNote:    { zh:'依樹齡與歷年紀錄推算，非保證產量',
                  en:'calculated from tree age and past records; not a guaranteed yield',
                  ms:'dikira daripada usia pokok dan rekod lampau; bukan hasil yang dijamin' },

  s2:           { zh:'二、認養金與分配', en:'2 · The fee and how it divides', ms:'2 · Yuran dan pembahagiannya' },
  item:         { zh:'項目',       en:'Item',               ms:'Perkara' },
  share:        { zh:'比例',       en:'Share',              ms:'Bahagian' },
  amount:       { zh:'金額',       en:'Amount',             ms:'Amaun' },
  feeTotal:     { zh:'認養金總額', en:'Total adoption fee', ms:'Jumlah yuran pengangkatan' },
  cShare:       { zh:'丙方（果農）應得', en:'To Party C (grower)', ms:'Kepada Pihak C (petani)' },
  preFlower:    { zh:'— 開花前先撥', en:'— paid before flowering', ms:'— dibayar sebelum berbunga' },
  postHarvest:  { zh:'— 採收後結清', en:'— settled after harvest', ms:'— diselesaikan selepas menuai' },
  aShare:       { zh:'甲方（平台）服務費', en:'To Party A (platform service fee)', ms:'Kepada Pihak A (yuran perkhidmatan platform)' },

  s3:           { zh:'三、三方權利義務', en:'3 · Obligations', ms:'3 · Kewajipan' },
  o1: { zh:'<b>丙方（果農）</b>依既有農法照顧本樹，配合溝通者現場查看，並於採收後交付本樹產出。',
        en:'<b>Party C (the grower)</b> tends the tree by existing practice, receives the coordinator for field visits, and delivers the tree\'s harvest when it is picked.',
        ms:'<b>Pihak C (petani)</b> menjaga pokok mengikut amalan sedia ada, menerima lawatan penyelaras, dan menyerahkan hasil pokok selepas dituai.' },
  o2: { zh:'<b>甲方（平台）</b>安排顧問提供栽培建議、指派溝通者定期回報樹況與照片、依第二條時程撥款，並將每一筆紀錄留存於系統供乙方查閱。',
        en:'<b>Party A (the platform)</b> provides advisory support, assigns a coordinator to report on the tree with photographs, releases payment on the schedule in clause 2, and keeps every record in the system for Party B to read.',
        ms:'<b>Pihak A (platform)</b> menyediakan khidmat nasihat, menugaskan penyelaras untuk melaporkan keadaan pokok berserta gambar, membuat bayaran mengikut jadual dalam fasal 2, dan menyimpan setiap rekod dalam sistem untuk rujukan Pihak B.' },
  o3: { zh:'<b>乙方（認養人）</b>於本合約成立時支付認養金，得取得本樹當期產出及完整生產履歷。',
        en:'<b>Party B (the adopter)</b> pays the fee on signing, and receives the season\'s harvest from this tree together with its full production record.',
        ms:'<b>Pihak B (pengangkat)</b> membayar yuran semasa menandatangani, dan menerima hasil musim ini daripada pokok tersebut berserta rekod pengeluaran penuhnya.' },
  o4: { zh:'本樹之所有權仍屬丙方，認養係取得當期收成之權利，不涉及土地或樹體所有權移轉。',
        en:'Ownership of the tree remains with Party C. Adoption grants the right to the season\'s harvest; it transfers no interest in the land or the tree itself.',
        ms:'Pemilikan pokok kekal dengan Pihak C. Pengangkatan memberi hak kepada hasil musim ini sahaja; ia tidak memindahkan hak ke atas tanah atau pokok itu sendiri.' },

  s4:           { zh:'四、歉收與不可抗力', en:'4 · Crop failure and force majeure', ms:'4 · Kegagalan hasil dan force majeure' },
  f1: { zh:'Dabai 為季節性作物，產量受氣候影響。預估產量為推算值，<b>非保證產量</b>。',
        en:'Dabai is seasonal and its yield turns on the weather. The estimate is a calculation, <b>not a guarantee</b>.',
        ms:'Dabai bermusim dan hasilnya bergantung kepada cuaca. Anggaran ialah pengiraan, <b>bukan jaminan</b>.' },
  f2: { zh:'因天候、病蟲害等不可歸責於丙方之事由導致歉收時，已撥付之開花前訂金不予追回；採收後尾款依實際產出比例結算。',
        en:'Where weather, pests or disease reduce the crop through no fault of Party C, the pre-flowering payment already made is not recovered, and the post-harvest balance is settled in proportion to what was actually picked.',
        ms:'Sekiranya cuaca, perosak atau penyakit mengurangkan hasil tanpa kesalahan Pihak C, bayaran sebelum berbunga yang telah dibuat tidak dituntut semula, dan baki selepas menuai diselesaikan mengikut kadar hasil sebenar.' },
  f3: { zh:'本樹於合約期間內死亡且非因丙方疏於照顧者，甲方應協助乙方改認養同等級之其他樹體。',
        en:'If the tree dies within the term and not through neglect by Party C, Party A will arrange for Party B to adopt another tree of comparable standing.',
        ms:'Jika pokok mati dalam tempoh perjanjian dan bukan kerana kecuaian Pihak C, Pihak A akan menguruskan Pihak B mengangkat pokok lain yang setaraf.' },

  s5:           { zh:'五、其他', en:'5 · General', ms:'5 · Am' },
  g1: { zh:'本合約一式三份，三方各執一份。',
        en:'This agreement is executed in three copies, one held by each party.',
        ms:'Perjanjian ini dibuat dalam tiga salinan, satu dipegang oleh setiap pihak.' },
  g2: { zh:'未盡事宜依馬來西亞相關法令及三方另行議定之補充條款辦理。',
        en:'Anything not covered here follows Malaysian law and any supplementary terms the three parties agree separately.',
        ms:'Perkara yang tidak diliputi di sini tertakluk kepada undang-undang Malaysia dan terma tambahan yang dipersetujui secara berasingan oleh ketiga-tiga pihak.' },

  warn: { zh:'⚠️ 這是<b>合約範本</b>，依平台目前的運作方式擬定，供快速產出與內部討論使用。正式對外簽署前請由法律專業審閱，本文件不構成法律意見。',
          en:'⚠️ This is a <b>template</b>, drafted from how the platform actually works, for quick preparation and internal discussion. Have a legal professional review it before anyone signs. It is not legal advice.',
          ms:'⚠️ Ini ialah <b>templat</b>, dirangka daripada cara platform ini beroperasi, untuk penyediaan pantas dan perbincangan dalaman. Dapatkan semakan profesional undang-undang sebelum sesiapa menandatangani. Ia bukan nasihat guaman.' },
};

/** 取單據字串的目前語言版本。 */
const L = k => (D[k] || {})[docLang()] ?? (D[k] || {}).zh ?? '';

/* 資料值（品種、果園、果農）走字典。
   單據整份被排除在逐句翻譯之外，是為了保護法律條文不被翻一半；
   但資料值在系統其他地方都會翻，單據裡不翻就前後不一致。
   所以這裡明確地只對這幾個欄位查字典 —— 查不到就原樣輸出。 */
const dv = v => (typeof I18N !== 'undefined' && v) ? I18N.translate(String(v)) : v;

const ORG = {
  name:  'TANJU',
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

  const item = `${L('adoption')} · ${dEsc(o.treeId)}`
    + (tree.orchard ? `<br><span class="doc-dim">${dEsc(dv(tree.orchard))}${tree.area ? ' · ' + dEsc(tree.area) : ''}`
        + `${tree.farmer ? ` · ${L('farmerLbl')} ` + dEsc(dv(tree.farmer)) : ''}</span>` : '');

  openDoc(`
    ${docHead(L('invoice'), L('invoiceEn'), invNo, [
      [L('issued'),   dEsc(o.date)],
      [L('dueDate'),  dEsc(due)],
      [L('srcOrder'), dEsc(o.no)],
    ])}

    <div class="doc-parties">
      <div>
        <span class="doc-lab">${L('from')}</span>
        <b>${ORG.name}</b>
        <span>${ORG.sub}</span>
      </div>
      <div>
        <span class="doc-lab">${L('billTo')}</span>
        <b>${dEsc(dv(o.customer))}</b>
        <span>${dEsc(o.email || '')}</span>
        <span>${dEsc(o.phone || '')}</span>
      </div>
    </div>

    <table class="doc-table">
      <thead><tr>
        <th>${L('desc')}</th>
        <th class="num">${L('qty')}</th>
        <th class="num">${L('unit')}</th>
        <th class="num">${L('lineTotal')}</th>
      </tr></thead>
      <tbody><tr>
        <td>${item}</td>
        <td class="num">${L('oneYear')}</td>
        <td class="num">${dmoney(sub)}</td>
        <td class="num">${dmoney(sub)}</td>
      </tr></tbody>
    </table>

    <div class="doc-sum">
      <div><span>${L('subtotal')}</span><b>${dmoney(sub)}</b></div>
      ${sst ? `<div><span>SST ${sst}%</span><b>${dmoney(tax)}</b></div>` : ''}
      <div class="doc-total"><span>${L('total')}</span><b>${dmoney(total)}</b></div>
      <div><span>${L('paid')}</span><b>${dmoney(o.paid)}</b></div>
      <div class="doc-due"><span>${L('balance')}</span><b>${dmoney(balance)}</b></div>
    </div>

    <div class="doc-note">
      <p><b>${L('payBy')}${docLang() === 'zh' ? '：' : ': '}</b>${dEsc(dv(o.channel) || '—')}</p>
      <p><b>${L('splitTitle')}${docLang() === 'zh' ? '：' : ': '}</b>${{
        zh:`認養金的 ${100 - rate}% 撥付果農，${rate}% 為平台服務費。果農那份再拆成開花前訂金與採收後尾款，每一筆撥款在系統裡都留有紀錄。`,
        en:`${100 - rate}% of the fee goes to the grower and ${rate}% is the platform service fee. The grower's share splits again into a pre-flowering payment and a post-harvest settlement, and every payout is recorded in the system.`,
        ms:`${100 - rate}% daripada yuran diberikan kepada petani dan ${rate}% ialah yuran perkhidmatan platform. Bahagian petani dipecah lagi kepada bayaran sebelum berbunga dan penyelesaian selepas menuai, dan setiap pembayaran direkodkan dalam sistem.`,
      }[docLang()]}</p>
      ${sst ? '' : `<p class="doc-dim">${L('noSst')}</p>`}
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
    ${docHead(L('agr'), L('agrEn'), 'AGR-' + dEsc(treeId), [
      [L('drafted'),     today],
      [L('term'),        L('termVal')],
      [L('linkedOrder'), order ? dEsc(order.no) : L('notYet')],
    ])}

    <div class="doc-parties doc-three">
      <div>
        <span class="doc-lab">${L('partyA')}</span>
        <b>${ORG.name}</b>
        <span>${ORG.sub}</span>
      </div>
      <div>
        <span class="doc-lab">${L('partyB')}</span>
        <b>${order ? dEsc(dv(order.customer)) : '＿＿＿＿＿＿＿＿'}</b>
        <span>${order ? dEsc(order.email || '') : L('contactBlank')}</span>
      </div>
      <div>
        <span class="doc-lab">${L('partyC')}</span>
        <b>${dEsc(dv(tree.farmer) || '＿＿＿＿＿＿')}</b>
        <span>${dEsc(dv(tree.orchard) || '')}${tree.area ? ' · ' + dEsc(tree.area) : ''}</span>
      </div>
    </div>

    <h4 class="doc-h">${L('s1')}</h4>
    <table class="doc-table">
      <tbody>
        <tr><td>${L('treeNo')}</td><td><b>${dEsc(tree.id)}</b></td></tr>
        <tr><td>${L('variety')}</td><td>${dEsc(dv(tree.variety) || '—')}</td></tr>
        <tr><td>${L('age')}</td><td>${dEsc(tree.age ?? '—')} ${L('years')}</td></tr>
        <tr><td>${L('orchard')}</td><td>${dEsc(dv(tree.orchard) || '—')}${tree.area ? ' · ' + dEsc(tree.area) : ''}</td></tr>
        <tr><td>${L('estYield')}</td><td>${dEsc(tree.kg ?? '—')} kg（${L('yieldNote')}）</td></tr>
      </tbody>
    </table>

    <h4 class="doc-h">${L('s2')}</h4>
    <table class="doc-table">
      <thead><tr><th>${L('item')}</th><th class="num">${L('share')}</th><th class="num">${L('amount')}</th></tr></thead>
      <tbody>
        <tr><td>${L('feeTotal')}</td><td class="num">100%</td><td class="num"><b>${dmoney(fee)}</b></td></tr>
        <tr><td>${L('cShare')}</td><td class="num">${100 - rate}%</td><td class="num">${dmoney(farmerCut)}</td></tr>
        <tr><td class="doc-ind">${L('preFlower')}</td><td class="num">${dep}%</td><td class="num">${dmoney(depositAmt)}</td></tr>
        <tr><td class="doc-ind">${L('postHarvest')}</td><td class="num">${(100 - rate - dep).toFixed(0)}%</td><td class="num">${dmoney(balanceAmt)}</td></tr>
        <tr><td>${L('aShare')}</td><td class="num">${rate}%</td><td class="num">${dmoney(platformCut)}</td></tr>
      </tbody>
    </table>

    <h4 class="doc-h">${L('s3')}</h4>
    <ol class="doc-list">
      <li>${L('o1')}</li>
      <li>${L('o2')}</li>
      <li>${L('o3')}</li>
      <li>${L('o4')}</li>
    </ol>

    <h4 class="doc-h">${L('s4')}</h4>
    <ol class="doc-list">
      <li>${L('f1')}</li>
      <li>${L('f2')}</li>
      <li>${L('f3')}</li>
    </ol>

    <h4 class="doc-h">${L('s5')}</h4>
    <ol class="doc-list">
      <li>${L('g1')}</li>
      <li>${L('g2')}</li>
    </ol>

    <div class="doc-sign">
      <div><span>${L('partyA')}</span><i></i></div>
      <div><span>${L('partyB')}</span><i></i></div>
      <div><span>${L('partyC')}</span><i></i></div>
    </div>

    <p class="doc-warn">${L('warn')}</p>
  `);
}
