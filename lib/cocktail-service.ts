import { supabase } from './supabase/client';
import cocktails from './liquid_lore_recipes';

export async function getAllIngredients() {
  // We can derive this from our local library for speed
  const ingredients = new Set<string>();
  cocktails.forEach(c => c.ingredients.forEach(i => ingredients.add(i.name)));
  return Array.from(ingredients).sort();
}

export async function getLibraryStats() {
  const { count: ingredientCount } = await supabase.from('ingredients').select('*', { count: 'exact', head: true });
  
  return {
    total: cocktails.length,
    ingredients: ingredientCount || 0
  };
}

export async function getCocktailDetail(id: string) {
  const drink = cocktails.find(c => c.id === id);

  if (!drink) {
    console.error('Cocktail not found in library:', id);
    return null;
  }
  
  return {
    id: drink.id,
    name: drink.name,
    image: drink.photo.url,
    story: drink.lore,
    glass: drink.glass,
    category: drink.spirit_category,
    instructions: drink.steps,
    ingredients: drink.ingredients.map(i => ({
      name: i.name,
      measure: i.amount,
      notes: i.notes
    })),
    tips: drink.pro_tip || "Serve chilled and enjoy responsibly.",
    garnish: drink.garnish,
    hasLore: true
  };
}

async function getRecipeLibrary() {
  return cocktails;
}

export async function searchByIngredients(ingredients: string[]) {
  if (!ingredients || ingredients.length === 0) return [];

  const normalizedSearch = ingredients.map(i => i.toLowerCase());
  
  return cocktails.filter(recipe => {
    const recipeIngs = recipe.ingredients.map(i => i.name.toLowerCase());
    return normalizedSearch.every(searchIng => 
      recipeIngs.some(ri => {
        if (ri === searchIng) return true;
        const regex = new RegExp(`\\b${searchIng.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        const reverseRegex = new RegExp(`\\b${ri.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        return regex.test(ri) || reverseRegex.test(searchIng);
      })
    );
  }).map(d => ({
    id: d.id,
    name: d.name,
    image: d.photo.thumb,
    hasLore: true
  }));
}

export async function getCuratedClassics(limit = 6) {
  return cocktails.filter(c => c.is_classic).slice(0, limit).map(d => ({
    id: d.id,
    name: d.name,
    image: d.photo.thumb,
    hasLore: true
  }));
}

export async function getAdvancedRecommendations(cabinet: string[]) {
  if (!cabinet || cabinet.length === 0) return { exactMatches: [], nearMisses: [], recommendations: [], maximizer: null, powerIngredients: [] };

  const normalizedCabinet = cabinet.map(i => i.toLowerCase());
  const exactMatches: any[] = [];
  const nearMisses: any[] = [];
  const recommendations: any[] = [];
  const missingIngredientCounts: Record<string, number> = {};

  for (const recipe of cocktails) {
    let missingCount = 0;
    let missingFromThisDrink: string | null = null;

    for (const ing of recipe.ingredients) {
      const ingName = ing.name.toLowerCase();
      const hasIngredient = normalizedCabinet.some(cabIng => {
        if (ingName === cabIng) return true;
        const regex = new RegExp(`\\b${cabIng.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        const reverseRegex = new RegExp(`\\b${ingName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        return regex.test(ingName) || reverseRegex.test(cabIng);
      });
      
      if (!hasIngredient) {
        missingCount++;
        missingFromThisDrink = ing.name;
      }
    }

    const recipeSummary = {
      id: recipe.id,
      name: recipe.name,
      image: recipe.photo.thumb,
      ingredients: recipe.ingredients,
      hasLore: true,
      tags: [...(recipe.flavor_profiles || []), ...(recipe.vibes || [])],
      category: recipe.spirit_category
    };

    if (missingCount === 0) {
      exactMatches.push(recipeSummary);
    } else if (missingCount === 1) {
      nearMisses.push(recipeSummary);
      if (missingFromThisDrink) {
        missingIngredientCounts[missingFromThisDrink] = (missingIngredientCounts[missingFromThisDrink] || 0) + 1;
      }
    } else if (missingCount < 4) {
      recommendations.push(recipeSummary);
    }
  }

  const topMaximizers = Object.entries(missingIngredientCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  return {
    exactMatches,
    nearMisses,
    recommendations: recommendations.slice(0, 12),
    maximizer: topMaximizers[0] || null,
    powerIngredients: topMaximizers
  };
}

