# Supabase setup

## Applying migrations

Run the files in `migrations/` in numeric order. Every one is idempotent, so re-running a
migration on an already-migrated project is safe.

**Via the Supabase SQL editor** — paste each file in order:

| Order | File | What it does |
|---|---|---|
| 1 | `0001_extensions.sql` | `pgcrypto`, `pg_trgm` |
| 2 | `0002_cocktails.sql` | the curated recipe library + read-only RLS |
| 3 | `0003_profiles.sql` | profiles, cabinet column, signup trigger |
| 4 | `0004_community.sql` | custom recipes, likes, favourites, tasting notes, `toggle_recipe_like()` |
| 5 | `0005_drop_legacy_tables.sql` | **optional, destructive** — removes the superseded `recipes` / `lore_overrides` / `user_cabinets` / `ingredients` tables |
| 6 | `0006_studio.sql` | `custom_recipes.flavor_profiles`, and the `recipe-images` storage bucket the Creator Studio uploads to |

`0006` is **not optional** if you run the app against this project: the community queries
name their columns explicitly, so a project without `flavor_profiles` makes the Lounge
report itself offline rather than returning partial rows.

**Via the CLI:**

```bash
supabase db push
```

Then load the recipe library:

```bash
npm run library:build   # rebuild data/cocktails.seed.json from TheCocktailDB (optional)
npm run db:seed         # upsert the seed into the cocktails table
```

`db:seed` needs `SUPABASE_SERVICE_ROLE_KEY` — the `cocktails` table is deliberately
read-only to the anon and authenticated roles.

## Security notes

- **`cocktails` has no write policy.** With RLS enabled and no permissive `insert`/`update`/
  `delete` policy, only `service_role` can modify the catalogue. The previous schema's
  `for all using (true)` let any anonymous visitor rewrite the entire recipe library.
- **`custom_recipes` UPDATE is owner-only.** The old `"Anyone can update like counts."`
  policy granted UPDATE on every column of every row, not just the counter.
- **Likes go through `toggle_recipe_like()`**, a `SECURITY DEFINER` function that recounts
  from `recipe_likes` instead of trusting a client-supplied delta.
- **Recipe images are owner-scoped by path.** Objects live at `<user-id>/<file>` and the
  `recipe-images` policies check that first path segment, so one creator cannot overwrite or
  delete another's photograph. The bucket caps uploads at 5 MB and allows only JPEG, PNG,
  WebP and AVIF — enforced by Storage, not just by the upload form.
- **Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.** It bypasses RLS entirely.
  It has no `NEXT_PUBLIC_` prefix for exactly this reason, and `lib/supabase/server.ts`
  throws if it is imported client-side.

## `_archive/`

The superseded migrations, kept for history. They are **not** part of the run order, and
they conflict with each other — `schema.sql` and `20260421_social_features.sql` both create
`custom_recipes` with different column names. Do not apply them.
