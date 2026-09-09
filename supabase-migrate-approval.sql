-- ============================================================
-- 帳號審核所需的欄位
-- ============================================================
-- 為什麼需要：用 Google 登入的新帳號要等後台通過才進得來。
-- 但「通過了沒有」如果只存在你這台瀏覽器，對方用他自己的手機登入時
-- 讀到的是雲端那份 —— 沒有這個欄位，他永遠是待審核狀態，
-- 你按幾次通過都沒用。審核狀態一定要存在雲端。
--
-- 三個欄位：
--   approved  是否已放行。null 或 true 都當作已通過 ——
--             這樣既有的帳號不會因為加了這個欄位就全部被鎖在外面。
--   joined    申請時間，待審核清單上要顯示。
--   via       怎麼進來的（google / 空白代表舊的帳號密碼帳號）。
--
-- 怎麼跑：Supabase → SQL Editor → New query → 貼上 → Run
-- 可以重複執行。
-- ============================================================

alter table users add column if not exists approved boolean;
alter table users add column if not exists joined   text;
alter table users add column if not exists via      text;

-- 既有帳號一律視為已通過，避免加了欄位之後大家都進不來
update users set approved = true where approved is null;

-- 核對
select u, name, perm, approved, via from users order by u;
