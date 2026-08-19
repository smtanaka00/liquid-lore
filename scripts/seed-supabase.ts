/**
 * scripts/seed-supabase.ts
 *
 * Loads `data/cocktails.seed.json` into the Supabase `cocktails` table.
 *
 * Requires `SUPABASE_SERVICE_ROLE_KEY`: the table is deliberately read-only to the anon
 * and authenticated roles (see supabase/migrations/0002_cocktails.sql), so the anon key
 * cannot write to it. That is the point — the previous schema let any visitor rewrite the
 * catalogue.
 *
 * Idempotent. Upserts on `id`, so re-running after `npm run library:build` updates changed
 * recipes and inserts new ones without disturbing anything else.
 *
 * Run with:
 *     npm run db:seed
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { cocktailToRow } from '../lib/data/supabase-source';
import type { Cocktail } from '../lib/domain/types';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SEED_PATH = path.join(ROOT, 'data', 'cocktails.seed.json');

/** Batched so a large library doesn't exceed the request size limit. */
const BATCH_SIZE = 100;

function loadEnvLocal(): void {
  // A tiny .env.local reader, so seeding needs no dotenv dependency.
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue; // a real environment variable always wins
    process.env[key] = rawValue.replace(/^["']|["']$/g, '');
  }
}

async function main(): Promise<void> {
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error(
      'Missing credentials.\n\n' +
      '  NEXT_PUBLIC_SUPABASE_URL   ' + (url ? 'ok' : 'MISSING') + '\n' +
      '  SUPABASE_SERVICE_ROLE_KEY  ' + (serviceKey ? 'ok' : 'MISSING') + '\n\n' +
      'Copy .env.example to .env.local and fill both in. The service role key is under\n' +
      'Project Settings -> API. It bypasses Row Level Security — keep it out of the browser.'
    );
    process.exit(1);
  }

  if (!fs.existsSync(SEED_PATH)) {
    console.error(`No seed at ${path.relative(ROOT, SEED_PATH)}. Run "npm run library:build" first.`);
    process.exit(1);
  }

  const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
  const cocktails: Cocktail[] = seed.cocktails ?? [];

  if (cocktails.length === 0) {
    console.error('Seed file contains no recipes. Refusing to run.');
    process.exit(1);
  }

  console.log(`Seeding ${cocktails.length} recipes into ${new URL(url).host}\n`);

  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let written = 0;
  for (let i = 0; i < cocktails.length; i += BATCH_SIZE) {
    const batch = cocktails.slice(i, i + BATCH_SIZE).map(cocktailToRow);
    const { error } = await client.from('cocktails').upsert(batch, { onConflict: 'id' });

    if (error) {
      console.error(`\nFailed on batch starting at ${i}: ${error.message}`);
      if (error.message.includes('does not exist')) {
        console.error('\nThe `cocktails` table is missing. Apply supabase/migrations/0002_cocktails.sql first.');
      }
      process.exit(1);
    }

    written += batch.length;
    process.stdout.write(`\r  ${written}/${cocktails.length}`);
  }

  const { count } = await client.from('cocktails').select('*', { count: 'exact', head: true });
  console.log(`\n\nDone. The cocktails table now holds ${count ?? written} recipes.`);
}

main().catch(err => {
  console.error('\nSeeding failed:', err);
  process.exit(1);
});
