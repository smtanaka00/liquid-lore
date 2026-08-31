# Liquid Lore — Implementation Plan

> **What this file is.** The live tracker for turning Liquid Lore from a prototype into a
> commercial-grade product. It records the audit that motivated the work, the decisions locked
> for this build, and per-milestone status. `feature_set.md` holds the product vision;
> this file holds the engineering path to it.

**Last updated:** 2026-08-17

---

## 1. Audit — what the review found

The app was reviewed end-to-end against `feature_set.md`, which marks 24 features as shipped.
Several of those are checked off but are not functional at runtime. Findings, worst first:

### 🔴 Blockers

| # | Finding | Evidence |
|---|---------|----------|
| B1 | **The app does not build.** | `pages/custom-drink/[id].tsx:111` has an unbalanced `</div>`. `npm run build` fails with `Type error: ')' expected`. Every deploy is broken. |
| B2 | **The core matching engine returns almost nothing.** A user who owns *every one of the 54 ingredients the UI offers* can make **27 of 1,050 recipes (2.6%)**. A realistic 12-bottle home bar matches **4**. | 1,031 of 1,050 recipes list their base spirit as a **brand name** — `Tito's`, `Monkey 47`, `Buffalo Trace`. The cabinet vocabulary contains `Vodka`, `Gin`, `Bourbon`. They never match. |
| B3 | **98% of the library is fabricated.** 1,030 of 1,050 recipes are machine-generated ingredient permutations carrying invented histories. | `ll-00021 "Wild London Collins"` — vodka, watermelon juice, `2 dashes dry white wine` — is captioned *"A tiki bar staple from the golden age of Polynesian-themed restaurants."* No such drink exists. Shipping invented history as fact is a credibility and liability risk. |
| B4 | **Recipes are hardcoded, not served from a database.** | `lib/liquid_lore_recipes.js` is a **2 MB** JS module imported directly by `lib/cocktail-service.ts`, so the entire library ships in the browser bundle on first paint. The `cocktails` Supabase table exists in a migration but **no code ever queries it**. This directly violates the rule in `AGENTS.md`: *"Do not allow the frontend to call external APIs directly; it must always query our Supabase instance."* |
| B5 | **The app cannot build or run without Supabase credentials.** Found while fixing B1. | `lib/supabase.ts` called `createClient('', '')` at module scope; supabase-js validates the URL and throws, so `next build` died with `Error: supabaseUrl is required` on every page that imports it. A fresh clone, and any CI without secrets, could not build. |
| B6 | **Anyone could rewrite or delete the entire recipe catalogue.** | `20260503_create_cocktails_table.sql:51` — `create policy "System can manage cocktails" on cocktails for all using (true) with check (true)` grants INSERT/UPDATE/DELETE on the whole library to the **anon** role. |

### 🟠 Major

