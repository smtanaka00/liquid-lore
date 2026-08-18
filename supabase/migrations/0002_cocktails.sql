-- 0002_cocktails.sql
--
-- The curated recipe library — the single source of truth for every drink Liquid Lore ships.
--
-- Supersedes the earlier `recipes` + `lore_overrides` pair (see _archive/). Lore is a column
-- on the row rather than a joined override table: there is exactly one story per drink, and
-- the join bought nothing but a LEFT JOIN on every read.
--
-- Populated by `npm run db:seed`, which reads data/cocktails.seed.json.

create table if not exists cocktails (
    id                    text primary key,             -- 'cdb-11007' | 'll-negroni'
    slug                  text not null unique,         -- url-safe, stable across re-seeds
    name                  text not null,

    -- Provenance. Every recipe must declare where it came from so the UI can be honest
    -- about which stories are documented history and which are house descriptions.
    source                text not null,                -- 'thecocktaildb' | 'liquid_lore_premium'
    source_id             text,
    source_url            text,

    category              text,
    is_alcoholic          boolean not null default true,
    is_classic            boolean not null default false,

    glass                 text,
    method                text,                         -- shake | stir | build | blend | muddle
    ice                   text,
    garnish               text,
    difficulty            text,                         -- easy | medium | advanced

    flavor_profiles       jsonb not null default '[]'::jsonb,
    vibes                 jsonb not null default '[]'::jsonb,

    lore                  text,                         -- null when no real story is known
    lore_source           text,                         -- attribution, so claims are traceable
    pro_tip               text,

    steps                 jsonb not null default '[]'::jsonb,
    ingredients           jsonb not null default '[]'::jsonb,

    -- Denormalised canonical ingredient slugs, kept in step with `ingredients` by the seeder.
    -- This is what the "What Can I Make?" engine matches against: a GIN-indexed text[] turns
    -- cabinet matching into a containment test instead of a per-row JSON scan.
    canonical_ingredients text[] not null default '{}'::text[],
    -- Ingredients that do not block a match (ice, water, common garnishes).
    optional_ingredients  text[] not null default '{}'::text[],

    photo                 jsonb not null default '{}'::jsonb,

    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now()
);

create index if not exists cocktails_canonical_ingredients_idx on cocktails using gin (canonical_ingredients);
create index if not exists cocktails_flavor_profiles_idx       on cocktails using gin (flavor_profiles);
create index if not exists cocktails_vibes_idx                 on cocktails using gin (vibes);
create index if not exists cocktails_name_trgm_idx             on cocktails using gin (name gin_trgm_ops);
create index if not exists cocktails_is_classic_idx            on cocktails (is_classic);
create index if not exists cocktails_category_idx              on cocktails (category);

-- ── Row Level Security ───────────────────────────────────────────────────────────────
-- The library is public to read and closed to write. The archived migration granted
-- `for all using (true)`, which let any anonymous visitor rewrite or delete every recipe
-- in the catalogue. Writes now require the service-role key, which only the seeder holds.

alter table cocktails enable row level security;

drop policy if exists "Cocktails are viewable by everyone" on cocktails;
drop policy if exists "System can manage cocktails" on cocktails;

create policy "Cocktails are viewable by everyone"
    on cocktails for select
    using (true);

-- No insert/update/delete policy is defined on purpose: with RLS enabled and no permissive
-- write policy, anon and authenticated roles cannot write. service_role bypasses RLS.
