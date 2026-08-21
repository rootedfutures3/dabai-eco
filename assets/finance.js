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
  fin_y1_trees:       '30',    // 第 1 年上架樹數（試點規模，教練建議就講 30 棵）
  fin_y1_adopt_rate:  '60',    // 認養率％
  fin_y1_fee:         '300',   // 每棵平均認養金 RM
  fin_y2_trees:       '600',   // 第 2 年目標樹數。Song 一季產 650 公噸，以每棵 35kg 估算，
                               // 當地約有上萬棵樹在結果 —— 600 棵仍只是其中的零頭。
  fin_y2_adopt_rate:  '70',
  fin_y2_fee:         '320',

  fin_kg_per_tree:    '35',    // 每棵樹平均產量（公斤）
  fin_price_kg:       '18',    // 直銷每公斤售價 RM
  fin_direct_comm:    '15',    // 直銷向果農收的佣金％
  fin_direct_loss:    '20',    // 直銷損耗％（Dabai 只有 3 天保鮮期）

  fin_ins_rate:       '25',    // 買保險的樹佔比％
  fin_ins_fee:        '30',    // 每棵保費 RM
  fin_ins_claim:      '40',    // 理賠支出佔保費％

  fin_opex_y1:        '9600',   // 年營運費用 RM（掛牌、船資車資、平台、雜支）
  fin_opex_y2:        '24000',
  fin_ads_y1:         '2400',   // Facebook 廣告
  fin_ads_y2:         '9600',
};

const FIN_LABELS = {
  fin_y1_trees:'上架樹數（棵）', fin_y1_adopt_rate:'認養率（%）', fin_y1_fee:'平均認養金（RM／棵）',
  fin_y2_trees:'上架樹數（棵）', fin_y2_adopt_rate:'認養率（%）', fin_y2_fee:'平均認養金（RM／棵）',
  fin_kg_per_tree:'每棵產量（kg）', fin_price_kg:'直銷售價（RM／kg）',
  fin_direct_comm:'直銷佣金（%）', fin_direct_loss:'損耗率（%）',
  fin_ins_rate:'投保比例（%）', fin_ins_fee:'保費（RM／棵）', fin_ins_claim:'理賠支出（佔保費%）',
  fin_opex_y1:'營運費用（RM／年）', fin_opex_y2:'營運費用（RM／年）',
  fin_ads_y1:'行銷廣告（RM／年）', fin_ads_y2:'行銷廣告（RM／年）',
};

const fin = k => Store.settingNum(k, parseFloat(FIN_DEFAULTS[k]));

/** 算某一年的損益。回傳的每個欄位都會直接顯示在表上。 */
function financeYear(y) {
  const trees  = fin(`fin_y${y}_trees`);
  const rate   = fin(`fin_y${y}_adopt_rate`) / 100;
  const fee    = fin(`fin_y${y}_fee`);
  const comm   = Store.settingNum('commission_rate', 20) / 100;

  const adopted   = Math.round(trees * rate);
  const unadopted = Math.max(0, trees - adopted);

  /* ① 認養佣金 —— 認養金全額流過平台，平台留 20%，其餘給果農 */
  const gmv       = adopted * fee;
  const rev1      = gmv * comm;
  const toFarmer1 = gmv - rev1;

  /* ② 直銷 —— 沒認養的樹，平台代售，向果農抽佣。
        Dabai 保鮮期只有 3 天，所以要先扣損耗。 */
  const kg       = fin('fin_kg_per_tree');
  const price    = fin('fin_price_kg');
  const loss     = fin('fin_direct_loss') / 100;
  const dcomm    = fin('fin_direct_comm') / 100;
  const sellable = unadopted * kg * (1 - loss);
  const sales    = sellable * price;
  const rev2     = sales * dcomm;

  /* ③ 果樹保險 —— 保費收入扣掉預期理賠 */
  const insured  = Math.round(trees * fin('fin_ins_rate') / 100);
  const premium  = insured * fin('fin_ins_fee');
  const claims   = premium * fin('fin_ins_claim') / 100;
  const rev3     = premium - claims;

  const revenue = rev1 + rev2 + rev3;

  /* 銷貨成本：直銷是唯一有實體成本的一條線（收果 + 物流），
     認養與保險幾乎沒有變動成本 —— 這就是輕資產模式的好處。 */
  const cogs = sales * (1 - dcomm) * 0.12 + claims * 0;   // 物流與集貨約佔銷售額 12%
  const gross = revenue - cogs;
  const opex  = fin(`fin_opex_y${y}`) + fin(`fin_ads_y${y}`);
  const net   = gross - opex;

  return {
    trees, adopted, unadopted, gmv, toFarmer1,
    rev1, rev2, rev3, revenue,
    sellable, sales, insured, premium,
    cogs, gross, opex, net,
    grossMargin: revenue ? gross / revenue * 100 : 0,
    netMargin:   revenue ? net   / revenue * 100 : 0,
    breakeven: net >= 0,
  };
}

