-- ============================================================
-- TANJU · ROOTED FUTURES 根築新局
-- 第三批：改用 Supabase Auth（真正的登入）
-- ------------------------------------------------------------
-- 用法：Supabase → SQL Editor → 貼上整份 → Run。可以重複執行。
--
-- 這份做三件事：
--   1. 把 users 表接到 auth.users（多一個 uid 欄位）
--   2. 新帳號註冊時自動建立對應的 users 資料列
--   3. 把 RLS 從「對所有人開放」改成「依登入身分與權限判斷」
--
-- ⚠️ 跑完之前請先在 Supabase 後台確認兩件事：
--    Authentication → Providers → Email 是開啟的
--    Authentication → Sign In / Providers → "Confirm email" 要不要關掉
--      （沒有設定寄信服務的話，開著會讓新帳號收不到確認信而無法登入）
-- ============================================================

-- ---------- 1. users 接上 auth.users ----------
alter table users add column if not exists uid uuid references auth.users(id) on delete cascade;
create unique index if not exists users_uid_idx on users (uid) where uid is not null;

-- 密碼欄位留著只是為了讓舊的示範帳號還能用。
-- 真正的密碼由 Supabase Auth 加鹽雜湊保管，永遠不會進到這張表。
comment on column users.pass is
  '舊示範模式用的明文密碼。改用 Supabase Auth 之後不再使用，可以清空。';

-- ---------- 2. 註冊時自動建立 users 資料列 ----------
-- 前端在 signUp 時把姓名、角色等塞進 raw_user_meta_data，
-- 這個 trigger 再把它們搬進 users 表。
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (u, uid, email, name, org, phone, area, role, perm, pass)
  values (
    coalesce(new.raw_user_meta_data->>'u', split_part(new.email, '@', 1)),
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'org', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'area', ''),
    -- 角色一律由後端決定，不信任前端送上來的值：
    -- 自己註冊的人只能是果農或收購商，管理權限要由超級管理員另外指派。
    case when new.raw_user_meta_data->>'role' = 'buyer' then 'buyer' else 'farmer' end,
    case when new.raw_user_meta_data->>'role' = 'buyer' then 'buyer' else 'farmer' end,
    ''
  )
  on conflict (u) do update
    set uid = excluded.uid,
        email = coalesce(nullif(users.email, ''), excluded.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 3. 權限判斷用的輔助函式 ----------
-- security definer：讓它繞過 users 表自己的 RLS，否則會遞迴。
create or replace function public.my_perm()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select perm from public.users where uid = auth.uid() limit 1;
$$;

create or replace function public.my_username()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u from public.users where uid = auth.uid() limit 1;
$$;

-- 是不是管理端的角色（能看後台的那些）
create or replace function public.is_staff()
returns boolean
language sql
stable
as $$
  select coalesce(public.my_perm(), '') in ('super', 'admin', 'finance', 'editor', 'coord');
$$;

create or replace function public.is_super()
returns boolean
language sql
stable
as $$
  select coalesce(public.my_perm(), '') = 'super';
$$;

-- ============================================================
-- 4. RLS：從「全開」改成「依身分」
-- ------------------------------------------------------------
-- 設計原則：
--   · 前台要能運作 —— 沒登入的訪客仍然看得到上架的果樹與果園，
--     也還能送出預購登記（leads）與模擬認養（orders）
--   · 錢與人的資料收緊 —— users / payouts / wages / settings
--     只有登入且有權限的人看得到
-- ============================================================

-- 先把舊的全開政策清掉
do $$
declare t text; p record;
begin
  foreach t in array array['users','trees','orders','reports','leads',
                           'wages','messages','settings','payouts','posts'] loop
    for p in select policyname from pg_policies
             where schemaname = 'public' and tablename = t loop
      execute format('drop policy if exists %I on %I', p.policyname, t);
    end loop;
  end loop;
end $$;

-- ---------- trees：公開可讀，員工可改 ----------
create policy "trees_read_all"    on trees for select using (true);
create policy "trees_write_staff" on trees for insert with check (public.is_staff());
create policy "trees_update_own"  on trees for update
  using (public.is_staff() or owner = public.my_username())
  with check (public.is_staff() or owner = public.my_username());

-- ---------- orders：認養人看自己的，員工看全部；訪客仍可下模擬單 ----------
create policy "orders_read"   on orders for select
  using (public.is_staff() or buyer = public.my_username());
create policy "orders_insert" on orders for insert with check (true);
create policy "orders_update" on orders for update
  using (public.is_staff()) with check (public.is_staff());

-- ---------- reports：公開可讀（認養人要看樹況），溝通者以上可寫 ----------
create policy "reports_read"   on reports for select using (true);
create policy "reports_insert" on reports for insert with check (public.is_staff());
create policy "reports_update" on reports for update
  using (public.is_staff()) with check (public.is_staff());

-- ---------- leads：任何人都能送出（官網表單），只有員工看得到 ----------
create policy "leads_insert" on leads for insert with check (true);
create policy "leads_read"   on leads for select using (public.is_staff());
create policy "leads_update" on leads for update
  using (public.is_staff()) with check (public.is_staff());

-- ---------- messages：只有對話雙方與員工 ----------
create policy "messages_read" on messages for select
  using (public.is_staff()
         or from_who = public.my_username()
         or to_who   = public.my_username());
create policy "messages_insert" on messages for insert
  with check (auth.uid() is not null);

-- ---------- users：自己看得到自己，員工看得到全部，只有超管能改別人 ----------
create policy "users_read" on users for select
  using (public.is_staff() or uid = auth.uid());
create policy "users_update_self" on users for update
  using (uid = auth.uid()) with check (uid = auth.uid());
create policy "users_update_super" on users for update
  using (public.is_super()) with check (public.is_super());
-- 沒有 insert policy：帳號一律由 auth trigger 建立，不從前端插入

-- ---------- 錢：只有看得到錢的角色 ----------
create policy "wages_read"    on wages   for select using (public.is_staff());
create policy "wages_write"   on wages   for insert with check (public.is_staff());
create policy "payouts_read"  on payouts for select
  using (public.is_staff() or farmer = public.my_username());
create policy "payouts_write" on payouts for insert with check (public.is_staff());

-- ---------- 設定與貼文 ----------
create policy "settings_read"   on settings for select using (true);
create policy "settings_write"  on settings for insert with check (public.is_super());
create policy "settings_update" on settings for update
  using (public.is_super()) with check (public.is_super());

create policy "posts_read"   on posts for select using (true);
create policy "posts_write"  on posts for insert with check (public.is_staff());
create policy "posts_update" on posts for update
  using (public.is_staff()) with check (public.is_staff());

-- ============================================================
-- 5. 把現有的示範帳號接上 Auth
-- ------------------------------------------------------------
-- SQL 沒辦法直接建立 auth 使用者（密碼要經過 Supabase 的雜湊）。
-- 請到 Authentication → Users → Add user 手動建立，Email 用下面這幾個，
-- 建好之後這段 SQL 會自動把 uid 對回 users 表：
--   admin@rootedfutures.my   →  超級管理員
--   jelani@example.com       →  果農
--   esg@example.com          →  收購商（Email 若已改過請照實際的填）
-- ============================================================
update users u
set uid = a.id
from auth.users a
where u.uid is null
  and lower(u.email) = lower(a.email);

-- 跑完看一眼：uid 有值代表已經接上 Auth
-- select u, email, perm, (uid is not null) as 已接上auth from users order by u;
