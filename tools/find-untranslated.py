#!/usr/bin/env python3
"""
找出全站還沒翻譯的中文字串。

比對方式刻意跟 assets/i18n.js 對齊：
  · 先用區塊元素的完整 textContent 當 key（句子被 <b> 切斷時才對得上）
  · 對不上就退回單一文字節點
只回報字典裡查不到的，並附上出現在哪幾頁。

用法：
  python3 tools/find-untranslated.py            # 摘要
  python3 tools/find-untranslated.py --json     # 給程式吃的完整清單
"""
import json, pathlib, re, sys
from html.parser import HTMLParser

ROOT = pathlib.Path(__file__).resolve().parent.parent
HAN = re.compile(r'[一-鿿]')
SKIP_TAGS = {'script', 'style', 'code', 'pre'}
SKIP_CLASS = ('lang-menu', 'lang-toggle', 'logo', 'side-brand', 'foot-brand')
BLOCKS = {'p','li','h1','h2','h3','h4','h5','b','strong','span','small','em','i',
          'dt','dd','td','th','button','a','label','summary','figcaption','div','option'}

# 區塊級：一個元素只要含有這類子元素，它自己就不是「一句話」，
# 而是包了好幾句的容器 —— i18n 不會拿整個容器去查字典，這裡也不該回報。
BLOCK_LEVEL = {'p','li','h1','h2','h3','h4','h5','h6','div','section','article',
               'ul','ol','table','tr','td','th','form','dl','dt','dd','header',
               'footer','nav','aside','main','figure','blockquote','option'}

# 含這些子元素時，整段替換會把它們抹掉，i18n 因此跳過整段比對
KILLS_CHILDREN = {'input','select','textarea','img','svg','video','iframe','canvas'}


class Extract(HTMLParser):
    """收集每個區塊元素的完整文字，以及沒有被區塊包住的散落文字節點。"""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        # [tag, skip, [文字片段], 有沒有區塊子元素, 有沒有會被抹掉的子元素]
        self.stack = []
        self.found = []        # 完整句子
        self.loose = []        # 區塊容器裡沒被子區塊包住的散落文字

    def handle_starttag(self, tag, attrs):
        if tag in ('br', 'img', 'input', 'hr', 'meta', 'link'):
            return
        cls = dict(attrs).get('class', '')
        # bool() 不能省：`self.stack and ...` 在 stack 還是空的時候會回傳
        # stack 這個 list 本身，之後它一長大就變成 truthy，整份文件都會被跳過。
        skip = bool(tag in SKIP_TAGS or any(c in cls for c in SKIP_CLASS)
                    or (self.stack and self.stack[-1][1]))
        if self.stack and tag in KILLS_CHILDREN:
            self.stack[-1][4] = True
        self.stack.append([tag, skip, [], False, tag in KILLS_CHILDREN])

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                node = self.stack.pop(i)
                del self.stack[i:]
                text = re.sub(r'\s+', ' ', ''.join(node[2])).strip()

                # 只有「不含區塊子元素、也不含會被抹掉的子元素」的元素，
                # 才是 i18n 真的會拿去查字典的那一段。
                emits = (text and not node[1] and node[0] in BLOCKS
                         and not node[3] and not node[4] and HAN.search(text))
                if emits:
                    self.found.append(text)

                # 把文字與旗標往上傳，外層才拿得到完整句子與正確的判斷
                if self.stack:
                    if node[2]:
                        self.stack[-1][2].append(''.join(node[2]))
                    if node[0] in BLOCK_LEVEL:
                        self.stack[-1][3] = True
                    if node[4]:
                        self.stack[-1][4] = True
                return

    def handle_data(self, data):
        # 這裡刻意「不」去掉前後空白：瀏覽器的 textContent 是把子節點原封不動
        # 接起來的，如果每個片段都先 strip 再用空格接，
        # 「…其中約 <b>八成沒人收</b>，爛在樹上」就會變成「…八成沒人收 ，爛在樹上」，
        # 多一個空格，key 就對不上字典了。
        text = data.strip()
        if not text:
            return
        if self.stack:
            self.stack[-1][2].append(data)
            # 散落在容器裡、沒被任何區塊包住的文字（i18n 第二輪會逐節點翻）
            if not self.stack[-1][1] and HAN.search(text) and self.stack[-1][0] not in BLOCKS:
                self.loose.append(text)
        elif HAN.search(text):
            self.loose.append(text)


def dict_keys(path):
    """從 assets/lang/*.js 撈出所有 key。這些檔案是物件字面值，用正則就夠。"""
    src = path.read_text(encoding='utf-8')
    return set(re.findall(r"^\s*'((?:[^'\\]|\\.)*)'\s*:", src, re.M))


