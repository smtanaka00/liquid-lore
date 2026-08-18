import React, { useState, useEffect } from 'react';
import { Beer, LogIn, LogOut, Search, Plus, X, Sparkles, Moon, Sun, Wine, Check } from 'lucide-react';
import { useTheme } from 'next-themes';
import { supabase } from '../lib/supabase';
import { Auth } from '../components/Auth';
import { getAdvancedRecommendations, getAllIngredients, getLibraryStats, getCuratedClassics, searchByIngredients } from '../lib/cocktail-service';
import { CATEGORY_MAP, getIngredientCategory, POPULAR_INGREDIENTS } from '../lib/ingredient-categories';

export default function Home() {
  const [cabinet, setCabinet] = useState<string[]>([]);
  const [exactMatches, setExactMatches] = useState<any[]>([]);
  const [nearMisses, setNearMisses] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [maximizer, setMaximizer] = useState<any>(null);
  const [powerIngredients, setPowerIngredients] = useState<any[]>([]);
  const [session, setSession] = useState<any>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [activeFlavor, setActiveFlavor] = useState<string | null>(null);
  const [stats, setStats] = useState({ total: 0, ingredients: 0 });
  const [isStockingMode, setIsStockingMode] = useState(false);
  const [activeSelection, setActiveSelection] = useState<string[]>([]);
  const [loadingCabinet, setLoadingCabinet] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);
  const [allIngredients, setAllIngredients] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredIngredients, setFilteredIngredients] = useState<string[]>([]);
  const [curated, setCurated] = useState<any[]>([]);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [searchMode, setSearchMode] = useState<'ingredient' | 'cocktail'>('ingredient');
  const [cocktailSearchResults, setCocktailSearchResults] = useState<any[]>([]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    getLibraryStats().then(setStats);
    getCuratedClassics(6).then(setCurated);
  }, []);

  useEffect(() => {
    // Load from localStorage immediately for fast initial render
    const localCabinet = localStorage.getItem('liquid-lore-cabinet');
    if (localCabinet) {
      const parsed = JSON.parse(localCabinet);
      setCabinet(parsed);
      setActiveSelection(parsed);
    } else {
      setCabinet(['Gin']);
      setActiveSelection(['Gin']);
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchCabinet(session.user.id);
      } else {
        setLoadingCabinet(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchCabinet(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    getAllIngredients().then(setAllIngredients);
  }, []);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!searchQuery.trim()) {
        setFilteredIngredients([]);
        setCocktailSearchResults([]);
        return;
      }
      
      if (searchMode === 'ingredient') {
        const filtered = allIngredients.filter(ing => 
          ing.toLowerCase().includes(searchQuery.toLowerCase()) && !cabinet.includes(ing)
        ).slice(0, 8);
        setFilteredIngredients(filtered);
      } else {
        setLoadingResults(true);
        searchByIngredients([searchQuery]).then(results => {
          setCocktailSearchResults(results);
          setLoadingResults(false);
        });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, allIngredients, cabinet, searchMode]);

  const fetchCabinet = async (userId: string) => {
    setLoadingCabinet(true);
    const { data, error } = await supabase.from('profiles').select('cabinet').eq('id', userId).single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching cabinet:', error);
    }

    // Merge logic: If local storage has items not in DB, we could merge, 
    // but for now let's just prioritize DB if it exists, otherwise keep local.
    if (data?.cabinet && data.cabinet.length > 0) {
      setCabinet(data.cabinet);
      setActiveSelection(data.cabinet);
      localStorage.setItem('liquid-lore-cabinet', JSON.stringify(data.cabinet));
    }
    setLoadingCabinet(false);
  };

  const updateCabinet = async (newCabinet: string[]) => {
    setCabinet(newCabinet);
    localStorage.setItem('liquid-lore-cabinet', JSON.stringify(newCabinet));
    
    if (session?.user.id) {
      const { error } = await supabase.from('profiles').upsert({ 
        id: session.user.id, 
        cabinet: newCabinet,
        updated_at: new Date().toISOString()
      });
      
      if (error) {
        console.error('Error saving cabinet to profile:', error);
      }
    }
  };

  const toggleIngredient = (ing: string) => {
    const isOwned = cabinet.includes(ing);
    const newCabinet = isOwned ? cabinet.filter(i => i !== ing) : [...cabinet, ing];
    updateCabinet(newCabinet);
    
    // Manage active selection based on ownership change
    if (isOwned && activeSelection.includes(ing)) {
        setActiveSelection(activeSelection.filter(i => i !== ing));
    } else if (!isOwned && !activeSelection.includes(ing)) {
        setActiveSelection([...activeSelection, ing]);
    }
  };

  const toggleActive = (ing: string) => {
    setActiveSelection(prev => 
        prev.includes(ing) ? prev.filter(i => i !== ing) : [...prev, ing]
    );
  };

  useEffect(() => {
    if (cabinet.length === 0) {
      setExactMatches([]);
      setNearMisses([]);
      setRecommendations([]);
      return;
    }
    setLoadingResults(true);
    getAdvancedRecommendations(activeSelection).then(res => {
      setExactMatches(res.exactMatches);
      setNearMisses(res.nearMisses);
      setRecommendations(res.recommendations);
      setMaximizer(res.maximizer);
      setPowerIngredients(res.powerIngredients || []);
      setLoadingResults(false);
    });
  }, [activeSelection]);

  return (
    <div className="min-h-screen bg-background text-foreground p-6 relative transition-colors duration-300">
      {showAuth && <Auth onLogin={() => setShowAuth(false)} />}
      <header className="max-w-6xl mx-auto mb-16 pt-10 flex justify-between items-start">
        <div>
          <h1 className="text-6xl font-serif text-primary tracking-tighter transition-all hover:scale-105 inline-block">Liquid Lore</h1>
          <div className="flex items-center gap-3 mt-2">
            <p className="text-muted-foreground uppercase tracking-[0.4em] text-[10px] font-bold">The Premium Mixology Suite</p>
            <span className="w-1 h-1 rounded-full bg-border"></span>
            <p className="text-primary/60 uppercase tracking-[0.2em] text-[9px] font-bold">{stats.total}+ Curated Recipes</p>
          </div>
        </div>
        <div>
          {session ? (
            <div className="flex items-center gap-6">
              <a href="/studio" className="text-muted-foreground hover:text-primary transition-colors text-sm font-bold uppercase tracking-widest">Studio</a>
              <a href="/lounge" className="text-muted-foreground hover:text-primary transition-colors text-sm font-bold uppercase tracking_widest">Lounge</a>
              <a href="/profile" className="text-muted-foreground hover:text-primary transition-colors text-sm font-bold uppercase tracking-widest">Profile</a>
              
              <button 
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground"
              >
                {mounted && (theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />)}
              </button>

              <button onClick={() => supabase.auth.signOut()} className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors text-sm font-bold uppercase tracking-widest ml-4">
                <LogOut size={16} /> Sign Out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-6">
              <a href="/lounge" className="text-muted-foreground hover:text-primary transition-colors text-sm font-bold uppercase tracking-widest">Lounge</a>
              
              <button 
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground"
              >
                {mounted && (theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />)}
              </button>

              <button onClick={() => setShowAuth(true)} className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors text-sm font-bold uppercase tracking-widest ml-4">
                <LogIn size={16} /> Login
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto grid lg:grid-cols-[300px_1fr] gap-12">
        <aside className="space-y-8">
          {powerIngredients.length > 0 && (
            <div className="bg-gradient-to-br from-primary/20 to-amber-900/10 border border-primary/20 p-6 rounded-[40px] shadow-xl">
              <h3 className="text-primary uppercase text-[10px] font-bold tracking-[0.2em] mb-4 flex items-center gap-2">
                <Sparkles size={12} /> Shopping List
              </h3>
              <p className="text-[10px] text-muted-foreground mb-4 uppercase tracking-tighter">Add these to your stock to unlock more:</p>
              <div className="space-y-4">
                {powerIngredients.slice(0, 3).map((ing, idx) => (
                  <div key={idx} className="flex items-center justify-between group">
                    <div>
                      <p className="text-foreground text-sm font-medium">{ing.name}</p>
                      <p className="text-primary text-[9px] uppercase tracking-tighter font-bold">+{ing.count} Recipes</p>
                    </div>
                    <button 
                      onClick={() => toggleIngredient(ing.name)}
                      className="p-1.5 hover:bg-primary hover:text-primary-foreground rounded-full border border-border transition-all shadow-sm"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-card border border-border p-6 rounded-3xl shadow-sm">
            <div className="flex items-center justify-between mb-2">
                <h2 className="text-primary font-serif text-2xl flex items-center gap-2">
                <Wine size={24} /> Virtual Bar
                </h2>
                <div className="flex flex-col items-end">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{cabinet.length} Owned</span>
                    <span className="text-[10px] font-bold text-primary uppercase tracking-widest">{activeSelection.length} Active</span>
                </div>
            </div>
            
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-6">Inventory Setup & Mixer</p>
            
            <div className="flex bg-muted rounded-xl p-1 mb-6">
              <button 
                onClick={() => {
                    setSearchMode('ingredient');
                    setIsStockingMode(true);
                }}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all ${isStockingMode ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground'}`}
              >
                Stock Bar
              </button>
              <button 
                onClick={() => {
                    setSearchMode('cocktail');
                    setIsStockingMode(false);
                }}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all ${!isStockingMode ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground'}`}
              >
                Recipes
              </button>
            </div>

            <div className="relative mb-8">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <input 
                type="text"
                placeholder={searchMode === 'ingredient' ? "E.g. Gin, Campari..." : "E.g. Negroni, Martini..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-background border border-border rounded-xl py-3 pl-10 pr-4 text-xs focus:ring-2 focus:ring-primary outline-none transition-all shadow-sm"
              />
              
              {searchMode === 'ingredient' && filteredIngredients.length > 0 && (
                <div className="absolute top-full left-0 w-full mt-2 bg-popover border border-border rounded-xl overflow-hidden z-30 shadow-2xl">
                  {filteredIngredients.map(ing => (
                    <button
                      key={ing}
                      onClick={() => {
                        toggleIngredient(ing);
                        setSearchQuery('');
                      }}
                      className="w-full text-left px-4 py-3 text-xs hover:bg-muted transition-colors flex items-center justify-between group"
                    >
                      {ing}
                      <Plus size={14} className="text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}
                </div>
              )}

              {searchMode === 'cocktail' && cocktailSearchResults.length > 0 && (
                <div className="absolute top-full left-0 w-full mt-2 bg-popover border border-border rounded-xl overflow-hidden z-30 shadow-2xl max-h-[400px] overflow-y-auto">
                  {cocktailSearchResults.map(drink => (
                    <a
                      key={drink.id}
                      href={`/drink/${drink.id}`}
                      className="w-full text-left px-4 py-3 text-xs hover:bg-muted transition-colors flex items-center gap-3 border-b border-border last:border-0 group"
                    >
                      <div className="w-8 h-8 rounded-full bg-muted overflow-hidden flex-shrink-0">
                        <img src={drink.image} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1">
                        <p className="font-bold">{drink.name}</p>
                        {drink.hasLore && <p className="text-[8px] text-primary uppercase font-bold tracking-widest">✨ Lore</p>}
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-8">
              {Object.entries(CATEGORY_MAP).map(([cat, defaults]) => {
                const inCabinet = cabinet.filter(ing => 
                  getIngredientCategory(ing) === cat
                );
                
                if (inCabinet.length === 0) return null;

                return (
                  <div key={cat} className="space-y-3">
                    <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] flex items-center gap-2">
                        {cat}
                    </h4>
                    <div className="space-y-1.5">
                      {inCabinet.map(ing => {
                        const isActive = activeSelection.includes(ing);
                        return (
                          <div key={ing} className="group flex items-center justify-between p-2.5 rounded-2xl bg-muted/50 border border-transparent hover:border-border hover:bg-muted transition-all">
                            <button 
                                onClick={() => toggleActive(ing)}
                                className="flex items-center gap-3 flex-1 text-left group"
                            >
                                <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${isActive ? 'bg-primary border-primary text-primary-foreground' : 'border-current opacity-20'}`}>
                                    {isActive && <Check size={10} strokeWidth={4} />}
                                </div>
                                <span className={`text-xs transition-colors ${isActive ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>{ing}</span>
                            </button>
                            <button 
                              onClick={() => toggleIngredient(ing)}
                              className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Catch-all for uncategorized ingredients */}
              {cabinet.filter(ing => getIngredientCategory(ing) === "Other").length > 0 && (
                <div className="space-y-3">
                   <h4 className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">Essentials & Other</h4>
                   <div className="space-y-1.5 focus:outline-none">
                        {cabinet.filter(ing => getIngredientCategory(ing) === "Other").map(ing => {
                           const isActive = activeSelection.includes(ing);
                           return (
                             <div key={ing} className="group flex items-center justify-between p-2.5 rounded-2xl bg-muted/50 border border-transparent hover:border-border hover:bg-muted transition-all">
                                <button 
                                    onClick={() => toggleActive(ing)}
                                    className="flex items-center gap-3 flex-1 text-left"
                                >
                                    <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${isActive ? 'bg-primary border-primary text-primary-foreground' : 'border-current opacity-20'}`}>
                                        {isActive && <Check size={10} strokeWidth={4} />}
                                    </div>
                                    <span className={`text-xs transition-colors ${isActive ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>{ing}</span>
                                </button>
                                <button 
                                 onClick={() => toggleIngredient(ing)}
                                 className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                                >
                                 <X size={14} />
                                </button>
                             </div>
                           );
                        })}
                   </div>
                </div>
              )}
            </div>

            {cabinet.length === 0 && (
                <div className="py-8 text-center border-2 border-dashed border-border rounded-2xl">
                    <p className="text-[10px] text-muted-foreground italic px-4">Your bar is empty. Search above or quick-add staples to see what you can make.</p>
                </div>
            )}
            
            <div className="mt-10 pt-6 border-t border-border">
                <h3 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-4">Quick Stock</h3>
                <div className="flex flex-wrap gap-1.5">
                {POPULAR_INGREDIENTS.filter(i => !cabinet.includes(i)).slice(0, 8).map(ing => (
                    <button
                        key={ing}
                        onClick={() => toggleIngredient(ing)}
                        className="px-2.5 py-1.5 rounded-lg text-[9px] border border-border text-muted-foreground hover:border-primary hover:text-primary transition-all bg-muted/20 hover:bg-muted/50"
                    >
                    {ing}
                    </button>
                ))}
                </div>
            </div>
          </div>
        </aside>

        <section>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
            <h2 className="text-3xl font-serif text-foreground">Recommended for You</h2>
            <div className="flex items-center gap-4">
              <div className="flex bg-muted border border-border rounded-full p-1 shadow-inner">
                {['All', 'Fruity', 'Strong', 'Bitter', 'Sweet'].map(f => (
                  <button
                    key={f}
                    onClick={() => setActiveFlavor(f === 'All' ? null : f)}
                    className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${(!activeFlavor && f === 'All') || activeFlavor === f ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              {loadingResults && <span className="text-primary text-sm animate-pulse ml-2 flex items-center gap-2"><Sparkles size={14} /> Analyzing...</span>}
            </div>
          </div>

          <div className="space-y-12">
            {cabinet.length < 3 || isStockingMode ? (
              <div className="space-y-12">
                <div className="text-center max-w-2xl mx-auto mb-16">
                    <h2 className="text-5xl font-serif text-foreground mb-4">Stock Your Bar</h2>
                    <p className="text-muted-foreground leading-relaxed">Liquid Lore discovery is powered by your cabinet. Select the staples you have on hand to unlock hundreds of curated recipes.</p>
                </div>

                <div className="grid md:grid-cols-2 gap-10">
                    {Object.entries(CATEGORY_MAP).map(([cat, items]) => (
                        <div key={cat} className="bg-card border border-border p-8 rounded-[40px] shadow-sm group hover:shadow-xl transition-all duration-500">
                            <h3 className="text-primary uppercase text-[10px] font-bold tracking-[0.3em] mb-6 flex items-center gap-2">
                                <Sparkles size={14} /> {cat}
                            </h3>
                            <div className="grid grid-cols-2 gap-3">
                                {items.map(ing => {
                                    const isActive = cabinet.includes(ing);
                                    return (
                                        <button
                                            key={ing}
                                            onClick={() => toggleIngredient(ing)}
                                            className={`text-left p-4 rounded-2xl border transition-all text-xs flex items-center justify-between group/item ${isActive ? 'bg-primary border-primary text-primary-foreground shadow-lg scale-[1.02]' : 'bg-background border-border text-muted-foreground hover:border-primary/50'}`}
                                        >
                                            <span className="font-medium">{ing}</span>
                                            {isActive ? <Check size={14} /> : <Plus size={14} className="opacity-0 group-hover/item:opacity-100" />}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex flex-col items-center gap-6 mt-16 pt-12 border-t border-border">
                    <div className="flex items-center gap-3">
                        <span className={`w-3 h-3 rounded-full ${cabinet.length >= 3 ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-muted'}`} />
                        <p className="text-sm font-medium">{cabinet.length} ingredients selected</p>
                    </div>
                    {!session && (
                        <p className="text-[10px] text-amber-500 font-bold uppercase tracking-widest animate-pulse">
                           Note: Your bar is saved locally, but sign in to access it on any device.
                        </p>
                    )}
                    <button 
                        onClick={() => setIsStockingMode(false)}
                        className="px-10 py-5 bg-primary text-primary-foreground rounded-2xl font-bold uppercase tracking-widest text-sm shadow-xl shadow-primary/20 hover:scale-105 transition-all"
                    >
                        {session ? "Save Stock & Enter Mixer" : "Enter Mixer (Guest)"}
                    </button>
                    {!session && (
                        <button 
                            onClick={() => setShowAuth(true)}
                            className="text-muted-foreground hover:text-primary text-[10px] font-bold uppercase tracking-widest border-b border-transparent hover:border-primary transition-all"
                        >
                            Or Sign In to Perpetualize
                        </button>
                    )}
                </div>
              </div>
            ) : exactMatches.length === 0 && nearMisses.length === 0 && recommendations.length === 0 ? (
              <div className="py-20 text-center text-muted-foreground border border-dashed border-border rounded-[40px] bg-card shadow-inner">
                <p className="font-serif italic text-lg">No cocktails found containing any selected ingredients.</p>
              </div>
            ) : (
              <>
                {exactMatches.filter(d => !activeFlavor || (d.tags && d.tags.some((t: string) => t.toLowerCase().includes(activeFlavor.toLowerCase()))) || (d.category && d.category.toLowerCase().includes(activeFlavor.toLowerCase()))).length > 0 && (
                  <div>
                    <h3 className="text-primary uppercase text-xs font-bold tracking-widest mb-4 flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]"></span> Ready to Make
                    </h3>
                    <div className="grid md:grid-cols-2 gap-6">
                      {exactMatches
                        .filter(d => !activeFlavor || (d.tags && d.tags.some((t: string) => t.toLowerCase().includes(activeFlavor.toLowerCase()))) || (d.category && d.category.toLowerCase().includes(activeFlavor.toLowerCase())))
                        .map(renderDrinkCard)}
                    </div>
                  </div>
                )}

                {nearMisses.filter(d => !activeFlavor || (d.tags && d.tags.some((t: string) => t.toLowerCase().includes(activeFlavor.toLowerCase()))) || (d.category && d.category.toLowerCase().includes(activeFlavor.toLowerCase()))).length > 0 && (
                  <div>
                    <h3 className="text-primary uppercase text-[10px] font-bold tracking-[0.2em] mb-4 flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.4)] animate-pulse"></span> Near Misses
                    </h3>
                    <div className="grid md:grid-cols-2 gap-6">
                      {nearMisses
                        .filter(d => !activeFlavor || (d.tags && d.tags.some((t: string) => t.toLowerCase().includes(activeFlavor.toLowerCase()))) || (d.category && d.category.toLowerCase().includes(activeFlavor.toLowerCase())))
                        .map(renderDrinkCard)}
                    </div>
                  </div>
                )}

                {recommendations.filter(d => !activeFlavor || (d.tags && d.tags.some((t: string) => t.toLowerCase().includes(activeFlavor.toLowerCase()))) || (d.category && d.category.toLowerCase().includes(activeFlavor.toLowerCase()))).length > 0 && (
                  <div>
                    <h3 className="text-muted-foreground uppercase text-[10px] font-bold tracking-[0.2em] mb-4 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-muted shadow-inner"></span> Other Ideas
                    </h3>
                    <div className="grid md:grid-cols-2 gap-6 opacity-60 hover:opacity-100 transition-opacity">
                      {recommendations
                        .filter(d => !activeFlavor || (d.tags && d.tags.some((t: string) => t.toLowerCase().includes(activeFlavor.toLowerCase()))) || (d.category && d.category.toLowerCase().includes(activeFlavor.toLowerCase())))
                        .map(renderDrinkCard)}
                    </div>
                  </div>
                )}

                <div className="pt-20 border-t border-border">
                  <div className="flex justify-between items-end mb-8">
                    <div>
                      <h3 className="text-primary uppercase text-xs font-bold tracking-widest mb-2 flex items-center gap-2">
                        <Sparkles size={14} /> Global Discovery
                      </h3>
                      <h2 className="text-4xl font-serif text-foreground">Curated Classics</h2>
                      <p className="text-muted-foreground text-sm mt-2 max-w-md">Our hand-picked library of industry standards and modern icons, available regardless of your current cabinet.</p>
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {curated.map(renderDrinkCard)}
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function renderDrinkCard(drink: any) {
  return (
    <a href={`/drink/${drink.id}`} key={drink.id} className="group cursor-pointer">
      <div className="relative overflow-hidden rounded-3xl aspect-[4/5] bg-card border border-border shadow-sm group-hover:shadow-2xl group-hover:shadow-primary/10 transition-all duration-500">
        <img src={drink.image} className="w-full h-full object-cover grayscale group-hover:grayscale-0 scale-100 group-hover:scale-105 transition-all duration-700" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-60 group-hover:opacity-90 transition-opacity" />
        <div className="absolute bottom-0 w-full p-6">
          <h3 className="text-xl font-serif text-white group-hover:text-primary transition-colors">{drink.name}</h3>
          {drink.hasLore && <span className="text-primary text-[9px] uppercase font-bold tracking-widest flex items-center gap-1 mt-1"><Sparkles size={10} /> Premium Lore</span>}
        </div>
      </div>
    </a>
  );
}
