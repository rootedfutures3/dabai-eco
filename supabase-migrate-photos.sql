-- ============================================================
-- 樹況回報的照片：存進 Supabase Storage
-- ============================================================
-- 現在照片只在手機上預覽，送出之後就沒了 —— 後台只看得到「3 張」，
-- 看不到那三張是什麼。這份把儲存空間與欄位建起來。
--
-- 怎麼跑：Supabase → SQL Editor → New query → 貼上 → Run
-- 可以重複執行。
-- ============================================================

-- 1 · 回報多一個欄位放照片網址（用逗號分隔，一筆回報最多 6 張）
alter table reports add column if not exists photo_urls text;

-- 2 · 建一個公開的儲存桶
--     公開的意思是「知道網址就看得到」，不是「可以列出全部」。
--     照片會出現在後台的回報清單裡，讓它公開讀取最單純；
--     檔名帶隨機碼，猜不到別人的。
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reports', 'reports', true, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg','image/png','image/webp'];

-- 3 · 政策
--     讀：任何人都可以讀這個桶裡的檔案（後台要顯示）。
--     寫：允許用 publishable key 上傳。
--
--     說清楚這件事的代價：publishable key 印在前端，
--     所以「任何人都能往這個桶丟圖」。這是靜態網站沒有後端的必然結果 ——
--     擋不了，只能限制影響範圍：限定 5MB、限定圖片格式、
--     而且刪除沒有開放。真的要擋住，要等 Supabase Auth 接起來
--     （AUTH_MODE='supabase'），那時候可以改成「只有登入的人能上傳」。
drop policy if exists "reports read"   on storage.objects;
drop policy if exists "reports upload" on storage.objects;

create policy "reports read" on storage.objects
  for select using (bucket_id = 'reports');

create policy "reports upload" on storage.objects
  for insert with check (bucket_id = 'reports');

-- 核對
select id, public, file_size_limit from storage.buckets where id = 'reports';
