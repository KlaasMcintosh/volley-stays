-- Adds photos to options. Paste into Supabase → SQL Editor → New query → Run.
alter table options add column if not exists images jsonb not null default '[]'::jsonb;

-- Public storage bucket for the photos (max 5 MB each, images only).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- No accounts: anyone with the app link can add and remove photos.
create policy "photos read" on storage.objects for select to anon, authenticated using (bucket_id = 'photos');
create policy "photos upload" on storage.objects for insert to anon, authenticated with check (bucket_id = 'photos');
create policy "photos delete" on storage.objects for delete to anon, authenticated using (bucket_id = 'photos');
