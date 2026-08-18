import os
import json
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables
load_dotenv(dotenv_path="../../.env.local")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: Supabase credentials not found in .env.local")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def verify_negroni_can_be_made():
    print("--- Verifying 'My Cabinet' Logic (Negroni Test) ---")
    
    # 1. Simulate a user cabinet with Gin, Campari, and Sweet Vermouth
    # Note: We use the normalized names
    simulated_cabinet = ["Gin", "Campari", "Sweet Vermouth"]
    
    # 2. Fetch the Negroni recipe from Supabase
    response = supabase.table("recipes").select("*").eq("name", "Negroni").execute()
    
    if not response.data:
        print("❌ Error: Negroni recipe not found in database. Please run migrate_static.py first.")
        return

    negroni = response.data[0]
    ingredients = negroni.get("ingredient_data", [])
    
    # 3. Check if all ingredients are in the cabinet
    missing = []
    for ing in ingredients:
        ing_name = ing["name"]
        if ing_name not in simulated_cabinet:
            missing.append(ing_name)
    
    if not missing:
        print(f"✅ SUCCESS: 'Negroni' can be made with {simulated_cabinet}")
    else:
        print(f"❌ FAILURE: 'Negroni' is missing: {missing}")
        print(f"Cabinet contains: {simulated_cabinet}")
        print(f"Recipe requires: {[i['name'] for i in ingredients]}")

if __name__ == "__main__":
    verify_negroni_can_be_made()
    
    # Optional: Test with missing ingredient
    print("\n--- Verifying 'Near Miss' Logic ---")
    simulated_cabinet_missing = ["Gin", "Campari"] # Missing Sweet Vermouth
    # (Logic check)
    response = supabase.table("recipes").select("*").eq("name", "Negroni").execute()
    negroni = response.data[0]
    missing = [i["name"] for i in negroni["ingredient_data"] if i["name"] not in simulated_cabinet_missing]
    if len(missing) == 1:
        print(f"✅ SUCCESS: 'Negroni' correctly identified as a 'Near Miss' (Missing: {missing[0]})")
    else:
        print(f"❌ FAILURE: Expected 1 missing ingredient, found {len(missing)}")
