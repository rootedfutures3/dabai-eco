/* ============================================================
   財務模型（Financial Plan）
   ------------------------------------------------------------
   依 2026-08-18 教練會議的要求做的：教練指出簡報缺財務頁，
   評審一定會問。這一頁把三條營收線、毛利、淨利與第 1～2 年
   預測算出來，數字全部可調，算完可以直接複製進簡報。

   三條營收線（教練會議確認）：
     ① 認養佣金 —— 認養人付 RM 100，果農拿 RM 80，平台留 RM 20
     ② 直銷佣金 —— 沒被認養的樹由平台自行收購，按公斤賣給餐廳／
        加工廠，再向果農收一筆佣金
     ③ 果樹保險 —— 附加服務，細節未定，先放進模型當作可選項

   刻意保守：教練說「不要灌水，評審知道你們還沒商業化」。
   ============================================================ */

/* 預設假設值。全部存進 settings 表，改了會留在資料庫。 */
const FIN_DEFAULTS = {
  /* --- 規模 --- */
  fin_y1_trees:       '30',    // 第 1 年上架樹數（試點規模，教練建議就講 30 棵）
  fin_y1_adopt_rate:  '60',    // 認養率％
  fin_y1_fee:         '300',   // 每棵平均認養金 RM
  fin_y2_trees:       '600',   // 第 2 年目標。Song 一季產 650 公噸，以每棵 35kg 估，
                               // 當地上萬棵樹在結果 —— 600 棵仍只是零頭。
  fin_y2_adopt_rate:  '70',
  fin_y2_fee:         '320',

  /* --- 收入 ② 直銷（未認養的樹由平台代售） --- */
  fin_kg_per_tree:    '35',    // 每棵樹平均產量（公斤）
  fin_price_kg:       '18',    // 直銷每公斤售價 RM
  fin_direct_comm:    '15',    // 直銷向果農收的佣金％
  fin_direct_loss:    '20',    // 損耗％（Dabai 採下只有 3 天）

  /* --- 收入 ③ 果樹保險 --- */
  fin_ins_rate:       '25',    // 投保比例％
  fin_ins_fee:        '30',    // 每棵保費 RM
  fin_ins_claim:      '40',    // 預期理賠佔保費％

  /* --- 變動成本（隨樹數／重量增加） --- */
  /* 只放材料與耗材。勘查與回報的「人力」已經算在固定成本的人事津貼裡，
     兩邊都算會重複計算，把毛利壓成負的。 */
  fin_c_tag:          '6',     // Tree ID 標牌與掛牌耗材 RM／棵
  fin_c_survey:       '8',     // 勘查耗材與土壤檢測 RM／棵／年（人力算在人事）
  fin_c_coord:        '5',     // 回報耗材與通訊 RM／棵／年（人力算在人事）
  fin_c_logistics:    '1.8',   // 集貨與物流 RM／kg（果園→舢舨→碼頭→貨車）
  fin_c_pack:         '0.9',   // 包裝 RM／kg
  fin_c_payment:      '2.5',   // 金流手續費％（FPX／信用卡／DuitNow）

  /* --- 固定成本（每年） --- */
  fin_f_people_y1:    '4800',  // 人事津貼（試點期創辦人自付大部分）
  fin_f_people_y2:    '14400',
  fin_f_travel_y1:    '2400',  // 下鄉交通與船資
  fin_f_travel_y2:    '5400',
  fin_f_system_y1:    '900',   // 網域、資料庫、工具訂閱
  fin_f_system_y2:    '1800',
  fin_f_ads_y1:       '2400',  // Facebook 廣告（買方與賣方獲客）
  fin_f_ads_y2:       '9600',
  fin_f_admin_y1:     '1500',  // 註冊、會計、保險、雜支
  fin_f_admin_y2:     '3000',

  /* 物流與包裝實務上是向買方另外收運費回收的，不是平台自己吸收。
     預設全額回收；想模擬平台自行吸收就把它調低。 */
  fin_ship_recover:   '100',
};

