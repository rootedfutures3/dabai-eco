-- ============================================================
-- 樹體編號改成六位數：DB-001 → DB-000001
-- ============================================================
-- 為什麼要改：三位數只到 999 棵。一個果園動輒上百棵，真的推廣起來
-- 很快會撞到上限，而編號一旦印在採收標籤和認養合約上就不好回頭了。
--
-- 為什麼一定要用 SQL 而不是從後台改：
--   orders.tree_id 有外鍵指向 trees.id。改 trees.id 的那一瞬間，
--   訂單還指著舊值，資料庫會擋下來。所以要先把外鍵拆掉、四張表一起改、
--   再把外鍵裝回去 —— 這整串必須在同一個交易裡，中途失敗要能整個回復。
--   REST API 沒有交易可用，分開打四次請求，斷在中間就會對不上。
--
-- 怎麼跑：
--   Supabase → SQL Editor → New query → 整份貼上 → Run
--   最後會列出結果讓你核對，數字對了才算成功。
--
-- 這份可以重複執行：已經是六位數的不會被再補一次零。
-- ============================================================

begin;

-- 1 · 先拆掉外鍵，否則改 trees.id 時訂單那邊會擋
alter table orders drop constraint if exists orders_tree_id_fkey;

-- 2 · 四張表一起改。只補「前綴 + 連字號 + 純數字」這種格式，
--     已經六位數的補完還是六位數，所以重跑安全。
update trees
   set id = split_part(id, '-', 1) || '-' || lpad(split_part(id, '-', 2), 6, '0')
 where id ~ '^[A-Z]{2}-[0-9]+$';

update orders
   set tree_id = split_part(tree_id, '-', 1) || '-' || lpad(split_part(tree_id, '-', 2), 6, '0')
 where tree_id ~ '^[A-Z]{2}-[0-9]+$';

update reports
   set tree_id = split_part(tree_id, '-', 1) || '-' || lpad(split_part(tree_id, '-', 2), 6, '0')
 where tree_id ~ '^[A-Z]{2}-[0-9]+$';

update payouts
   set tree_id = split_part(tree_id, '-', 1) || '-' || lpad(split_part(tree_id, '-', 2), 6, '0')
 where tree_id ~ '^[A-Z]{2}-[0-9]+$';

-- 3 · 外鍵裝回去。這一步如果失敗，代表有訂單指到不存在的樹，
--     整個交易會回復，資料不會停在半路。
alter table orders
  add constraint orders_tree_id_fkey
  foreign key (tree_id) references trees(id);

commit;

-- ============================================================
-- 核對：三個數字都要是 0，才算全部改完
-- ============================================================
select
  (select count(*) from trees   where id      !~ '^[A-Z]{2}-[0-9]{6}$') as 樹_還沒改的,
  (select count(*) from orders  where tree_id !~ '^[A-Z]{2}-[0-9]{6}$') as 訂單_還沒改的,
  (select count(*) from reports where tree_id !~ '^[A-Z]{2}-[0-9]{6}$') as 回報_還沒改的,
  (select count(*) from payouts where tree_id !~ '^[A-Z]{2}-[0-9]{6}$'
     and tree_id is not null and tree_id <> '')                          as 撥款_還沒改的,
  (select count(*) from orders o
     where o.tree_id is not null
       and not exists (select 1 from trees t where t.id = o.tree_id))    as 訂單_對不到樹的;