| # | Finding | Evidence |
|---|---------|----------|
| M1 | Only **41 distinct photos** across 1,050 recipes — originals repeat a small stock pool. | 1,030 recipes share 40 Unsplash URLs. |
| M2 | **Shared links have no preview.** Social sharing and QR codes are headline features, but drink pages are client-rendered with no per-page `<title>`, description or Open Graph tags. Every shared link previews as a blank "Liquid Lore". | `pages/drink/[id].tsx` fetches in `useEffect`; only `_app.tsx` sets `<Head>`. |
| M3 | **PWA/offline is claimed but absent.** There is no service worker anywhere in the repo, so "Offline Mode" and "installable PWA" do not work — a manifest alone does neither. | No `sw.js`, no `next-pwa`, no `workbox`. |
| M4 | **Two migrations create the same tables with different columns.** Applying both in either order leaves a schema that does not match the app. | `supabase/schema.sql` creates `custom_recipes.ingredients`; `migrations/20260421_social_features.sql` creates `custom_recipes.ingredient_data`. `pages/studio.tsx:37` writes `ingredients`. Whichever ran last wins. |
| M5 | **Any logged-in user can overwrite anyone's recipe.** | `schema.sql:67` — `create policy "Anyone can update like counts." on custom_recipes for update using (true)` grants UPDATE on *every column of every row*, not just the counter. |
| M6 | **Like counts are forgeable and race-prone.** The client reads the count, adds one, and writes it back — two concurrent likes lose one, and the value can be set to anything. | `pages/lounge.tsx:51-53`. |
| M7 | **Light mode is broken on half the app.** `index` and `drink` use CSS theme tokens; `UserProfile`, `custom-drink`, `Auth`, `QRShare` and the Lounge cards hardcode `bg-zinc-950` / `text-amber-500`, so they stay dark and low-contrast when the user picks light. | Hardcoded palette classes in 5 components. |
| M8 | **A filter chip that matches nothing.** The "Strong" flavour filter returns 0 of 1,050 recipes; the dataset's vocabulary is `boozy`, `citrusy`, `herby`, `warming`… — the four hardcoded chips were never reconciled with the data. | `pages/index.tsx:431`. |
| M9 | **Unit conversion silently fails on most of the library.** `formatMeasure` parses with `parseFloat`, but the dataset writes amounts as unicode fractions (`¾ oz`, `1½ oz`). `parseFloat("¾")` is `NaN`. | `pages/drink/[id].tsx:101-129`. |
| M10 | **`getAllIngredients()` feeds raw, unnormalized names into the cabinet.** The autocomplete offers `bourbon`, `Tito's`, `muddled jalapeño` and `splash of club soda` as stockable items, so users build cabinets the engine can't match. | `lib/cocktail-service.ts:4-9`. |

### 🟡 Gaps against the spec

| # | Feature claimed shipped | Reality |
|---|---|---|
| G1 | "AI Flavor Assistant (Phase 3)" | No such code exists anywhere in the repo. |
| G2 | "Favorites & **Wishlist**" | Favorites exist; there is no wishlist. |
| G3 | "**Multi-step** Creator Studio form" | Single long form, no validation, no image upload, no flavour tagging. |
| G4 | "Global API Integration (TheCocktailDB)" | Only a Python script that was run once. Nothing integrates at runtime. |
| G5 | Lounge feed | No pagination, no search, and creators show as raw UUIDs — `profiles.username` is never joined. |
| G6 | Engineering baseline | No tests, no linter, no `next.config.js`, no `.env.example`, no CI. `next@14.0.3` carries a known advisory. |

### Structural read

The layering in `PROJECT_STRUCTURE.md` is inverted. `lib/cocktail-service.ts` is nominally the
data layer but it holds business logic (the matching engine), reaches into a bundled data file,
and is called straight from React components. There is no server boundary at all: every page
talks to Supabase from the browser. That is why the "database" never got used — there was
nowhere for it to plug in.

---

## 2. Decisions locked for this build

| Decision | Choice | Why |
|---|---|---|
| **Library content** | Rebuild on real data: ingest TheCocktailDB (~600 verified recipes) + retain the 20 hand-written premium classics. The 1,030 generated recipes are archived out of the app. | Every recipe and every story must be true. A smaller honest library beats a large invented one. |
| **Data layer** | Supabase is the source of truth. Next.js **API routes** query it server-side; the browser never receives the whole library. A generated local seed is the degraded/offline fallback. | Satisfies the `AGENTS.md` single-source-of-truth rule, kills the 2 MB bundle, and keeps Offline Mode achievable. |
| **Supabase provisioning** | Build **ready-to-seed**: migrations + one-command seed script + `.env.example`. No credentials pass through the build session. | The app must run and be verifiable with or without cloud configured. |
| **Ingredient model** | A canonical taxonomy with a **hierarchy** (`bourbon` → `whiskey`), an **alias map** (brand → generic, `Tito's` → `vodka`), and a **pantry set** (ice, water, garnishes) that never blocks a match. | This is the single fix for B2. Matching quality is a data-modelling problem, not a filtering problem. |
| **Rendering** | `getServerSideProps` / `getStaticProps` for drink and profile pages, so shared links carry real metadata. | Fixes M2; sharing is a headline feature. |
| **Testing** | Vitest over the pure domain layer (taxonomy, matching, unit conversion) — the logic where correctness is load-bearing. | Boundary + failure-mode coverage per `PROJECT_STRUCTURE.md §7`. |

