# 🍸 Liquid Lore

**Tell it what's on your shelf. It tells you what you can pour tonight.**

Liquid Lore is a story-first cocktail platform. You stock a virtual bar, and it matches your
shelf against a library of **629 verified recipes** — showing what you can make right now,
what you're exactly one bottle away from, and which single purchase would unlock the most new
drinks. Every recipe is a real cocktail, and every story attached to one is a real story.

That last part is a design constraint, not a slogan. A drink with no documented history gets
an empty space and an honest note, never an invented origin.

---

## Setup & running

**Requirements:** Node 20 or later. (Node 18 works but `@supabase/supabase-js` warns on it.)

```bash
npm install
npm run dev            # http://localhost:3000
```

That's the whole setup. **The app runs fully with no backend configured** — the recipe
library, cabinet matching, search and Mixing Mode all work, with your bar saved in
localStorage.

Supabase adds accounts, cross-device sync, the Creator Studio and the community Lounge:

```bash
cp .env.example .env.local     # fill in your project URL and anon key
```

Then apply `supabase/migrations/0001` → `0004` in order (see [supabase/README.md](supabase/README.md))
and load the library:

```bash
npm run db:seed        # needs SUPABASE_SERVICE_ROLE_KEY
```

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run verify` | typecheck → lint → test → build. Run before pushing. |
| `npm test` | Vitest over the domain layer (125 tests) |
| `npm run library:build` | Refetch TheCocktailDB and regenerate `data/cocktails.seed.json` |
| `npm run db:seed` | Upsert the seed into Supabase |

---

## How it fits together

Data flows one way: UI → API → domain → data. No layer reaches past the one beneath it, and
the browser never receives the recipe library.

```text
 pages/, components/          React. No business logic, no data access.
        │  lib/api-client.ts — the browser's only route to recipe data
        ▼
 pages/api/*                  Server boundary
        ▼
 lib/domain/*                 Pure, unit-tested: taxonomy · matching · measures
        ▼
 lib/data/repository.ts       Supabase first ─┐
        ├── supabase-source                   │ on any failure
        └── seed-source ──────────────────────┘ (bundled library)
```

| Layer | Files | Owns | Must not |
|---|---|---|---|
| UI | `pages/`, `components/` | Rendering, local interaction state | Business logic, direct data access |
| API | `pages/api/` | Request validation, caching headers, degradation signalling | Reimplement domain logic |
| Domain | `lib/domain/` | The ingredient vocabulary, matching, measure parsing | Know about HTTP, React or Supabase |
| Data | `lib/data/` | Choosing a source, caching, non-throwing fallback | Business logic |

### The parts that matter

| Module | What it does |
|---|---|
| [`lib/domain/ingredient-taxonomy.ts`](lib/domain/ingredient-taxonomy.ts) | ~180 canonical ingredients with a hierarchy (`bourbon` → `whiskey`), brand aliases (`Tito's` → `vodka`), stand-ins (`sugar` satisfies `simple-syrup`) and a pantry set that never blocks a match. `resolveIngredient()` maps any raw string onto it. |
| [`lib/domain/matching.ts`](lib/domain/matching.ts) | `matchCabinet(library, slugs)` → ready / near misses / reachable / maximizers. Pure set containment, because the taxonomy did the hard part. |
| [`lib/domain/measures.ts`](lib/domain/measures.ts) | Parses `¾ oz`, `1½ oz`, `1 1/2 oz`, `3 cl`; converts between oz / ml / parts and leaves `2 dashes` alone. |
| [`lib/data/repository.ts`](lib/data/repository.ts) | Supabase-first with a bundled fallback. Never throws; always reports which source answered. |
| [`scripts/build-library.ts`](scripts/build-library.ts) | Rebuilds the library from TheCocktailDB, normalises every ingredient through the taxonomy, and merges the hand-written classics. |

---

## Why the ingredient taxonomy exists

It is the whole reason the app works, so it's worth understanding before changing anything.

Recipes and cabinets have to speak the same language. They didn't. Recipes stored their base
spirit as a **brand** — `Tito's`, `Monkey 47`, `Buffalo Trace` — while the cabinet offered
generics like *Vodka* and *Gin*. Nothing matched:

| Cabinet | Recipes it could make |
|---|---|
| Every ingredient the UI offered (54) | **27 of 1,050 — 2.6%** |
| A realistic 12-bottle home bar | **4** |

Ice and a lemon twist also counted against a match exactly as much as the base spirit.

The taxonomy fixes both by giving every ingredient one canonical slug, arranging those slugs
into a hierarchy, and marking the ones nobody should ever be blocked on:

| Cabinet | Now |
|---|---|
| Every stockable ingredient | **629 of 629 — 100%** |
| A realistic 12-bottle home bar | **45 ready, 182 one bottle away** |
| Gin + Campari + Sweet Vermouth | **6** — Negroni, Americano, Addison, Gin Sling, Gin Toddy, Lone Tree |

`tests/matching.test.ts` guards these numbers directly, so a regression fails the build
rather than quietly emptying the app.

---

## The library

`data/cocktails.seed.json` is generated, not hand-edited. Rebuild it with
`npm run library:build`.

| | |
|---|---|
| Recipes | **629**, all real drinks |
| Sources | 609 TheCocktailDB · 20 hand-written classics |
| Classics | 79 — IBA-recognised, or hand-written with sourced history |
| Photographs | 629 distinct |
| With documented lore | 20 |

**To add a story**, edit [`data/premium-lore.json`](data/premium-lore.json) and rebuild. Each
entry carries a `lore_source` so any claim stays traceable. Entries there take precedence over
the API's version of the same drink.

**To add an ingredient**, add a node to `INGREDIENTS` in the taxonomy and rebuild the library.
`data/library-build-report.json` lists every name that failed to resolve, so the vocabulary's
gaps are visible rather than silent — currently 4 unresolved names out of 1,730 ingredient uses.

---

## Degradation

Nothing in the data path throws. Every repository call returns `{ data, source, notes }`, and
`source` says which backend actually answered.

| Situation | What happens |
|---|---|
| Supabase unconfigured | Bundled library is served; cabinet persists to localStorage; the Lounge explains what's missing |
| Supabase unreachable | Same, plus an "Offline library" marker in the UI |
| Recipe missing from Supabase but present in the seed | Served from the seed |
| Recipe in neither | Genuine 404 |
| Unknown ingredient in a stored cabinet | Resolved if possible, otherwise dropped and reported in `unknown` |
| Corrupt cabinet in localStorage | Treated as empty rather than crashing the page |

Cabinets from before the slug migration are upgraded automatically on load
(`lib/cabinet.ts`), and the match endpoint resolves legacy display names too, so a stale
browser tab still works.

---

## Security notes

- The `cocktails` table has **no write policy** — only the service-role key can modify the
  catalogue. An earlier schema granted `for all using (true)`, letting any anonymous visitor
  rewrite the entire recipe library.
- `custom_recipes` UPDATE is owner-only. The previous `"Anyone can update like counts."`
  policy granted write access to every column of every user's recipe.
- Likes go through `toggle_recipe_like()`, a `SECURITY DEFINER` function that recounts from
  `recipe_likes` rather than trusting a client-supplied delta.
- `SUPABASE_SERVICE_ROLE_KEY` has no `NEXT_PUBLIC_` prefix and `lib/supabase/server.ts`
  throws if imported client-side.

---

## Project documents

| File | What it holds |
|---|---|
| [`feature_set.md`](feature_set.md) | The product vision |
| [`implementation_plan.md`](implementation_plan.md) | The audit, locked decisions, milestone tracker, and where work stopped |
| [`supabase/README.md`](supabase/README.md) | Migration order and security rationale |
| [`AGENTS.md`](AGENTS.md) | The original data-integration protocol |

## Status

Milestones 0–2 are complete: the build is repaired and the schema secured, the library is
real and served from a proper data layer, and the matching engine works. Milestone 3
(social, sharing, SEO) and Milestone 4 (PWA, offline, self-hosted assets) are scoped but not
started — see `implementation_plan.md` for the current state and the next step.
