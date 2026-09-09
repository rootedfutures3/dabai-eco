#!/usr/bin/env python3
"""
找出程式裡有中文、但字典裡沒有的字串
============================================================
為什麼需要：介面切成英文之後，還是會零星冒出中文 ——
因為那些字是 JS 產生的，沒有 data-zh 標記，也沒進字典。
一頁一頁用眼睛抓會漏，而且每次改完程式又會多幾條。

做法：把註解剝掉（註解裡的中文是寫給我們自己看的，不能翻），
剩下的字串常值裡挑出含中文的，拿去比對 en.js。

用法：
    python3 tools/find-untranslated.py          # 列出缺的
    python3 tools/find-untranslated.py --count  # 只報數量
============================================================
"""
import io, os, re, sys, subprocess, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = ['erp.js', 'social.js', 'coordinator.js', 'app.js', 'docs.js',
         'store.js', 'perm.js', 'site.js', 'auth.js', 'auth-google.js']
CJK = re.compile(r'[一-鿿]')


def strip_comments(src):
    """把 // 與 /* */ 註解拿掉，但不要動字串裡長得像註解的東西。"""
    out, i, n = [], 0, len(src)
    while i < n:
        c = src[i]
        if c in '"\'`':
            q = c; out.append(c); i += 1
            while i < n:
                if src[i] == '\\': out.append(src[i:i+2]); i += 2; continue
                out.append(src[i])
                if src[i] == q: i += 1; break
                i += 1
            continue
        if c == '/' and i + 1 < n and src[i+1] == '/':
            while i < n and src[i] != '\n': i += 1
            continue
        if c == '/' and i + 1 < n and src[i+1] == '*':
            i += 2
            while i + 1 < n and not (src[i] == '*' and src[i+1] == '/'): i += 1
            i += 2
            continue
        out.append(c); i += 1
    return ''.join(out)


def literals(src):
    """抓出字串常值。樣板字串按 ${} 切開，只留純文字那幾段。"""
    found = []
    for m in re.finditer(r"'((?:[^'\\\n]|\\.)*)'|\"((?:[^\"\\\n]|\\.)*)\"", src):
        found.append(m.group(1) if m.group(1) is not None else m.group(2))
    for m in re.finditer(r'`((?:[^`\\]|\\.)*)`', src, re.S):
        for part in re.split(r'\$\{[^}]*\}', m.group(1)):
            found.append(part)
    return found


def clean(s):
    s = s.replace('\\n', '\n').replace('\\t', ' ')
    s = re.sub(r'<[^>]+>', '', s)          # 去掉 HTML 標籤
    return s.strip()


def main():
    dicts = subprocess.run(
        ['node', '-e',
         "global.window={};require('./assets/lang/en.js');"
         "console.log(JSON.stringify(Object.keys(window.LANG_EN)))"],
        cwd=ROOT, capture_output=True, text=True)
    have = set(json.loads(dicts.stdout))

    missing = {}
    for f in FILES:
        p = os.path.join(ROOT, 'assets', f)
        if not os.path.exists(p): continue
        src = strip_comments(io.open(p, encoding='utf-8').read())
        for raw in literals(src):
            for line in clean(raw).split('\n'):
                t = line.strip()
                if not t or not CJK.search(t): continue
                if t in have: continue
                # 數字樣板：36 → {n}，字典是用樣板存的
                tpl = re.sub(r'-?\d[\d,.]*', '{n}', t)
                if tpl in have: continue
                missing.setdefault(t, []).append(f)

    if '--count' in sys.argv:
        print(len(missing)); return

    for t, fs in sorted(missing.items(), key=lambda x: (x[1][0], x[0])):
        print(f'{fs[0]:16} {t}')
    print(f'\n共 {len(missing)} 條沒有英文翻譯。')


if __name__ == '__main__':
    main()
