# 用 Google 帳號登入 —— 設定步驟

程式已經寫好了。填完下面三個地方，登入頁就會自動變成「只有一顆 Google 按鈕」，
帳號密碼欄位會整組消失，我們這邊不再保管任何密碼。

前置：**需要一個能用的 Supabase 專案**。目前 `assets/config.js` 裡那個
（`ttyevmszssqxyhfhduqk`）在 DNS 上已經查不到，八成被刪掉了，所以要先有新的。

---

## 1 · Supabase：拿到專案網址與金鑰

1. 到 <https://supabase.com/dashboard>，開一個新專案（或確認舊的還在）。
2. 左邊 **Project Settings → API**，抄兩個東西：
   - **Project URL** — 長得像 `https://xxxxxxxx.supabase.co`
   - **Publishable key**（舊名 anon / public）— `sb_publishable_...` 開頭

> ⚠️ 只抄 publishable key。旁邊那把 **secret key 絕對不要**貼進這個專案 ——
> 前端的檔案任何人都下載得到，等於把資料庫的鑰匙公開掛在網路上。

3. 到 **SQL Editor**，依序跑專案根目錄的：
   - `supabase-setup.sql`
   - `supabase-setup-v2.sql`
   - `supabase-setup-v3.sql` ← Google 登入需要這一份（帳號側寫與 RLS）

---

## 2 · Google Cloud：建立 OAuth 用戶端

1. 到 <https://console.cloud.google.com/>，建立或選一個專案。
2. **APIs & Services → OAuth consent screen**
   - User Type 選 **External**
   - App name：`TANJU`
   - User support email、Developer contact：填你的信箱
   - Authorized domains 加：`supabase.co`
   - 先存成 **Testing** 就好；要開放給所有人再按 Publish app
     （Testing 狀態下只有你加進 Test users 的信箱能登入，
     自己人測試很夠用，Demo Day 前建議先這樣）
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type：**Web application**
   - Name：`TANJU Web`
   - **Authorized redirect URIs** 加入這一行（把 `xxxxxxxx` 換成你的專案代號）：

     ```
     https://xxxxxxxx.supabase.co/auth/v1/callback
     ```

     > 這裡填的是 **Supabase 的網址，不是我們的網站網址**。
     > Google 是把人送回 Supabase，Supabase 再送回我們這邊。
     > 填錯這一行是最常見的失敗原因（會看到 redirect_uri_mismatch）。

4. 建立後會拿到 **Client ID** 和 **Client Secret**，兩個都先留著。

---

## 3 · Supabase：把 Google 打開

1. Supabase 後台 → **Authentication → Providers → Google**
2. 打開 **Enable Sign in with Google**
3. 把剛才的 **Client ID** 和 **Client Secret** 貼進去，儲存。
4. 再到 **Authentication → URL Configuration**：
   - **Site URL**：`https://rootedfutures3.github.io/dabai-eco/`
   - **Redirect URLs** 加這兩行：

     ```
     https://rootedfutures3.github.io/dabai-eco/**
     http://localhost:8199/**
     ```

     第二行是本機測試用的，不加的話在自己電腦上會被擋。

---

## 4 · 專案這邊：改三行

打開 `assets/config.js`：

```js
const SUPABASE_URL      = 'https://xxxxxxxx.supabase.co';   // 第 1 步抄的
const SUPABASE_ANON_KEY = 'sb_publishable_...';             // 第 1 步抄的
const AUTH_MODE         = 'supabase';                        // 從 'demo' 改成這個
```

存檔、跑一次 `python3 tools/bump-version.py`、推上 GitHub 就生效了。

---

## 5 · 第一個管理員

Google 登入不需要註冊 —— 第一次用 Google 登入時，`supabase-setup-v3.sql` 裡的
觸發器會自動在 `users` 表建一筆側寫，預設角色是**果農**（權限最小的那個）。

所以要這樣開通你自己：

1. 你先用 Google 登入一次。
2. 到 Supabase 後台 → **Table Editor → users**，找到你的那一列。
3. 把 `perm` 欄位改成 `super`，儲存。
4. 重新登入，你就是超級管理員了，之後其他人的角色可以直接在
   TANJU Portal 的「帳號與權限」裡指派，不必再進 Supabase。

---

## 驗收清單

接通之後應該會看到：

- [ ] 登入頁只有一顆「使用 Google 帳號登入」，沒有帳號密碼欄位
- [ ] 按下去跳到 Google 選帳號的畫面
- [ ] 選完帳號回到網站，右上角出現你的名字
- [ ] 網址列**沒有**殘留 `#access_token=...`（程式會自動抹掉）
- [ ] 後台的資料是從雲端來的（開發者工具 Console 會有一行
      `[TANJU] 雲端資料庫已連線 · N 棵樹 / N 筆訂單`）

## 卡住的時候

| 症狀 | 通常是什麼 |
|---|---|
| `redirect_uri_mismatch` | 第 2 步的 redirect URI 沒填成 `https://<專案>.supabase.co/auth/v1/callback` |
| 回來之後還是沒登入 | 第 3 步的 Redirect URLs 沒加我們網站的網址 |
| `Unsupported provider` | Supabase 那邊的 Google provider 沒有按到 Enable |
| 只有你自己登得進去 | OAuth consent screen 還在 Testing，別人要加進 Test users，或按 Publish app |
| 登入後權限都看不到 | 第 5 步的 `perm` 還沒改成 `super` |

有任何一步的畫面看不懂，截圖給我，我看得出來卡在哪。
