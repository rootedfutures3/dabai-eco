-- ============================================================
-- 營運數據：事件紀錄表（events）
-- ============================================================
-- 為什麼需要：後台「營運數據」要回答「每天有沒有人回來用、
-- 用了哪些功能、訪客走到認養的哪一步就離開」。
-- 訂單、回報、貼文本來就有紀錄，但「登入」「打開哪一頁」
-- 「看了認養頁卻沒下單」這些動作沒有地方存 —— 這張表就是存它們的。
--
-- 存什麼：
--   u      登入的帳號代號（訪客是 null）
--   vid    訪客代號：瀏覽器第一次來時隨機產生，存在那台瀏覽器，
--          不含姓名、Email、IP，只用來算「不重複訪客」與漏斗
--   ev     事件名稱（visit / login / tab / order / report …）
--   page   哪一頁（index.html、erp.html …）
--   detail 補充（例如打開的後台分頁、訂單編號、樹的 ID）
--
-- 權限和其他示範表一樣：可以新增、可以讀，不能改、不能刪。
-- 欄位長度有上限，避免有人往裡面塞大量垃圾。
--
-- 怎麼跑：Supabase → SQL Editor → New query → 貼上 → Run
-- 可以重複執行。
-- ============================================================

create table if not exists events (
  id     bigserial primary key,
  at     timestamptz not null default now(),
  u      text check (char_length(u) <= 60),
  vid    text check (char_length(vid) <= 40),
  ev     text not null check (char_length(ev) <= 30),
  page   text check (char_length(page) <= 60),
  detail text check (char_length(detail) <= 120)
);
create index if not exists events_at_idx on events (at);

alter table events enable row level security;

drop policy if exists "demo_read_events"   on events;
drop policy if exists "demo_insert_events" on events;
create policy "demo_read_events"   on events for select using (true);
create policy "demo_insert_events" on events for insert with check (true);
-- 沒有 update / delete policy = 紀錄寫進去就改不了、刪不掉，這是刻意的。

grant select, insert on events to anon, authenticated;
grant usage, select on sequence events_id_seq to anon, authenticated;

-- 核對：應該回傳 0 筆（或已經開始記錄的事件）
select count(*) as events from events;
