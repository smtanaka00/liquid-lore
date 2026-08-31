-- 0006_studio.sql
--
-- What the rebuilt Creator Studio needs: flavour tags on community recipes, and a place
-- to put the photograph a creator uploads.
--
-- Flavour tags use the *library's* vocabulary (`boozy`, `citrusy`, `smoky`, …) rather than
-- a second free-text list. A community drink tagged `smoky` should be findable by the same
-- chip that finds a smoky classic; two vocabularies would mean two filters that disagree.

-- ── Flavour tags ─────────────────────────────────────────────────────────────────────

alter table custom_recipes
    add column if not exists flavor_profiles text[] not null default '{}'::text[];

-- GIN so a `flavor_profiles @> '{smoky}'` filter stays an index scan as the feed grows.
create index if not exists custom_recipes_flavor_idx
    on custom_recipes using gin (flavor_profiles);

-- ── Recipe photography ───────────────────────────────────────────────────────────────
-- Public-read, owner-write. Objects are stored under `<user-id>/<file>`, and the write
-- policies check that first path segment: without it, any authenticated user could
-- overwrite or delete another creator's photograph, which is the storage-layer version of
-- the `custom_recipes` UPDATE hole that 0004 closed.
--
-- 5 MB and an explicit MIME allow-list, so the bucket cannot be used as general file
-- hosting. Both are enforced by Storage itself, not only by the upload form.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'recipe-images',
    'recipe-images',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
   set public             = excluded.public,
       file_size_limit    = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Recipe images are publicly readable." on storage.objects;
drop policy if exists "Users can upload own recipe images." on storage.objects;
drop policy if exists "Users can replace own recipe images." on storage.objects;
drop policy if exists "Users can delete own recipe images." on storage.objects;

create policy "Recipe images are publicly readable."
    on storage.objects for select
    using (bucket_id = 'recipe-images');

create policy "Users can upload own recipe images."
    on storage.objects for insert to authenticated
    with check (
        bucket_id = 'recipe-images'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

create policy "Users can replace own recipe images."
    on storage.objects for update to authenticated
    using (
        bucket_id = 'recipe-images'
        and (storage.foldername(name))[1] = auth.uid()::text
    )
    with check (
        bucket_id = 'recipe-images'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

create policy "Users can delete own recipe images."
    on storage.objects for delete to authenticated
    using (
        bucket_id = 'recipe-images'
        and (storage.foldername(name))[1] = auth.uid()::text
    );
