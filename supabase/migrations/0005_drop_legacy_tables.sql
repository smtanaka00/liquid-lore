-- 0005_drop_legacy_tables.sql
--
-- OPTIONAL — run deliberately, not as part of a first-time setup.
--
-- Three generations of recipe modelling accumulated in this project: `recipes` +
-- `lore_overrides` (0420), a normalised `user_cabinets`, and the current `cocktails`.
-- Only `cocktails` is read by the application. This migration removes the rest.
--
-- It is separated from 0002–0004 because it destroys data. On a fresh project the tables
-- do not exist and this is a no-op. On an existing project, migrate anything you care
-- about first — in particular `user_cabinets`, which may hold real user inventories.
--
--   -- carry normalised cabinets over to profiles.cabinet before dropping:
--   update profiles p
--      set cabinet = coalesce(sub.items, '{}'::text[])
--     from (
--       select user_id, array_agg(distinct ingredient_name) as items
--         from user_cabinets group by user_id
--     ) sub
--    where p.id = sub.user_id;

drop function if exists public.get_cocktails_with_lore(text);

drop table if exists lore_overrides;
drop table if exists recipes;
drop table if exists user_cabinets;

-- `ingredients` was a bare name list populated by the old Python ingestion script. The
-- canonical taxonomy now lives in lib/domain/ingredient-taxonomy.ts, versioned with the
-- code that depends on it, so the table has no remaining reader.
drop table if exists ingredients;
