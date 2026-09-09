# 用 Google 帳號登入

程式已經寫好了。你只要拿到一個 **Client ID**，貼進 `assets/config.js`，
登入頁就會變成只有一顆 Google 按鈕，帳號密碼欄位整組消失 ——
我們這邊不再保管任何密碼。

有兩條路。**先走 A**，五分鐘就能用；等 Supabase 回來再換 B。

| | A · Google Identity Services | B · Supabase OAuth |
|---|---|---|
| 需要 Supabase | ❌ 不需要 | ✅ 需要一個活著的專案 |
| 需要 client secret | ❌ 不需要 | ✅ 需要 |
| 設定時間 | 約 5 分鐘 | 約 30 分鐘 |
| 權限是誰在擋 | 前端（和現在的示範模式一樣） | 資料庫的 RLS，真的擋得住 |
| `AUTH_MODE` | `'google'` | `'supabase'` |

> 為什麼現在不能直接做 B：`config.js` 裡的 Supabase 專案
> `ttyevmszssqxyhfhduqk` 在三個公用 DNS 都查不到，專案應該已經被刪掉了。

---

# A · 五分鐘版（現在就能用）

## 1 · 到 Google Cloud 建一個 Client ID

1. 開 <https://console.cloud.google.com/>
2. 左上角專案下拉 → **New Project** → 名字打 `TANJU` → Create
3. 左邊 **APIs & Services → OAuth consent screen**
   - User Type 選 **External** → Create
   - **App name**：`TANJU`
   - **User support email** 和 **Developer contact**：都填你的 Gmail
   - 一路 Save and Continue
   - **Test users** → **+ ADD USERS** → 把你和團隊的 Gmail 加進去
   - Save

   > 停在 **Testing** 就好，不用送審。Testing 狀態下只有你加進 Test users
   > 的信箱能登入，Demo Day 前這樣最安全。要開放給所有人再按 Publish app。

4. 左邊 **Credentials** → **+ CREATE CREDENTIALS** → **OAuth client ID**
   - **Application type**：`Web application`
   - **Name**：`TANJU Web`
   - **Authorized JavaScript origins** → **+ ADD URI**，加這兩行：

     ```
     https://rootedfutures3.github.io
     http://localhost:8199
     ```

     > 只填到網域為止，**後面不要加路徑**（不是 `.../dabai-eco/`）。
     > 這一條是 A 和 B 最大的差別 —— A 填的是「JavaScript 來源」，
     > B 填的是「重新導向 URI」。填錯位置會出現 `origin_mismatch`。

   - **Authorized redirect URIs** 這一欄 **不用填**
   - Create

5. 複製 **Client ID**（長得像 `1234567890-abcdefg.apps.googleusercontent.com`）。
   旁邊的 **Client Secret 用不到**，A 這條路不需要它。

## 2 · 貼進專案

打開 `assets/config.js`，找到這一行（大約第 79 行）：

```js
const GOOGLE_CLIENT_ID = '';
```

把 Client ID 貼進去：

```js
const GOOGLE_CLIENT_ID = '1234567890-abcdefg.apps.googleusercontent.com';
```

`AUTH_MODE` **已經是 `'google'` 了，不用改**。

## 3 · 推上線

```bash
cd /Users/ch/Dabai && python3 tools/bump-version.py && git add -A && git commit -m "接上 Google 登入" && git push
```

等一分鐘 GitHub Pages 更新完就生效。

## 4 · 把自己變成超級管理員

第一次用 Google 登入的人，系統會自動建一個帳號，**預設角色是果農**（權限最小）。
所以第一次登入之後要升級自己：

- **如果你的 Gmail 就是 `admin@example.com`** —— 不用做任何事，會直接對到現有的超管帳號。
- **如果不是**（你的是 `idrawer1217@gmail.com`），兩種做法選一種：

  **做法一（推薦）**：先用帳號密碼登入 `admin / admin`，到後台
  「帳號與權限」把你的 Gmail 填進管理員那筆帳號的 Email 欄位。
  之後用 Google 登入就會直接對到超管。

  **做法二**：先用 Google 登入一次（會建立一個果農帳號），
  再用 `admin / admin` 登入，到「帳號與權限」把那個新帳號的角色改成超級管理員。

  > 填好 Client ID 之後密碼欄位就不見了。所以**建議先做做法一再貼 Client ID**，
  > 順序反過來會需要暫時把 `GOOGLE_CLIENT_ID` 清空才能用密碼進去。