---

## 3. Target architecture

```text
 ┌──────────────────────────────────────────────────────────┐
 │  UI layer — pages/, components/                           │
 │  React. No business logic, no direct data access.         │
 └───────────────┬──────────────────────────────────────────┘
                 │  fetch()  via lib/api-client.ts
 ┌───────────────▼──────────────────────────────────────────┐
 │  Server boundary — pages/api/*                            │
 │  cocktails · cocktails/[id] · cabinet/match · ingredients  │
 │  lounge                                                   │
 └───────────────┬──────────────────────────────────────────┘
                 │
 ┌───────────────▼──────────────────────────────────────────┐
 │  Domain layer — lib/domain/*        (pure, unit-tested)   │
 │  ingredient-taxonomy · matching · measures · types        │
 └───────────────┬──────────────────────────────────────────┘
                 │
 ┌───────────────▼──────────────────────────────────────────┐
 │  Data layer — lib/data/repository.ts                      │
 │      ├── supabase-source   (primary)                      │
 │      └── seed-source       (fallback, on any failure) ────┼──▶ notes[]
 └───────────────┬──────────────────────────────────────────┘
                 │
        ┌────────▼────────┐        ┌──────────────────────┐
        │  Supabase       │        │ data/cocktails.seed  │
        │  cocktails, …   │        │ .json  (generated)   │
        └─────────────────┘        └──────────────────────┘
                 ▲
                 │  npm run db:seed
        ┌────────┴──────────────────────────────────────────┐
        │  scripts/build-library.mjs                         │
        │  TheCocktailDB ──▶ normalize ──▶ merge premium lore│
        └────────────────────────────────────────────────────┘
```

**Degradation contract.** Every data-layer call returns `{ data, notes[] }` and never throws.
If Supabase is unconfigured or unreachable, the repository serves the local seed and pushes a
note; the API route returns 200 with a `X-Liquid-Lore-Source: seed` header. The UI decides
whether to surface it. No user-facing crash from a data outage.

---

## 4. Milestones

**Legend:** ✅ done · 🟡 in progress · ⬜ not started

### Milestone 0 — Foundation & build repair · branch `fix/build-and-foundation`

| # | Task | Files | Status |
|---|------|-------|--------|
| 0.1 | Fix the unbalanced JSX that breaks the build (B1) | `pages/custom-drink/[id].tsx` | ✅ |
| 0.2 | Add `next.config.js` — strict mode, remote image patterns, security headers | `next.config.js` | ✅ |
| 0.3 | Add `.env.example` + document required vars | `.env.example` | ✅ |
| 0.4 | Add ESLint + `lint` / `typecheck` / `test` / `verify` scripts | `.eslintrc.json`, `package.json` | ✅ |
| 0.5 | Patch the `next@14.0.3` advisory — now `14.2.35` (G6) | `package.json` | ✅ |
| 0.6 | Replace hardcoded `zinc`/`amber` with theme tokens (M7) | `UserProfile`, `custom-drink`, `Auth`, `QRShare`, `lounge` | ✅ |
| 0.7 | Consolidate the conflicting migrations into one ordered set (M4) | `supabase/migrations/000{1..5}_*.sql` | ✅ |
| 0.8 | Scope the `custom_recipes` UPDATE policy to the owner (M5) | `0004_community.sql` | ✅ |
| 0.9 | Move like counting into a `SECURITY DEFINER` RPC (M6) | `0004_community.sql`, `pages/lounge.tsx` | ✅ |
| 0.10 | Make Supabase optional at import time so the app builds and runs with no backend (B5) | `lib/supabase/client.ts`, `lib/supabase/server.ts` | ✅ |
| 0.11 | Remove the anon write policy on `cocktails`; writes are service-role only (B6) | `0002_cocktails.sql` | ✅ |
| 0.12 | Author bylines in the Lounge via a `custom_recipes → profiles` FK (G5, partial) | `0004_community.sql`, `pages/lounge.tsx` | ✅ |
| 0.13 | Replace blocking `alert()` calls with inline, screen-reader-announced toasts | `pages/lounge.tsx` | ✅ |

