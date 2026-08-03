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

    // 屬性
    const ATTRS = ['placeholder', 'title', 'alt', 'aria-label'];
    // dataset 的 key 不能含連字號（aria-label 會丟例外），先轉成合法名稱
    const dkey = a => 'o' + a.replace(/-([a-z])/g, (m, c) => c.toUpperCase());
    const withAttrs = [root, ...root.querySelectorAll('*')];
    withAttrs.forEach(el => {
      if (el.nodeType !== 1) return;
      ATTRS.forEach(a => {
        if (!el.hasAttribute(a)) return;
        const k = dkey(a);
        if (el.dataset[k] === undefined) el.dataset[k] = el.getAttribute(a);
        el.setAttribute(a, this.translate(el.dataset[k]));
      });
      // select 的 option 文字
      if (el.tagName === 'OPTION' && !el.dataset.oText) el.dataset.oText = el.textContent;
      if (el.tagName === 'OPTION') el.textContent = this.translate(el.dataset.oText);
    });

    // 文字節點
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (p.closest('script,style,code,pre')) return NodeFilter.FILTER_REJECT;
        if (p.tagName === 'OPTION') return NodeFilter.FILTER_REJECT;   // 上面處理過
        return n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    const nodes = [];
    let n; while ((n = walker.nextNode())) nodes.push(n);

    nodes.forEach(node => {
      if (node.__o === undefined) node.__o = node.nodeValue;
      const src = node.__o;
      const out = this.translate(src);
      if (node.nodeValue !== out) node.nodeValue = out;
    });
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

document.addEventListener('DOMContentLoaded', () => I18N.init());
