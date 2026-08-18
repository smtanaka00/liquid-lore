/**
 * Liquid Lore — Unsplash API Photo Enrichment Script
 * 
 * Run this when you have a real Unsplash API key to swap the curated
 * pool URLs for live, query-matched Unsplash photos.
 * 
 * Usage:
 *   UNSPLASH_KEY=your_key_here node enrich_with_unsplash_api.js
 * 
 * Get a free key at: https://unsplash.com/developers
 * Free tier: 50 requests/hour, which is enough for batch enrichment.
 */

import fs from 'fs';

const API_KEY = process.env.UNSPLASH_KEY;
if (!API_KEY) {
  console.error('Set UNSPLASH_KEY environment variable first.');
  process.exit(1);
}

const SPIRIT_QUERIES = {
  vodka:           ['vodka cocktail', 'clear cocktail glass', 'martini drink'],
  rum:             ['rum cocktail', 'tropical drink', 'tiki cocktail'],
  tequila:         ['tequila cocktail', 'margarita drink', 'mexican cocktail'],
  mezcal:          ['mezcal cocktail', 'smoky drink glass', 'agave cocktail'],
  gin:             ['gin cocktail', 'botanical drink', 'gin tonic glass'],
  whiskey_bourbon: ['bourbon cocktail', 'whiskey glass', 'old fashioned drink'],
  whiskey_rye:     ['rye whiskey cocktail', 'manhattan drink', 'whiskey rocks'],
  scotch:          ['scotch whisky glass', 'whisky neat', 'smoky whisky drink'],
  brandy:          ['brandy cocktail', 'cognac glass', 'sidecar drink'],
  amaro:           ['aperitif cocktail', 'campari drink', 'italian cocktail'],
};

async function fetchUnsplashPhoto(query) {
  const q = encodeURIComponent(query);
  const url = `https://api.unsplash.com/photos/random?query=${q}&orientation=landscape&client_id=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Unsplash error: ${res.status}`);
  const data = await res.json();
  return {
    url:              data.urls.regular,
    thumb:            data.urls.small,
    source:           'unsplash',
    source_url:       data.links.html,
    photo_id:         data.id,
    has_custom_photo: false,
    photo_credit:     data.user.name,
    photo_credit_url: data.user.links.html,
  };
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const raw = fs.readFileSync('liquid_lore_recipes.json', 'utf8');
  const db  = JSON.parse(raw);

  let updated = 0;
  for (const drink of db.cocktails) {
    // Skip classics (TheCocktailDB) and already-custom photos
    if (drink.photo?.source === 'thecocktaildb') continue;
    if (drink.photo?.has_custom_photo) continue;

    const cat     = drink.spirit_category || 'vodka';
    const queries = SPIRIT_QUERIES[cat] || SPIRIT_QUERIES.vodka;
    const query   = queries[Math.floor(Math.random() * queries.length)];

    try {
      drink.photo = await fetchUnsplashPhoto(query);
      updated++;
      process.stdout.write(`\r  Enriched ${updated} drinks...`);
      await sleep(1300); // ~46 req/min, well within the 50/hour free tier limit
    } catch (err) {
      console.error(`\nFailed for ${drink.name}:`, err.message);
    }
  }

  fs.writeFileSync('liquid_lore_recipes.json', JSON.stringify(db, null, 2));
  console.log(`\nDone. Updated ${updated} photos.`);
}

main();