def main():
    pages = sorted(ROOT.glob('*.html'))

    # JS 裡也有大量會顯示出來的中文（帳號綁定的步驟、派工單、提示訊息）。
    # 只掃 HTML 的話這些永遠抓不到 —— 除錯時就是這樣漏了 30 條。
    js_strings = {}
    for jf in sorted((ROOT / 'assets').glob('*.js')):
        src = jf.read_text(encoding='utf-8')
        # 去掉註解，避免把說明文字當成要翻譯的內容
        src = re.sub(r'/\*.*?\*/', '', src, flags=re.S)
        src = re.sub(r'^\s*//.*$', '', src, flags=re.M)
        for m in re.finditer(r"'([^'\\\n]{2,})'|\"([^\"\\\n]{2,})\"", src):
            t = (m.group(1) or m.group(2)).strip()
            if not HAN.search(t):
                continue
            # 只收「看起來像完整句子或標籤」的字串。
            # 樣板碎片、HTML 片段、class 名稱不是給人看的，收進來只會製造噪音：
            #   '<div class="no-result">…</div>'  ← HTML
            #   'badge-${o.status === '已付全額' …'  ← 樣板運算式
            #   '棵'、'張'                        ← 接在數字後面的量詞，靠 {n} 樣板處理
            if any(x in t for x in ('<', '${', '}', 'badge-', '\\n')):
                continue
            if len(t) < 4:
                continue
            js_strings.setdefault(t, set()).add(jf.name)

    langs = {p.stem: dict_keys(p) for p in sorted((ROOT / 'assets/lang').glob('*.js'))}

    where = {}
    for page in pages:
        ex = Extract()
        ex.feed(page.read_text(encoding='utf-8'))
        for text in ex.found + ex.loose:
            where.setdefault(text, set()).add(page.stem)

    for t, files in js_strings.items():
        where.setdefault(t, set()).update(files)

    missing = {}
    for text, pgs in where.items():
        gaps = [lang for lang, keys in langs.items() if text not in keys]
        if gaps:
            missing[text] = {'pages': sorted(pgs), 'missing': sorted(gaps)}

    # --- 濾掉「拼接品」---
    # 像導覽列 <div><a>首頁</a><a>平台介紹</a>…</div> 的完整文字會變成
    # 「首頁 平台介紹 包樹認養 …」。i18n 確實會拿它去查字典，但查不到就
    # 自動退回逐個 <a> 翻譯，結果完全正確 —— 這種不需要補字典。
    # 判斷方式：能不能用其他候選字串從左到右完整鋪滿它。
    pool = {t for t in where if t.strip()}
    by_first = {}
    for t in pool:
        by_first.setdefault(t[0], []).append(t)

    def is_composite(text):
        """能不能用其他候選字串（中間允許空白）從左到右完整鋪滿 text。"""
        n = len(text)
        reach = [False] * (n + 1)
        reach[0] = True
        used_pieces = [0] * (n + 1)
        for i in range(n):
            if not reach[i]:
                continue
            # 允許片段之間有空白
            j = i
            while j < n and text[j] == ' ':
                j += 1
            if j > i and not reach[j]:
                reach[j] = True
                used_pieces[j] = used_pieces[i]
            if j >= n:
                continue
            for cand in by_first.get(text[j], ()):
                end = j + len(cand)
                if end <= n and cand != text and text.startswith(cand, j) and not reach[end]:
                    reach[end] = True
                    used_pieces[end] = used_pieces[j] + 1
        # 要「由兩段以上拼成」才算拼接品，整段等於自己不算
        return reach[n] and used_pieces[n] >= 2

    composites = {t for t in missing if is_composite(t)}
    for t in composites:
        missing[t]['composite'] = True

    if '--all' not in sys.argv:
        missing = {k: v for k, v in missing.items() if k not in composites}

    if '--json' in sys.argv:
        print(json.dumps(missing, ensure_ascii=False, indent=1))
        return

    print(f'掃描 {len(pages)} 頁，抓到 {len(where)} 個中文字串')
    for lang in sorted(langs):
        n = sum(1 for v in missing.values() if lang in v['missing'])
        print(f'  {lang:4} 字典 {len(langs[lang]):5} 條 · 還缺 {n} 條')
    print(f'\n需要補字典的字串：{len(missing)} 條'
          f'（已濾掉 {len(composites)} 條拼接品，加 --all 可看全部）')


if __name__ == '__main__':
    main()
