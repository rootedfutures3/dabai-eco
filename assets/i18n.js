/* ============================================================
   ROOTED FUTURES — 多語言切換
   ------------------------------------------------------------
   作法：HTML 維持繁體中文為原文，執行時走訪文字節點，
   用「中文原文」當 key 去字典換成馬來文／英文。
   好處是不必在 14 個頁面加 data-i18n，之後補譯文只要改字典；
   字典查不到就原樣顯示中文，不會出現空白或 key 名稱。

   動態產生的內容（果樹卡、表格、彈窗）由 MutationObserver 自動補譯。
   ============================================================ */

const I18N_KEY = 'rf_lang';
const LANGS = {
  zh: { label: '中文',          htmlLang: 'zh-Hant', dict: null },
  en: { label: 'ENGLISH',       htmlLang: 'en',      dict: () => window.LANG_EN },
  ms: { label: 'BAHASA MELAYU', htmlLang: 'ms',      dict: () => window.LANG_MS },
  /* Iban 的字典還在建置，目前只有導覽和常用字。
     fallback 指定 ms 的意思是：查不到的句子退到馬來文，不是退到中文。
     Song 當地的 Iban 使用者讀得懂馬來文，讀不懂中文 ——
     退到中文等於這個選項對他們沒有用。 */
  iba:{ label: 'JAKU IBAN', htmlLang: 'iba', dict: () => window.LANG_IBA,
        fallback: 'ms', partial: true },
};