**Baseline captured after Milestone 0** (`next build`, First Load JS) — the number Milestone 1 has to move:

| Route | Before M1 |
|---|---|
| `/` | 282 kB |
| `/drink/[id]` | 278 kB |
| `/profile` | 279 kB |
| `/lounge` | 140 kB |

### Milestone 1 — Real data layer · branch `feat/real-recipe-data-layer`

| # | Task | Files | Status |
|---|------|-------|--------|
| 1.1 | Canonical ingredient taxonomy: hierarchy, brand aliases, pantry set (B2) | `lib/domain/ingredient-taxonomy.ts` | ✅ |
| 1.2 | Domain types shared by every layer | `lib/domain/types.ts` | ✅ |
| 1.3 | `build-library.ts` — TheCocktailDB → normalized seed, merged with premium lore (B3) | `scripts/build-library.ts` | ✅ |
| 1.4 | Generate `data/cocktails.seed.json`; archive the 1,030 generated recipes out of the app | `data/`, `enrichments/_archive/` | ✅ |
| 1.5 | Repository with Supabase-primary / seed-fallback and non-throwing contract (B4) | `lib/data/*` | ✅ |
| 1.6 | API routes: cocktails, cocktail detail, ingredients, cabinet match | `pages/api/*` | ✅ |
| 1.7 | Delete the 2 MB client import; browser talks only to `/api` | `lib/api-client.ts`; old files removed | ✅ |
| 1.8 | `db:seed` script + refreshed `cocktails` migration | `scripts/seed-supabase.ts` | ✅ |
| 1.9 | Cabinet persistence + migration of legacy display-name cabinets to slugs | `lib/cabinet.ts` | ✅ |

**Library rebuilt.** `npm run library:build` fetches TheCocktailDB across three enumeration
axes (a–z search, category/glass/ingredient filters) and merges the 20 hand-written classics:

| | Before | After |
|---|---|---|
| Recipes | 1,050 | **629** |
| …that are real drinks | 20 | **629** |
| Distinct photographs | 41 | **629** |
| Recipes with sourced lore | 20 (+1,030 fabricated) | **20** (and zero fabricated) |
| Classics | self-declared | **79**, IBA-recognised or hand-written |
| Unresolved ingredient names | n/a | 4 of 1,730 uses (Kool-Aid, Jello, Fruit, Maui) |

**Bundle impact** (`next build`, First Load JS):

| Route | Before | After | |
|---|---|---|---|
| `/` | 282 kB | **151 kB** | −46% |
| `/drink/[id]` | 278 kB | **145 kB** | −48%, and now server-rendered |
| `/profile` | 279 kB | **142 kB** | −49% |

### Milestone 2 — Matching engine · branch `feat/matching-engine`

| # | Task | Files | Status |
|---|------|-------|--------|
| 2.1 | Rewrite matching over the taxonomy: hierarchy-aware, pantry-aware, substitutions (B2) | `lib/domain/matching.ts` | ✅ |
| 2.2 | Real Maximizer — rank candidate purchases by recipes unlocked | `lib/domain/matching.ts` | ✅ |
| 2.3 | Cabinet UI driven by the taxonomy, not by raw recipe strings (M10) | `pages/index.tsx` | ✅ |
| 2.4 | Flavour filters generated from the actual vocabulary (M8) | `pages/index.tsx`, `/api/cocktails` | ✅ |
| 2.5 | Unicode-fraction-safe measure parsing and conversion (M9) | `lib/domain/measures.ts` | ✅ |
| 2.6 | Vitest suite over taxonomy, matching, measures, cabinet | `tests/` — **125 tests passing** | ✅ |

**The headline fix.** Recipes a cabinet can actually make, before and after:

| Cabinet | Before | After |
|---|---|---|
| Every ingredient the UI offers | 27 / 1,050 (2.6%) | **629 / 629 (100%)** |
| Realistic 12-bottle home bar | 4 ready | **45 ready, 182 one bottle away** |
| Gin + Campari + Sweet Vermouth | 1 | **6** — Negroni, Americano, Addison, Gin Sling, Gin Toddy, Lone Tree |

