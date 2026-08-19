/**
 * lib/domain/ingredient-taxonomy.ts
 *
 * The canonical ingredient vocabulary, and the resolver that maps any raw string onto it.
 *
 * WHY THIS EXISTS
 * The previous library stored each drink's base spirit as a *brand* — "Tito's", "Monkey 47",
 * "Buffalo Trace" — while the cabinet UI offered generic names like "Vodka" and "Gin". Nothing
 * matched: a user who owned every one of the 54 offered ingredients could make 27 of 1,050
 * recipes. Matching quality was never a filtering problem; it was a missing shared vocabulary.
 *
 * THE MODEL
 *   - Every ingredient has a `slug`. Cabinets and recipes store slugs, never display strings.
 *   - `parent` builds a hierarchy: bourbon → whiskey → (nothing). Owning a child satisfies a
 *     recipe asking for the parent, and vice versa — someone who stocked "Whiskey" wants to be
 *     shown bourbon drinks.
 *   - `satisfiedBy` covers non-hierarchical stand-ins (sugar can become simple syrup).
 *   - `pantry` items never block a match. Nobody's Margarita is blocked on ice.
 *
 * Usage:
 *     import { resolveIngredient, expandCabinet } from './ingredient-taxonomy';
 *     resolveIngredient("Tito's")          // -> 'vodka'
 *     resolveIngredient('fresh lime juice')// -> 'lime-juice'
 *     expandCabinet(['whiskey'])           // -> Set { 'whiskey', 'bourbon', 'rye-whiskey', … }
 */

import type { IngredientCategory, IngredientNode } from './types';

// ── the vocabulary ────────────────────────────────────────────────────────────
// Aliases are lower-cased at load; write them however reads best. Brand names live
// alongside generics deliberately — the source data is full of them.

