-- ============================================================
-- TANJU · ROOTED FUTURES 根築新局
-- 第二批資料表：佣金分潤（settings / payouts）+ 社群發文（posts）
-- ------------------------------------------------------------
-- 用法：Supabase → SQL Editor → 貼上整份 → Run
-- 這份可以重複執行，不會弄壞既有資料（都有 IF NOT EXISTS）。
--
-- ⚠️ 沿用第一批的做法：RLS 對 anon 開放 select/insert/update，
--    因為這是純前端的 demo，沒有伺服器可以藏金鑰。
--    正式營運一定要改成「登入後才可寫入」。
-- ============================================================

-- ---------- 1. 系統設定（佣金比例等） ----------
create table if not exists settings (
  key         text primary key,
  value       text not null,
  note        text,
  updated_at  timestamptz default now()
);

-- 預設值：平台抽 20%，果農拿 80%。
-- 果農那 80% 再拆成「開花前訂金」與「採收後尾款」，
-- 預設 55% 開花前先給（對應官網文案「認養金 55% 於開花前直達果農」），
-- 剩下 25% 採收後結清。20 + 55 + 25 = 100。
insert into settings (key, value, note) values
  ('commission_rate', '20', '平台佣金％ —— 向收購商／認養人收取，其餘給果農'),
  ('deposit_share',   '55', '果農在開花前先拿到的％（佔合約總額）'),
  ('currency',        'RM', '幣別')
on conflict (key) do nothing;

-- ---------- 2. 撥款紀錄（實際付給果農的每一筆） ----------
create table if not exists payouts (
  ref        text primary key,          -- PO-2026-0001
  date       date not null,
  order_no   text,                      -- 對應 orders.no
  tree_id    text,
  farmer     text,
  kind       text,                      -- deposit 訂金 / balance 尾款 / adjust 調整
  amount     numeric not null,
  method     text,                      -- 轉帳方式
  status     text default '已撥款',
  note       text,
  created_at timestamptz default now()
);
create index if not exists payouts_order_idx on payouts (order_no);

-- ---------- 3. 社群發文 ----------
create table if not exists posts (
  id         bigserial primary key,
  at         text,                      -- 建立時間
  channel    text,                      -- facebook / instagram / youtube / rednote
  topic      text,                      -- tree / order / product / free
  topic_id   text,                      -- 例如 DB-001
  lang       text default 'zh',
  title      text,
  body       text,
  tags       text,
  status     text default '草稿',        -- 草稿 / 已複製 / 已發布 / 排程
  link       text,                      -- 發布後回填的貼文網址
  scheduled  text,
  created_at timestamptz default now()
);
create index if not exists posts_channel_idx on posts (channel);

-- ---------- RLS ----------
alter table settings enable row level security;
alter table payouts  enable row level security;
alter table posts    enable row level security;

do $$
declare t text;
begin
  foreach t in array array['settings','payouts','posts'] loop
    execute format('drop policy if exists "demo_read_%1$s"   on %1$s', t);
    execute format('drop policy if exists "demo_insert_%1$s" on %1$s', t);
    execute format('drop policy if exists "demo_update_%1$s" on %1$s', t);
    execute format('create policy "demo_read_%1$s"   on %1$s for select using (true)', t);
    execute format('create policy "demo_insert_%1$s" on %1$s for insert with check (true)', t);
    execute format('create policy "demo_update_%1$s" on %1$s for update using (true) with check (true)', t);
  end loop;
end $$;

-- 沒有 delete policy = anon 刪不掉任何東西，這是刻意的。

-- ---------- 4. 帳號權限（第二批補充） ----------
-- users 表加一個 perm 欄位，存 ERP 的權限角色
-- （super / admin / finance / editor / coord / farmer / buyer）。
-- 舊資料的 perm 會是 null，前端會把 role='admin' 的舊帳號視為 super，
-- 所以升級後原本的管理員不會被鎖在門外。
alter table users add column if not exists perm text;

update users set perm = 'super'  where perm is null and role = 'admin';
update users set perm = 'farmer' where perm is null and role = 'farmer';
update users set perm = 'buyer'  where perm is null and role = 'buyer';