const FIN_LABELS = {
  fin_y1_trees:'上架樹數（棵）', fin_y1_adopt_rate:'認養率（%）', fin_y1_fee:'平均認養金（RM／棵）',
  fin_y2_trees:'上架樹數（棵）', fin_y2_adopt_rate:'認養率（%）', fin_y2_fee:'平均認養金（RM／棵）',

  fin_kg_per_tree:'每棵產量（kg）', fin_price_kg:'直銷售價（RM／kg）',
  fin_direct_comm:'直銷佣金（%）', fin_direct_loss:'損耗率（%）',

  fin_ins_rate:'投保比例（%）', fin_ins_fee:'保費（RM／棵）', fin_ins_claim:'理賠支出（佔保費%）',

  fin_c_tag:'標牌耗材（RM／棵）', fin_c_survey:'勘查耗材（RM／棵／年）',
  fin_c_coord:'回報耗材（RM／棵／年）', fin_c_logistics:'集貨物流（RM／kg）',
  fin_c_pack:'包裝（RM／kg）', fin_c_payment:'金流手續費（%）',
  fin_ship_recover:'物流費回收（%）',

  fin_f_people_y1:'人事津貼（RM／年）', fin_f_people_y2:'人事津貼（RM／年）',
  fin_f_travel_y1:'交通與船資（RM／年）', fin_f_travel_y2:'交通與船資（RM／年）',
  fin_f_system_y1:'系統與工具（RM／年）', fin_f_system_y2:'系統與工具（RM／年）',
  fin_f_ads_y1:'行銷廣告（RM／年）', fin_f_ads_y2:'行銷廣告（RM／年）',
  fin_f_admin_y1:'行政與雜支（RM／年）', fin_f_admin_y2:'行政與雜支（RM／年）',
};

const fin = k => Store.settingNum(k, parseFloat(FIN_DEFAULTS[k]));

/**
 * 算某一年的損益，收入與支出都逐項列出。
 * 回傳的 revenue[] 與 costs[] 會直接變成畫面上的兩張明細表。
 */
