-- Migration: Create Cocktails Table for Liquid Lore Repository
-- Description: Sets up the schema for the 1,050 recipe dataset.
-- Date: 2026-05-03

CREATE TABLE IF NOT EXISTS cocktails (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    spirit_category TEXT,
    primary_spirit TEXT,
    method TEXT,
    glass TEXT,
    ice TEXT,
    garnish TEXT,
    flavor_profiles JSONB NOT NULL DEFAULT '[]'::jsonb,
    vibes JSONB NOT NULL DEFAULT '[]'::jsonb,
    difficulty TEXT,
    lore TEXT,
    pro_tip TEXT,
    is_classic BOOLEAN DEFAULT FALSE,
    source TEXT,
    steps_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    ingredients_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Photo fields (augmented from README to match CSV)
    photo_url TEXT,
    photo_thumb TEXT,
    photo_source TEXT,
    photo_id TEXT,
    has_custom_photo BOOLEAN DEFAULT FALSE,
    photo_credit TEXT,
    photo_credit_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Optimization Indexes
CREATE INDEX IF NOT EXISTS cocktails_flavor_profiles_idx ON cocktails USING gin(flavor_profiles);
CREATE INDEX IF NOT EXISTS cocktails_ingredients_json_idx ON cocktails USING gin(ingredients_json);
CREATE INDEX IF NOT EXISTS cocktails_spirit_category_idx ON cocktails(spirit_category);
CREATE INDEX IF NOT EXISTS cocktails_is_classic_idx ON cocktails(is_classic);
CREATE INDEX IF NOT EXISTS cocktails_difficulty_idx ON cocktails(difficulty);

-- Security: Enable RLS
ALTER TABLE cocktails ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Cocktails are viewable by everyone" ON cocktails;
CREATE POLICY "Cocktails are viewable by everyone" ON cocktails 
    FOR SELECT USING (true);

-- System Policy (Allow ingestion/updates)
DROP POLICY IF EXISTS "System can manage cocktails" ON cocktails;
CREATE POLICY "System can manage cocktails" ON cocktails 
    FOR ALL USING (true) WITH CHECK (true);
