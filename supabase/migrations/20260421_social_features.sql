-- Liquid Lore Social Infrastructure Migration
-- Phase 2: Community & Personalization

-- 1. Profiles Table
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
    username TEXT UNIQUE,
    bio TEXT,
    avatar_url TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Custom Recipes Table (User Created)
CREATE TABLE IF NOT EXISTS custom_recipes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    story TEXT,
    instructions TEXT[] NOT NULL DEFAULT '{}'::text[],
    ingredient_data JSONB NOT NULL DEFAULT '[]'::jsonB,
    image_url TEXT,
    likes_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3. Recipe Likes (Many-to-Many)
CREATE TABLE IF NOT EXISTS recipe_likes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    recipe_id UUID REFERENCES custom_recipes ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(user_id, recipe_id)
);

-- 4. Favorites (Unified for Classics and Custom)
CREATE TABLE IF NOT EXISTS favorites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    drink_id TEXT NOT NULL, -- Can be CocktailDB ID or UUID
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(user_id, drink_id)
);

-- 5. Tasting Notes (Enhanced)
CREATE TABLE IF NOT EXISTS tasting_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    drink_id TEXT NOT NULL,
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Ensure enhanced columns exist for tasting_notes
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasting_notes' AND column_name='rating') THEN
        ALTER TABLE tasting_notes ADD COLUMN rating INTEGER CHECK (rating >= 0 AND rating <= 5);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasting_notes' AND column_name='twists') THEN
        ALTER TABLE tasting_notes ADD COLUMN twists TEXT;
    END IF;
END $$;

-- 6. Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasting_notes ENABLE ROW LEVEL SECURITY;

-- Policies for Profiles
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON profiles;
DROP POLICY IF EXISTS "Users can update own profile." ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile." ON profiles;
CREATE POLICY "Public profiles are viewable by everyone." ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile." ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile." ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Policies for Custom Recipes
DROP POLICY IF EXISTS "Custom recipes are viewable by everyone." ON custom_recipes;
DROP POLICY IF EXISTS "Users can insert own recipes." ON custom_recipes;
DROP POLICY IF EXISTS "Users can update own recipes." ON custom_recipes;
DROP POLICY IF EXISTS "Users can delete own recipes." ON custom_recipes;
CREATE POLICY "Custom recipes are viewable by everyone." ON custom_recipes FOR SELECT USING (true);
CREATE POLICY "Users can insert own recipes." ON custom_recipes FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "Users can update own recipes." ON custom_recipes FOR UPDATE USING (auth.uid() = creator_id);
CREATE POLICY "Users can delete own recipes." ON custom_recipes FOR DELETE USING (auth.uid() = creator_id);

-- Policies for Recipe Likes
DROP POLICY IF EXISTS "Likes are viewable by everyone." ON recipe_likes;
DROP POLICY IF EXISTS "Users can manage own likes." ON recipe_likes;
CREATE POLICY "Likes are viewable by everyone." ON recipe_likes FOR SELECT USING (true);
CREATE POLICY "Users can manage own likes." ON recipe_likes FOR ALL USING (auth.uid() = user_id);

-- Policies for Favorites
DROP POLICY IF EXISTS "Users can view own favorites." ON favorites;
DROP POLICY IF EXISTS "Users can manage own favorites." ON favorites;
CREATE POLICY "Users can view own favorites." ON favorites FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own favorites." ON favorites FOR ALL USING (auth.uid() = user_id);

-- Policies for Tasting Notes
DROP POLICY IF EXISTS "Users can view own notes." ON tasting_notes;
DROP POLICY IF EXISTS "Users can manage own notes." ON tasting_notes;
CREATE POLICY "Users can view own notes." ON tasting_notes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own notes." ON tasting_notes FOR ALL USING (auth.uid() = user_id);

-- 7. Triggers for profiles creation on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

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
