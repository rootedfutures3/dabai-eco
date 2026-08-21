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
  iba:{ label: 'JAKU IBAN',     htmlLang: 'iba',     dict: () => window.LANG_IBA },
};

const I18N = {
  lang: 'zh',
  dict: null,
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

    // 2) 數字樣板：把數字抽成 {n} 再查，例如
    //    「36 棵」→ 樣板「{n} 棵」；「上架 36 棵」→「上架 {n} 棵」
    //    這樣帶數字的動態字串不必逐一列進字典。
    const nums = [];
    const tpl = key.replace(/\d[\d,.]*/g, m => { nums.push(m); return '{n}'; });
    if (nums.length) {
      const tt = this.dict[tpl];
      if (tt !== undefined) {
        let i = 0;
        return tt.replace(/\{n\}/g, () => nums[i++] ?? '');
      }
    }
    return s;
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
      if (el.closest('script,style,code,pre,.lang-menu,.lang-toggle,.logo,.foot-brand b')) return;
      /* 整段替換是用 textContent 寫回去的，會把子元素整個抹掉。
         所以只要元素裡有「不是純文字」的東西，就不能整段處理：

         · 表單控制項 —— 例如 <div class="fld"><label>對象</label><select id="po-subject">
           這個 div 的 textContent 剛好是「對象」，字典查得到，
           整段替換會連 <select> 一起消失，後面的程式就抓不到那個 id 了。
         · 圖片與向量圖 —— 同理會被抹掉。
         · 區塊子元素 —— <div class="reveal"><h2>…</h2><p>…</p></div>
           不是一個句子，不該被當成單一段落。

         這些一律跳過，交給第二輪逐節點翻譯處理。 */
      if (el.querySelector('input,select,textarea,img,svg,video,iframe,canvas')) return;
      if (el.tagName === 'DIV' &&
          el.querySelector('div,section,article,ul,ol,li,table,form,p,h1,h2,h3,h4,h5,h6,button,label')) return;

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
        el.textContent = out;
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
        if (p.closest('script,style,code,pre,.lang-menu,.lang-toggle')) return NodeFilter.FILTER_REJECT;
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

    document.documentElement.lang = cfg.htmlLang;
    try { localStorage.setItem(I18N_KEY, lang); } catch (e) {}

    this.apply(document.body);
    this.syncSwitch();
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
          `<button class="lang-btn" data-lang="${k}" type="button" role="menuitem">${v.label}</button>`).join('')}
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
