-- 0001_extensions.sql
--
-- Extensions every later migration depends on. Run first.
--
-- Supabase enables pgcrypto by default, but a self-hosted or reset project may not have it,
-- and gen_random_uuid() is the default for every primary key below.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;   -- trigram index for recipe name search