## 驗收

- [ ] 登入頁只有一顆 Google 按鈕，沒有帳號密碼欄位
- [ ] 按下去跳出 Google 選帳號的視窗
- [ ] 選完帳號直接進入系統，右上角是你的名字
- [ ] 登出後再登入不會重複建帳號

## 卡住的話

| 看到什麼 | 是什麼問題 |
|---|---|
| `origin_mismatch` / 按鈕沒反應 | 第 1 步的 **Authorized JavaScript origins** 沒填，或多加了路徑 |
| `idpiframe_initialization_failed` | 瀏覽器擋了第三方 Cookie，換一個瀏覽器或關掉阻擋試試 |
| 按鈕根本沒出現 | `GOOGLE_CLIENT_ID` 還是空的，或忘了跑 `bump-version.py` |
| 只有你登得進去 | consent screen 還在 Testing，同事的 Gmail 要加進 Test users |
| 登入了但看不到後台功能 | 你的帳號還是果農，照第 4 步升級 |

## 這條路的限制（要知道）

沒有伺服器就沒辦法驗證 Google 那張 token 的簽章，所以這是「**證明你是誰**」，
不是「**強制你只能做什麼**」。懂技術的人一樣可以改瀏覽器裡的 session ——
這點和現在的示範模式一樣，沒有變差。

真正的改善是：**我們這邊完全不保管密碼了**。
要做到權限真的擋得住，需要下面的 B。

---

# B · 完整版（等 Supabase 回來再做）

權限由資料庫的 RLS 強制執行，前端改 session 沒有用。

## 1 · Supabase

1. <https://supabase.com/dashboard> → 開一個新專案，Region 選 **Southeast Asia (Singapore)**
2. **Project Settings → API**，抄下：
   - **Project URL** → `https://abcdefgh.supabase.co`
   - **Publishable key**（舊名 anon）→ `sb_publishable_...`

   > ⚠️ 旁邊的 **secret key 不要碰**。前端的檔案任何人都下載得到。

3. **SQL Editor** 依序跑：`supabase-setup.sql` → `supabase-setup-v2.sql` → `supabase-setup-v3.sql`

## 2 · Google Cloud 補一條 redirect URI

回到 A 建的那個 OAuth client，這次填 **Authorized redirect URIs**：

```
https://abcdefgh.supabase.co/auth/v1/callback
```

> 填的是 **Supabase 的網址**，不是我們網站的。流程是
> Google → Supabase → 我們這邊。填錯會看到 `redirect_uri_mismatch`。

這一步會用到 **Client Secret**，一起複製下來。

## 3 · Supabase 開啟 Google

1. **Authentication → Providers → Google** → Enable
2. 貼上 **Client ID** 與 **Client Secret** → Save
3. **Authentication → URL Configuration**
   - **Site URL**：`https://rootedfutures3.github.io/dabai-eco/`
   - **Redirect URLs** 加兩行（結尾的 `**` 不能少）：

     ```
     https://rootedfutures3.github.io/dabai-eco/**
     http://localhost:8199/**
     ```

## 4 · 改 config.js

```js
const SUPABASE_URL      = 'https://abcdefgh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_...';
const AUTH_MODE         = 'supabase';      // 從 'google' 改成這個
```

## 5 · 第一個管理員

用 Google 登入一次 → Supabase **Table Editor → users** →
找到你的那一列 → `perm` 改成 `super` → 重新登入。

## 卡住的話

| 看到什麼 | 是什麼問題 |
|---|---|
| `redirect_uri_mismatch` | 第 2 步的 redirect URI 沒填成 `https://<專案>.supabase.co/auth/v1/callback` |
| 回來還是沒登入 | 第 3 步的 Redirect URLs 沒加，或少了結尾的 `**` |
| `Unsupported provider` | Supabase 的 Google 開關沒打開 |
| 登入了但功能都看不到 | 第 5 步的 `perm` 還沒改成 `super` |

---

任何一步的畫面看不懂，截圖給我，我看得出來卡在哪。
