/* ============================================================
   營運數據（後台 #analytics）
   ------------------------------------------------------------
   回答幾個問題：
     會員有沒有回來用？用了哪些功能？
     訪客走到認養的哪一步就離開了？
     這段時間的認養、回報、發文，跟上一期比是多還是少？

   兩種資料來源：
     1. 本來就有的紀錄 —— 訂單、回報、貼文、撥款、企業提案、帳號註冊。
        這些不用另外設定，馬上就有數字。
     2. 動作紀錄（events 表，assets/track.js 寫入）—— 登入、打開哪個
        後台分頁、瀏覽哪一頁、打開認養表單。表還沒建的話這些數字顯示「—」，
        畫面上會說要跑 supabase-migrate-events.sql。

   「上一期」是緊接在前面、一樣長的一段時間；
   本月／上月／今年改用日曆對齊（上個月同一段、去年同一段）。

   這支檔案用到 erp.js 的 table / num / qty / money / tw / H / growth，
   所以要排在 erp.js 後面載入。
   ============================================================ */

const An = (() => {
  const S = {
    preset: 'd30',
    from: '', to: '', prev: null,
    view: 'overview',
    cohort: 'members',
    who: '',
    ev: { state: 'idle', rows: [], key: '' },
    stamp: null,
    bound: false,
  };

  /* ---------- 日期 ---------- */
  const pad = n => String(n).padStart(2, '0');
  const ds = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ds(d); };
  const span = (a, b) => Math.round((parse(b) - parse(a)) / 864e5) + 1;
  const monthStart = (y, m) => ds(new Date(y, m, 1));
  const monthEnd = (y, m) => ds(new Date(y, m + 1, 0));
  const weekStart = s => { const d = parse(s); return addDays(s, -((d.getDay() + 6) % 7)); };
  const day = v => String(v || '').slice(0, 10);
  const evDay = e => ds(new Date(e.at));
  const inR = (s, r) => { const d = day(s); return !!d && d >= r.from && d <= r.to; };

  /** 依預設區間算出本期與上一期。 */
  function setPreset(k) {
    const t = ds(new Date());
    const now = parse(t);
    const y = now.getFullYear(), m = now.getMonth();
    let from, to, prev;
    const back = (f, tt) => {           // 緊接在前面、一樣長
      const n = span(f, tt);
      return { from: addDays(f, -n), to: addDays(f, -1) };
    };
    switch (k) {
      case 'today':     from = to = t; break;
      case 'yesterday': from = to = addDays(t, -1); break;
      case 'd7':        from = addDays(t, -6);  to = t; break;
      case 'd30':       from = addDays(t, -29); to = t; break;
      case 'month': {
        from = monthStart(y, m); to = t;
        const pe = monthEnd(y, m - 1);
        const same = ds(new Date(y, m - 1, now.getDate()));
        prev = { from: monthStart(y, m - 1), to: same < pe ? same : pe };
        break;
      }
      case 'lastmonth':
        from = monthStart(y, m - 1); to = monthEnd(y, m - 1);
        prev = { from: monthStart(y, m - 2), to: monthEnd(y, m - 2) };
        break;
      case 'year':
        from = monthStart(y, 0); to = t;
        prev = { from: monthStart(y - 1, 0), to: ds(new Date(y - 1, m, now.getDate())) };
        break;
      default: return;
    }
    S.preset = k; S.from = from; S.to = to; S.prev = prev || back(from, to);
  }

  function setCustom(from, to) {
    if (!from || !to) return;
    if (from > to) [from, to] = [to, from];
    const n = span(from, to);
    S.preset = 'custom'; S.from = from; S.to = to;
    S.prev = { from: addDays(from, -n), to: addDays(from, -1) };
  }

  const cur = () => ({ from: S.from, to: S.to });

  /* 留存要看最近 8 週的世代，所以事件要往前多抓一段。 */
  function cohortWeeks() {
    const last = weekStart(S.to);
    return Array.from({ length: 8 }, (_, i) => addDays(last, -7 * (7 - i)));
  }
  function windowRange() {
    const start = [S.prev.from, cohortWeeks()[0]].sort()[0];
    return { from: start, to: S.to };
  }

  /* ---------- 事件 ---------- */
  const evOk = () => S.ev.state === 'ok';
  const evIn = r => S.ev.rows.filter(e => { const d = evDay(e); return d >= r.from && d <= r.to; });

  async function loadEvents(force) {
    const w = windowRange();
    const key = `${w.from}|${w.to}`;
    if (!force && S.ev.key === key && S.ev.state !== 'error') return;
    S.ev.key = key;
    S.ev.state = 'loading';
    drawStamp();
    try {
      const fromISO = parse(w.from).toISOString();
      const toISO = parse(addDays(w.to, 1)).toISOString();
      const r = await Track.load(fromISO, toISO);
      if (S.ev.key !== key) return;            // 讀的時候又換了區間
      S.ev.rows = r.rows;
      S.ev.state = r.missing ? 'missing' : 'ok';
    } catch (e) {
      console.warn('[營運數據] 讀不到事件', e.message);
      S.ev.rows = [];
      S.ev.state = 'error';
    }
    S.stamp = new Date();
    render();
  }

  /* ---------- 計算 ---------- */
  function stats(r) {
    const db = Store.read();
    const E = evOk() ? evIn(r) : [];
    const users = db.users || [];

    const members = users.filter(u => !u.joined || day(u.joined) <= r.to).length;
    const active = new Set(E.filter(e => e.u).map(e => e.u));
    (db.posts || []).filter(p => p.by && inR(p.at, r)).forEach(p => active.add(p.by));
    const memberOps = E.filter(e => e.u && e.ev !== 'visit').length;

    const visits = E.filter(e => e.ev === 'visit');
    const vids = new Set(visits.map(e => e.vid));
    const treeV = new Set(visits.filter(e => e.page === 'trees.html').map(e => e.vid));
    const opens = new Set(E.filter(e => e.ev === 'adopt_open').map(e => e.vid));

    const orders = (db.orders || []).filter(o => inR(o.date, r));
    const reports = (db.reports || []).filter(x => inR(x.at, r));
    const posts = (db.posts || []).filter(p => inR(p.at, r));
    const payouts = (db.payouts || []).filter(p => inR(p.date, r));
    const sum = (a, f) => a.reduce((t, x) => t + (Number(f(x)) || 0), 0);

    return {
      signups: users.filter(u => inR(u.joined, r)).length,
      members,
      active: active.size,
      activeRate: members ? active.size / members * 100 : 0,
      logins: E.filter(e => e.ev === 'login').length,
      opsPerActive: active.size ? memberOps / active.size : 0,
      views: visits.length,
      visitors: vids.size,
      treeViewers: treeV.size,
      adoptOpens: opens.size,
      orders: orders.length,
      gmv: sum(orders, o => o.amount),
      paid: sum(orders, o => o.paid),
      fee: sum(orders, o => Store.split(o).fee),
      leads: (db.leads || []).filter(l => inR(l.date, r)).length,
      reports: reports.length,
      photos: sum(reports, x => x.photos),
      attention: reports.filter(x => x.health && x.health !== '良好').length,
      posts: posts.length,
      published: posts.filter(p => p.status === '已發布').length,
      payoutAmt: sum(payouts, p => p.amount),
    };
  }

  const F = {
    n:   v => qty(Math.round(v)),
    rm:  v => money(v),
    pct: v => (Math.round(v * 10) / 10).toFixed(1) + '%',
    d1:  v => (Math.round(v * 10) / 10).toFixed(1),
  };

  /* [key, 標籤, 格式, 需要動作紀錄] */
  const GROUPS = [
    ['會員', [
      ['signups', '新註冊', 'n'],
      ['active', '活躍會員', 'n', true],
      ['activeRate', '活躍率', 'pct', true],
      ['logins', '登入次數', 'n', true],
      ['opsPerActive', '每位活躍會員操作幾次', 'd1', true],
    ]],
    ['網站訪客', [
      ['views', '網站瀏覽次數', 'n', true],
      ['visitors', '不重複訪客', 'n', true],
      ['treeViewers', '看過認養頁的訪客', 'n', true],
      ['adoptOpens', '打開認養表單', 'n', true],
    ]],
    ['認養與收入', [
      ['orders', '新認養訂單', 'n'],
      ['gmv', '認養金額', 'rm'],
      ['paid', '已收款', 'rm'],
      ['fee', '平台佣金', 'rm'],
      ['leads', '企業提案', 'n'],
    ]],
    ['現場與內容', [
      ['reports', '樹況回報', 'n'],
      ['photos', '現場照片', 'n'],
      ['attention', '需注意的回報', 'n'],
      ['posts', '社群貼文', 'n'],
      ['published', '已發布貼文', 'n'],
      ['payoutAmt', '撥給果農', 'rm'],
    ]],
  ];

  function deltaHTML(now, prev) {
    const g = growth(now, prev);
    if (g === null) return '';
    if (Math.abs(g) < 0.5) return '<span class="delta flat">± 0%</span>';
    return `<span class="delta ${g >= 0 ? 'up' : 'down'}">${g >= 0 ? '▲' : '▼'} ${Math.abs(g).toFixed(0)}%</span>`;
  }

  /* ---------- 總覽 ---------- */
  function drawOverview() {
    const box = document.getElementById('an-overview');
    if (!box) return;
    const a = stats(cur()), b = stats(S.prev);
    const need = !evOk();

    const groups = GROUPS.map(([title, cards]) => `
      <h4 class="sub-h">${title}</h4>
      <div class="an-cards">
        ${cards.map(([k, label, f, ev]) => {
          const off = ev && need;
          return `
          <div class="an-card${off ? ' off' : ''}">
            <span class="an-k">${label}</span>
            <b class="an-v">${off ? '—' : F[f](a[k])}</b>
            <span class="an-prev" data-i18n-keep><span>${tw('上一期')}</span> <span>${off ? '—' : F[f](b[k])}</span>${off ? '' : deltaHTML(a[k], b[k])}</span>
          </div>`;
        }).join('')}
      </div>`).join('');

    box.innerHTML = groups + `
      <div class="chart-card an-chart-card">
        <div class="an-chart-h">
          <h4 class="sub-h" style="margin:0">每天活躍會員與營運動作</h4>
          <span class="dim">${S.from} – ${S.to}</span>
        </div>
        <div id="an-day-chart"></div>
        <p class="panel-note" style="margin:10px 0 0">營運動作 = 當天的認養訂單、企業提案、樹況回報、社群貼文、撥款加起來。</p>
      </div>`;

    drawDayChart(document.getElementById('an-day-chart'));
  }

  function dayList(r) {
    const n = span(r.from, r.to);
    return Array.from({ length: n }, (_, i) => addDays(r.from, i));
  }

  function drawDayChart(box) {
    if (!box) return;
    const db = Store.read();
    const days = dayList(cur());
    const act = {}, ops = {};
    days.forEach(d => { act[d] = new Set(); ops[d] = 0; });
    if (evOk()) evIn(cur()).forEach(e => { if (e.u) { const d = evDay(e); if (act[d]) act[d].add(e.u); } });
    (db.posts || []).forEach(p => { const d = day(p.at); if (act[d] && p.by) act[d].add(p.by); });
    const bump = d => { if (d in ops) ops[d]++; };
    (db.orders || []).forEach(o => bump(day(o.date)));
    (db.leads || []).forEach(l => bump(day(l.date)));
    (db.reports || []).forEach(x => bump(day(x.at)));
    (db.posts || []).forEach(p => bump(day(p.at)));
    (db.payouts || []).forEach(p => bump(day(p.date)));

    const rows = days.map(d => ({ d, active: act[d].size, ops: ops[d] }));
    const series = [
      ...(evOk() ? [{ key: 'active', label: '活躍會員', cls: 't-1' }] : []),
      { key: 'ops', label: '營運動作', cls: 't-2' },
    ];

    const W = Math.max(660, rows.length * (series.length > 1 ? 18 : 12));
    const Hh = 220, PB = 40, PT = 16, PL = 8;
    const plotH = Hh - PB - PT;
    const top = Math.max(1, ...rows.flatMap(x => series.map(s => x[s.key])));
    const slot = (W - PL * 2) / rows.length;
    const bw = Math.max(2, Math.min(14, slot / (series.length + 1.2)));
    const y = v => PT + plotH - (v / top) * plotH;
    const step = Math.ceil(rows.length / 12);

    const grid = [0, .5, 1].map(f => `
      <line class="g-line" x1="0" x2="${W}" y1="${(PT + plotH * (1 - f)).toFixed(1)}" y2="${(PT + plotH * (1 - f)).toFixed(1)}"/>
      <text class="g-lab" x="4" y="${(PT + plotH * (1 - f) - 4).toFixed(1)}">${qty(Math.round(top * f))}</text>`).join('');

    const bars = rows.map((x, i) => {
      const cx = PL + slot * i + slot / 2;
      const off0 = -((series.length - 1) * (bw + 1)) / 2;
      return series.map((sp, k) => {
        const v = x[sp.key];
        const h = Math.max(v / top * plotH, v ? 1.5 : 0);
        return `<rect class="${sp.cls}" x="${(cx + off0 + k * (bw + 1) - bw / 2).toFixed(1)}" y="${y(v).toFixed(1)}"
                  width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5"><title>${x.d}｜${tw(sp.label)}：${qty(v)}</title></rect>`;
      }).join('') + (i % step === 0
        ? `<text class="x-lab" x="${cx.toFixed(1)}" y="${Hh - PB + 17}" text-anchor="middle">${x.d.slice(5)}</text>` : '');
    }).join('');

    box.innerHTML = `
      <div class="chart-legend">
        ${series.map(sp => `<span data-i18n-keep><i class="sw ${sp.cls}"></i>${tw(sp.label)}</span>`).join('')}
      </div>
      <div class="chart-scroll">
        <svg viewBox="0 0 ${W} ${Hh}" width="${W}" height="${Hh}" role="img" aria-label="${tw('每天活躍會員與營運動作')}">${grid}${bars}</svg>
      </div>`;
  }

  /* ---------- 功能使用 ---------- */
  const TAB_KEYS = () => [...document.querySelectorAll('.side-item[data-tab]')]
    .map(b => [b.dataset.tab, b.dataset.zh || b.textContent.trim()]);

  const ACTIONS = [
    { label: '登入',         ev: 'login' },
    { label: '打開認養表單', ev: 'adopt_open' },
    { label: '送出認養訂單', rec: db => db.orders,  at: o => o.date, who: o => o.email || o.buyer },
    { label: '送出企業提案', rec: db => db.leads,   at: l => l.date, who: l => l.email || l.company },
    { label: '樹況回報',     rec: db => db.reports, at: x => x.at,   who: x => x.by },
    { label: '社群發文',     rec: db => db.posts,   at: p => p.at,   who: p => p.by },
    { label: '撥款給果農',   rec: db => db.payouts, at: p => p.date },
    { label: '開發票',       ev: 'invoice' },
    { label: '開合約',       ev: 'contract' },
  ];

  function useOf(spec, r) {
    if (spec.ev || spec.tab) {
      if (!evOk()) return null;
      const E = evIn(r).filter(e => spec.tab ? (e.ev === 'tab' && e.detail === spec.tab) : e.ev === spec.ev);
      return { n: E.length, who: new Set(E.map(e => e.u || e.vid)).size };
    }
    const rows = (spec.rec(Store.read()) || []).filter(x => inR(spec.at(x), r));
    /* 有些舊資料沒記是誰（例如早期的貼文），那就說不知道，不要說 0 個人。 */
    const who = spec.who ? new Set(rows.map(spec.who).filter(Boolean)).size : null;
    return { n: rows.length, who: who === 0 && rows.length ? null : who };
  }

  function useTable(specs) {
    const data = specs.map(s => ({ s, a: useOf(s, cur()), b: useOf(s, S.prev) }));
    const max = Math.max(1, ...data.map(d => d.a ? d.a.n : 0));
    data.sort((x, y) => (y.a ? y.a.n : -1) - (x.a ? x.a.n : -1));
    return table(
      ['功能', { h: '使用次數', num: true }, { h: '使用人數', num: true }, { h: '上一期', num: true }, '變化'],
      data.map(({ s, a, b }) => [
        `<b>${s.label}</b><span class="an-bar"><i style="width:${a ? (a.n / max * 100).toFixed(1) : 0}%"></i></span>`,
        a ? num(a.n, qty) : '—',
        a && a.who !== null ? num(a.who, qty) : '—',
        b ? num(b.n, qty) : '—',
        a && b ? (deltaHTML(a.n, b.n) || '<span class="dim">—</span>') : '—',
      ]));
  }

  function drawFeatures() {
    const box = document.getElementById('an-features');
    if (!box) return;
    box.innerHTML = `
      <h4 class="sub-h">動作</h4>
      <p class="panel-note">認養、提案、回報、發文、撥款是從資料本身算的；登入、打開表單、開發票與合約要有動作紀錄才算得出來。</p>
      <div class="table-scroll"><table id="an-t-actions"></table></div>
      <h4 class="sub-h">後台頁面</h4>
      <p class="panel-note">每個後台分頁被打開幾次、幾個人在用。沒人打開的頁，可能是不需要，也可能是大家不知道它在那裡。</p>
      <div class="table-scroll"><table id="an-t-tabs"></table></div>`;
    document.getElementById('an-t-actions').innerHTML = useTable(ACTIONS);
    document.getElementById('an-t-tabs').innerHTML =
      useTable(TAB_KEYS().map(([tab, label]) => ({ label, tab })));
  }

  /* ---------- 漏斗 ---------- */
  function funnelHTML(title, note, steps) {
    const first = steps[0].n;
    return `
      <div class="an-funnel">
        <h4 class="sub-h">${title}</h4>
        <p class="panel-note">${note}</p>
        ${steps.map((s, i) => {
          const prev = i ? steps[i - 1].n : null;
          const w = first ? (s.n / first * 100) : 0;
          const conv = i && prev ? `<span class="an-conv">→ ${Math.round(s.n / prev * 100)}%</span>` : '';
          return `
          <div class="an-step">
            <span class="an-step-k">${s.label}</span>
            <span class="an-step-bar"><i style="width:${s.n === null ? 0 : Math.max(w, s.n ? 1.5 : 0).toFixed(1)}%"></i></span>
            <b class="an-step-v">${s.n === null ? '—' : qty(s.n)}</b>
            ${s.n === null ? '' : conv}
          </div>`;
        }).join('')}
      </div>`;
  }

  function drawFunnel() {
    const box = document.getElementById('an-funnel');
    if (!box) return;
    const r = cur();
    const db = Store.read();
    const E = evOk() ? evIn(r) : [];

    /* 1. 訪客認養：同一個訪客代號一路往下走了幾步。 */
    let visit = null;
    if (evOk()) {
      const vis = new Set(E.filter(e => e.ev === 'visit').map(e => e.vid));
      const sawTrees = new Set(E.filter(e => e.ev === 'visit' && e.page === 'trees.html' && vis.has(e.vid)).map(e => e.vid));
      const opened = new Set(E.filter(e => e.ev === 'adopt_open' && sawTrees.has(e.vid)).map(e => e.vid));
      const ordered = new Set(E.filter(e => e.ev === 'order' && opened.has(e.vid)).map(e => e.vid));
      visit = [vis.size, sawTrees.size, opened.size, ordered.size];
    }

    /* 2. 訂單收款：這段時間成立的訂單，錢走到哪一步。 */
    const orders = (db.orders || []).filter(o => inR(o.date, r));
    const dep = orders.filter(o => Number(o.paid) > 0);
    const full = dep.filter(o => Number(o.paid) >= Number(o.amount));
    const paidOut = full.filter(o => Store.payoutsFor(o.no).length);

    /* 3. 帳號審核：用 Google 申請的人，有沒有真的開始用。 */
    const apply = (db.users || []).filter(u => u.via === 'google' && inR(u.joined, r));
    const ok = apply.filter(u => u.approved !== false);
    let logged = null, used = null;
    if (evOk()) {
      const L = new Set(E.filter(e => e.ev === 'login').map(e => e.u));
      const U = new Set(E.filter(e => e.u && !['visit', 'login'].includes(e.ev)).map(e => e.u));
      const l = ok.filter(u => L.has(u.u));
      logged = l.length;
      used = l.filter(u => U.has(u.u)).length;
    }

    const v = i => visit ? visit[i] : null;
    box.innerHTML =
      funnelHTML('訪客認養漏斗', '同一位訪客一路走下去：來到網站 → 看認養頁 → 打開認養表單 → 送出認養。看哪一步掉最多人，就先改那一步。', [
        { label: '來到網站', n: v(0) }, { label: '看認養頁', n: v(1) },
        { label: '打開認養表單', n: v(2) }, { label: '送出認養', n: v(3) },
      ])
    + funnelHTML('訂單收款漏斗', '這段時間成立的訂單，錢走到哪一步。認養制的重點是錢要在開花前先到果農手上。', [
        { label: '認養訂單', n: orders.length }, { label: '已收訂金', n: dep.length },
        { label: '已付全額', n: full.length }, { label: '已撥款給果農', n: paidOut.length },
      ])
    + funnelHTML('帳號審核漏斗', '用 Google 申請的人，通過之後有沒有真的登入、開始用。', [
        { label: 'Google 申請', n: apply.length }, { label: '已通過', n: ok.length },
        { label: '登入過', n: logged }, { label: '有操作', n: used },
      ]);
  }

  /* ---------- 留存 ---------- */
  function drawRetention() {
    const box = document.getElementById('an-retention');
    if (!box) return;
    const weeks = cohortWeeks();
    const all = evOk() ? S.ev.rows : [];
    const isMem = S.cohort === 'members';

    /* 每個人在哪幾週有出現 */
    const seen = new Map();
    all.forEach(e => {
      const id = isMem ? e.u : e.vid;
      if (!id) return;
      const w = weekStart(evDay(e));
      if (!seen.has(id)) seen.set(id, new Set());
      seen.get(id).add(w);
    });

    /* 世代：會員看註冊那一週；訪客看第一次出現那一週 */
    const cohortOf = new Map();
    if (isMem) {
      (Store.read().users || []).forEach(u => { if (u.joined) cohortOf.set(u.u, weekStart(day(u.joined))); });
    } else {
      seen.forEach((ws, id) => cohortOf.set(id, [...ws].sort()[0]));
    }

    const rows = weeks.map(w => {
      const people = [...cohortOf].filter(([, c]) => c === w).map(([id]) => id);
      const cells = [0, 1, 2, 3, 4].map(k => {
        const wk = addDays(w, 7 * k);
        if (wk > S.to) return null;                        // 還沒到
        if (!people.length || !evOk()) return { n: 0, p: null };
        const n = people.filter(id => seen.get(id)?.has(wk)).length;
        return { n, p: n / people.length * 100 };
      });
      return { w, size: people.length, cells };
    });

    const cell = c => {
      if (c === null) return '<td class="an-ret-cell future"></td>';
      if (c.p === null) return '<td class="an-ret-cell">—</td>';
      return `<td class="an-ret-cell" style="--a:${(c.p / 100 * 0.85 + 0.05).toFixed(2)}" title="${qty(c.n)}">${Math.round(c.p)}%</td>`;
    };

    box.innerHTML = `
      <div class="an-sub-switch" role="tablist">
        <button class="an-chip${isMem ? ' on' : ''}" data-cohort="members" type="button">會員</button>
        <button class="an-chip${!isMem ? ' on' : ''}" data-cohort="visitors" type="button">網站訪客</button>
      </div>
      <p class="panel-note">${isMem
        ? '每一列是同一週註冊的會員。W0 是註冊那一週，W1 是下一週還有沒有回來用，以此類推。'
        : '每一列是同一週第一次來的訪客。W0 是第一次來那一週，W1 是下一週還有沒有再來，以此類推。'}</p>
      ${evOk() ? '' : '<p class="panel-note"><b>留存要有動作紀錄才算得出來。</b></p>'}
      <div class="table-scroll">
        <table class="an-ret">
          <thead><tr><th>週起始</th><th class="num">人數</th><th>W0</th><th>W1</th><th>W2</th><th>W3</th><th>W4</th></tr></thead>
          <tbody>${rows.map(r => `
            <tr><td data-label="">${r.w}</td><td class="num">${qty(r.size)}</td>${r.cells.map(cell).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  /* ---------- 會員活動 ---------- */
  const EV_LABEL = {
    visit: '瀏覽', login: '登入', tab: '打開後台', order: '送出認養訂單', lead: '送出企業提案',
    report: '送出樹況回報', post: '社群發文', payout: '撥款', invoice: '開發票',
    contract: '開合約', adopt_open: '打開認養表單',
  };
  const PAGE_NAME = {
    'index.html': '首頁', 'trees.html': '包樹認養', 'orchards.html': '果園列表', 'platform.html': '媒合平台',
    'esg.html': '企業 ESG', 'products.html': '產品線', 'dabai.html': '認識 Dabai', 'sustainability.html': '永續藍圖',
    'contact.html': '加入平台', 'app.html': '登入', 'dashboard.html': '入口頁', 'erp.html': 'TANJU Portal',
    'coordinator.html': '溝通者平台',
  };
  const tabName = k => (TAB_KEYS().find(([t]) => t === k) || [k, k])[1];

  function whoHTML(u, vid) {
    if (!u) return `<span class="dim">訪客</span> <code>${H(String(vid || '').slice(1, 6))}</code>`;
    const x = (Store.read().users || []).find(y => y.u === u);
    return `<b>${H(x ? (x.name || u) : u)}</b><span class="sub-line">${H(u)}</span>`;
  }

  function whatHTML(e) {
    const label = `<span>${EV_LABEL[e.ev] || H(e.ev)}</span>`;
    if (e.ev === 'tab') return `${label} <span class="pill">${tabName(e.detail)}</span>`;
    if (e.ev === 'visit') return `${label} <span class="pill">${PAGE_NAME[e.page] || H(e.page)}</span>`;
    return label + (e.detail ? ` <code>${H(e.detail)}</code>` : '');
  }

  function memberRows(r) {
    const E = evOk() ? evIn(r) : [];
    const users = Store.read().users || [];
    const by = new Map();
    const get = u => {
      if (!by.has(u)) by.set(u, { u, login: 0, tabs: 0, ops: 0, last: '', tabUse: {} });
      return by.get(u);
    };
    E.filter(e => e.u).forEach(e => {
      const m = get(e.u);
      if (e.ev === 'login') m.login++;
      else if (e.ev === 'tab') { m.tabs++; m.tabUse[e.detail] = (m.tabUse[e.detail] || 0) + 1; }
      else if (e.ev !== 'visit') m.ops++;
      const t = new Date(e.at);
      const stamp = `${ds(t)} ${pad(t.getHours())}:${pad(t.getMinutes())}`;
      if (stamp > m.last) m.last = stamp;
    });
    /* 沒有動作紀錄也看得到的：誰發了文 */
    (Store.read().posts || []).filter(p => p.by && inR(p.at, r)).forEach(p => {
      const m = get(p.by);
      if (!evOk()) m.ops++;
      if (String(p.at) > m.last) m.last = String(p.at);
    });
    return [...by.values()].map(m => {
      const x = users.find(y => y.u === m.u) || {};
      const perm = x.perm || (x.role === 'admin' ? 'super' : x.role);
      const top = Object.entries(m.tabUse).sort((a, b) => b[1] - a[1])[0];
      return { ...m, name: x.name || m.u, perm, top: top ? top[0] : '' };
    }).sort((a, b) => b.last.localeCompare(a.last));
  }

  function drawMembers() {
    const box = document.getElementById('an-members');
    if (!box) return;
    const r = cur();
    const ms = memberRows(r);
    if (S.who && !ms.some(m => m.u === S.who)) S.who = '';

    const feed = (evOk() ? evIn(r) : [])
      .filter(e => !S.who || e.u === S.who)
      .slice(-80).reverse();

    box.innerHTML = `
      <h4 class="sub-h">會員</h4>
      <p class="panel-note">這段時間有登入或有操作的會員。</p>
      <div class="table-scroll"><table id="an-t-members"></table></div>

      <div class="an-feed-h">
        <h4 class="sub-h" style="margin:0">最近的動作</h4>
        <label class="an-who">
          <span>只看</span>
          <select id="an-who">
            <option value="">全部（含訪客）</option>
            ${ms.map(m => `<option value="${H(m.u)}"${m.u === S.who ? ' selected' : ''}>${H(m.name)}（${H(m.u)}）</option>`).join('')}
          </select>
        </label>
      </div>
      ${evOk() ? '' : '<p class="panel-note"><b>最近的動作要有動作紀錄才看得到。</b></p>'}
      <div class="table-scroll"><table id="an-t-feed"></table></div>`;

    document.getElementById('an-t-members').innerHTML = table(
      ['會員', '權限', { h: '登入', num: true }, { h: '打開後台頁面', num: true }, { h: '操作', num: true }, '最常用', '最後活動'],
      ms.map(m => [
        whoHTML(m.u),
        `<span class="pill">${(PERMS[m.perm] || {}).label || H(m.perm || '—')}</span>`,
        evOk() ? num(m.login, qty) : '—',
        evOk() ? num(m.tabs, qty) : '—',
        num(m.ops, qty),
        m.top ? `<span class="pill">${tabName(m.top)}</span>` : '<span class="dim">—</span>',
        m.last || '—',
      ]));

    document.getElementById('an-t-feed').innerHTML = table(
      ['時間', '誰', '做了什麼', '頁面'],
      feed.map(e => {
        const t = new Date(e.at);
        return [
          `${ds(t)} ${pad(t.getHours())}:${pad(t.getMinutes())}`,
          whoHTML(e.u, e.vid),
          whatHTML(e),
          PAGE_NAME[e.page] ? `<span>${PAGE_NAME[e.page]}</span>` : H(e.page || '—'),
        ];
      }));

    document.getElementById('an-who').addEventListener('change', ev => {
      S.who = ev.target.value;
      drawMembers();
    });
  }

  /* ---------- 匯出 ---------- */
  function exportCsv() {
    const a = stats(cur()), b = stats(S.prev);
    const need = !evOk();
    const out = [];
    const row = (...c) => out.push(c);
    row('TANJU', tw('營運數據'));
    row(tw('日期區間'), `${S.from} – ${S.to}`);
    row(tw('上一期'), `${S.prev.from} – ${S.prev.to}`);
    row();
    row(tw('類別'), tw('指標'), tw('本期'), tw('上一期'));
    GROUPS.forEach(([g, cards]) => cards.forEach(([k, label, f, ev]) => {
      const off = ev && need;
      const v = x => off ? '' : (f === 'rm' ? Math.round(x * 100) / 100 : f === 'n' ? Math.round(x) : Math.round(x * 10) / 10);
      row(tw(g), tw(label), v(a[k]), v(b[k]));
    }));
    row();
    row(tw('功能'), tw('使用次數'), tw('使用人數'), tw('上一期'));
    [...ACTIONS, ...TAB_KEYS().map(([tab, label]) => ({ label, tab }))].forEach(s => {
      const x = useOf(s, cur()), y = useOf(s, S.prev);
      row(tw(s.label), x ? x.n : '', x && x.who !== null ? x.who : '', y ? y.n : '');
    });
    row();
    row(tw('會員'), tw('帳號'), tw('登入'), tw('打開後台頁面'), tw('操作'), tw('最後活動'));
    memberRows(cur()).forEach(m => row(m.name, m.u, need ? '' : m.login, need ? '' : m.tabs, m.ops, m.last));

    const csv = '﻿' + out.map(r => r.map(c => {
      const s = String(c ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `tanju-analytics_${S.from}_${S.to}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /* ---------- 外框 ---------- */
  function drawStamp() {
    const el = document.getElementById('an-stamp');
    if (!el) return;
    if (S.ev.state === 'loading') { el.textContent = tw('讀取中…'); return; }
    el.textContent = S.stamp ? `${pad(S.stamp.getHours())}:${pad(S.stamp.getMinutes())}` : '—';
  }

  function drawFrame() {
    document.querySelectorAll('#an-range [data-range]').forEach(b =>
      b.classList.toggle('on', b.dataset.range === S.preset));
    const f = document.getElementById('an-from'), t = document.getElementById('an-to');
    if (f) f.value = S.from;
    if (t) t.value = S.to;
    const sp = document.getElementById('an-span');
    if (sp) sp.innerHTML = `<span>${tw('上一期')}</span> ${S.prev.from} – ${S.prev.to}`;

    const n = document.getElementById('an-notice');
    if (n) {
      const msg = {
        missing: '還沒開始記錄登入和瀏覽，所以標「—」的數字算不出來。要開始記錄：Supabase → SQL Editor → 貼上專案裡的 supabase-migrate-events.sql → Run。建好之後會從那一刻開始累積。',
        error: '動作紀錄暫時讀不到（網路或資料庫問題），標「—」的數字先算不出來。按「立即更新」再試一次。',
      }[S.ev.state];
      n.hidden = !msg;
      if (msg) n.innerHTML = `<b>ⓘ</b> <span>${tw(msg)}</span>`;
    }

    document.querySelectorAll('#an-switch .ovs').forEach(b => {
      const on = b.dataset.an === S.view;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
    document.querySelectorAll('.an-view').forEach(v => v.classList.toggle('on', v.dataset.an === S.view));
    drawStamp();
  }

  function bind() {
    if (S.bound) return;
    S.bound = true;
    document.getElementById('an-range').addEventListener('click', e => {
      const b = e.target.closest('[data-range]');
      if (!b) return;
      setPreset(b.dataset.range);
      render();
      loadEvents();
    });
    ['an-from', 'an-to'].forEach(id => document.getElementById(id).addEventListener('change', () => {
      setCustom(document.getElementById('an-from').value, document.getElementById('an-to').value);
      render();
      loadEvents();
    }));
    document.getElementById('an-switch').addEventListener('click', e => {
      const b = e.target.closest('.ovs');
      if (!b) return;
      S.view = b.dataset.an;
      drawFrame();
    });
    document.getElementById('an-retention').addEventListener('click', e => {
      const b = e.target.closest('[data-cohort]');
      if (!b) return;
      S.cohort = b.dataset.cohort;
      drawRetention();
    });
    document.getElementById('an-refresh').addEventListener('click', async () => {
      const btn = document.getElementById('an-refresh');
      btn.disabled = true;
      try { await Store.boot(); } catch (e) {}
      await loadEvents(true);
      btn.disabled = false;
    });
    document.getElementById('an-export').addEventListener('click', exportCsv);
  }

  function render() {
    if (!document.getElementById('an-overview')) return;
    if (!S.from) setPreset(S.preset);
    bind();
    const step = (name, fn) => {
      try { fn(); } catch (e) { console.error(`[營運數據] ${name} 沒畫成功`, e); }
    };
    step('外框', drawFrame);
    step('總覽', drawOverview);
    step('功能使用', drawFeatures);
    step('漏斗', drawFunnel);
    step('留存', drawRetention);
    step('會員活動', drawMembers);
  }

  /** 第一次打開這個分頁時才去讀事件，不讓每次進後台都多一個請求。 */
  function ensure() {
    if (!S.from) setPreset(S.preset);
    loadEvents();
  }

  return { render, ensure, _state: S };
})();
