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


class Extract(HTMLParser):
    """收集每個區塊元素的完整文字，以及沒有被區塊包住的散落文字節點。"""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []        # [(tag, skip, [text parts]), ...]
        self.found = []        # 完整句子
        self.loose = []        # 沒被區塊包住的文字

    def handle_starttag(self, tag, attrs):
        if tag in ('br', 'img', 'input', 'hr', 'meta', 'link'):
            return
        cls = dict(attrs).get('class', '')
        # bool() 不能省：`self.stack and ...` 在 stack 還是空的時候會回傳
        # stack 這個 list 本身，之後它一長大就變成 truthy，整份文件都會被跳過。
        skip = bool(tag in SKIP_TAGS or any(c in cls for c in SKIP_CLASS)
                    or (self.stack and self.stack[-1][1]))
        self.stack.append([tag, skip, []])

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                node = self.stack.pop(i)
                del self.stack[i:]
                text = ' '.join(node[2])
                text = re.sub(r'\s+', ' ', text).strip()
                if text and not node[1] and node[0] in BLOCKS and HAN.search(text):
                    self.found.append(text)
                # 把文字往上傳，外層才拿得到完整句子
                if self.stack and text:
                    self.stack[-1][2].append(text)
                return

    def handle_data(self, data):
        text = re.sub(r'\s+', ' ', data).strip()
        if not text:
            return
        if self.stack:
            self.stack[-1][2].append(text)
            if not self.stack[-1][1] and HAN.search(text):
                self.loose.append(text)
        elif HAN.search(text):
            self.loose.append(text)


def dict_keys(path):
    """從 assets/lang/*.js 撈出所有 key。這些檔案是物件字面值，用正則就夠。"""
    src = path.read_text(encoding='utf-8')
    return set(re.findall(r"^\s*'((?:[^'\\]|\\.)*)'\s*:", src, re.M))


def main():
    pages = sorted(ROOT.glob('*.html'))
    langs = {p.stem: dict_keys(p) for p in sorted((ROOT / 'assets/lang').glob('*.js'))}

    where = {}
    for page in pages:
        ex = Extract()
        ex.feed(page.read_text(encoding='utf-8'))
        for text in ex.found + ex.loose:
            where.setdefault(text, set()).add(page.stem)

    missing = {}
    for text, pgs in where.items():
        gaps = [lang for lang, keys in langs.items() if text not in keys]
        if gaps:
            missing[text] = {'pages': sorted(pgs), 'missing': sorted(gaps)}

    if '--json' in sys.argv:
        print(json.dumps(missing, ensure_ascii=False, indent=1))
        return

    print(f'掃描 {len(pages)} 頁，抓到 {len(where)} 個中文字串')
    for lang in sorted(langs):
        n = sum(1 for v in missing.values() if lang in v['missing'])
        print(f'  {lang:4} 字典 {len(langs[lang]):5} 條 · 還缺 {n} 條')
    print(f'\n至少缺一種語言的字串：{len(missing)} 條')


if __name__ == '__main__':
    main()