export const INGREDIENTS: IngredientNode[] = [
  // ── Base Spirits ────────────────────────────────────────────────────────────
  {
    slug: 'gin', label: 'Gin', category: 'Base Spirits', essential: true,
    aliases: ['dry gin', 'london dry gin', 'old tom gin', 'plymouth', 'plymouth gin', 'tanqueray',
      'bombay sapphire', "hendrick's", 'hendricks', 'beefeater', 'monkey 47', 'sipsmith',
      'aviation', 'the botanist', 'roku', 'genever'],
  },
  {
    slug: 'sloe-gin', label: 'Sloe Gin', category: 'Liqueurs',
    aliases: ['sloe gin'],
  },
  {
    slug: 'vodka', label: 'Vodka', category: 'Base Spirits', essential: true,
    // Flavoured vodkas alias up rather than becoming nodes: a recipe calling for vanilla
    // vodka is served well enough by plain vodka, and eight near-duplicate cabinet rows
    // would be noise.
    aliases: ['absolut', 'absolut vodka', 'absolut citron', 'absolut peppar', 'absolut kurant',
      'grey goose', 'ketel one', 'belvedere', 'smirnoff', 'stolichnaya', "tito's", 'titos',
      'finlandia', 'ciroc', 'reyka', 'vanilla vodka', 'lime vodka', 'raspberry vodka',
      'peach vodka', 'cranberry vodka', 'citrus vodka', 'pepper vodka'],
  },
  { slug: 'rum', label: 'Rum', category: 'Base Spirits', aliases: ['rum'] },
  {
    slug: 'white-rum', label: 'White Rum', category: 'Base Spirits', parent: 'rum', essential: true,
    aliases: ['light rum', 'silver rum', 'white cuban rum', 'bacardi white', 'bacardi white rum',
      'bacardi limon', 'havana club', 'plantation', 'banks'],
  },
  {
    slug: 'gold-rum', label: 'Aged Rum', category: 'Base Spirits', parent: 'rum',
    aliases: ['gold rum', 'aged rum', 'añejo rum', 'anejo rum', 'appleton estate', 'mount gay',
      'el dorado', 'zacapa', 'diplomatico', 'rhum agricole'],
  },
  {
    slug: 'dark-rum', label: 'Dark Rum', category: 'Base Spirits', parent: 'rum',
    aliases: ['dark rum', 'blackstrap rum', "gosling's black seal", 'goslings black seal',
      'bacardi dark', 'myers', 'black rum', 'navy rum'],
  },
  { slug: 'spiced-rum', label: 'Spiced Rum', category: 'Base Spirits', parent: 'rum', aliases: ['spiced rum', 'captain morgan'] },
  { slug: 'overproof-rum', label: 'Overproof Rum', category: 'Base Spirits', parent: 'rum', aliases: ['151 proof rum', 'overproof rum', 'wray and nephew'] },
  { slug: 'cachaca', label: 'Cachaça', category: 'Base Spirits', aliases: ['cachaca', 'cachaça'] },

  { slug: 'whiskey', label: 'Whiskey', category: 'Base Spirits', aliases: ['whiskey', 'whisky', 'blended whiskey'] },
  {
    slug: 'bourbon', label: 'Bourbon', category: 'Base Spirits', parent: 'whiskey', essential: true,
    aliases: ['bourbon whiskey', 'buffalo trace', "maker's mark", 'makers mark', 'jim beam',
      'knob creek', 'woodford reserve', 'four roses', 'eagle rare', 'wild turkey',
      'bulleit bourbon', "angel's envy", 'angels envy'],
  },
  {
    slug: 'rye-whiskey', label: 'Rye Whiskey', category: 'Base Spirits', parent: 'whiskey',
    aliases: ['rye', 'rye whisky', 'rittenhouse', 'sazerac rye', 'bulleit rye', 'templeton',
      'whistlepig', 'redemption', 'high west'],
  },
  {
    slug: 'scotch', label: 'Scotch', category: 'Base Spirits', parent: 'whiskey',
    aliases: ['blended scotch', 'scotch whisky', 'islay single malt scotch', 'single malt',
      'johnnie walker', 'johnnie walker black', 'lagavulin', 'laphroaig', 'macallan',
      'glenlivet', 'glenfiddich', 'balvenie', 'oban'],
  },
  { slug: 'irish-whiskey', label: 'Irish Whiskey', category: 'Base Spirits', parent: 'whiskey', aliases: ['irish whisky', 'jameson'] },
  { slug: 'tennessee-whiskey', label: 'Tennessee Whiskey', category: 'Base Spirits', parent: 'whiskey', aliases: ['jack daniels', "jack daniel's"] },
  { slug: 'canadian-whisky', label: 'Canadian Whisky', category: 'Base Spirits', parent: 'whiskey', aliases: ['crown royal', 'canadian whiskey'] },

  { slug: 'brandy', label: 'Brandy', category: 'Base Spirits', aliases: ['brandy', 'e&j'] },
  { slug: 'cognac', label: 'Cognac', category: 'Base Spirits', parent: 'brandy', aliases: ['hennessy', 'hennessy vs', 'remy martin', 'rémy martin', 'courvoisier', 'courvoisier vsop', 'armagnac'] },
  { slug: 'apple-brandy', label: 'Apple Brandy', category: 'Base Spirits', parent: 'brandy', aliases: ['applejack', 'calvados', 'apple brandy'] },
  { slug: 'peach-brandy', label: 'Peach Brandy', category: 'Base Spirits', parent: 'brandy', aliases: ['peach brandy'] },
  { slug: 'blackberry-brandy', label: 'Blackberry Brandy', category: 'Base Spirits', parent: 'brandy', aliases: ['blackberry brandy'] },

  { slug: 'pisco', label: 'Pisco', category: 'Base Spirits', aliases: ['pisco quebranta', 'putaendo'] },
  {
    slug: 'tequila', label: 'Tequila', category: 'Base Spirits', essential: true,
    aliases: ['tequila blanco', 'blanco tequila', 'reposado', 'patron silver', 'patrón silver',
      'don julio blanco', 'espolon blanco', 'espolón blanco', 'herradura', 'casamigos blanco',
      'olmeca', 'jose cuervo', '1800 silver', 'clase azul', 'fortaleza'],
  },
  {
    slug: 'mezcal', label: 'Mezcal', category: 'Base Spirits',
    aliases: ['del maguey', 'montelobos', 'wahaka', 'ilegal', 'banhez', 'el silencio', 'alipus'],
  },
  { slug: 'absinthe', label: 'Absinthe', category: 'Base Spirits', aliases: ['wormwood'] },
  { slug: 'grain-alcohol', label: 'Grain Alcohol', category: 'Base Spirits', aliases: ['everclear', 'grain alcohol', 'firewater'] },

  // ── Liqueurs ────────────────────────────────────────────────────────────────
  {
    slug: 'triple-sec', label: 'Triple Sec', category: 'Liqueurs', essential: true,
    aliases: ['cointreau', 'orange curacao', 'orange curaçao', 'curacao', 'orange liqueur'],
  },
  { slug: 'grand-marnier', label: 'Grand Marnier', category: 'Liqueurs', parent: 'triple-sec' },
  { slug: 'blue-curacao', label: 'Blue Curaçao', category: 'Liqueurs', parent: 'triple-sec', aliases: ['blue curacao'] },
  { slug: 'maraschino-liqueur', label: 'Maraschino Liqueur', category: 'Liqueurs', aliases: ['luxardo maraschino', 'luxardo', 'maraschino'] },
  { slug: 'amaretto', label: 'Amaretto', category: 'Liqueurs', aliases: ['amaretto disaronno', 'disaronno'] },
  { slug: 'coffee-liqueur', label: 'Coffee Liqueur', category: 'Liqueurs', aliases: ['kahlua', 'kahlúa', 'tia maria', 'coffee brandy'] },
  { slug: 'irish-cream', label: 'Irish Cream', category: 'Liqueurs', aliases: ['baileys', 'baileys irish cream', "bailey's irish cream"] },
  { slug: 'creme-de-cacao', label: 'Crème de Cacao', category: 'Liqueurs', aliases: ['creme de cacao', 'dark creme de cacao', 'white creme de cacao', 'dark crème de cacao', 'crème de cacao'] },
  { slug: 'creme-de-menthe', label: 'Crème de Menthe', category: 'Liqueurs', aliases: ['creme de menthe', 'white creme de menthe', 'green creme de menthe', 'crème de menthe'] },
  { slug: 'creme-de-cassis', label: 'Crème de Cassis', category: 'Liqueurs', aliases: ['creme de cassis', 'cassis'] },
  { slug: 'raspberry-liqueur', label: 'Raspberry Liqueur', category: 'Liqueurs', aliases: ['chambord', 'chambord raspberry liqueur', 'creme de mure', 'crème de mûre', 'framboise'] },
  { slug: 'elderflower-liqueur', label: 'Elderflower Liqueur', category: 'Liqueurs', aliases: ['st-germain', 'st. germain', 'st germain', 'elderflower cordial'] },
  { slug: 'melon-liqueur', label: 'Melon Liqueur', category: 'Liqueurs', aliases: ['midori', 'midori melon liqueur'] },
  { slug: 'peach-schnapps', label: 'Peach Schnapps', category: 'Liqueurs', aliases: ['peachtree schnapps', 'archers', 'peach liqueur'] },
  { slug: 'coconut-liqueur', label: 'Coconut Liqueur', category: 'Liqueurs', aliases: ['malibu', 'malibu rum', 'malibu coconut rum', 'koko kanu', 'coconut rum'] },
  { slug: 'banana-liqueur', label: 'Banana Liqueur', category: 'Liqueurs', aliases: ['creme de banane', 'crème de banane', 'pisang ambon'] },
  { slug: 'cherry-liqueur', label: 'Cherry Liqueur', category: 'Liqueurs', aliases: ['cherry brandy', 'cherry heering', 'kirsch', 'kirschwasser'] },
  { slug: 'apricot-brandy', label: 'Apricot Liqueur', category: 'Liqueurs', aliases: ['apricot brandy', 'apricot liqueur'] },
  { slug: 'hazelnut-liqueur', label: 'Hazelnut Liqueur', category: 'Liqueurs', aliases: ['frangelico'] },
  { slug: 'chartreuse', label: 'Chartreuse', category: 'Liqueurs', aliases: ['green chartreuse', 'yellow chartreuse', 'chartreuse green'] },
  { slug: 'benedictine', label: 'Bénédictine', category: 'Liqueurs', aliases: ['benedictine', 'dom benedictine'] },
  { slug: 'drambuie', label: 'Drambuie', category: 'Liqueurs' },
  { slug: 'galliano', label: 'Galliano', category: 'Liqueurs' },
  { slug: 'sambuca', label: 'Sambuca', category: 'Liqueurs', aliases: ['black sambuca', 'anisette'] },
  { slug: 'pastis', label: 'Pastis', category: 'Liqueurs', aliases: ['pernod', 'ricard', 'anis', 'anise', 'ouzo', 'raki'] },
  { slug: 'aquavit', label: 'Aquavit', category: 'Base Spirits', aliases: ['akvavit', 'kummel'] },
  { slug: 'peppermint-schnapps', label: 'Peppermint Schnapps', category: 'Liqueurs', aliases: ['rumple minze'] },
  { slug: 'cinnamon-schnapps', label: 'Cinnamon Schnapps', category: 'Liqueurs', aliases: ['goldschlager', 'hot damn', 'fireball'] },
  { slug: 'butterscotch-schnapps', label: 'Butterscotch Schnapps', category: 'Liqueurs' },
  { slug: 'southern-comfort', label: 'Southern Comfort', category: 'Liqueurs', aliases: ['soco'] },
  { slug: 'jagermeister', label: 'Jägermeister', category: 'Liqueurs', aliases: ['jägermeister', 'jagermeister'] },
  { slug: 'advocaat', label: 'Advocaat', category: 'Liqueurs' },
  { slug: 'chocolate-liqueur', label: 'Chocolate Liqueur', category: 'Liqueurs', aliases: ['godiva liqueur', 'creme de cocoa'] },
  { slug: 'passion-fruit-liqueur', label: 'Passion Fruit Liqueur', category: 'Liqueurs', aliases: ['passoa'] },
  { slug: 'fruit-liqueur', label: 'Fruit Liqueur', category: 'Liqueurs', aliases: ['strawberry liqueur', 'strawberry schnapps', 'blueberry schnapps', 'kiwi liqueur', 'apfelkorn', 'yukon jack', 'blackcurrant cordial', 'hpnotiq'] },

  // ── Amari & Aperitifs ───────────────────────────────────────────────────────
  { slug: 'campari', label: 'Campari', category: 'Amari & Aperitifs', essential: true },
  { slug: 'aperol', label: 'Aperol', category: 'Amari & Aperitifs' },
  { slug: 'amaro', label: 'Amaro', category: 'Amari & Aperitifs', aliases: ['averna', 'montenegro', 'amaro montenegro', 'ramazzotti', 'braulio', 'amaro nonino', 'nonino'] },
  { slug: 'fernet', label: 'Fernet', category: 'Amari & Aperitifs', parent: 'amaro', aliases: ['fernet-branca', 'fernet branca'] },
  { slug: 'cynar', label: 'Cynar', category: 'Amari & Aperitifs', parent: 'amaro' },
  { slug: 'pimms', label: "Pimm's No. 1", category: 'Amari & Aperitifs', aliases: ["pimm's no. 1", 'pimms no 1', "pimm's"] },

  // ── Fortified Wine ──────────────────────────────────────────────────────────
  {
    slug: 'sweet-vermouth', label: 'Sweet Vermouth', category: 'Fortified Wine', essential: true,
    aliases: ['vermouth', 'rosso vermouth', 'red vermouth', 'sweet red vermouth', 'italian vermouth'],
  },
  { slug: 'dry-vermouth', label: 'Dry Vermouth', category: 'Fortified Wine', aliases: ['french vermouth'] },
  { slug: 'lillet', label: 'Lillet Blanc', category: 'Fortified Wine', aliases: ['lillet blanc', 'lillet blonde', 'kina lillet'] },
  { slug: 'dubonnet', label: 'Dubonnet', category: 'Fortified Wine', aliases: ['dubonnet rouge'] },
  { slug: 'sherry', label: 'Sherry', category: 'Fortified Wine', aliases: ['fino', 'amontillado', 'oloroso'] },
  { slug: 'port', label: 'Port', category: 'Fortified Wine', aliases: ['ruby port', 'tawny port'] },

  // ── Wine & Beer ─────────────────────────────────────────────────────────────
  { slug: 'champagne', label: 'Champagne', category: 'Wine & Beer', aliases: ['prosecco', 'sparkling wine', 'cava', 'crémant'] },
  { slug: 'white-wine', label: 'White Wine', category: 'Wine & Beer', aliases: ['dry white wine'] },
  { slug: 'red-wine', label: 'Red Wine', category: 'Wine & Beer' },
  { slug: 'wine', label: 'Wine', category: 'Wine & Beer' },
  { slug: 'beer', label: 'Beer', category: 'Wine & Beer', aliases: ['lager', 'corona', 'guinness stout', 'stout', 'ale'] },
  { slug: 'cider', label: 'Cider', category: 'Wine & Beer', aliases: ['hard cider'] },

  // ── Juices ──────────────────────────────────────────────────────────────────
  { slug: 'lime-juice', label: 'Lime Juice', category: 'Juices', essential: true, aliases: ['fresh lime juice', 'roses sweetened lime juice', "rose's lime juice", 'lime cordial'] },
  { slug: 'lemon-juice', label: 'Lemon Juice', category: 'Juices', essential: true, aliases: ['fresh lemon juice'] },
  { slug: 'orange-juice', label: 'Orange Juice', category: 'Juices', aliases: ['fresh orange juice'] },
  { slug: 'pineapple-juice', label: 'Pineapple Juice', category: 'Juices' },
  { slug: 'cranberry-juice', label: 'Cranberry Juice', category: 'Juices' },
  { slug: 'grapefruit-juice', label: 'Grapefruit Juice', category: 'Juices', aliases: ['fresh grapefruit juice'] },
  { slug: 'tomato-juice', label: 'Tomato Juice', category: 'Juices' },
  { slug: 'apple-juice', label: 'Apple Juice', category: 'Juices' },
  { slug: 'passion-fruit-juice', label: 'Passion Fruit Juice', category: 'Juices', aliases: ['passion fruit puree'] },
  { slug: 'grape-juice', label: 'Grape Juice', category: 'Juices' },
  { slug: 'pomegranate-juice', label: 'Pomegranate Juice', category: 'Juices' },
  { slug: 'cherry-juice', label: 'Cherry Juice', category: 'Juices' },
  { slug: 'watermelon-juice', label: 'Watermelon Juice', category: 'Juices' },
  { slug: 'peach-puree', label: 'Peach Purée', category: 'Juices', aliases: ['peach puree', 'peach nectar'] },
  { slug: 'apricot-nectar', label: 'Apricot Nectar', category: 'Juices' },
  { slug: 'coconut-cream', label: 'Coconut Cream', category: 'Juices', aliases: ['cream of coconut', 'coconut milk'] },
  { slug: 'fruit-juice', label: 'Fruit Juice', category: 'Juices', aliases: ['fruit punch', 'mixed fruit juice', 'tropicana', 'blackcurrant squash'] },
  { slug: 'guava-juice', label: 'Guava Juice', category: 'Juices' },

  // ── Sodas & Mixers ──────────────────────────────────────────────────────────
  { slug: 'soda-water', label: 'Soda Water', category: 'Sodas & Mixers', essential: true, aliases: ['club soda', 'carbonated water', 'sparkling water', 'seltzer', 'splash of club soda', 'schweppes russchian'] },
  { slug: 'tonic-water', label: 'Tonic Water', category: 'Sodas & Mixers', aliases: ['bitter lemon', 'fever-tree tonic'] },
  { slug: 'cola', label: 'Cola', category: 'Sodas & Mixers', aliases: ['coca-cola', 'coca cola', 'pepsi cola', 'pepsi', 'carbonated soft drink'] },
  { slug: 'lemon-lime-soda', label: 'Lemon-Lime Soda', category: 'Sodas & Mixers', aliases: ['sprite', '7-up', '7up', 'surge', 'fresca', 'zima', 'mountain dew', 'grapefruit soda', 'grapefruit soda (jarritos or fever-tree)', 'jarritos'] },
  { slug: 'ginger-ale', label: 'Ginger Ale', category: 'Sodas & Mixers' },
  { slug: 'ginger-beer', label: 'Ginger Beer', category: 'Sodas & Mixers' },
  { slug: 'lemonade', label: 'Lemonade', category: 'Sodas & Mixers', aliases: ['pink lemonade', 'limeade'] },
  { slug: 'root-beer', label: 'Root Beer', category: 'Sodas & Mixers', aliases: ['sarsaparilla', 'dr. pepper', 'dr pepper'] },
  { slug: 'fruit-soda', label: 'Fruit Soda', category: 'Sodas & Mixers', aliases: ['grape soda', 'orange soda', 'cream soda'] },
  { slug: 'sweet-and-sour', label: 'Sweet & Sour Mix', category: 'Sodas & Mixers', aliases: ['sweet and sour', 'sour mix', 'daiquiri mix', 'pina colada mix'] },
  { slug: 'coffee', label: 'Coffee', category: 'Sodas & Mixers', aliases: ['espresso', 'fresh espresso', 'cold brew coffee', 'hot coffee'] },
  { slug: 'tea', label: 'Tea', category: 'Sodas & Mixers', aliases: ['iced tea', 'green tea', 'black tea'] },

  // ── Syrups & Sweeteners ─────────────────────────────────────────────────────
  { slug: 'simple-syrup', label: 'Simple Syrup', category: 'Syrups & Sweeteners', essential: true, satisfiedBy: ['sugar'], aliases: ['sugar syrup', 'gomme syrup', 'gum syrup', 'rich simple syrup'] },
  { slug: 'grenadine', label: 'Grenadine', category: 'Syrups & Sweeteners' },
  { slug: 'honey-syrup', label: 'Honey Syrup', category: 'Syrups & Sweeteners', aliases: ['honey'] },
  { slug: 'agave-syrup', label: 'Agave Syrup', category: 'Syrups & Sweeteners', aliases: ['agave nectar', 'agave'] },
  { slug: 'maple-syrup', label: 'Maple Syrup', category: 'Syrups & Sweeteners' },
  { slug: 'orgeat-syrup', label: 'Orgeat', category: 'Syrups & Sweeteners', aliases: ['orgeat', 'almond syrup'] },
  { slug: 'falernum', label: 'Falernum', category: 'Syrups & Sweeteners', aliases: ['velvet falernum'] },
  { slug: 'raspberry-syrup', label: 'Raspberry Syrup', category: 'Syrups & Sweeteners', aliases: ['sirup of roses', 'rose syrup'] },
  { slug: 'passion-fruit-syrup', label: 'Passion Fruit Syrup', category: 'Syrups & Sweeteners' },
  { slug: 'vanilla-syrup', label: 'Vanilla Syrup', category: 'Syrups & Sweeteners' },
  { slug: 'ginger-syrup', label: 'Ginger Syrup', category: 'Syrups & Sweeteners' },
  { slug: 'mint-syrup', label: 'Mint Syrup', category: 'Syrups & Sweeteners' },
  { slug: 'coconut-syrup', label: 'Coconut Syrup', category: 'Syrups & Sweeteners' },
  { slug: 'pineapple-syrup', label: 'Pineapple Syrup', category: 'Syrups & Sweeteners' },
  { slug: 'rosemary-syrup', label: 'Rosemary Syrup', category: 'Syrups & Sweeteners' },
  { slug: 'matcha-syrup', label: 'Matcha Syrup', category: 'Syrups & Sweeteners' },
  { slug: 'chocolate-syrup', label: 'Chocolate Syrup', category: 'Syrups & Sweeteners' },

  // ── Bitters & Aromatics ─────────────────────────────────────────────────────
  { slug: 'angostura-bitters', label: 'Angostura Bitters', category: 'Bitters & Aromatics', essential: true, aliases: ['bitters', 'aromatic bitters'] },
  { slug: 'orange-bitters', label: 'Orange Bitters', category: 'Bitters & Aromatics' },
  { slug: 'peychauds-bitters', label: "Peychaud's Bitters", category: 'Bitters & Aromatics', aliases: ['peychaud bitters', "peychaud's bitters", 'peychauds'] },
  { slug: 'peach-bitters', label: 'Peach Bitters', category: 'Bitters & Aromatics' },
  { slug: 'rose-water', label: 'Rose Water', category: 'Bitters & Aromatics', aliases: ['rose', 'rosewater'] },
  { slug: 'hot-sauce', label: 'Hot Sauce', category: 'Bitters & Aromatics', aliases: ['tabasco sauce', 'tabasco'] },
  { slug: 'worcestershire-sauce', label: 'Worcestershire Sauce', category: 'Bitters & Aromatics' },
  { slug: 'soy-sauce', label: 'Soy Sauce', category: 'Bitters & Aromatics' },
  { slug: 'olive-brine', label: 'Olive Brine', category: 'Bitters & Aromatics', aliases: ['brine'] },

  // ── Dairy & Eggs ────────────────────────────────────────────────────────────
  { slug: 'milk', label: 'Milk', category: 'Dairy & Eggs', aliases: ['condensed milk', 'evaporated milk'] },
  { slug: 'cream', label: 'Cream', category: 'Dairy & Eggs', aliases: ['light cream', 'heavy cream', 'whipping cream', 'half-and-half', 'double cream', 'single cream'] },
  { slug: 'whipped-cream', label: 'Whipped Cream', category: 'Dairy & Eggs', parent: 'cream' },
  { slug: 'yoghurt', label: 'Yoghurt', category: 'Dairy & Eggs', aliases: ['yogurt'] },
  { slug: 'ice-cream', label: 'Ice Cream', category: 'Dairy & Eggs', aliases: ['vanilla ice-cream', 'vanilla ice cream', 'sherbet'] },
  { slug: 'egg', label: 'Egg', category: 'Dairy & Eggs' },
  { slug: 'egg-white', label: 'Egg White', category: 'Dairy & Eggs', parent: 'egg', satisfiedBy: ['aquafaba'] },
  { slug: 'egg-yolk', label: 'Egg Yolk', category: 'Dairy & Eggs', parent: 'egg' },
  { slug: 'aquafaba', label: 'Aquafaba', category: 'Dairy & Eggs' },
  { slug: 'butter', label: 'Butter', category: 'Dairy & Eggs' },

  // ── Fruit & Produce ─────────────────────────────────────────────────────────
  { slug: 'mint', label: 'Mint', category: 'Fruit & Produce', aliases: ['fresh mint', 'mint leaves', 'muddled mint'] },
  { slug: 'basil', label: 'Basil', category: 'Fruit & Produce', aliases: ['muddled basil', 'fresh basil'] },
  { slug: 'rosemary', label: 'Rosemary', category: 'Fruit & Produce' },
  { slug: 'thyme', label: 'Thyme', category: 'Fruit & Produce' },
  { slug: 'lavender', label: 'Lavender', category: 'Fruit & Produce' },
  { slug: 'ginger', label: 'Ginger', category: 'Fruit & Produce', aliases: ['fresh ginger'] },
  { slug: 'cucumber', label: 'Cucumber', category: 'Fruit & Produce' },
  { slug: 'jalapeno', label: 'Jalapeño', category: 'Fruit & Produce', aliases: ['jalapeño', 'muddled jalapeño', 'muddled jalapeno'] },
  { slug: 'pineapple', label: 'Pineapple', category: 'Fruit & Produce' },
  { slug: 'strawberries', label: 'Strawberries', category: 'Fruit & Produce', aliases: ['strawberry'] },
  { slug: 'blackberries', label: 'Blackberries', category: 'Fruit & Produce', aliases: ['blackberry'] },
  { slug: 'raspberries', label: 'Raspberries', category: 'Fruit & Produce', aliases: ['raspberry'] },
  { slug: 'blueberries', label: 'Blueberries', category: 'Fruit & Produce', aliases: ['blueberry'] },
  { slug: 'cranberries', label: 'Cranberries', category: 'Fruit & Produce', aliases: ['cranberry'] },
  { slug: 'grapes', label: 'Grapes', category: 'Fruit & Produce', aliases: ['grape', 'raisins'] },
  { slug: 'berries', label: 'Mixed Berries', category: 'Fruit & Produce', aliases: ['berry'] },
  { slug: 'melon', label: 'Melon', category: 'Fruit & Produce', aliases: ['cantaloupe', 'honeydew'] },
  { slug: 'apricot', label: 'Apricot', category: 'Fruit & Produce' },
  { slug: 'carrot', label: 'Carrot', category: 'Fruit & Produce' },
  { slug: 'banana', label: 'Banana', category: 'Fruit & Produce' },
  { slug: 'apple', label: 'Apple', category: 'Fruit & Produce' },
  { slug: 'mango', label: 'Mango', category: 'Fruit & Produce' },
  { slug: 'kiwi', label: 'Kiwi', category: 'Fruit & Produce' },
  { slug: 'papaya', label: 'Papaya', category: 'Fruit & Produce' },
  { slug: 'watermelon', label: 'Watermelon', category: 'Fruit & Produce' },
  { slug: 'figs', label: 'Figs', category: 'Fruit & Produce', aliases: ['fig'] },
  { slug: 'peach', label: 'Peach', category: 'Fruit & Produce' },

  // ── Pantry & Garnish ────────────────────────────────────────────────────────
  // `pantry: true` means "never blocks a match". These still appear on the recipe; they
  // just don't count as something the user is missing. Nobody's Margarita is short an ice cube.
  { slug: 'ice', label: 'Ice', category: 'Pantry & Garnish', pantry: true, aliases: ['crushed ice', 'ice cubes', 'large cube'] },
  { slug: 'water', label: 'Water', category: 'Pantry & Garnish', pantry: true, aliases: ['hot water', 'cold water', 'still water'] },
  { slug: 'sugar', label: 'Sugar', category: 'Pantry & Garnish', pantry: true, aliases: ['powdered sugar', 'caster sugar', 'brown sugar', 'demerara sugar', 'granulated sugar', 'sugar cube', 'corn syrup'] },
  { slug: 'salt', label: 'Salt', category: 'Pantry & Garnish', pantry: true, aliases: ['celery salt', 'sea salt', 'kosher salt', 'tajin rim', 'salt rim'] },
  { slug: 'pepper', label: 'Pepper', category: 'Pantry & Garnish', pantry: true, aliases: ['black pepper', 'cayenne pepper', 'red chili flakes', 'chili flakes'] },
  { slug: 'spices', label: 'Baking Spices', category: 'Pantry & Garnish', pantry: true, aliases: ['nutmeg', 'cinnamon', 'cloves', 'cardamom', 'allspice', 'coriander', 'cumin seed', 'asafoetida', 'star anise', 'angelica root', 'licorice root', 'fennel seeds', 'marjoram leaves', 'almond'] },
  { slug: 'vanilla-extract', label: 'Vanilla Extract', category: 'Pantry & Garnish', pantry: true, aliases: ['vanilla', 'almond flavoring', 'caramel coloring', 'peppermint extract', 'food coloring', 'glycerine', 'cornstarch'] },
  { slug: 'cocoa', label: 'Cocoa', category: 'Pantry & Garnish', pantry: true, aliases: ['chocolate', 'cocoa powder', 'hot chocolate', 'oreo cookie', 'marshmallows', 'candy', 'mini-snickers bars', 'caramel sauce'] },
  { slug: 'maraschino-cherry', label: 'Maraschino Cherry', category: 'Pantry & Garnish', pantry: true, aliases: ['cherry', 'cherries', 'cocktail cherry'] },
  { slug: 'olive', label: 'Olive', category: 'Pantry & Garnish', pantry: true, aliases: ['olives', 'green olive'] },
  { slug: 'lime', label: 'Lime', category: 'Pantry & Garnish', pantry: true, aliases: ['lime peel', 'lime wedge', 'lime wheel', 'lime twist'] },
  { slug: 'lemon', label: 'Lemon', category: 'Pantry & Garnish', pantry: true, aliases: ['lemon peel', 'lemon wedge', 'lemon twist', 'lemon wheel'] },
  { slug: 'orange', label: 'Orange', category: 'Pantry & Garnish', pantry: true, aliases: ['orange peel', 'orange spiral', 'orange twist', 'orange wheel', 'blood orange', 'expressed orange peel'] },
  { slug: 'grapefruit', label: 'Grapefruit', category: 'Pantry & Garnish', pantry: true, aliases: ['grapefruit peel', 'grapefruit twist'] },
];

