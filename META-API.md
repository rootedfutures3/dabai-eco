# 接上 Meta：把粉專和 IG 的真實成效讀進後台

後台「社群發文 → 成效」那一區的欄位和版面早就做好了，一直空著是因為
觸及、互動、點擊這些數字只有 Meta 自己知道。這份文件是把它接上。

程式都寫完了（`tools/publish-worker.js`）。你要做的是三件事：

1. 把 Meta App 的權限選對
2. 換到一把**長效** Page Access Token
3. 把那把 token 放進 Cloudflare，不是放進這個 repo

---

## 先講最重要的一件事

**Page Access Token 絕對不能進 `assets/config.js`。**

那把 token 不只是「看數字」而已 —— 它可以代你發文、刪文、讀私訊。
`config.js` 會原封不動送到每一個訪客的瀏覽器，按右鍵看原始碼就拿得到。

所以中間一定要有一台伺服器。用 Cloudflare Workers，免費方案夠用，
token 存在它的 secret 裡，前端只送「我要看成效」，把數字拿回來。

---

## 1 · Meta App 的設定

你正在開的那個 App，這幾個地方要選對。

### 產品

在 App 後台左邊 **Add products**，加這兩個：

- **Facebook Login for Business** —— 用來拿 token
- **Instagram**（設定時選 *Instagram API setup with Facebook Login*）

### 需要哪些權限

Graph API Explorer 產 token 的時候，這幾個都要勾。
少勾一個，就少一整欄數字：

| 權限 | 沒有它會怎樣 |
|---|---|
| `pages_show_list` | 列不出你有哪些粉專，連第一步都過不了 |
| `pages_read_engagement` | 讀不到貼文內容、讚數、留言數 |
| `read_insights` | **觸及、曝光、點擊整欄空白** |
| `instagram_basic` | 讀不到 IG 的貼文 |
| `instagram_manage_insights` | IG 的觸及空白 |
| `pages_manage_posts` | 只有要「一鍵發文」才需要；只看數字可以不勾 |
| `instagram_content_publish` | 同上，只發 IG 才需要 |

> 只想先看數字、暫時不自動發文的話，後面兩個可以不勾。
> 權限勾越少，之後送審越好過。

---

### 權限要先「解鎖」，才勾得到

**這一步實際踩過，一定要先做。**

新版 Meta 的權限是綁在 **use case** 上的，不是想勾就勾。
App 沒有加對應的 use case，Graph API Explorer 的權限清單裡
**根本不會出現那個權限** —— 不是你漏勾，是它沒被解鎖。

實測狀況：一個掛滿廣告、目錄、名單、募款 use case 的 App，
權限清單裡有 `ads_management`、`catalog_management`、
`whatsapp_business_messaging`，卻連 `read_insights` 的影子都沒有。

#### 先看現在缺什麼

左邊側欄 → **Review → Permissions and features**，搜尋 `read_insights`。
這一頁是所有權限的權威清單，會顯示它現在的狀態：

| 看到 | 意思 |
|---|---|
| **Standard access**（可取用） | 加 use case 就有，**不用送審** |
| **Advanced access needed** | 要送 App Review |
| 找不到這個權限 | App 類型不支援，要改用別的方式（見下面 CSV） |

> 開發模式下、對你自己管理的粉專，**Standard access 就夠了**。
> Advanced access 是為了讀「別人的」粉專，我們用不到。

#### 加 use case

1. 左邊側欄 → **Use cases**
2. 右上 **Add use case**
3. 找**跟經營粉專有關**的那一個 —— 通常叫
   **「Manage everything on your Page」**（管理粉絲專頁的所有內容）之類。
   **不要**選廣告那幾個，它們不帶洞察權限。
4. 加進去之後點它的 **Permissions** 分頁，確認清單裡有 `read_insights`

   > Meta 改版很勤，標題可能不完全一樣。判斷標準只有一個：
   > **點進去的 Permissions 分頁裡有沒有 `read_insights`**。有就是對的。

