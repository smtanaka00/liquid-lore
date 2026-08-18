-- Migration: Add Cabinet to Profiles
-- Description: Adds the cabinet text array column to store the user's stocked bar.
-- Date: 2026-05-03

DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='cabinet') THEN
        ALTER TABLE profiles ADD COLUMN cabinet text[] DEFAULT '{}'::text[];
    END IF;
END $$;

-- Update existing profiles to have an empty array if null (though DEFAULT should handle it)
UPDATE profiles SET cabinet = '{}'::text[] WHERE cabinet IS NULL;