// ── indexes ───────────────────────────────────────────────────────────────────

const BY_SLUG = new Map<string, IngredientNode>(INGREDIENTS.map(n => [n.slug, n]));

/** alias / label / slug (all normalized) → slug. Built once at module load. */
const BY_ALIAS = new Map<string, string>();
for (const node of INGREDIENTS) {
  const keys = [node.slug, node.label, ...(node.aliases ?? [])];
  for (const key of keys) {
    const norm = normalizeKey(key);
    // First registration wins, so a node's own slug/label always beats another's alias.
    if (norm && !BY_ALIAS.has(norm)) BY_ALIAS.set(norm, node.slug);
  }
}

/** slug → direct children. */
const CHILDREN = new Map<string, string[]>();
for (const node of INGREDIENTS) {
  if (!node.parent) continue;
  const list = CHILDREN.get(node.parent) ?? [];
  list.push(node.slug);
  CHILDREN.set(node.parent, list);
}

// Longest first, so "white creme de menthe" is tried before "creme de menthe" and
// "apple brandy" before "brandy" during the substring fallback.
const ALIASES_BY_LENGTH = Array.from(BY_ALIAS.keys()).sort((a, b) => b.length - a.length);

// ── normalization ─────────────────────────────────────────────────────────────

/** Qualifiers that describe preparation rather than identity. Stripped before matching. */
const NOISE_WORDS = [
  'fresh', 'freshly', 'squeezed', 'chilled', 'cold', 'hot', 'warm', 'optional',
  'splash of', 'dash of', 'dashes of', 'a few', 'good quality', 'premium',
  'homemade', 'store bought', 'to taste', 'as needed', 'or so', 'about',
];