function financeYear(y) {
  const trees = fin(`fin_y${y}_trees`);
  const rate  = fin(`fin_y${y}_adopt_rate`) / 100;
  const fee   = fin(`fin_y${y}_fee`);
  const comm  = Store.settingNum('commission_rate', 20) / 100;

  const adopted   = Math.round(trees * rate);
  const unadopted = Math.max(0, trees - adopted);

  /* ---------- 收入 ---------- */

  // ① 認養佣金：認養金全額流過平台，平台留 20%，其餘給果農
  const gmv       = adopted * fee;
  const rev1      = gmv * comm;
  const toFarmer  = gmv - rev1;

  // ② 直銷佣金：沒認養的樹由平台代售，先扣損耗再抽佣
  const kg        = fin('fin_kg_per_tree');
  const loss      = fin('fin_direct_loss') / 100;
  const dcomm     = fin('fin_direct_comm') / 100;
  const harvest   = unadopted * kg;                 // 採下的總重
  const sellable  = harvest * (1 - loss);           // 扣掉三天保鮮期造成的損耗
  const sales     = sellable * fin('fin_price_kg'); // 代售銷售額
  const rev2      = sales * dcomm;

  // ③ 果樹保險：保費收入（理賠列在支出，不在這裡淨掉）
  const insured   = Math.round(trees * fin('fin_ins_rate') / 100);
  const premium   = insured * fin('fin_ins_fee');
  const claims    = premium * fin('fin_ins_claim') / 100;

  // ④ 物流費回收：運費向買方另外收，不是平台吸收
  const cLogRaw  = sellable * fin('fin_c_logistics');
  const cPackRaw = sellable * fin('fin_c_pack');
  const recover  = (cLogRaw + cPackRaw) * fin('fin_ship_recover') / 100;

  const revenue = [
    ['① 認養佣金', `${adopted} 棵 × RM ${fee} × ${comm * 100}%`, rev1],
    ['② 直銷佣金', `${Math.round(sellable)} kg × RM ${fin('fin_price_kg')} × ${dcomm * 100}%`, rev2],
    ['③ 果樹保險保費', `${insured} 棵 × RM ${fin('fin_ins_fee')}`, premium],
    ['④ 物流費回收', `向買方收取，回收 ${fin('fin_ship_recover')}%`, recover],
  ];
  const revTotal = revenue.reduce((s, r) => s + r[2], 0);

  /* ---------- 變動成本（跟著樹數與重量走） ---------- */
  const cTag   = trees * fin('fin_c_tag');
  const cSurv  = trees * fin('fin_c_survey');
  const cCoord = trees * fin('fin_c_coord');
  const cLog   = cLogRaw;
  const cPack  = cPackRaw;
  const cPay   = (gmv + sales) * fin('fin_c_payment') / 100;

  const variable = [
    ['Tree ID 標牌耗材', `${trees} 棵 × RM ${fin('fin_c_tag')}`, cTag],
    ['勘查耗材與土壤檢測', `${trees} 棵 × RM ${fin('fin_c_survey')}`, cSurv],
    ['回報耗材與通訊',     `${trees} 棵 × RM ${fin('fin_c_coord')}`, cCoord],
    ['集貨與物流',         `${Math.round(sellable)} kg × RM ${fin('fin_c_logistics')}`, cLog],
    ['包裝',               `${Math.round(sellable)} kg × RM ${fin('fin_c_pack')}`, cPack],
    ['金流手續費',         `流水 RM ${Math.round(gmv + sales).toLocaleString('en-MY')} × ${fin('fin_c_payment')}%`, cPay],
    ['保險理賠支出',       `保費的 ${fin('fin_ins_claim')}%`, claims],
  ];
  const varTotal = variable.reduce((s, c) => s + c[2], 0);

  /* ---------- 固定成本（每年一筆） ---------- */
  const fixed = [
    ['人事津貼',     '創辦人與兼職溝通者', fin(`fin_f_people_y${y}`)],
    ['交通與船資',   '下鄉勘查、舢舨、貨車', fin(`fin_f_travel_y${y}`)],
    ['系統與工具',   '網域、資料庫、訂閱', fin(`fin_f_system_y${y}`)],
    ['行銷廣告',     'Facebook 廣告與獲客', fin(`fin_f_ads_y${y}`)],
    ['行政與雜支',   '註冊、會計、保險、文具', fin(`fin_f_admin_y${y}`)],
  ];
  const fixTotal = fixed.reduce((s, c) => s + c[2], 0);

  const gross = revTotal - varTotal;
  const net   = gross - fixTotal;

  return {
    trees, adopted, unadopted, gmv, toFarmer, harvest, sellable, sales, insured, premium, claims,
    revenue, revTotal, variable, varTotal, fixed, fixTotal,
    gross, net,
    grossMargin: revTotal ? gross / revTotal * 100 : 0,
    netMargin:   revTotal ? net   / revTotal * 100 : 0,
    perTree:     trees ? gross / trees : 0,
  };
}

/** 要打平需要幾棵樹（其他假設不變，只放大樹數） */
/** 固定成本不變的前提下，要幾棵樹才打平 */
function breakevenTrees(y) {
  const b = financeYear(y);
  if (b.trees <= 0 || b.perTree <= 0) return null;
  return Math.ceil(b.fixTotal / b.perTree);
}

/* ---------- 畫面 ---------- */

