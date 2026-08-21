#!/usr/bin/env python3
"""
重新計算靜態資源的內容雜湊，並改寫所有 HTML 裡的 ?v= 參數。

為什麼需要：GitHub Pages 會讓瀏覽器快取 CSS/JS，改了檔案卻沒改網址，
使用者拿到的還是舊版。把內容雜湊放進網址，內容變了網址就變，
瀏覽器自然會重抓。改完記得一起 commit。

用法：python3 tools/bump-version.py
"""
import hashlib, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

# 參與雜湊的檔案：內容一變，全站的 ?v= 就跟著換
ASSETS = sorted(
    p for p in ROOT.glob('assets/**/*')
    if p.is_file() and p.suffix in {'.js', '.css', '.png', '.svg', '.webp', '.jpg'}
)

h = hashlib.sha256()
for p in ASSETS:
    h.update(p.relative_to(ROOT).as_posix().encode())
    h.update(p.read_bytes())
ver = h.hexdigest()[:8]

changed = []
for page in sorted(ROOT.glob('*.html')):
    src = page.read_text(encoding='utf-8')
    out = re.sub(r'\?v=[0-9a-f]{8}', f'?v={ver}', src)
    if out != src:
        page.write_text(out, encoding='utf-8')
        changed.append(page.name)

print(f'版本 {ver}（{len(ASSETS)} 個資源）')
print('已更新：' + (', '.join(changed) if changed else '（沒有變動）'))