const I18N = {
  lang: 'zh',
  dict: null,
  fallbackDict: null,
  observer: null,

  /** 目前語言的字典（中文時為 null） */
  get map() { return this.dict; },

  norm(s) { return s.replace(/\s+/g, ' ').trim(); },

  translate(s) {
    if (!this.dict) return s;
    const key = this.norm(s);

    // 1) 完全比對
    const t = this.dict[key];
    if (t !== undefined) return t;

    /* 這個語言的字典還不完整時，先問備援語言，再放棄。
       放棄的結果是原樣回傳，也就是中文。 */
    if (this.fallbackDict) {
      const f = this.fallbackDict[key];
      if (f !== undefined) return f;
    }

    // 2) 數字樣板：把數字抽成 {n} 再查，例如
    //    「36 棵」→ 樣板「{n} 棵」；「上架 36 棵」→「上架 {n} 棵」
    //    這樣帶數字的動態字串不必逐一列進字典。
    const nums = [];
    // 負號要一起吃掉，否則「淨利率 -13.7%」會被拆成「-{n}%」而查不到字典
    const tpl = key.replace(/-?\d[\d,.]*/g, m => { nums.push(m); return '{n}'; });
    if (nums.length) {
      const tt = this.dict[tpl];
      if (tt !== undefined) {
        let i = 0;
        return tt.replace(/\{n\}/g, () => nums[i++] ?? '');
      }
    }
    // 3) 自由樣板：字典 key 裡寫 {a}、{b} 之類的佔位符，
    //    用來對付程式產生、中間夾著人名地名的字串，例如
    //      '{a}, Sarawak · 果農：{b}'
    //    這樣就不必把每一個果農的名字都列進字典。
    for (const [re, out, slots] of this.patterns()) {
      const m = key.match(re);
      if (!m) continue;
      // 依名字對應，不能照順序填 —— 譯文的語序常常和中文不一樣，
      // 例如 '{a}｜{b} 年生的{c}' 的馬來文是 '{a} — pokok {c} berusia {b} tahun'。
      const val = {};
      // 擷取到的片段自己也可能查得到字典 —— 例如 '{a}, Sarawak · 果農：{b}'
      // 裡的 {b} 是「Ak. Jelani 一家」，字典裡有它，就一起翻掉。
      slots.forEach((name, i) => {
        const raw = m[i + 1] ?? '';
        val[name] = this.dict[this.norm(raw)] ?? raw;
      });
      return out.replace(/\{([a-z])\}/g, (_, name) => val[name] ?? '');
    }

    return s;
  },

  /**
   * 程式改寫過某個元素的內容之後要呼叫這個。
   *
   * apply() 會把元素的原文記在 data-o-full / data-o-html，之後切語言都
   * 依那份快取翻譯。如果程式在那之後才用 innerHTML 換掉內容（例如 ERP
   * 開頁連上雲端後改寫狀態列），快取就過期了 —— 一切語言就會跳回舊句子。
   * 呼叫這個把快取清掉並重譯，畫面才會跟著新內容走。
   */
  /**
   * 這一塊的內容被程式改過了，重新翻一次。
   *
   * 清記錄之前一定要先把原文放回去。順序顛倒的話會出事：
   * 畫面上當下是英文，清掉記錄再重新掃一遍，引擎就把「Sign In」
   * 當成原文記下來 —— 這一塊從此卡在英文，切回中文也回不來，
   * 而且看起來像壞掉而不是像沒翻譯。登入卡片就是這樣壞的。
   */
  refresh(el) {
    if (!el) return;

    /* 先還原。祖先在前（querySelectorAll 是文件順序），
       還原祖先的 innerHTML 會連同底下整段標記一起換回來，
       所以之後遇到已經脫離文件的子節點就跳過。 */
    /* 只還原「還是我們自己翻出來的那個結果」的節點。
       呼叫 refresh 的人常常是剛剛才把新字寫進去（麵包屑就是這樣），
       無條件還原會把那個新字換成上一次的舊原文。 */
    const mine = (now, orig) => now === orig || now === this.translate(orig);

    const marked = [el, ...el.querySelectorAll('[data-o-full],[data-o-html],[data-o-text]')];
    marked.forEach(n => {
      if (!n.isConnected || !n.dataset) return;
      if (n.dataset.oHtml !== undefined) {
        if (mine(this.norm(n.textContent), n.dataset.oFull ?? this.norm(n.textContent))) {
          n.innerHTML = n.dataset.oHtml;
        }
      } else if (n.dataset.oText !== undefined) {
        if (mine(n.textContent, n.dataset.oText)) n.textContent = n.dataset.oText;
      }
    });

    /* 剩下沒有被整段還原到的文字節點，用 __o 各自還原 */
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const texts = []; let n;
    while ((n = w.nextNode())) texts.push(n);
    texts.forEach(t => {
      if (t.__o !== undefined && mine(t.nodeValue, t.__o)) t.nodeValue = t.__o;
    });

    /* 記錄清乾淨，讓 apply 重新以「真正的原文」建檔 */
    [el, ...el.querySelectorAll('[data-o-full],[data-o-html],[data-o-text]')].forEach(m => {
      if (!m.dataset) return;
      delete m.dataset.oFull; delete m.dataset.oHtml; delete m.dataset.oText;
    });
    const w2 = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n2; while ((n2 = w2.nextNode())) delete n2.__o;

    this.apply(el);
  },

  /** 把字典裡含佔位符的 key 編成正則。每個語言只算一次。 */
  patterns() {
    if (this._pats && this._patsLang === this.lang) return this._pats;
    const list = [];
    for (const k of Object.keys(this.dict)) {
      if (!/\{[a-z]\}/.test(k)) continue;
      // 先把非佔位符的部分逐字轉義，再把佔位符換成擷取群組
      // slots 記下佔位符在「原文」裡出現的順序，之後才能對回名字
      const slots = [];
      const re = k.split(/(\{[a-z]\})/).map(part => {
        const hit = part.match(/^\{([a-z])\}$/);
        if (hit) { slots.push(hit[1]); return '(.+?)'; }
        return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }).join('');
      list.push([new RegExp('^' + re + '$'), this.dict[k], slots]);
    }
    this._pats = list;
    this._patsLang = this.lang;
    return list;
  },

  /** 走訪整棵樹，翻譯文字節點與特定屬性 */
  apply(root) {
    root = root || document.body;
    if (!root || root.nodeType !== 1) return;

    /* --- 屬性 --- */
    const ATTRS = ['placeholder', 'title', 'alt', 'aria-label'];
    // dataset 的 key 不能含連字號（aria-label 會丟例外），先轉成合法名稱
    const dkey = a => 'o' + a.replace(/-([a-z])/g, (m, c) => c.toUpperCase());
    [root, ...root.querySelectorAll('*')].forEach(el => {
      if (el.nodeType !== 1) return;
      ATTRS.forEach(a => {
        if (!el.hasAttribute(a)) return;
        const k = dkey(a);
        if (el.dataset[k] === undefined) el.dataset[k] = el.getAttribute(a);
        el.setAttribute(a, this.translate(el.dataset[k]));
      });
      if (el.tagName === 'OPTION') {
        if (el.dataset.oText === undefined) el.dataset.oText = el.textContent;
        el.textContent = this.translate(el.dataset.oText);
      }
    });

    /* --- 第一輪：整個元素比對 ---
       像「🧪 <b>示範系統</b> —— 沒有伺服器…」這種句子會被 <b> 切成好幾個
       文字節點，逐節點翻譯永遠對不上整句的 key。所以先用元素的完整
       textContent 去查字典，查得到就整段替換（內嵌的 <b> 會被攤平，
       這是可接受的取捨）。查不到才交給第二輪逐節點處理。 */
    const BLOCKS = 'p,li,h1,h2,h3,h4,h5,b,strong,span,small,em,i,dt,dd,td,th,button,a,label,summary,figcaption,div';
    const cands = [root, ...root.querySelectorAll(BLOCKS)];
    const handled = new Set();

    cands.forEach(el => {
      if (el.nodeType !== 1) return;
      if (handled.has(el)) return;
      // 已被祖先整段處理過就跳過
      for (let a = el.parentElement; a; a = a.parentElement) if (handled.has(a)) return;
      // 品牌字標不翻譯
      /* .post-body 是要發出去的社群文案本身。它的語言是使用者在卡片上
         自己選的（中文給華人社群、馬來文給在地、英文給海外），
         跟後台介面用什麼語言是兩回事。讓 i18n 去翻它，
         中文文案裡會冒出「a 34-year-old」這種半截英文，
         而使用者複製出去就是壞的。

         只排除文案那一格，不是整張卡 —— 卡片上的按鈕與提示
         還是要跟著介面語言走。

         .doc-sheet 是發票與合約。那兩份自己就有三種語言版本（見 docs.js），
         整份一起產出。不能讓逐句翻譯碰它 —— 字典裡剛好有的詞會被換掉、
         沒有的留著，結果是「甲方 · Platform」「Variety … 所在果園」
         這種半中半英的合約，比整份中文還糟。 */
      /* .side-avatar 放的是名字的第一個字，不是一個詞。
         「平台管理員」的「平」剛好在字典裡（'平' → 'Flat'），
         於是英文版的頭像變成 Flat、馬來文版變成 Rata。 */
      if (el.closest('script,style,code,pre,.lang-menu,.lang-toggle,.logo,.foot-brand b,.doc-sheet,.post-body,.side-avatar')) return;
      /* 整段替換是用 textContent 寫回去的，會把子元素整個抹掉。
         所以只要元素裡有「不是純文字」的東西，就不能整段處理：

         · 表單控制項與按鈕 —— 例如 <div class="fld"><label>對象</label><select id="po-subject">
           這個 div 的 textContent 剛好是「對象」，字典查得到，
           整段替換會連 <select> 一起消失，後面的程式就抓不到那個 id 了。
           表格裡 <td><button data-user-edit="…">編輯</button></td> 也一樣：
           「編輯」查得到字典，整段替換之後按鈕連同 data 屬性一起不見。
           按鈕自己仍然會被當成候選元素翻譯，所以文字不會漏翻。
         · 圖片與向量圖 —— 同理會被抹掉。
         · 區塊子元素 —— <div class="reveal"><h2>…</h2><p>…</p></div>
           不是一個句子，不該被當成單一段落。

         這些一律跳過，交給第二輪逐節點翻譯處理。 */
      if (el.querySelector('input,select,textarea,img,svg,video,iframe,canvas,button')) return;

      /* 整段替換是用 textContent 寫回去的，子元素會連同樣式一起消失。
         大多數情況這樣沒問題（句子裡的 <b> 本來就該被整句取代），
         但排版用的容器不行 —— 例如成長率徽章和說明文字並排的那種。
         那些地方標上 data-i18n-keep，這裡就跳過，改用逐節點翻譯。

         用明確標記而不是猜（例如「子元素有沒有 class」）：
         <h1>果園列表 · <span class="accent">開放認養</span></h1>
         的 .accent 也是有 class 的，但它就是句子的一部分，該整句翻。 */
      if (el.hasAttribute('data-i18n-keep')) return;
      if (el.tagName === 'DIV' &&
          el.querySelector('div,section,article,ul,ol,li,table,form,p,h1,h2,h3,h4,h5,h6,button,label')) return;

      /* 文字全部住在子元素裡的容器，不是一個句子，是一個排版盒子：
           <div class="btn-row"><a class="btn" href="platform.html">看平台怎麼運作</a></div>
         這個 div 的 textContent 剛好等於那顆按鈕的字，字典查得到，
         整段替換會把 <a> 連同 href 一起換成純文字 —— 按鈕就這樣消失了。
         判斷依據是「元素自己有沒有非空白的文字節點」：沒有就代表
         它只是個容器，跳過它，讓子元素各自被翻譯。 */
      if (el.children.length && ![...el.childNodes].some(
            n => n.nodeType === 3 && n.textContent.trim())) return;

      if (el.dataset.oHtml === undefined) {
        const txt = this.norm(el.textContent);
        if (!txt || txt.length > 400) return;
        // 只有字典真的收錄整段時才記錄原文，避免無謂佔用
        if (!this.dictHas(txt)) return;
        el.dataset.oHtml = el.innerHTML;
        el.dataset.oFull = txt;
      }
      const out = this.translate(el.dataset.oFull);
      if (out !== el.dataset.oFull) {
        /* 字典值可以自己帶標記。句子裡的連結、<b> 強調、換行都是內容的一
           部分，攤成純文字會讓英文版少掉兩顆按鈕、少掉整段的重點。
           譯文由我們自己寫在 assets/lang/*.js，不是外部輸入，
           所以這裡用 innerHTML 是安全的。 */
        if (out.includes('<')) el.innerHTML = out;
        else el.textContent = out;
        handled.add(el);
      } else if (this.lang === 'zh') {
        el.innerHTML = el.dataset.oHtml;   // 切回中文時還原原本的 <b> 等標記
        handled.add(el);
      }
    });

    /* --- 第二輪：剩下的文字節點 --- */
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (p.closest('script,style,code,pre,.lang-menu,.lang-toggle,.doc-sheet,.post-body,.side-avatar')) return NodeFilter.FILTER_REJECT;
        if (p.tagName === 'OPTION') return NodeFilter.FILTER_REJECT;
        for (let a = p; a; a = a.parentElement) if (handled.has(a)) return NodeFilter.FILTER_REJECT;
        return n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    const nodes = [];
    let n; while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(node => {
      if (node.__o === undefined) node.__o = node.nodeValue;
      const out = this.translate(node.__o);
      if (node.nodeValue !== out) node.nodeValue = out;
    });
  },

  /** 字典裡有沒有這個 key（含 {n} 樣板） */
  dictHas(s) {
    if (!this.dict) {
      // 中文模式：只要任一語言字典收錄就先記下原文，供之後切換使用
      const all = [window.LANG_MS, window.LANG_EN, window.LANG_IBA].filter(Boolean);
      return all.some(d => d[s] !== undefined || d[s.replace(/\d[\d,.]*/g, '{n}')] !== undefined);
    }
    return this.dict[s] !== undefined || this.dict[s.replace(/\d[\d,.]*/g, '{n}')] !== undefined;
  },

  /** 切換語言 */
  set(lang) {
    if (!LANGS[lang]) lang = 'zh';
    this.lang = lang;
    const cfg = LANGS[lang];
    this.dict = cfg.dict ? (cfg.dict() || null) : null;
    /* 字典不完整的語言，查不到就退到備援語言（見 LANGS.iba）。 */
    const fb = cfg.fallback && LANGS[cfg.fallback];
    this.fallbackDict = (fb && fb.dict) ? (fb.dict() || null) : null;

    document.documentElement.lang = cfg.htmlLang;
    try { localStorage.setItem(I18N_KEY, lang); } catch (e) {}

    this.apply(document.body);
    this.dedupeHeadings(document.body);
    this.syncSwitch();

    /* 有些區塊的內容本身就是「用某個語言寫出來的」，不是可以逐句翻譯的
       介面文字 —— 例如社群排程表裡的文案預覽。那種要整段重新產生，
       所以換語言時發一個事件出去，由它們自己重畫。 */
    document.dispatchEvent(new CustomEvent('i18n:change', { detail: { lang } }));
  },

  /**
   * 標題裡的 <small> 是給中文讀者的英文對照，例如
   *   <h4>發文概況 <small>Publishing</small></h4>
   * 介面切成英文之後主標題也變成 Publishing，於是畫面上出現
   * 「PublishingPublishing」。這裡在翻譯完之後比一次：
   * 副標題和主標題講的是同一件事就把它藏起來，
   * 帶額外資訊的（例如「Orders & Unearned Revenue」）留著。
   *
   * 中文模式下一律還原 —— 那時候對照才有用。
   */
  dedupeHeadings(root) {
    const norm = t => String(t || '').toLowerCase().replace(/[\s·&,.\-—/]+/g, '');
    /* panel-h / sub-h 之外，還有一種是「大字放在 span 裡」的寫法
       （溝通者平台的「該去看看了」就是），一樣要去重。 */
    (root || document).querySelectorAll('.panel-h small, .sub-h small, h2 small, h3 small').forEach(sm => {
      const h = sm.parentElement;
      /* 主標可能是純文字節點，也可能包在 <span> 裡 —— 兩種都要抓到，
         否則「Needs a visit / Needs a visit」這種重複會漏掉。 */
      let main = [...h.childNodes]
        .filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
      if (!main) {
        main = [...h.children].filter(c => c !== sm)
          .map(c => c.textContent).join(' ').trim();
      }
      sm.hidden = this.lang !== 'zh' && !!main && norm(main) === norm(sm.textContent);
    });
  },

  syncSwitch() {
    document.querySelectorAll('.lang-btn').forEach(b =>
      b.classList.toggle('on', b.dataset.lang === this.lang));
    const cur = document.querySelector('.lang-current');
    if (cur) cur.textContent = LANGS[this.lang].label;
  },

  /**
   * 在導覽列插入語言切換器。
   * 三個語言全名並排會撐破導覽列（實測 520–768px 與 1280px 以上都溢出），
   * 所以做成下拉：收合時只顯示目前語言，展開後三個都是完整名稱。
   */
  mountSwitch() {
    const nav = document.querySelector('nav');
    if (!nav || nav.querySelector('.lang-switch')) return;

    const box = document.createElement('div');
    box.className = 'lang-switch';
    box.innerHTML = `
      <button class="lang-toggle" type="button" aria-haspopup="true" aria-expanded="false"
              aria-label="切換語言 / Change language">
        <span aria-hidden="true">🌐</span>
        <span class="lang-current">中文</span>
        <span class="lang-caret" aria-hidden="true">▾</span>
      </button>
      <div class="lang-menu" role="menu">
        ${Object.entries(LANGS).map(([k, v]) =>
          /* 字典還沒補完的語言要標出來。不標的話使用者切過去看到滿頁
             別的語言，會以為網站壞了，而不是「這個語言還在做」。 */
          `<button class="lang-btn" data-lang="${k}" type="button" role="menuitem">${v.label}${
             v.partial ? '<small class="lang-wip">sema digaga · 建置中</small>' : ''}</button>`).join('')}
      </div>`;

    const cta = nav.querySelector('.nav-cta');
    cta ? nav.insertBefore(box, cta) : nav.appendChild(box);

    const toggle = box.querySelector('.lang-toggle');
    const close = () => {
      box.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    };

    toggle.addEventListener('click', e => {
      e.stopPropagation();
      const open = box.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });

    box.addEventListener('click', e => {
      const b = e.target.closest('.lang-btn');
      if (!b) return;
      I18N.set(b.dataset.lang);
      close();
    });

    document.addEventListener('click', e => { if (!box.contains(e.target)) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  },

  /** 監看動態新增的內容並即時翻譯 */
  watch() {
    if (this.observer) return;
    this.observer = new MutationObserver(muts => {
      if (!this.dict) return;
      muts.forEach(m => m.addedNodes.forEach(nd => {
        if (nd.nodeType === 1) this.apply(nd);
        else if (nd.nodeType === 3 && nd.nodeValue.trim()) {
          if (nd.__o === undefined) nd.__o = nd.nodeValue;
          nd.nodeValue = this.translate(nd.__o);
        }
      }));
    });
    this.observer.observe(document.body, { childList: true, subtree: true });
  },

  init() {
    let saved = 'zh';
    try { saved = localStorage.getItem(I18N_KEY) || 'zh'; } catch (e) {}
    this.mountSwitch();
    this.watch();
    this.set(saved);
  },
};

window.I18N = I18N;   // 供工具與除錯取用
document.addEventListener('DOMContentLoaded', () => I18N.init());