5. IG 的觸及要另外一個 —— 找 Instagram 相關的 use case，
   確認它的 Permissions 裡有 `instagram_manage_insights`。
   （只有 `instagram_basic` 是不夠的，那只能讀貼文，讀不到數字。）

#### 加完要重新授權

use case 加好之後，舊 token **不會自動長出新權限**，要重跑一次：

1. 回 Graph API Explorer
2. Permissions 現在應該找得到 `read_insights` 了，勾起來
3. **Generate Access Token**

彈窗如果沒有重新問你 —— 因為之前授權過 —— 到
Facebook → 設定與隱私 → 設定 → **商業整合** → 把這個 App 移除，
再按一次 Generate。

#### 驗

```bash
python3 tools/meta-token.py
```

五個權限全部打勾才算過。少哪個它會直接講。

---

---

### IG 那邊的前提

IG 必須是**商業帳號或創作者帳號**，而且**連到這個粉專**。
個人帳號 Meta 一律不給數據，這是平台規定，不是設定漏掉。

檢查：IG App → 設定 → 帳號類型與工具 → 應該顯示「商業帳號」，
然後 Meta Business Suite → 設定 → Instagram 帳號 → 有連到粉專。

連好之後 **IG 的帳號編號不用手動找** —— 後端會用粉專的 token 自己查
（`resolveIgUserId`）。

### 要不要送 App Review

**你自己的粉專，現在就能讀，不用等審核。**

App 停在 **開發模式（Development）** 時，權限對「在這個 App 裡有角色的人」
是有效的 —— 也就是你自己。你是 App 的管理員、粉專也是你的，
那就讀得到真實數字。

送 App Review 是為了「讓別人的粉專也能用這個 App」。
TANJU 只讀自己的帳號，這一步可以先不做。

> 但 Meta 這幾年一直在收緊，某些權限即使開發模式也要先過
> **企業驗證（Business Verification）**。如果 Graph API Explorer 上
> 某個權限勾不下去、或勾了 token 裡卻沒有，多半就是卡在這裡 ——
> App 後台會有一條黃色提示告訴你缺什麼。

---

## 2 · 換一把長效 token

Graph API Explorer 直接給你的那把，**一小時就過期**。
拿它去設定，明天數字就沒了。要換成長效的，三步。

### 一個指令做完（建議走這條）

第一步到第三步我寫成一支程式了，順便幫你驗權限 ——
不用自己在瀏覽器貼三次網址、自己讀 JSON 判斷對不對。

先去 <https://developers.facebook.com/tools/explorer/> 按 Generate
拿一把短效 token（照上一節設定），**拿到就馬上跑這個**（它只有一小時）：

```bash
python3 tools/meta-token.py
```

它會問三樣東西：**應用程式編號**、**應用程式密鑰**（App 後台 → 設定 → 基本）、
還有剛拿到的**短效 token**。後兩樣輸入時不會顯示在畫面上。

然後它會：

1. 換成長效 token
2. 一項一項檢查五個必要權限，缺哪個直接告訴你
3. 找到 Rootedfutures 的粉專 token
4. **真的去讀一次成效** —— 這關過了才算數
5. 檢查 IG 有沒有連上
6. 把粉專 token 寫進 `.meta-token.txt`（權限 600，已在 `.gitignore`）

任何一關過不了它會停下來講清楚缺什麼，不會讓你帶著壞掉的 token
一路做到 Cloudflare 才發現。

> token 寫成檔案而不是印在畫面上，是為了下一步可以
> `wrangler secret put FB_PAGE_TOKEN < .meta-token.txt` ——
> 不經過剪貼簿，也不會留在指令歷史裡。

---

### 或者手動走（想知道每一步在做什麼再看）

### 第一步 · 拿使用者 token

開 <https://developers.facebook.com/tools/explorer/>。
所有東西都在**右邊那一欄**，由上往下填。

