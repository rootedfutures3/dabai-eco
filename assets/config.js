/* ============================================================
   ⚙️ 資料庫設定 —— 要把資料存到雲端，只改這兩行
   ------------------------------------------------------------
   留空 → 資料存在瀏覽器 localStorage（只在這台裝置）
   填好 → 資料存到 Supabase（所有裝置共用同一份）

   取得方式：
   1. 到 https://supabase.com 註冊，建一個新專案（免費方案即可）
   2. 專案建好後，到 Settings → API
   3. 複製「Project URL」貼到 SUPABASE_URL
   4. 複製「Project API keys」裡的 anon / public 那一組貼到 SUPABASE_ANON_KEY
   5. 到 SQL Editor，把專案根目錄的 supabase-setup.sql 整份貼上執行
   6. 存檔後跑 ./deploy.sh

   ⚠️ anon key 是「公開金鑰」，設計上就是要放在前端，
      安全性由資料庫的 Row Level Security 規則把關（setup SQL 已含）。
      絕對不要把 service_role key 放進來 —— 那一組可以繞過所有權限。
   ============================================================ */

const SUPABASE_URL = '';
const SUPABASE_ANON_KEY = '';

/** 有沒有設定雲端資料庫 */
const CLOUD_ON = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
