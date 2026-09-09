#!/usr/bin/env python3
"""
把 Meta 的短效 token 換成可以用的粉專 token，順便驗權限
============================================================
原本要在瀏覽器手動貼三次網址、自己看 JSON 判斷對不對。
這支把那幾步收成一個指令，而且會直接告訴你「可以往下做」或
「還缺什麼」—— 不用自己讀 Graph API 的錯誤訊息。

怎麼用：
    python3 tools/meta-token.py

會問你三樣東西：
    應用程式編號    App 後台 → 設定 → 基本
    應用程式密鑰    同一頁，按「顯示」（輸入時不會顯示在畫面上）
    短效 token      Graph API Explorer 按 Generate 拿到的那串

跑完粉專 token 會寫進 .meta-token.txt（權限 600，已經在 .gitignore 裡）。
接著：
    wrangler secret put FB_PAGE_TOKEN < .meta-token.txt

這樣 token 不會經過剪貼簿，也不會留在指令歷史裡。
============================================================
"""
import getpass
import json
import os
import sys
import urllib.parse
import urllib.request

GRAPH = 'v23.0'
PAGE_ID = '1211431805397689'          # assets/config.js 的 SOCIAL_ACCOUNTS.facebook.pageId

NEEDED = {
    'pages_show_list':           '列出粉專',
    'pages_read_engagement':     '讀貼文、讚、留言',
    'read_insights':             '觸及、曝光、點擊',
    'instagram_basic':           '讀 IG 貼文',
    'instagram_manage_insights': 'IG 的觸及',
}

OK, BAD, WARN = '  ✅ ', '  ❌ ', '  ⚠️  '


def call(path, **params):
    url = f'https://graph.facebook.com/{GRAPH}/{path}?' + urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(url, timeout=20) as r:
            return json.load(r), None
    except urllib.error.HTTPError as e:
        try:
            return None, json.load(e).get('error', {}).get('message', str(e))
        except Exception:
            return None, f'HTTP {e.code}'
    except Exception as e:
        return None, str(e)


def die(msg):
    print('\n' + BAD + msg + '\n')
    sys.exit(1)


