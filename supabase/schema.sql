-- Create a table for public profiles
create table profiles (
  id uuid references auth.users not null primary key,
  username text,
  bio text,
  cabinet text[] default '{}'::text[],
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Custom Recipes Table (Creator Studio)
create table custom_recipes (
  id uuid default uuid_generate_v4() primary key,
  creator_id uuid references auth.users not null,
  name text not null,
  story text,
  ingredients jsonb not null default '[]'::jsonb,
  instructions text[] not null default '{}'::text[],
  image_url text,
  glass text,
  garnish text,
  likes_count integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Recipe Likes (to track who liked what)
create table recipe_likes (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users not null,
  recipe_id uuid references custom_recipes not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, recipe_id)
);

-- Favorites
create table favorites (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users not null,
  drink_id text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, drink_id)
);

-- Tasting Notes
create table tasting_notes (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users not null,
  drink_id text not null,
  note text not null,
  rating integer default 0,
  twists text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Set up Row Level Security (RLS)
alter table profiles enable row level security;
alter table custom_recipes enable row level security;
alter table recipe_likes enable row level security;
alter table favorites enable row level security;
alter table tasting_notes enable row level security;

create policy "Public profiles are viewable by everyone." on profiles for select using (true);
create policy "Users can insert their own profile." on profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile." on profiles for update using (auth.uid() = id);

create policy "Recipes are viewable by everyone." on custom_recipes for select using (true);
create policy "Users can insert their own recipes." on custom_recipes for insert with check (auth.uid() = creator_id);
create policy "Anyone can update like counts." on custom_recipes for update using (true);

create policy "Likes are viewable by everyone." on recipe_likes for select using (true);
create policy "Users can insert own likes." on recipe_likes for insert with check (auth.uid() = user_id);
create policy "Users can delete own likes." on recipe_likes for delete using (auth.uid() = user_id);

create policy "Users can view own favorites." on favorites for select using (auth.uid() = user_id);
create policy "Users can insert own favorites." on favorites for insert with check (auth.uid() = user_id);
create policy "Users can delete own favorites." on favorites for delete using (auth.uid() = user_id);

create policy "Users can view own notes." on tasting_notes for select using (auth.uid() = user_id);
create policy "Users can insert/update own notes." on tasting_notes for insert with check (auth.uid() = user_id);
create policy "Users can delete own notes." on tasting_notes for delete using (auth.uid() = user_id);

-- Trigger for profile creation on signup
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
  -- Defensive insert: use ON CONFLICT to avoid PK errors
  -- Fallback for username: metadata -> email prefix -> generic name
  INSERT INTO public.profiles (id, username)
  VALUES (
    new.id, 
    COALESCE(
      new.raw_user_meta_data->>'username', 
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1),
      'mixologist_' || substr(new.id::text, 1, 8)
    )
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN new;
EXCEPTION WHEN OTHERS THEN
  -- Critical: If profile creation fails, we MUST still return 'new'
  -- to let the user be created in auth.users, otherwise login is blocked.
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