function renderFinance() {
  const box = document.getElementById('fin-inputs');
  if (!box) return;

  const group = (title, keys) => `
    <div class="fin-group">
      <h5>${title}</h5>
      ${keys.map(k => `
        <div class="fld">
          <label for="${k}">${FIN_LABELS[k]}</label>
          <input id="${k}" type="number" step="any" min="0" value="${fin(k)}">
        </div>`).join('')}
    </div>`;

  box.innerHTML =
      group('規模 · 第 1 年（試點）', ['fin_y1_trees', 'fin_y1_adopt_rate', 'fin_y1_fee'])
    + group('規模 · 第 2 年（擴張）', ['fin_y2_trees', 'fin_y2_adopt_rate', 'fin_y2_fee'])
    + group('收入 ② 直銷', ['fin_kg_per_tree', 'fin_price_kg', 'fin_direct_comm', 'fin_direct_loss'])
    + group('收入 ③ 果樹保險', ['fin_ins_rate', 'fin_ins_fee', 'fin_ins_claim'])
    + group('變動成本', ['fin_c_tag', 'fin_c_survey', 'fin_c_coord',
                        'fin_c_logistics', 'fin_c_pack', 'fin_c_payment',
                        'fin_ship_recover'])
    + group('固定成本 · 第 1 年', ['fin_f_people_y1', 'fin_f_travel_y1', 'fin_f_system_y1',
                                 'fin_f_ads_y1', 'fin_f_admin_y1'])
    + group('固定成本 · 第 2 年', ['fin_f_people_y2', 'fin_f_travel_y2', 'fin_f_system_y2',
                                 'fin_f_ads_y2', 'fin_f_admin_y2']);

  box.querySelectorAll('input').forEach(i => {
    i.addEventListener('change', () => {
      const v = parseFloat(i.value);
      if (!Number.isFinite(v) || v < 0) { i.value = fin(i.id); return; }
      Store.saveSetting(i.id, v);
      renderFinance();
    });
  });

  drawFinance();
}