/** 要打平需要幾棵樹（其他假設不變，只放大樹數） */
function breakevenTrees(y) {
  const base = financeYear(y);
  if (base.trees <= 0) return null;
  const perTree = (base.gross) / base.trees;          // 每棵樹貢獻的毛利
  if (perTree <= 0) return null;
  return Math.ceil(base.opex / perTree);
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
      group('第 1 年 · 試點', ['fin_y1_trees', 'fin_y1_adopt_rate', 'fin_y1_fee', 'fin_opex_y1', 'fin_ads_y1'])
    + group('第 2 年 · 擴張', ['fin_y2_trees', 'fin_y2_adopt_rate', 'fin_y2_fee', 'fin_opex_y2', 'fin_ads_y2'])
    + group('② 直銷（未認養的樹）', ['fin_kg_per_tree', 'fin_price_kg', 'fin_direct_comm', 'fin_direct_loss'])
    + group('③ 果樹保險', ['fin_ins_rate', 'fin_ins_fee', 'fin_ins_claim']);

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
  const comm = Store.settingNum('commission_rate', 20);
  const m = n => 'RM ' + Math.round(n).toLocaleString('en-MY');
  const pc = n => n.toFixed(1) + '%';

  /* 三條營收線 */
  document.getElementById('t-streams').innerHTML = table(
    ['營收來源', '計算方式', '第 1 年', '第 2 年'],
    [
      [`① 認養佣金 <span class="badge-ok">主力</span>`,
       `認養金 × ${comm}%（果農拿 ${100 - comm}%）`, m(y1.rev1), m(y2.rev1)],
      ['② 直銷佣金',
       `未認養的樹代售，向果農抽 ${fin('fin_direct_comm')}%`, m(y1.rev2), m(y2.rev2)],
      ['③ 果樹保險',
       `保費收入扣預期理賠 ${fin('fin_ins_claim')}%`, m(y1.rev3), m(y2.rev3)],
      ['<b>合計營收</b>', '', `<b>${m(y1.revenue)}</b>`, `<b>${m(y2.revenue)}</b>`],
    ]);

  /* 損益表 */
  document.getElementById('t-pnl').innerHTML = table(
    ['項目', '第 1 年（試點）', '第 2 年（擴張）'],
    [
      ['上架樹數', `${y1.trees} 棵`, `${y2.trees} 棵`],
      ['其中已認養', `${y1.adopted} 棵`, `${y2.adopted} 棵`],
      ['平台流水（GMV）', m(y1.gmv), m(y2.gmv)],
      ['<span class="dim">— 其中撥給果農</span>', `<span class="dim">${m(y1.toFarmer1)}</span>`, `<span class="dim">${m(y2.toFarmer1)}</span>`],
      ['<b>營業收入</b>', `<b>${m(y1.revenue)}</b>`, `<b>${m(y2.revenue)}</b>`],
      ['銷貨成本（集貨與物流）', '−' + m(y1.cogs), '−' + m(y2.cogs)],
      ['<b>毛利</b>', `<b>${m(y1.gross)}</b>`, `<b>${m(y2.gross)}</b>`],
      ['毛利率', pc(y1.grossMargin), pc(y2.grossMargin)],
      ['營運與行銷費用', '−' + m(y1.opex), '−' + m(y2.opex)],
      ['<b>淨利</b>',
       `<b class="${y1.net < 0 ? 'neg' : 'pos'}">${m(y1.net)}</b>`,
       `<b class="${y2.net < 0 ? 'neg' : 'pos'}">${m(y2.net)}</b>`],
      ['淨利率', pc(y1.netMargin), pc(y2.netMargin)],
      ['<b>每棵樹貢獻毛利</b>',
       `<b>${m(y1.gross / (y1.trees || 1))}</b>／棵`,
       `<b>${m(y2.gross / (y2.trees || 1))}</b>／棵`],
    ]);

  /* 結論 —— 直接寫成可以唸出來的句子 */
  const be = breakevenTrees(1);
  document.getElementById('fin-verdict').innerHTML = `
    <p>
      第 1 年以 <b>${y1.trees} 棵樹</b>的試點規模，營收 <b>${m(y1.revenue)}</b>、
      毛利率 <b>${pc(y1.grossMargin)}</b>、淨利 <b class="${y1.net < 0 ? 'neg' : 'pos'}">${m(y1.net)}</b>
      —— ${y1.net < 0
        ? `如同教練所說，<b>試點規模本來就不會打平</b>，這一年是在驗證模式。`
        : `已可打平。`}
      ${be ? `在其他條件不變下，約需 <b>${be} 棵樹</b>才能損益兩平。` : ''}
    </p>
    <p>
      第 2 年擴到 <b>${y2.trees} 棵</b>，營收成長到 <b>${m(y2.revenue)}</b>、
      淨利 <b class="${y2.net < 0 ? 'neg' : 'pos'}">${m(y2.net)}</b>（淨利率 ${pc(y2.netMargin)}）。
      模式的槓桿在於<b>樹數</b>與<b>認養率</b> —— 平台不壓貨、不建冷鏈，
      每多一棵樹幾乎不增加固定成本。
    </p>
    <p class="dim">
      Song 一季約產 650 公噸 Dabai、其中約 80% 因為找不到買家而浪費。
      即使只承接其中 1%，就是 6.5 公噸 —— 上表的規模仍遠低於當地實際的浪費量。
    </p>`;
}
