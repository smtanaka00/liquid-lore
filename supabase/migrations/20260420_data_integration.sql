-- Liquid Lore Data Integration Protocol Migration
-- Phase 1: Strict Data Modeling

-- 1. Ingredients Table
CREATE TABLE IF NOT EXISTS ingredients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    is_alcoholic BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Recipes Table
CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY, -- Use the same ID as TheCocktailDB (string) or internal identifier
    name TEXT NOT NULL,
    instructions TEXT[] NOT NULL DEFAULT '{}'::text[],
    image_url TEXT,
    glass TEXT,
    category TEXT,
    ingredient_data JSONB NOT NULL DEFAULT '[]'::jsonB, -- Array of {ingredient_name, measure}
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3. Lore Overrides Table
CREATE TABLE IF NOT EXISTS lore_overrides (
    recipe_id TEXT PRIMARY KEY REFERENCES recipes(id) ON DELETE CASCADE,
    history TEXT,
    pro_tip TEXT,
    glassware_icon TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 4. User Cabinets Table (Normalized)
CREATE TABLE IF NOT EXISTS user_cabinets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users NOT NULL,
    ingredient_name TEXT NOT NULL, -- Standardized name
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(user_id, ingredient_name)
);

-- 5. Row Level Security (RLS)
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE lore_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_cabinets ENABLE ROW LEVEL SECURITY;

-- Policies for Ingredients
DROP POLICY IF EXISTS "Ingredients are viewable by everyone." ON ingredients;
DROP POLICY IF EXISTS "System can manage ingredients." ON ingredients;
CREATE POLICY "Ingredients are viewable by everyone." ON ingredients FOR SELECT USING (true);
CREATE POLICY "System can manage ingredients." ON ingredients FOR ALL USING (true) WITH CHECK (true);

-- Policies for Recipes
DROP POLICY IF EXISTS "Recipes are viewable by everyone." ON recipes;
DROP POLICY IF EXISTS "System can manage recipes." ON recipes;
CREATE POLICY "Recipes are viewable by everyone." ON recipes FOR SELECT USING (true);
CREATE POLICY "System can manage recipes." ON recipes FOR ALL USING (true) WITH CHECK (true);

-- Policies for Lore Overrides
DROP POLICY IF EXISTS "Lore is viewable by everyone." ON lore_overrides;
DROP POLICY IF EXISTS "System can manage lore." ON lore_overrides;
CREATE POLICY "Lore is viewable by everyone." ON lore_overrides FOR SELECT USING (true);
CREATE POLICY "System can manage lore." ON lore_overrides FOR ALL USING (true) WITH CHECK (true);

-- Policies for User Cabinets
DROP POLICY IF EXISTS "Users can view own cabinet." ON user_cabinets;
DROP POLICY IF EXISTS "Users can insert into own cabinet." ON user_cabinets;
DROP POLICY IF EXISTS "Users can delete from own cabinet." ON user_cabinets;
CREATE POLICY "Users can view own cabinet." ON user_cabinets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert into own cabinet." ON user_cabinets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete from own cabinet." ON user_cabinets FOR DELETE USING (auth.uid() = user_id);

-- 6. Helper Functions

-- Function to get recipes with lore merged
CREATE OR REPLACE FUNCTION get_cocktails_with_lore(recipe_id_param TEXT DEFAULT NULL)
RETURNS TABLE (
    id TEXT,
    name TEXT,
    instructions TEXT[],
    image_url TEXT,
    glass TEXT,
    category TEXT,
    ingredient_data JSONB,
    history TEXT,
    pro_tip TEXT,
    glassware_icon TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.id,
        r.name,
        r.instructions,
        r.image_url,
        r.glass,
        r.category,
        r.ingredient_data,
        COALESCE(lo.history, r.name || ' is a classic ' || COALESCE(r.category, 'cocktail') || '.') as history,
        lo.pro_tip,
        lo.glassware_icon
    FROM recipes r
    LEFT JOIN lore_overrides lo ON r.id = lo.recipe_id
    WHERE (recipe_id_param IS NULL OR r.id = recipe_id_param);
END;
$$ LANGUAGE plpgsql;
