import os
import requests
import json
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, field_validator
from dotenv import load_dotenv
from supabase import create_client, Client

# Get the directory of the current script
script_dir = os.path.dirname(os.path.abspath(__file__))
# Load environment variables from the project root
load_dotenv(dotenv_path=os.path.join(script_dir, "../../.env.local"))

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: Supabase credentials not found in .env.local")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# --- Normalization Map ---
INGREDIENT_MAP = {
    "fresh lime juice": "Lime Juice",
    "lime juice": "Lime Juice",
    "fresh lemon juice": "Lemon Juice",
    "lemon juice": "Lemon Juice",
    "sugar syrup": "Simple Syrup",
    "gomme syrup": "Simple Syrup",
    "demerara sugar": "Brown Sugar",
    "white cuban rum": "White Rum",
    "bacardi white rum": "White Rum",
    "dark rum": "Dark Rum",
    "london dry gin": "Gin",
    "old tom gin": "Gin",
    "bourbon whiskey": "Bourbon",
    "rye whiskey": "Rye Whiskey",
    "sweet red vermouth": "Sweet Vermouth",
    "red vermouth": "Sweet Vermouth",
    "dry vermouth": "Dry Vermouth",
    "angostura bitters": "Aromatic Bitters",
}

def normalize_ingredient(name: str) -> str:
    if not name:
        return "Unknown"
    name = name.lower().strip()
    return INGREDIENT_MAP.get(name, name.title())

# --- Pydantic Models ---

class IngredientDetail(BaseModel):
    name: str
    measure: str = "To taste"

    @field_validator('name')
    @classmethod
    def validate_name(cls, v: str) -> str:
        return normalize_ingredient(v)

class CocktailModel(BaseModel):
    id: str
    name: str
    instructions: List[str]
    image_url: Optional[str]
    glass: Optional[str]
    category: Optional[str]
    ingredients: List[IngredientDetail]

# --- Ingestion Logic ---

def fetch_details(drink_id: str) -> Optional[CocktailModel]:
    url = f"https://www.thecocktaildb.com/api/json/v1/1/lookup.php?i={drink_id}"
    try:
        response = requests.get(url)
        data = response.json()
        if data and data['drinks']:
            drink = data['drinks'][0]
            ingredients = []
            for i in range(1, 16):
                ing_name = drink.get(f'strIngredient{i}')
                if ing_name:
                    measure = drink.get(f'strMeasure{i}') or "To taste"
                    ingredients.append(IngredientDetail(name=ing_name, measure=measure))
            
            return CocktailModel(
                id=drink['idDrink'],
                name=drink['strDrink'],
                instructions=drink['strInstructions'].split('. ') if drink['strInstructions'] else [],
                image_url=drink['strDrinkThumb'],
                glass=drink['strGlass'],
                category=drink['strCategory'],
                ingredients=ingredients
            )
    except Exception as e:
        print(f"Error fetching details for {drink_id}: {e}")
    return None

def fetch_all_cocktails() -> List[CocktailModel]:
    print("Fetching all cocktails from TheCocktailDB (A-Z)...")
    import string
    alphabet = string.ascii_lowercase + "0123456789"
    results = []
    seen_ids = set()

    for char in alphabet:
        url = f"https://www.thecocktaildb.com/api/json/v1/1/search.php?f={char}"
        try:
            response = requests.get(url)
            data = response.json()
            if data and data['drinks']:
                for drink in data['drinks']:
                    d_id = drink['idDrink']
                    if d_id not in seen_ids:
                        seen_ids.add(d_id)
                        # Process basic data from search to avoid lookup for each if possible
                        # but lookup gives more detail sometimes. 
                        # Actually search.php return full detail!
                        ingredients = []
                        for i in range(1, 16):
                            ing_name = drink.get(f'strIngredient{i}')
                            if ing_name:
                                measure = drink.get(f'strMeasure{i}') or "To taste"
                                ingredients.append(IngredientDetail(name=ing_name, measure=measure))
                        
                        cocktail = CocktailModel(
                            id=drink['idDrink'],
                            name=drink['strDrink'],
                            instructions=drink['strInstructions'].split('. ') if drink['strInstructions'] else [],
                            image_url=drink['strDrinkThumb'],
                            glass=drink['strGlass'],
                            category=drink['strCategory'],
                            ingredients=ingredients
                        )
                        results.append(cocktail)
                        print(f"Collected: {cocktail.name}")
        except Exception as e:
            print(f"Error fetching for char {char}: {e}")
            
    print(f"✅ Total cocktails collected: {len(results)}")
    return results

def migrate_lore():
    print("Migrating internal Lore overrides...")
    # Based on PREMIUM_LORE in lib/cocktail-service.ts
    lore_data = {
        "11007": {
            "history": "Born in the 1930s, the Margarita is the evolution of the 'Daisy'. It represents the perfect marriage of Mexican Tequila and French Cointreau.",
            "pro_tip": "Always use fresh lime juice; bottled juice lacks the essential oils.",
            "glassware_icon": "margarita-gold"
        },
        # Add more if needed or fetch from file
    }
    
    for rid, data in lore_data.items():
        try:
            supabase.table("lore_overrides").upsert({
                "recipe_id": rid,
                "history": data["history"],
                "pro_tip": data["pro_tip"],
                "glassware_icon": data["glassware_icon"]
            }).execute()
            print(f"✅ Lore migrated for {rid}")
        except Exception as e:
            print(f"❌ Lore migration failed for {rid}: {e}")

def upsert_to_supabase(cocktails: List[CocktailModel]):
    print(f"Upserting {len(cocktails)} cocktails to Supabase...")
    
    for cocktail in cocktails:
        # 1. Upsert ingredients
        for ing in cocktail.ingredients:
            try:
                supabase.table("ingredients").upsert({"name": ing.name}, on_conflict="name").execute()
            except: pass

        # 2. Upsert Recipe
        recipe_data = {
            "id": cocktail.id,
            "name": cocktail.name,
            "instructions": cocktail.instructions,
            "image_url": cocktail.image_url,
            "glass": cocktail.glass,
            "category": cocktail.category,
            "ingredient_data": [ing.model_dump() for ing in cocktail.ingredients]
        }
        
        try:
            supabase.table("recipes").upsert(recipe_data).execute()
        except Exception as e:
            print(f"❌ Error upserting {cocktail.name}: {e}")

if __name__ == "__main__":
    cocktails = fetch_all_cocktails()
    upsert_to_supabase(cocktails)
    migrate_lore()
    print("Ingestion complete.")
