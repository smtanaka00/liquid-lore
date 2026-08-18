-- 0003_profiles.sql
--
-- Public profiles and the cloud copy of each user's cabinet.
--
-- The cabinet is a text[] on the profile rather than the normalised `user_cabinets` table
-- from the archived migration. It is read on every page load and written as a whole set;
-- a row-per-ingredient table added a join and a transaction to every toggle and bought no
-- query we actually make.

create table if not exists profiles (
    id           uuid primary key references auth.users on delete cascade,
    username     text unique,
    bio          text,
    avatar_url   text,
    cabinet      text[] not null default '{}'::text[],   -- canonical ingredient slugs
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

-- Bring forward any profile table created by the archived migrations.
alter table profiles add column if not exists cabinet    text[] not null default '{}'::text[];
alter table profiles add column if not exists avatar_url text;
alter table profiles add column if not exists created_at timestamptz not null default now();

create index if not exists profiles_username_idx on profiles (username);

alter table profiles enable row level security;

drop policy if exists "Public profiles are viewable by everyone." on profiles;
drop policy if exists "Users can insert their own profile." on profiles;
drop policy if exists "Users can insert own profile." on profiles;
drop policy if exists "Users can update own profile." on profiles;

create policy "Public profiles are viewable by everyone."
    on profiles for select using (true);
create policy "Users can insert own profile."
    on profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile."
    on profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- ── Profile bootstrap on signup ──────────────────────────────────────────────────────
-- Runs inside the auth.users insert. It must never raise: a failure here would roll back
-- the signup itself and lock the user out permanently, so the body swallows errors and the
-- app tolerates a missing profile row.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, username)
    values (
        new.id,
        coalesce(
            new.raw_user_meta_data->>'username',
            new.raw_user_meta_data->>'full_name',
            split_part(new.email, '@', 1),
            'mixologist_' || substr(new.id::text, 1, 8)
        )
    )
    on conflict (id) do nothing;
    return new;
exception when others then
    -- Never block account creation on profile creation.
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();
