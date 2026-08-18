export const CATEGORY_MAP: Record<string, string[]> = {
  "Base Spirits": [
    "Gin", "Vodka", "White Rum", "Dark Rum", "Tequila", "Bourbon", "Scotch", "Rye Whiskey", "Brandy", "Cognac", "Mezcal", "Pisco"
  ],
  "Fortified Wines": [
    "Sweet Vermouth", "Dry Vermouth", "Sherry", "Port", "Lillet Blanc"
  ],
  "Liqueurs": [
    "Triple Sec", "Cointreau", "Campari", "Aperol", "Amaretto", "Kahlua", "Baileys", "Chartreuse", "St-Germain", "Luxardo Maraschino", "Absinthe", "Blue Curacao"
  ],
  "Mixers & Juices": [
    "Lime Juice", "Lemon Juice", "Orange Juice", "Pineapple Juice", "Grapefruit Juice", "Soda Water", "Tonic Water", "Ginger Beer", "Ginger Ale", "Cola", "Simple Syrup", "Grenadine", "Honey Syrup", "Agave Syrup"
  ],
  "Bitters & Pantry": [
    "Angostura Bitters", "Orange Bitters", "Peychaud's Bitters", "Mint", "Lemon Peel", "Lime Wedge", "Orange Peel", "Maraschino Cherry", "Egg White", "Salt", "Sugar"
  ]
};

export function getIngredientCategory(name: string): string {
  for (const [category, items] of Object.entries(CATEGORY_MAP)) {
    if (items.some(item => {
      // Escape special characters in item if any, though our map doesn't have them
      const regex = new RegExp(`\\b${item}\\b`, 'i');
      if (regex.test(name)) return true;
      
      const nameRegex = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (nameRegex.test(item)) return true;
      
      return false;
    })) {
      return category;
    }
  }
  return "Other";
}

export const POPULAR_INGREDIENTS = [
    "Gin", "Vodka", "Bourbon", "White Rum", "Tequila", 
    "Lime Juice", "Lemon Juice", "Simple Syrup", "Sweet Vermouth", 
    "Campari", "Angostura Bitters", "Soda Water"
];