> Meta 每隔一陣子會改這個畫面的排版和字樣，
> 下面照功能講，你的畫面字可能不完全一樣，位置大致相同。

**1 · Meta App**（最上面的下拉）
選你剛開的那個 App。選錯就白做 —— 產出來的 token 綁在 App 上。

**2 · User or Page**
選 **User Token**（使用者權杖）。

> 這裡也看得到 Page Access Token 的選項，會很想直接選。
> 但那樣拿到的粉專 token 跟著使用者 token 的壽命走，一樣一小時死。
> 順序不能顛倒：先拿使用者 token → 換長效 → 再換粉專 token。

**3 · Permissions**（權限）
按 **Add a Permission** / 權限搜尋框，一個一個加：

```
pages_show_list
pages_read_engagement
read_insights
instagram_basic
instagram_manage_insights
```

要一鍵發文再加 `pages_manage_posts`、`instagram_content_publish`。

> 有些權限旁邊會標「需要進階存取權」或灰掉點不下去 ——
> 那是卡在企業驗證，不是你少按了什麼。App 後台首頁會有一條
> 黃色提示講缺什麼。開發模式下、對你自己的粉專，
> 標準存取權（Standard Access）就夠了。

**4 · Generate Access Token**

按下去會跳出 Facebook 的授權視窗。**真正會出錯的地方全在這裡。**

- 會問你**要讓這個 App 用哪些粉專** ——
  一定要勾到 Rootedfutures。
  漏勾的話 token 產得出來，但讀不到這個粉專的任何東西。
- 接著問**允許這個 App 做什麼**，一排開關 ——
  **每一個都要開著**。關掉任何一個，那個權限不會出現在 token 裡，
  而且不會報錯，只會在後台看到某一欄永遠空白。
- 如果之前授權過，這個視窗可能只問新增的那幾項，
  甚至直接跳過。跳過而權限又不對的話，到 Facebook →
  設定與隱私 → 設定 → 商業整合，把這個 App 移除，再按一次 Generate。

**5 · 當場驗，不要等到部署完才發現**

token 出來之後，先在 Explorer 上面那個網址列打這三個，各按一次 Submit：

| 打這個 | 應該看到 |
|---|---|
| `me/accounts` | 列出你的粉專，`id` 應該是 `1211431805397689` |
| `1211431805397689?fields=instagram_business_account` | 一個 `id`，代表 IG 有連上 |
| `1211431805397689/posts?fields=id,message,insights.metric(post_impressions_unique,post_clicks)` | 貼文清單，每篇底下有 `insights` |

**第三個是關鍵**。它過了才代表 `read_insights` 真的在 token 裡。
回 `(#200)` 或 `(#100)` 就是沒有 —— 回第 3 步重新勾、重新授權，
不要往下做。

**6 · 複製那一串**（短效的，一小時，等一下要換掉）

### 第二步 · 換成長效使用者 token

App 後台 → **設定 → 基本**，抄下 **應用程式編號** 和 **應用程式密鑰**
（密鑰要按「顯示」）。然後把下面三個空格填好，貼到瀏覽器網址列：

```
https://graph.facebook.com/v23.0/oauth/access_token?grant_type=fb_exchange_token&client_id=應用程式編號&client_secret=應用程式密鑰&fb_exchange_token=第一步那串
```

回來的 JSON 裡的 `access_token` 就是長效的，可以用兩個月。

> 這一步會把**應用程式密鑰**打進網址列。做完把瀏覽器紀錄那一筆刪掉，
> 也不要把這個網址貼給任何人 —— 密鑰等於 App 的鑰匙。

### 第三步 · 換成粉專 token

```
https://graph.facebook.com/v23.0/me/accounts?access_token=第二步那串
```

回來的清單裡找到 Rootedfutures（`id` 是 `1211431805397689`），
它底下的 `access_token` 就是**你要的那一把**。

用長效使用者 token 換出來的粉專 token **不會過期**，
除非你改密碼、移除 App 授權，或 Meta 那邊要求重新授權。

