-- 0004_community.sql
--
-- Community tables: user-authored recipes, likes, favourites and private tasting notes.
--
-- Two defects from the archived schema are fixed here:
--
--   1. `custom_recipes` previously carried `for update using (true)` — nominally so the
--      client could bump `likes_count`, in practice granting every signed-in user write
--      access to every column of every other user's recipe. UPDATE is now owner-only.
--
--   2. Like counts were maintained by the browser with a read-modify-write, so concurrent
--      likes lost updates and any client could POST an arbitrary number. Counting now
--      happens in `toggle_recipe_like()`, which recounts from `recipe_likes` rather than
--      applying a delta, making the stored count self-healing.

-- ── Custom recipes ───────────────────────────────────────────────────────────────────

create table if not exists custom_recipes (
    id           uuid primary key default gen_random_uuid(),
    creator_id   uuid not null references auth.users on delete cascade,
    name         text not null,
    story        text,
    ingredients  jsonb not null default '[]'::jsonb,      -- [{ name, measure }]
    instructions text[] not null default '{}'::text[],
    glass        text,
    garnish      text,
    image_url    text,
    likes_count  integer not null default 0,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

-- The archived migration named this column `ingredient_data` while the Studio wrote
-- `ingredients`; whichever ran last decided whether publishing worked. Reconcile both.
alter table custom_recipes add column if not exists ingredients jsonb not null default '[]'::jsonb;
alter table custom_recipes add column if not exists glass       text;
alter table custom_recipes add column if not exists garnish     text;
alter table custom_recipes add column if not exists updated_at  timestamptz not null default now();

do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_name = 'custom_recipes' and column_name = 'ingredient_data'
    ) then
        update custom_recipes
           set ingredients = ingredient_data
         where ingredients = '[]'::jsonb
           and ingredient_data is not null
           and ingredient_data <> '[]'::jsonb;
        alter table custom_recipes drop column ingredient_data;
    end if;
end $$;

-- A second FK, to `profiles` rather than `auth.users`. `auth.users` is not in the exposed
-- schema, so without this PostgREST cannot resolve `custom_recipes -> profiles` and the
-- Lounge has no way to show an author name instead of a raw UUID.
do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'custom_recipes_creator_profile_fkey'
    ) then
        alter table custom_recipes
            add constraint custom_recipes_creator_profile_fkey
            foreign key (creator_id) references profiles (id) on delete cascade;
    end if;
end $$;

create index if not exists custom_recipes_creator_idx on custom_recipes (creator_id);
create index if not exists custom_recipes_created_idx on custom_recipes (created_at desc);
create index if not exists custom_recipes_name_trgm_idx on custom_recipes using gin (name gin_trgm_ops);

alter table custom_recipes enable row level security;

drop policy if exists "Recipes are viewable by everyone." on custom_recipes;
drop policy if exists "Custom recipes are viewable by everyone." on custom_recipes;
drop policy if exists "Users can insert their own recipes." on custom_recipes;
drop policy if exists "Users can insert own recipes." on custom_recipes;
drop policy if exists "Anyone can update like counts." on custom_recipes;   -- the hole
drop policy if exists "Users can update own recipes." on custom_recipes;
drop policy if exists "Users can delete own recipes." on custom_recipes;

create policy "Custom recipes are viewable by everyone."
    on custom_recipes for select using (true);
create policy "Users can insert own recipes."
    on custom_recipes for insert with check (auth.uid() = creator_id);
create policy "Users can update own recipes."
    on custom_recipes for update using (auth.uid() = creator_id) with check (auth.uid() = creator_id);
create policy "Users can delete own recipes."
    on custom_recipes for delete using (auth.uid() = creator_id);

-- ── Likes ────────────────────────────────────────────────────────────────────────────

create table if not exists recipe_likes (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null references auth.users on delete cascade,
    recipe_id  uuid not null references custom_recipes on delete cascade,
    created_at timestamptz not null default now(),
    unique (user_id, recipe_id)
);

create index if not exists recipe_likes_recipe_idx on recipe_likes (recipe_id);

alter table recipe_likes enable row level security;

drop policy if exists "Likes are viewable by everyone." on recipe_likes;
drop policy if exists "Users can insert own likes." on recipe_likes;
drop policy if exists "Users can delete own likes." on recipe_likes;
drop policy if exists "Users can manage own likes." on recipe_likes;

create policy "Likes are viewable by everyone."
    on recipe_likes for select using (true);
create policy "Users can manage own likes."
    on recipe_likes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Favourites ───────────────────────────────────────────────────────────────────────
-- `drink_id` is text because it holds either a library id ('cdb-11007') or a custom
-- recipe uuid. `kind` disambiguates so a reader doesn't have to guess from the shape.

create table if not exists favorites (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null references auth.users on delete cascade,
    drink_id   text not null,
    kind       text not null default 'library' check (kind in ('library', 'custom')),
    created_at timestamptz not null default now(),
    unique (user_id, drink_id)
);

alter table favorites add column if not exists kind text not null default 'library';

create index if not exists favorites_user_idx on favorites (user_id);

alter table favorites enable row level security;

drop policy if exists "Users can view own favorites." on favorites;
drop policy if exists "Users can insert own favorites." on favorites;
drop policy if exists "Users can delete own favorites." on favorites;
drop policy if exists "Users can manage own favorites." on favorites;

create policy "Users can manage own favorites."
    on favorites for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Tasting notes ────────────────────────────────────────────────────────────────────

create table if not exists tasting_notes (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null references auth.users on delete cascade,
    drink_id   text not null,
    note       text,
    twists     text,
    rating     integer check (rating between 0 and 5),
    created_at timestamptz not null default now()
);

alter table tasting_notes add column if not exists twists text;
alter table tasting_notes add column if not exists rating integer;

create index if not exists tasting_notes_user_drink_idx on tasting_notes (user_id, drink_id);

alter table tasting_notes enable row level security;

drop policy if exists "Users can view own notes." on tasting_notes;
drop policy if exists "Users can insert/update own notes." on tasting_notes;
drop policy if exists "Users can delete own notes." on tasting_notes;
drop policy if exists "Users can manage own notes." on tasting_notes;

create policy "Users can manage own notes."
    on tasting_notes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Like toggling ────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER so it may update `custom_recipes.likes_count`, which the caller cannot
-- write directly. The count is recomputed from `recipe_likes` rather than incremented, so
-- concurrent toggles converge and a drifted count repairs itself on the next like.

create or replace function public.toggle_recipe_like(p_recipe_id uuid)
returns table (liked boolean, likes_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user  uuid := auth.uid();
    v_liked boolean;
    v_count integer;
begin
    if v_user is null then
        raise exception 'Authentication required to like a recipe'
            using errcode = '28000';
    end if;

    delete from recipe_likes where user_id = v_user and recipe_id = p_recipe_id;
    if found then
        v_liked := false;
    else
        insert into recipe_likes (user_id, recipe_id) values (v_user, p_recipe_id);
        v_liked := true;
    end if;

    select count(*)::integer into v_count from recipe_likes where recipe_id = p_recipe_id;
    update custom_recipes set likes_count = v_count where id = p_recipe_id;

    return query select v_liked, v_count;
end;
$$;

revoke all on function public.toggle_recipe_like(uuid) from public, anon;
grant execute on function public.toggle_recipe_like(uuid) to authenticated;
