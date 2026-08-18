# AGENTS.md

## 🛠 Project: Liquid Lore – Data Integration Protocol
**Role:** Lead Data Engineer & Full-Stack Architect
**Objective:** Implement a hybrid cocktail database using Supabase, TheCocktailDB API, and custom Lore overrides.

### 1. Architectural Constraints
* **Single Source of Truth:** All recipes must be synced to the Supabase `recipes` table. Do not allow the frontend to call external APIs directly; it must always query our Supabase instance.
* **Normalization Rule:** Standardize ingredient names (e.g., "Lime juice" vs "Fresh Lime Juice") during ingestion to ensure the **"My Cabinet"** logic works flawlessly.
* **Environment Security:** Never hardcode API keys. Use `.env.local` for local development and Supabase Secrets for production.

### 2. Implementation Steps for the Agent
1.  **Schema Setup:** Generate a Supabase migration for `recipes`, `ingredients`, `user_cabinets`, and `lore_overrides`.
2.  **API Ingestion Script:** Create a Python service in `/services/ingestion` that:
    * Fetches the top 100 classic cocktails from TheCocktailDB.
    * Maps them to our internal schema.
    * Upserts them into Supabase.
3.  **The "Lore" Merger Logic:** Implement a database function (RPC) or an Edge Function that joins `recipes` with `lore_overrides`. 
    * *Logic:* If `lore_overrides.history` exists, use it; otherwise, use the default description.
4.  **Verification:** Run a test script to ensure a "Negroni" can be "made" if the `user_cabinet` contains Gin, Campari, and Sweet Vermouth.