### 驗一下

```
https://graph.facebook.com/v23.0/debug_token?input_token=粉專那串&access_token=第二步那串
```

要看到：

- `"expires_at": 0` —— 0 就是不過期，對了
- `"type": "PAGE"`
- `scopes` 裡面有 `read_insights` 和 `instagram_manage_insights`

**`scopes` 裡沒有 `read_insights` 的話，後面白做。** 回第一步重新勾。

---

## 3 · 放進 Cloudflare

Cloudflare Workers 是一台「只在被呼叫時才醒來」的小伺服器。
我們只需要它做一件事：保管 token。免費方案每天十萬次請求，
我們一天發不到十篇，永遠用不完。

### 3.1 · 申請帳號

1. 開 <https://dash.cloudflare.com/sign-up>
2. 填 Email 和密碼 → Sign up
3. 去信箱收驗證信，點裡面的連結

> **不需要買網域，也不需要把網域轉過去。** 註冊流程可能會一直問你
> 要加哪個網站 —— 全部跳過就好。Workers 會自己給你一個
> `.workers.dev` 的網址。

### 3.2 · 決定你的子網域

1. 登入後左邊選 **Workers & Pages**
2. 第一次進來會要你取一個子網域，例如打 `rootedfutures`
3. 之後所有 Worker 的網址都會長成
   `https://<worker 名字>.rootedfutures.workers.dev`

這串取了就跟著帳號走，想清楚再按。

### 3.3 · 裝 wrangler 並登入

wrangler 是 Cloudflare 的命令列工具，用來把程式送上去。
它要 Node.js（`node --version` 有東西就代表有裝）。

**不用安裝** —— 用 `npx` 直接跑就好：

```bash
npx wrangler login
```

> `npm i -g wrangler` 也可以，但在 macOS 上通常要 `sudo`，
> 而且之後版本更新要自己管。`npx` 每次抓當下的版本，沒有這些麻煩。
> 下面所有指令都是 `npx wrangler ...`。

會開瀏覽器問你要不要授權，按 **Allow**。
看到 `Successfully logged in` 就好了。

### 3.4 · 送上去

`tools/wrangler.toml` 已經寫好了，所以不用 `wrangler init`，
也不用選任何選項。

```bash
cd tools
npx wrangler secret put FB_PAGE_ID        # 貼 1211431805397689
npx wrangler secret put FB_PAGE_TOKEN < ../.meta-token.txt
npx wrangler secret put TANJU_KEY         # 自己隨便打一串
npx wrangler deploy
```

- `wrangler secret put` 會停下來等你貼值，貼完按 Enter。
  貼進去的東西存在 Cloudflare，不會進這個 repo。
- `IG_USER_ID` → **不用設**，後端自己查
- `GRAPH_VERSION` → **不用設**，Meta 哪天淘汰 v23 再設

跑完最後會印出網址：

```
Deployed tanju-publish triggers
  https://tanju-publish.rootedfutures.workers.dev
```

**那一行就是你要的網址。** 事後要找：Cloudflare 後台 →
Workers & Pages → 點 `tanju-publish`。

### 3.5 · 填回網站

`assets/config.js` 兩行：

```js
const PUBLISH_ENDPOINT = 'https://tanju-publish.你的子網域.workers.dev';
const PUBLISH_KEY = '你剛剛設的 TANJU_KEY';
```

然後 `./deploy.sh`。後台的 Facebook 與 Instagram 兩張卡，
按鈕會從「複製並開啟」變成「一鍵發布」。

最後把 `.meta-token.txt` 刪掉 —— Cloudflare 已經有一份了。

> `PUBLISH_KEY` 還是在前端，所以它只擋得住隨手掃網址的人，
> 擋不住有心人。真正的做法是讓後端去驗登入者的身分 ——
> 等 `AUTH_MODE` 換成 `'supabase'` 之後再改，
> `publish-worker.js` 最後面寫了怎麼改。

