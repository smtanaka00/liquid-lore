import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(dotenv_path="../../.env.local")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Missing credentials")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

try:
    tables = ["recipes", "ingredients", "profiles", "custom_recipes", "recipe_likes", "favorites", "tasting_notes"]
    for table in tables:
        try:
            response = supabase.table(table).select("*", count="exact").limit(1).execute()
            print(f"✅ Table '{table}' exists. Count: {response.count}")
        except Exception as e:
            if "not find the table" in str(e).lower():
                print(f"❌ Table '{table}' is MISSING.")
            else:
                print(f"⚠️ Error checking table '{table}': {e}")
    
    # Column check for tasting_notes
    try:
        response = supabase.table("tasting_notes").select("rating, twists").limit(1).execute()
        print("✅ Column check for 'tasting_notes': 'rating' and 'twists' exist.")
    except Exception as e:
        if "column" in str(e).lower():
            print("❌ Column check for 'tasting_notes': 'rating' or 'twists' MISSING.")
        else:
            print(f"❓ Info for 'tasting_notes' columns: {e}")
            
except Exception as e:
    print(f"General Error: {e}")
