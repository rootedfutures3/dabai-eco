# 資安現況

日期：2026-09-09。這份是實測結果，不是讀程式推測的 —— 每一條都真的打上去試過。

---

## 一句話

**這個平台目前的安全模型是「示範等級」：資料庫對外完全開放讀取與寫入，
後台權限只是把按鈕藏起來。** 拿去 Demo 沒問題，開始收真實的錢和客戶資料之前必須收緊。

---

## 已修好的

### 儲存型 XSS（高風險 · 已修）

樹況回報的備註原本是直接當 HTML 塞進頁面。備註裡放
`<img src=x onerror=...>`，那段程式會在**打開那一頁的人的瀏覽器裡執行** ——
而在後台，打開那一頁的人是管理員，所有分頁都開著。

實測確認可執行，修完再測已擋下。

比一般的 XSS 嚴重，是因為**誰能寫進去**：publishable key 印在
`config.js` 裡（設計上就是公開的），而現在的 RLS 政策允許匿名寫入，
所以那段程式不必來自溝通者 —— 任何看得到網頁原始碼的人都能透過
REST API 種一筆，等管理員打開分頁。

修法：所有從資料庫拿出來的文字（備註、姓名、果園、果農、工資說明、
貼文標題）在進 HTML 之前一律跳脫；照片網址只放行 `http/https`
（`javascript:` 開頭的網址點下去就是執行程式碼）。

---

## 還沒解決的

### 1 · 資料庫對匿名開放讀取與修改（高風險）

拿 `config.js` 裡那把公開金鑰，實測結果：

| 動作 | 結果 |
|---|---|
| 讀取 users / orders / payouts / wages / trees / reports / posts / settings | **全部讀得到** |
| 新增一列 | **成功**（實測寫入一筆再確認存在） |
| 修改任何一列 | **成功**（實測改掉一個值再讀回來確認） |
| 刪除 | 被擋下（政策沒有開放 delete） |

也就是說，任何人打開網頁原始碼，就能：

- 拿到全部使用者的 Email、全部客戶的電話、全部工資明細
- 把任何一張訂單的金額改掉
- 把自己加進 users 表並把角色設成 super

> 這不是設定失誤，是目前跑的是 `supabase-setup.sql` / `-v2.sql` 的
> 示範政策（`using (true)`）。專案裡已經有寫好的
> `supabase-setup-v3.sql`，政策改成用 `is_staff()` 判斷 ——
> 但它需要 Supabase Auth 發出的 JWT，而現在的登入是
> Google 前端登入，不會產生那個 JWT。**兩件事要一起換。**

### 2 · 登入可以偽造（高風險）

登入狀態只是 `sessionStorage` 裡的一個值。實測：在瀏覽器主控台打一行

```js
sessionStorage.setItem('rf_app_session', '<某個管理員的信箱>')
```

角色立刻變成 `super`，`isSuper()` 回 true —— **沒有經過任何登入**。

原因是沒有後端可以驗證 Google 回傳那張 token 的簽章
（`auth-google.js` 的 `decode()` 只是 base64 解碼，不驗簽）。
`config.js` 的註解裡本來就寫明了這一點：這是「身分」不是「權限強制」。

單獨看它其實沒有加重危害 —— 反正資料庫本來就對匿名開放。
但它代表**後台的權限控制完全擋不住任何懂一點技術的人**。

### 3 · 發文金鑰是公開的（中風險）

`PUBLISH_KEY` 印在 `config.js` 裡。Worker 的把關就是比對這把 key，
所以任何人複製它就能：

- 用你的名義發文到 Facebook 粉專
- 用你的名義發文到 Instagram

實測確認錯的 key 會被擋（回 401），對的 key 會通過。
對的那條我沒有測 —— 那會真的發一篇到你的粉專。

> Page Access Token 本身是安全的：它只在 Cloudflare 的 secret 裡，
> 沒有進 git、也沒有出現在前端。外流的是「呼叫 Worker 的通行碼」，
> 不是 token 本身。所以攻擊者能發文，但拿不走你的粉專。

### 4 · 儲存空間可匿名上傳（低風險，已知取捨）

`reports` 桶允許用 publishable key 上傳。限制是 5MB 與圖片格式，
刪除沒開放。這是靜態網站沒有後端的必然結果，
`supabase-migrate-photos.sql` 裡本來就寫明了這個取捨。

---

## 檢查過、沒有問題的

- **git 沒有洩漏過金鑰**：整段歷史掃過，沒有 `sb_secret`、
  service_role JWT、Meta 長 token、client secret。
- **`.meta-token.txt` 有被 gitignore**，權限 600。
- **Worker 的把關有效**：沒有 key 或 key 錯一律 401；GET 一律 405；
  CORS 只開放給我們的網域（但 CORS 只擋瀏覽器，擋不住 curl）。
- **Meta 的 Page Access Token 不在前端**，只在 Cloudflare secret。
- **`.gitignore` 覆蓋到 token 檔**。

---

## 建議順序

**Demo 前（9/15）不用動。** 現在這個狀態撐得住展示，
而上面兩項高風險的修法會動到登入流程，來不及測。

**開始收真實客戶資料或真實金流之前，這三件事一起做：**

1. `AUTH_MODE` 換成 `'supabase'`，登入改用 Supabase Auth
   （Google 也可以走 Supabase 的 OAuth，使用者體驗一樣）
2. 跑 `supabase-setup-v3.sql`，把 `using (true)` 的示範政策換掉
3. Worker 改成驗 Supabase 的 JWT，不要再用 `PUBLISH_KEY`
   （`publish-worker.js` 最後面寫了怎麼改）

三件是綁在一起的：只做 2 會讓網站整個讀不到資料，
只做 1 資料庫還是開的。要換就一起換。

**現在可以馬上做、不影響 Demo 的：**

- 到 Supabase 後台刪掉 `settings` 表裡 key 為 `__sectest__` 的那一列
  （我做寫入測試留下的，delete 被擋所以刪不掉）
- 順便刪掉之前的測試資料：撥款 `PO-2026-0004`、
  storage 的 `_selftest/1788927845-check.png`、DB-000005 上第 8 筆回報