function drawFinance() {
  const y1 = financeYear(1), y2 = financeYear(2);
  const m  = n => 'RM ' + Math.round(n).toLocaleString('en-MY');
  const pc = n => n.toFixed(1) + '%';

  /* 把「第 1 年」與「第 2 年」的同一列併排。兩年的項目順序一致，所以用索引對。 */
  const pair = (rows1, rows2) => rows1.map((r, i) => [
    r[0], `<span class="dim">${r[1]}</span>`,
    `<span class="num">${m(r[2])}</span>`,
    `<span class="num">${m((rows2[i] || [])[2] || 0)}</span>`,
  ]);

  /* --- 收入明細 --- */
  document.getElementById('t-streams').innerHTML = table(
    ['收入項目', '怎麼算的', '第 1 年', '第 2 年'],
    [
      ...pair(y1.revenue, y2.revenue),
      ['<b>營業收入合計</b>', '',
       `<b class="num">${m(y1.revTotal)}</b>`, `<b class="num">${m(y2.revTotal)}</b>`],
      ['<span class="dim">（參考）平台流水 GMV</span>',
       '<span class="dim">認養金全額，其中八成是果農的錢</span>',
       `<span class="dim num">${m(y1.gmv)}</span>`, `<span class="dim num">${m(y2.gmv)}</span>`],
      ['<span class="dim">（參考）撥給果農</span>', '',
       `<span class="dim num">${m(y1.toFarmer)}</span>`, `<span class="dim num">${m(y2.toFarmer)}</span>`],
    ]);

  /* --- 支出明細 --- */
  document.getElementById('t-costs').innerHTML = table(
    ['支出項目', '怎麼算的', '第 1 年', '第 2 年'],
    [
      ['<b>變動成本</b><span class="dim">（跟著樹數與重量走）</span>', '', '', ''],
      ...pair(y1.variable, y2.variable),
      ['<b>變動成本小計</b>', '',
       `<b class="num">${m(y1.varTotal)}</b>`, `<b class="num">${m(y2.varTotal)}</b>`],

      ['<b>固定成本</b><span class="dim">（每年一筆，不隨規模變動）</span>', '', '', ''],
      ...pair(y1.fixed, y2.fixed),
      ['<b>固定成本小計</b>', '',
       `<b class="num">${m(y1.fixTotal)}</b>`, `<b class="num">${m(y2.fixTotal)}</b>`],

      ['<b>支出合計</b>', '',
       `<b class="num">${m(y1.varTotal + y1.fixTotal)}</b>`,
       `<b class="num">${m(y2.varTotal + y2.fixTotal)}</b>`],
    ]);

  /* --- 損益總表 --- */
  const line = (k, a, b, bold) => [
    bold ? `<b>${k}</b>` : k,
    bold ? `<b class="num">${a}</b>` : `<span class="num">${a}</span>`,
    bold ? `<b class="num">${b}</b>` : `<span class="num">${b}</span>`,
  ];
  document.getElementById('t-pnl').innerHTML = table(
    ['項目', '第 1 年（試點）', '第 2 年（擴張）'],
    [
      line('上架樹數', `${y1.trees} 棵`, `${y2.trees} 棵`),
      line('其中已認養', `${y1.adopted} 棵`, `${y2.adopted} 棵`),
      line('代售果實（扣損耗後）', `${Math.round(y1.sellable)} kg`, `${Math.round(y2.sellable)} kg`),
      line('營業收入', m(y1.revTotal), m(y2.revTotal), true),
      line('變動成本', '−' + m(y1.varTotal), '−' + m(y2.varTotal)),
      line('毛利', m(y1.gross), m(y2.gross), true),
      line('毛利率', pc(y1.grossMargin), pc(y2.grossMargin)),
      line('固定成本', '−' + m(y1.fixTotal), '−' + m(y2.fixTotal)),
      [
        '<b>淨利</b>',
        `<b class="num ${y1.net < 0 ? 'neg' : 'pos'}">${m(y1.net)}</b>`,
        `<b class="num ${y2.net < 0 ? 'neg' : 'pos'}">${m(y2.net)}</b>`,
      ],
      line('淨利率', pc(y1.netMargin), pc(y2.netMargin)),
      line('每棵樹貢獻毛利', m(y1.perTree) + '／棵', m(y2.perTree) + '／棵', true),
    ]);

  /* --- 結論 --- */
  const be = breakevenTrees(2);
  document.getElementById('fin-verdict').innerHTML = `
    <p>
      第 1 年以 <b>${y1.trees} 棵樹</b>的試點規模，營收 <b>${m(y1.revTotal)}</b>、
      毛利率 <b>${pc(y1.grossMargin)}</b>、淨利
      <b class="${y1.net < 0 ? 'neg' : 'pos'}">${m(y1.net)}</b>
      —— ${y1.net < 0
        ? '如同教練所說，<b>試點規模本來就不會打平</b>，這一年是在驗證模式。'
        : '已經可以打平。'}
    </p>
    <p>
      第 2 年擴到 <b>${y2.trees} 棵</b>，營收 <b>${m(y2.revTotal)}</b>、
      淨利 <b class="${y2.net < 0 ? 'neg' : 'pos'}">${m(y2.net)}</b>（淨利率 ${pc(y2.netMargin)}）。
      ${be ? `<span>以第 2 年的固定成本推算，約需 <b>${be} 棵樹</b>損益兩平。</span>` : ''}
    </p>
    <p>
      <b>槓桿在哪：</b>每棵樹貢獻約 <b>${m(y2.perTree)}</b> 毛利，而固定成本幾乎不隨樹數增加 ——
      平台不建冷藏庫、不壓貨、不養車隊。所以規模一上來，淨利是跳的，不是爬的。
    </p>
    <p class="dim">
      Song 一季約產 650 公噸 Dabai，其中約 80% 因為找不到買家而浪費。
      即使只承接其中 1%，就是 6.5 公噸 —— 上表的規模仍遠低於當地實際的浪費量。
      所有數字都是可調的假設，不是承諾。
    </p>`;
}