### 出錯的話

| 訊息 | 意思 |
|---|---|
| `wrangler: command not found` | 指令前面要加 `npx` |
| `Authentication error` | `npx wrangler login` 過期了，再跑一次 |
| `You need to register a workers.dev subdomain` | 回 3.2，去後台取子網域 |
| `binding ... not found` | secret 少設了一個，`npx wrangler secret list` 看看有哪些 |
| 前台按鈕還是「複製並開啟」 | `config.js` 沒填、或忘了跑 `./deploy.sh` |

## 4 · 驗收

進後台 → **社群發文** → 選一棵樹 → **產生四個平台的文案與配圖**。

Facebook 和 Instagram 那兩張卡，按鈕應該從「複製並開啟」變成
**一鍵發布**。按下去會：產圖 → 傳到 Supabase 拿公開網址 →
交給 Worker → Worker 用 token 發布 → 貼文連結寫進下面的發文紀錄。

> 第一次先發一篇測試的，發完到粉專確認，不喜歡就去粉專刪掉。
> 這裡沒有做「從後台刪貼文」—— 刪掉的東西救不回來，
> 那種按鈕不該放在一個手指容易滑到的地方。

小紅書和 YouTube 不會有一鍵發布。小紅書沒有公開的發文 API，
YouTube 的社群貼文只開放部分頻道。那兩個就是
「複製文案 + 下載配圖 + 開啟發文視窗」，手動貼。

### 出錯對照

| 你看到 | 意思 |
|---|---|
| 按鈕還是「複製並開啟」 | `PUBLISH_ENDPOINT` 沒填，或忘了 `./deploy.sh` |
| 發布失敗（401）· 沒有權限 | `PUBLISH_KEY` 和 Cloudflare 的 `TANJU_KEY` 不一樣 |
| `Meta API：… (#200)` | token 少了 `pages_manage_posts` 或 `instagram_content_publish`。回第 1 節加 use case、重新授權 |
| `Object with ID … does not exist` | `FB_PAGE_ID` 填成網址上的編號了，見下一節 |
| `這個粉專底下沒有綁 IG 商業帳號` | 回第 1 節「IG 那邊的前提」 |
| `Instagram 一定要附圖片網址` | 配圖上傳失敗。多半是 Supabase 睡著了，開後台任一頁叫醒它再試 |
| IG 發成功但發文紀錄沒有連結 | 正常，permalink 有時候要等幾秒才查得到。貼文本身沒問題 |

---

## 粉專有兩個編號，別填錯

這件事實測踩過，寫下來免得再踩：

| 編號 | 哪裡看到 | 用途 |
|---|---|---|
| `1211431805397689` | `me/accounts` 回傳的 `id` | **Graph API 只認這個** |
| `61594043096404` | 瀏覽器網址列 | 只能給人點，API 查不到 |

新版粉專的網址是 `facebook.com/profile.php?id=61594043096404`，
直覺會複製那一串去填 `FB_PAGE_ID`，然後得到

```
Object with ID '61594043096404' does not exist, cannot be loaded
due to missing permissions, or does not support this operation
```

那句話會讓你以為是權限問題，跑去重弄 token —— 其實只是編號拿錯。
`assets/config.js` 已經填好正確的那個了。

---

## 之後會壞掉的地方

老實說幾個會出事的點，免得到時候找不到原因：

- **Graph 版本淘汰**。Meta 大約每兩年砍一個版本，砍掉那天所有呼叫一起停。
  修法是 `wrangler secret put GRAPH_VERSION` 填新版本號，程式不用改。
- **指標改名**。Meta 會無預告拿掉指標。後端寫成容錯的 ——
  一個一個試，能用的留下，不能用的回報給你看，不會整頁掛掉。
- **token 失效**。改 Facebook 密碼、移除 App 授權都會讓它失效，
  要重跑第 2 節。看板會顯示 Meta 的原話，不會只說「失敗」。
