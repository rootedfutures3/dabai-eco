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
  zh: { label: '中文', htmlLang: 'zh-Hant', dict: null },
  ms: { label: 'BM',   htmlLang: 'ms',      dict: () => window.LANG_MS },
  en: { label: 'EN',   htmlLang: 'en',      dict: () => window.LANG_EN },
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
    const t = this.dict[this.norm(s)];
    return t === undefined ? s : t;
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
  },

  /** 在導覽列插入語言切換器 */
  mountSwitch() {
    const nav = document.querySelector('nav');
    if (!nav || nav.querySelector('.lang-switch')) return;

    const box = document.createElement('div');
    box.className = 'lang-switch';
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', '語言 / Language');
    box.innerHTML = Object.entries(LANGS).map(([k, v]) =>
      `<button class="lang-btn" data-lang="${k}" type="button">${v.label}</button>`).join('');

    // 放在 CTA 前面
    const cta = nav.querySelector('.nav-cta');
    cta ? nav.insertBefore(box, cta) : nav.appendChild(box);

    box.addEventListener('click', e => {
      const b = e.target.closest('.lang-btn');
      if (b) I18N.set(b.dataset.lang);
    });
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
