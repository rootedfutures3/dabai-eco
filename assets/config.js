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

   改這一行就會切換，登入頁上會清楚標示目前是哪一種。
   ------------------------------------------------------------ */
const AUTH_MODE = 'demo';

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