Verified end-to-end against the running app: `/api/ingredients` (11 groups, counts from the
live library), `/api/cabinet/match`, `/api/cocktails` search, `/api/cocktails/[id]`, plus the
error paths (404 on an unknown recipe, 405 on the wrong verb, 400 on a malformed body).
Drink pages now emit real OG/Twitter metadata and 307 from an id URL to the slug URL.

### Milestone 3 — Social, sharing & SEO · branch `feat/social-and-sharing`

| # | Task | Files | Status |
|---|------|-------|--------|
| 3.1 | Server-render drink/profile/custom-drink pages with per-page OG + Twitter metadata (M2) | `pages/drink/[id].tsx`, … | ⬜ |
| 3.2 | Join `profiles.username` into the Lounge feed; drop raw UUIDs (G5) | `lib/domain/community.ts`, `lib/data/community-source.ts` | ✅ |
| 3.3 | Lounge pagination + search | `pages/api/lounge.ts`, `pages/lounge.tsx` | ✅ |
| 3.4 | Creator Studio: multi-step flow, validation, flavour tagging, image upload (G3) | `pages/studio.tsx` | ⬜ |
| 3.5 | Wishlist alongside favourites (G2) | migration, profile UI | ⬜ |

Groundwork already in place for this milestone: the `custom_recipes → profiles` foreign key
exists (so the Lounge byline query works), `favorites.kind` distinguishes library recipes
from community ones, and `/drink/[id]` is already server-rendered — 3.1 is mostly a matter
of repeating that treatment on `/custom-drink/[id]` and `/profile/[id]`.

**3.2 + 3.3 — the community server boundary.** The Lounge no longer queries `custom_recipes`
from the browser. `/api/lounge` owns the feed, which is what made pagination and search
possible at all: the old effect pulled a flat `.limit(60)` with no total to page against.

Community rows are the only ones in the app a *user* writes, so `normalizeCommunityRecipe`
coerces every field — a hand-edited `ingredients` jsonb holding strings, nulls or numbers
now renders a thin card instead of throwing inside the grid. The author name is resolved
server-side through the `custom_recipes_creator_profile_fkey` embed and falls back to
"a mixologist"; a raw `creator_id` can no longer reach the screen (G5).

There is deliberately **no seed fallback** here, unlike the recipe library: community
recipes exist only in the cloud, so "Supabase is unreachable" and "nobody has published
yet" are different states and the feed says different things about them (`available: false`
versus an empty list). Search terms are stripped of the characters that would restructure
a PostgREST `or=(...)` filter before they are interpolated.

14 new tests over the normalizer and the search sanitizer — **139 passing**.

### Milestone 4 — PWA, offline & polish · branch `feat/pwa-offline`

| # | Task | Files | Status |
|---|------|-------|--------|
| 4.1 | Real service worker: precache shell, runtime-cache API + images (M3) | `next.config.js`, `public/sw.js` | ⬜ |
| 4.2 | Offline access to favourites and the last-viewed library slice | service worker + IndexedDB | ⬜ |
| 4.3 | Self-host recipe photography in Supabase Storage (M1) | `scripts/`, migration | ⬜ |
| 4.4 | Reconcile `feature_set.md` status checkboxes with reality (G1–G6) | `feature_set.md` | ⬜ |

---

## 5. Error-handling contract

| Unit | Failure mode | Response |
|------|--------------|----------|
| `supabase-source` | unconfigured / network error / RLS denial | return `null`; repository falls through to seed and appends a note |
| `seed-source` | seed file missing or corrupt | return empty list + note; API returns 200 with an empty payload, never 500 |
| `community-source` | unconfigured / network error / RLS denial | return `available: false` with an empty feed — there is no local fallback for user content, so the UI says the Lounge is offline rather than implying nobody has posted |
| `normalizeCommunityRecipe` | field of the wrong type in a user-written row | coerce to a safe value (`[]`, `null`, `0`); the recipe still renders, the row is never dropped |
| `build-library.mjs` | TheCocktailDB 4xx/5xx or rate limit | retry with backoff; on final failure keep the previous seed and exit non-zero |
| `normalizeIngredient` | unrecognised name | return an `unknown` slug tagged `unresolved` — never drop the ingredient silently |
| `matchCabinet` | empty cabinet | return empty result sets, not an error |
| `parseMeasure` | unparseable amount | return the original string unchanged (display-safe) |
| API routes | any unhandled throw | 200 with `{ data: fallback, degraded: true }` where a fallback exists; otherwise 503 + JSON error |

