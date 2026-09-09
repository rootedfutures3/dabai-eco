/* ============================================================
   ⚙️ 資料庫設定 —— 要把資料存到雲端，只改這兩行
   ------------------------------------------------------------
   留空 → 資料存在瀏覽器 localStorage（只在這台裝置）
   填好 → 資料存到 Supabase（所有裝置共用同一份）

   取得方式：
   1. 到 https://supabase.com 註冊，建一個新專案（免費方案即可）
   2. 專案建好後，到 Settings → API
   3. 複製「Project URL」貼到 SUPABASE_URL
   4. 複製 Publishable key（舊稱 anon / public）貼到 SUPABASE_ANON_KEY
   5. 到 SQL Editor，把專案根目錄的 supabase-setup.sql 整份貼上執行
   6. 存檔後跑 ./deploy.sh

   ⚠️ Publishable key 是「公開金鑰」，設計上就是要放在前端，
      安全性由資料庫的 Row Level Security 規則把關（setup SQL 已含）。
      絕對不要把 Secret key（sb_secret_… / service_role）放進來 ——
      那一把可以繞過所有 RLS 規則，等於把資料庫大門打開。
   ============================================================ */

const SUPABASE_URL = 'https://ttyevmszssqxyhfhduqk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Z607-FXhkCuPASC8G-hIsw_65JveKUV';

/** 有沒有設定雲端資料庫 */
const CLOUD_ON = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/* ------------------------------------------------------------
   社群自動代發的後端網址（選填）
   ------------------------------------------------------------
   留空時，ERP 的「社群發文」走半自動：複製文案 + 開啟發文視窗。

   要做到真的一鍵自動發布，必須有一台伺服器保管各平台的授權金鑰：
     Facebook / Instagram → Meta Graph API 的 Page Access Token
     YouTube              → OAuth 2.0 refresh token
     小紅書                → 目前沒有開放的發文 API
   這些金鑰不能放在前端，任何人打開原始碼都看得到。
   等你架好後端（Cloudflare Workers、Vercel Functions 都可以），
   把網址填進來，按鈕就會自動改走代發。
   ------------------------------------------------------------ */
const PUBLISH_ENDPOINT = '';

/* ------------------------------------------------------------
   登入模式
   ------------------------------------------------------------
   'supabase' —— 真正的登入。密碼由 Supabase 加鹽雜湊保管，
                 登入後帶 JWT 讀寫資料庫，權限由 RLS 政策強制執行。
                 用這個模式之前要先：
                   1. 到 Supabase → SQL Editor 跑 supabase-setup-v3.sql
                   2. Authentication → Providers → 確認 Email 是開的
                   3. Authentication → 決定要不要關掉 Confirm email
                      （沒設定寄信服務的話建議關掉，否則新帳號收不到信）
                   4. Authentication → Users → Add user 建立第一個管理員，
                      Email 要和 users 表裡那筆管理員的 Email 一致

   'demo'     —— 示範模式。帳號密碼是明文，存在瀏覽器裡，
                 權限只是前端把按鈕藏起來。適合展示流程，不能拿來營運。

   'google'   —— 用 Google 帳號登入，不需要後端也不需要 Supabase。
                 走 Google Identity Services：前端只拿得到 Client ID
                 （它本來就是公開的，沒有 secret），Google 回一張簽好名的
                 ID token，裡面有 Email 與姓名。

                 老實說它擋不住懂技術的人：沒有伺服器就沒辦法驗證那張
                 token 的簽章，所以這是「身分」不是「權限強制」。
                 但比示範模式好 —— 我們這邊完全不保管密碼。
                 等 Supabase 回來之後改成 'supabase'，權限才會由資料庫強制執行。

                 設定：把 Google Cloud 的 Client ID 填進下面的
                 GOOGLE_CLIENT_ID，然後把這一行改成 'google'。

   改這一行就會切換，登入頁上會清楚標示目前是哪一種。
   ------------------------------------------------------------ */
const AUTH_MODE = 'google';

/* Google Identity Services 的 Client ID。
   長得像 1234567890-abcdefg.apps.googleusercontent.com
   這串是公開的，放在前端沒有問題 —— Google 是靠「授權的來源網域」
   來限制誰能用它，不是靠保密。 */
const GOOGLE_CLIENT_ID = '908132991198-s1ls4f6hkl9q1sac3r5t2setfkn9elf1.apps.googleusercontent.com';

/* 哪些 Google 帳號一登入就是超級管理員。
   把你自己的 Gmail 放進來 —— 不然第一次用 Google 登入會拿到
   權限最小的果農帳號，而那時候密碼欄位已經不見了，
   要救回來得先把上面的 Client ID 清空、重新部署一次。

   其他同事不用寫在這裡：他們照常用 Google 登入（會自動開一個果農帳號），
   再由你在後台的「帳號與權限」指派角色就好。 */
const SUPER_EMAILS = [
  'idrawer1217@gmail.com',      // 平時登入用的
  'rootedfutures3@gmail.com',   // 組織帳號（Google Cloud 與 GitHub 都是它）
];

/* ------------------------------------------------------------
   發布後端的通行碼
   ------------------------------------------------------------
   PUBLISH_ENDPOINT 是一個公開網址，這串是用來擋住隨手掃到的人。
   要和 Cloudflare Worker 上設定的 TANJU_KEY 一致。

   老實說：這串仍然在前端，打開原始碼就看得到，
   所以它只擋得住路人，擋不住有心人。真正的做法是讓後端驗證
   Supabase 的登入 token —— 等 AUTH_MODE 切成 'supabase' 之後再換，
   publish-worker.js 的最後面有寫怎麼改。
   ------------------------------------------------------------ */
const PUBLISH_KEY = '';

/* ------------------------------------------------------------
   已經開好的社群帳號
   ------------------------------------------------------------
   這裡只放「公開就看得到」的東西：粉專編號、IG 帳號名稱、網址。
   這些不是機密 —— 任何人看你的粉專網址都看得到同樣的數字。

   真正的金鑰（Page Access Token 之類）不在這裡，也不該在這裡，
   它們設定在 Cloudflare Worker 的 secret 裡。
   ------------------------------------------------------------ */
const SOCIAL_ACCOUNTS = {
  facebook: {
    /* 注意這裡有兩個編號，是同一個粉專的兩種身分，很容易填錯：

         1211431805397689  Graph API 認得的 Page ID ← 後端要用這個
         61594043096404    網址上看到的公開編號   ← 只能給人點，API 查不到

       新版粉專的網址列顯示的是後者，直覺會複製那一串填進來，
       但拿去打 Graph API 會得到「Object with ID does not exist」。
       正確的拿法：用粉專 token 打 me/accounts，回傳的 id 就是前者。 */
    pageId: '1211431805397689',
    url: 'https://www.facebook.com/profile.php?id=61594043096404',
  },
  instagram: {
    handle: 'rootedfutures3',
    url: 'https://www.instagram.com/rootedfutures3/',
    /* IG Business Account ID 不用手動填 —— 後端會用粉專的 token
       自動去查（見 publish-worker.js 的 resolveIgUserId）。 */
  },
  youtube: {
    channelId: 'UCzD_4IugardyBMMXo3MaqwQ',
    url: 'https://www.youtube.com/channel/UCzD_4IugardyBMMXo3MaqwQ',
  },
  rednote:  { url: '' },
};
