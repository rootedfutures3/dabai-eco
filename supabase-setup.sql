-- ============================================================
-- ROOTED FUTURES — Supabase 資料表建置
-- ------------------------------------------------------------
-- 用法：Supabase 專案 → 左側 SQL Editor → New query
--       把這整份貼上 → 按 Run
--       跑完到 Table Editor 應該會看到五張表。
--
-- ⚠️ 這份腳本開放了匿名讀寫（anon 角色）。
--    這對「比賽 demo / MVP 市場驗證」是刻意的取捨：
--    任何拿到網址的人都能讀寫這些資料表。
--    正式營運前務必改成：接 Supabase Auth，
--    並把下方 policy 換成 auth.uid() 綁定的規則。
-- ============================================================

-- 果樹資產（一樹一碼）
create table if not exists trees (
  id         text primary key,           -- DB-001 / DR-001 / RB-001
  crop       text not null,              -- dabai | durian | rambutan
  variety    text,
  age        int,
  kg         int,                        -- 預估年產量
  price      int,                        -- 年認養金 RM
  orchard    text,
  area       text,
  farmer     text,
  owner      text,                       -- 持有者帳號
  listed     boolean default true,
  status     text default 'available',   -- available | reserved | adopted
  created_at timestamptz default now()
);

-- 認養訂單與預付款
create table if not exists orders (
  no         text primary key,           -- RF-2026-0001
  date       date,
  tree_id    text references trees(id),
  crop       text,
  customer   text,
  email      text,
  phone      text,
  amount     int,                        -- 合約金額
  paid       int,                        -- 已收
  channel    text,                       -- 付款方式
  status     text,
  buyer      text,                       -- 收購商帳號
  created_at timestamptz default now()
);

-- 現場樹況回報（溝通者門戶寫入）
create table if not exists reports (
  id         bigserial primary key,
  at         text,
  tree_id    text,
  by_who     text,
  stage      text,
  health     text,
  note       text,
  photos     int default 0,
  created_at timestamptz default now()
);

-- B2B 潛在客戶名單
create table if not exists leads (
  id         bigserial primary key,
  date       date,
  company    text,
  contact    text,
  title      text,
  email      text,
  need       text,
  budget     text,
  stage      text,
  created_at timestamptz default now()
);

-- 果農 × 收購商 訊息
create table if not exists messages (
  id         bigserial primary key,
  tree_id    text,
  from_who   text,
  to_who     text,
  at         text,
  text       text,
  created_at timestamptz default now()
);

-- ============================================================
-- Row Level Security
-- ------------------------------------------------------------
-- 開啟 RLS 後，預設是「全部拒絕」，再逐條開放。
-- 下面開放 anon 讀寫，讓純前端的 demo 可以運作。
-- ============================================================
alter table trees    enable row level security;
alter table orders   enable row level security;
alter table reports  enable row level security;
alter table leads    enable row level security;
alter table messages enable row level security;

do $$
declare t text;
begin
  foreach t in array array['trees','orders','reports','leads','messages'] loop
    execute format('drop policy if exists "demo_read" on %I', t);
    execute format('drop policy if exists "demo_write" on %I', t);
    execute format('drop policy if exists "demo_update" on %I', t);
    execute format('create policy "demo_read"   on %I for select to anon using (true)', t);
    execute format('create policy "demo_write"  on %I for insert to anon with check (true)', t);
    execute format('create policy "demo_update" on %I for update to anon using (true) with check (true)', t);
  end loop;
end $$;

-- ============================================================
-- 完成。回到網站，把 Project URL 與 anon key 填進
-- assets/config.js，資料就會開始存到這裡。
-- 首次連線時，網站會自動把 36 棵示範果樹寫入 trees 表。
-- ============================================================
