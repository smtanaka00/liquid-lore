# Liquid Lore Recipe Repository

**1,050 cocktail recipes** structured for the Liquid Lore platform.

## Files

| File | Description |
|------|-------------|
| `liquid_lore_recipes.json` | Full recipe library — primary source |
| `liquid_lore_recipes.csv` | Flat CSV for Supabase bulk import |
| `liquid_lore_recipes.js` | ES module export for direct JS import |

---

## JSON Schema

```json
{
  "version": "1.0.0",
  "total": 1050,
  "cocktails": [
    {
      "id": "ll-00001",
      "name": "Old Fashioned",
      "spirit_category": "whiskey_bourbon",
      "primary_spirit": "Buffalo Trace",
      "ingredients": [
        { "name": "bourbon", "amount": "2 oz", "notes": "Buffalo Trace recommended" }
      ],
      "method": "stir",
      "glass": "rocks",
      "ice": "large cube",
      "garnish": "expressed orange peel, cocktail cherry",
      "steps": ["..."],
      "flavor_profiles": ["boozy", "warming", "sweet", "bitter"],
      "vibes": ["Date Night", "Cozy Night In", "After Dinner"],
      "difficulty": "easy",
      "lore": "Historical context...",
      "pro_tip": "Expert advice...",
      "is_classic": true,
      "source": "liquid_lore_premium",
      "rating": null,
      "tasting_notes": [],
      "created_at": "2025-01-01T00:00:00Z"
    }
  ]
}
```

---

## Spirit Categories

| Category | Count |
|----------|-------|
| gin | 173 |
| rum | 171 |
| vodka | 166 |
| whiskey_bourbon | 130 |
| tequila | 125 |
| amaro | 75 |
| mezcal | 74 |
| scotch | 48 |
| whiskey_rye | 44 |
| brandy | 44 |

---

## Connecting to Liquid Lore

### Option A — Supabase Bulk Import

1. Go to your Supabase dashboard → Table Editor → Create table `cocktails`
2. Use the CSV import feature and upload `liquid_lore_recipes.csv`
3. The columns map directly to the schema above

```sql
-- Suggested Supabase table schema
create table cocktails (
  id text primary key,
  name text not null,
  spirit_category text,
  primary_spirit text,
  method text,
  glass text,
  ice text,
  garnish text,
  flavor_profiles jsonb,
  vibes jsonb,
  difficulty text,
  lore text,
  pro_tip text,
  is_classic boolean default false,
  source text,
  steps_json jsonb,
  ingredients_json jsonb,
  created_at timestamptz default now()
);

-- Useful indexes for Liquid Lore's Logic Engine
create index on cocktails using gin(flavor_profiles);
create index on cocktails using gin(ingredients_json);
create index on cocktails(spirit_category);
create index on cocktails(is_classic);
create index on cocktails(difficulty);
```

### Option B — Direct JS/TS Import

```js
import cocktails from './liquid_lore_recipes.js';

// Filter by spirit
const ginDrinks = cocktails.filter(c => c.spirit_category === 'gin');

// Flavor profile search
const refreshing = cocktails.filter(c => c.flavor_profiles.includes('refreshing'));

// "What Can I Make?" matching
function canMake(cabinet, drink) {
  const required = drink.ingredients.map(i => i.name.toLowerCase());
  return required.every(ing => cabinet.some(item => item.toLowerCase().includes(ing)));
}

// "Near Miss" feature
function nearMiss(cabinet, drink) {
  const required = drink.ingredients.map(i => i.name.toLowerCase());
  const missing = required.filter(ing => !cabinet.some(item => item.toLowerCase().includes(ing)));
  return missing.length === 1 ? missing[0] : null;
}
```

### Option C — TheCocktailDB Hybrid

This repository is designed to **merge with TheCocktailDB API** data.
- `source: "liquid_lore_premium"` = the 20 hand-crafted classics with full lore
- `source: "liquid_lore_original"` = generated originals
- TheCocktailDB records can be marked `source: "cocktaildb"` and merged at query time

---

## Sources

- **20 premium classics** with hand-crafted lore, pro tips, and exact recipes
- **1,030 original recipes** generated with realistic ingredient combinations, proper ratios, and technique-specific prep steps
- All flavor profiles, vibes, and difficulty ratings are assigned per drink
- All records include Supabase-compatible field types


---

## Photo Integration

Every drink now includes a `photo` object:

```json
{
  "photo": {
    "url":              "https://images.unsplash.com/photo-xxx?w=800&q=80&fit=crop",
    "thumb":            "https://images.unsplash.com/photo-xxx?w=400&q=70&fit=crop",
    "source":           "unsplash",
    "source_url":       "https://unsplash.com/photos/xxx",
    "photo_id":         "xxx",
    "has_custom_photo": false,
    "photo_credit":     "Unsplash",
    "photo_credit_url": "https://unsplash.com/photos/xxx"
  }
}
```

### Photo Sources
- **20 classics** → TheCocktailDB (drink-specific photos, `source: "thecocktaildb"`)
- **1,030 originals** → Unsplash curated pool, matched by spirit category (`source: "unsplash"`)

### Upgrading to Live Unsplash API
Run `enrich_with_unsplash_api.js` with a real API key to swap pool photos for
live, query-matched Unsplash results. Free tier = 50 req/hour.

```bash
UNSPLASH_KEY=your_key node enrich_with_unsplash_api.js
```

### Displaying Photos in Liquid Lore

```js
// Full resolution (card view, recipe detail)
<img src={drink.photo.url} alt={drink.name} />

// Thumbnail (grid view, browse mode)
<img src={drink.photo.thumb} alt={drink.name} loading="lazy" />

// Attribution (required by Unsplash license)
<a href={drink.photo.photo_credit_url}>{drink.photo.photo_credit}</a>

// Future-proofing: check has_custom_photo to show AI-gen badge
{drink.photo.has_custom_photo && <span className="badge">AI Photo</span>}
```

### Supabase Storage Migration (Phase 2)
When you're ready to self-host photos:

```sql
-- Add column for self-hosted URL
alter table cocktails add column photo_storage_url text;

-- After uploading to Supabase Storage, update:
update cocktails 
set photo_storage_url = 'https://your-project.supabase.co/storage/v1/object/public/photos/' || id || '.jpg'
where id = 'll-00001';
```