---

## 6. Where we left off

**Stopped:** 2026-08-18, end of Milestone 2.
**Branch:** `feat/real-recipe-data-layer` (stacked on `fix/build-and-foundation`, which is
already committed). Milestone 1 + 2 work is **on disk and verified but not yet committed.**

### State of the tree

`npm run typecheck`, `npm run lint`, `npm test` (125 passing) and `npm run build` are all
green. The app runs end-to-end with no Supabase configured, serving the bundled library.

### Pick up here — in this order

1. **Commit Milestone 1 + 2.** The working tree holds the whole data-layer and matching
   rewrite. Suggested split: one commit for the domain + data layer + API routes, one for
   the UI rewire. Nothing is half-finished; the last in-flight edit (below) is complete.

2. **Finish the visual pass that was interrupted.** Driving the app with Playwright caught
   a real bug and it has been **fixed but not yet re-verified in a browser**: the stocking
   screen used to jump to results after the *first* ingredient click, because
   `showStocking` was derived from `cabinet.length`. It is now an explicit `isStocking`
   decision made once when the cabinet loads (`pages/index.tsx`). Re-run the screenshots to
   confirm, and check the light theme while there.

   The driver script is at `<scratchpad>/shots.mjs` and needs three things that cost time to
   rediscover: Node 20+ (`~/.nvm/versions/node/v22.13.1/bin`), `playwright-core` pointed at
   the cached headless binary
   (`~/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`),
   and `waitUntil: 'domcontentloaded'` — `networkidle` never settles because Next's dev
   server holds an HMR websocket open.

3. **Then Milestone 3** (social, sharing, SEO) as scoped below.

### Known-good commands

```bash
npm run dev             # runs with or without Supabase configured
npm run verify          # typecheck + lint + test + build
npm run library:build   # refetch TheCocktailDB, rebuild data/cocktails.seed.json
npm run db:seed         # push the seed to Supabase (needs SUPABASE_SERVICE_ROLE_KEY)
```

### Deferred, with reasons

| Item | Why it was deferred |
|---|---|
| `next` 14 → 15 | The remaining production advisory is the image-optimizer `remotePatterns` DoS, which needs a major upgrade. Not currently exploitable here: pages use plain `<img>`, so the optimizer isn't in the request path. Worth doing before adding `next/image`. |
| Remaining `npm audit` findings | All dev-only transitive (vitest/vite/esbuild dev server, eslint's `glob`, `postcss`). None ship to production. |
| Self-hosted photography | Milestone 4.3. Photos are hotlinked from TheCocktailDB; fine for now, a reliability risk at scale. |
| QR generated client-side | `components/QRShare.tsx` calls `api.qrserver.com`, which sends the recipe URL to a third party and breaks in offline mode. Worth replacing with a local generator during Milestone 4. |
| Node 18 | `@supabase/supabase-js` warns on every build. The repo works, but Node 20+ is the supported floor and is already installed via nvm. |

---

## 7. Progress log

| Date | Milestone | Note |
|------|-----------|------|
| 2026-08-17 | — | Full audit completed; B1–B6, M1–M10, G1–G6 recorded. Build decisions locked. |
| 2026-08-17 | 0 | Foundation committed (`4dfcce2`): build repaired, schema consolidated and secured, Supabase made optional, theming tokens, next 14.2.35. |
| 2026-08-18 | 1 | Real data layer: taxonomy, library rebuild (629 verified recipes), repository, API routes, 2 MB client bundle removed. Uncommitted. |
| 2026-08-18 | 2 | Matching engine rewritten — fully-stocked coverage 2.6% → 100%. 125 tests. |
| 2026-08-30 | 3 | Community server boundary: `/api/lounge` with pagination, search and the author join. The Lounge stopped querying Supabase directly. 139 tests. |
