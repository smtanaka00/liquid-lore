import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(dotenv_path="../../.env.local")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Fetch all tables in the public schema using direct SQL if possible, or just trying to select from them
# Supabase doesn't easily let you list tables via API besides introspection.
# We'll try to broad-query the existence.

print("--- Broad Table Existence Check ---")
tables_to_check = ["recipes", "ingredients", "profiles", "custom_recipes", "recipe_likes", "favorites", "tasting_notes"]

for t in tables_to_check:
    try:
        # Just an empty select to check existence
        supabase.table(t).select("id").limit(1).execute()
        print(f"✅ {t}: FOUND")
    except Exception as e:
        print(f"❌ {t}: NOT FOUND ({e})")

print("\n--- Tasting Notes Column Check ---")
try:
    # Try selecting specific columns
    supabase.table("tasting_notes").select("rating, twists").limit(1).execute()
    print("✅ rating & twists: FOUND")
except Exception as e:
    print(f"❌ rating & twists: NOT FOUND ({e})")