function normalizeKey(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFKD')
    // Strip parenthetical asides: "grapefruit soda (Jarritos or Fever-Tree)".
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[’`]/g, "'")
    .replace(/[^a-z0-9'&\- ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripNoise(key: string): string {
  let out = ` ${key} `;
  for (const word of NOISE_WORDS) out = out.split(` ${word} `).join(' ');
  return out.replace(/\s+/g, ' ').trim();
}

// ── public API ────────────────────────────────────────────────────────────────

/** Look up a node by its canonical slug. Returns `undefined` for unknown slugs. */
export function getIngredient(slug: string): IngredientNode | undefined {
  return BY_SLUG.get(slug);
}

export function allIngredients(): IngredientNode[] {
  return INGREDIENTS;
}

/** Display label for a slug, falling back to the slug itself so the UI never renders blank. */
export function labelFor(slug: string): string {
  return BY_SLUG.get(slug)?.label ?? slug;
}

export function categoryFor(slug: string): IngredientCategory {
  return BY_SLUG.get(slug)?.category ?? 'Pantry & Garnish';
}

export function isPantry(slug: string): boolean {
  return BY_SLUG.get(slug)?.pantry === true;
}

/**
 * Map any raw ingredient string onto a canonical slug.
 *
 * Tries, in order: exact match, match after stripping preparation words, then the longest
 * known alias contained in the string. Deliberately conservative — it returns `null` rather
 * than guessing, because a wrong mapping silently corrupts every match that ingredient
 * touches, while a `null` is visible and reportable.
 *
 * Returns: the slug, or `null` when nothing in the taxonomy fits.
 */
export function resolveIngredient(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const key = normalizeKey(raw);
  if (!key) return null;

  const direct = BY_ALIAS.get(key);
  if (direct) return direct;

  const stripped = stripNoise(key);
  if (stripped !== key) {
    const viaStripped = BY_ALIAS.get(stripped);
    if (viaStripped) return viaStripped;
  }

  // Singular/plural is the last cheap normalisation worth trying.
  for (const candidate of [stripped, key]) {
    if (candidate.endsWith('s')) {
      const singular = BY_ALIAS.get(candidate.slice(0, -1));
      if (singular) return singular;
    } else {
      const plural = BY_ALIAS.get(`${candidate}s`);
      if (plural) return plural;
    }
  }

  // Whole-word containment, longest alias first. Word boundaries matter: without them
  // "gin" matches "ginger ale" and "ginger beer", which is exactly the class of silent
  // mis-mapping this function exists to avoid.
  const haystack = ` ${stripped} `;
  for (const alias of ALIASES_BY_LENGTH) {
    if (alias.length < 4) continue;
    if (haystack.includes(` ${alias} `)) return BY_ALIAS.get(alias)!;
  }

  return null;
}

/**
 * Expand a cabinet of slugs into everything it can satisfy.
 *
 * Walks three relationships:
 *   - descendants: owning `whiskey` covers a recipe asking for `bourbon`
 *   - ancestors:   owning `bourbon` covers a recipe asking for `whiskey`
 *   - satisfiedBy: owning `sugar` covers a recipe asking for `simple-syrup`
 *
 * Returns: the closure as a Set, including the inputs. Unknown slugs pass through
 * unchanged so a hand-edited cabinet still matches on exact names.
 */
export function expandCabinet(slugs: Iterable<string>): Set<string> {
  const out = new Set<string>();
  const queue: string[] = [];

  for (const slug of slugs) {
    if (!slug) continue;
    if (!out.has(slug)) { out.add(slug); queue.push(slug); }
  }

  while (queue.length) {
    const current = queue.pop()!;

    for (const child of CHILDREN.get(current) ?? []) {
      if (!out.has(child)) { out.add(child); queue.push(child); }
    }

    const node = BY_SLUG.get(current);
    if (node?.parent && !out.has(node.parent)) {
      out.add(node.parent);
      queue.push(node.parent);
    }
  }

  // satisfiedBy is directional: a node lists what can stand in FOR it, so owning one of
  // those stand-ins should add the node. Resolved as a separate pass over the whole
  // vocabulary rather than by walking edges, because the relation points the other way.
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of INGREDIENTS) {
      if (out.has(node.slug) || !node.satisfiedBy) continue;
      if (node.satisfiedBy.some(s => out.has(s))) {
        out.add(node.slug);
        changed = true;
      }
    }
  }

  return out;
}

/** Ingredients offered as one-tap additions on the cabinet screen. */
export function essentialIngredients(): IngredientNode[] {
  return INGREDIENTS.filter(n => n.essential);
}

/** The full vocabulary grouped for the cabinet UI, pantry items excluded. */
export function stockableByCategory(): Array<{ category: IngredientCategory; items: IngredientNode[] }> {
  const order: IngredientCategory[] = [
    'Base Spirits', 'Liqueurs', 'Amari & Aperitifs', 'Fortified Wine', 'Wine & Beer',
    'Juices', 'Sodas & Mixers', 'Syrups & Sweeteners', 'Bitters & Aromatics',
    'Dairy & Eggs', 'Fruit & Produce',
  ];
  return order.map(category => ({
    category,
    items: INGREDIENTS
      .filter(n => n.category === category && !n.pantry)
      .sort((a, b) => a.label.localeCompare(b.label)),
  })).filter(group => group.items.length > 0);
}