def main():
    print(__doc__.split('怎麼用：')[0].strip())
    print()

    app_id = input('應用程式編號 App ID：').strip()
    app_secret = getpass.getpass('應用程式密鑰 App Secret（輸入時不顯示）：').strip()
    short = getpass.getpass('短效 token（輸入時不顯示）：').strip()
    if not (app_id and app_secret and short):
        die('三樣都要填。')

    # ---- 1 · 換長效使用者 token ----
    print('\n1 · 換長效使用者 token')
    d, err = call('oauth/access_token', grant_type='fb_exchange_token',
                  client_id=app_id, client_secret=app_secret, fb_exchange_token=short)
    if err:
        low = err.lower()
        if 'client id' in low or 'client_id' in low:
            hint = '應用程式編號填錯了。App 後台 → 設定 → 基本，第一欄。'
        elif 'client secret' in low or 'secret' in low:
            hint = '應用程式密鑰填錯了。同一頁，要按「顯示」才看得到。'
        elif 'expire' in low or 'session' in low:
            hint = ('短效 token 已經過期 —— 它只有一小時。'
                    '回 Explorer 重新 Generate 一次，拿到就馬上跑這支。')
        else:
            hint = '三樣輸入其中一個不對，對照 App 後台再確認一次。'
        die(f'換不過來：{err}\n     {hint}')
    long_user = d['access_token']
    print(OK + '換到了')

    # ---- 2 · 檢查權限 ----
    print('\n2 · 權限檢查')
    d, err = call('debug_token', input_token=long_user, access_token=long_user)
    if err:
        die(f'查不到 token 資訊：{err}')
    scopes = set(d.get('data', {}).get('scopes', []))
    missing = [k for k in NEEDED if k not in scopes]
    for k, why in NEEDED.items():
        print((OK if k in scopes else BAD) + f'{k:28} {why}')
    if missing:
        die('少了上面打叉的權限，接下去也是白做。\n'
            '     回 Graph API Explorer，Permissions 把它們加進去，\n'
            '     重新 Generate，授權彈窗裡每個開關都要開著。')

    # ---- 3 · 拿粉專 token ----
    print('\n3 · 粉專 token')
    d, err = call('me/accounts', fields='id,name,access_token', access_token=long_user)
    if err:
        die(f'列不出粉專：{err}')
    pages = d.get('data', [])
    if not pages:
        die('這個帳號底下一個粉專都沒有。授權彈窗裡粉專沒有勾到。')

    page = next((p for p in pages if p['id'] == PAGE_ID), None)
    if not page:
        print(WARN + f'找不到 {PAGE_ID}，這個帳號看得到的是：')
        for p in pages:
            print(f'      {p["id"]}  {p.get("name")}')
        die('授權彈窗裡沒有勾到那個粉專，或 config.js 的 pageId 要改成上面其中一個。')
    page_token = page['access_token']
    print(OK + f'{page["name"]}（{page["id"]}）')

    # ---- 4 · 真的去讀一次成效 ----
    print('\n4 · 實際讀一次（這關過了才算數）')
    d, err = call(f'{PAGE_ID}/posts',
                  fields='id,message,likes.summary(true).limit(0),'
                         'insights.metric(post_impressions_unique,post_clicks)',
                  limit=3, access_token=page_token)
    if err:
        die(f'讀不到：{err}\n'
            '     權限有給但讀不到，通常是授權時沒有勾到這個粉專。')
    posts = d.get('data', [])
    got_insights = any(p.get('insights') for p in posts)
    print(OK + f'讀到 {len(posts)} 篇貼文')
    print((OK if got_insights else BAD) + ('成效數字有進來' if got_insights else
          '貼文讀得到，但沒有成效數字 —— read_insights 沒有真的生效'))

    # ---- 5 · IG ----
    print('\n5 · Instagram')
    d, err = call(PAGE_ID, fields='instagram_business_account', access_token=page_token)
    ig = (d or {}).get('instagram_business_account', {}).get('id')
    if ig:
        print(OK + f'連上了（{ig}）')
    else:
        print(WARN + '這個粉專底下沒有綁 IG 商業帳號。')
        print('      IG App → 設定 → 帳號類型 → 切換成商業帳號，')
        print('      再到 Meta Business Suite → 設定 → Instagram 帳號 → 連到粉專。')
        print('      不處理的話 Facebook 那半邊照樣有數字，IG 那半邊會是空的。')

    # ---- 6 · 存檔 ----
    out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       '.meta-token.txt')
    with open(out, 'w') as f:
        f.write(page_token)
    os.chmod(out, 0o600)

    d, _ = call('debug_token', input_token=page_token, access_token=long_user)
    exp = (d or {}).get('data', {}).get('expires_at')
    print('\n' + OK + f'粉專 token 已寫入 {os.path.basename(out)}'
          + ('（不會過期）' if exp == 0 else f'（expires_at={exp}，不是 0 要注意）'))

    print(f"""
────────────────────────────────────────────
接下來把它交給 Cloudflare，token 不會經過剪貼簿：

    wrangler secret put FB_PAGE_ID        # 填 {PAGE_ID}
    wrangler secret put FB_PAGE_TOKEN < .meta-token.txt
    wrangler secret put TANJU_KEY         # 自己隨便打一串
    wrangler deploy

deploy 完把網址和 TANJU_KEY 填進 assets/config.js 的
PUBLISH_ENDPOINT 和 PUBLISH_KEY，跑 ./deploy.sh，
後台「社群發文 → 成效」按「更新成效」就有數字了。

存好之後把 .meta-token.txt 刪掉（Cloudflare 已經有一份了）。
────────────────────────────────────────────""")


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\n取消了。')
