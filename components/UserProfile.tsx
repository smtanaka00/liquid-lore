import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ArrowLeft, User, Heart, PenTool, Sparkles, ShieldCheck, Trophy, Medal, Wine, Trash2 } from 'lucide-react';
import { useRouter } from 'next/router';
import { getCocktailDetail } from '../lib/cocktail-service';

export const UserProfile = ({ profileId }: { profileId?: string }) => {
    const router = useRouter();
    const [userProfile, setUserProfile] = useState<any>(null);
    const [favorites, setFavorites] = useState<any[]>([]);
    const [myRecipes, setMyRecipes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isOwnProfile, setIsOwnProfile] = useState(false);

    useEffect(() => {
        const checkUser = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            const targetId = profileId || session?.user?.id;
            
            if (!targetId) {
                // Handle guest user
                setIsOwnProfile(true);
                const localCabinet = localStorage.getItem('liquid-lore-cabinet');
                setUserProfile({
                    username: "Guest Mixologist",
                    cabinet: localCabinet ? JSON.parse(localCabinet) : [],
                    isGuest: true
                });
                setLoading(false);
                return;
            }

            setIsOwnProfile(session?.user?.id === targetId);
            
            // Fetch profile info
            const { data: profile } = await supabase.from('profiles').select('*').eq('id', targetId).single();
            setUserProfile(profile || { id: targetId }); // Fallback if no profile record yet
            
            loadProfileData(targetId);
        };
        
        checkUser();
    }, [profileId, router]);

    const loadProfileData = async (userId: string) => {
        // 1. Fetch created recipes
        const { data: recipes } = await supabase.from('custom_recipes').select('*').eq('creator_id', userId).order('created_at', { ascending: false });
        if (recipes) setMyRecipes(recipes);

        // 2. Fetch favorites IDs
        const { data: favs } = await supabase.from('favorites').select('drink_id').eq('user_id', userId);
        if (favs && favs.length > 0) {
            const detailedFavs = await Promise.all(favs.map(f => getCocktailDetail(f.drink_id)));
            setFavorites(detailedFavs.filter(Boolean));
        }
        setLoading(false);
    };

    const getExpertise = (recipeCount: number) => {
        if (recipeCount >= 10) return { label: 'Master Mixologist', icon: <Trophy size={16} className="text-amber-500" /> };
        if (recipeCount >= 3) return { label: 'Professional Barman', icon: <Medal size={16} className="text-zinc-400" /> };
        return { label: 'Enthusiast', icon: <ShieldCheck size={16} className="text-amber-600/50" /> };
    };

    const expertise = getExpertise(myRecipes.length);

    const removeIngredient = async (ing: string) => {
        if (!isOwnProfile || !userProfile) return;
        
        const newCabinet = (userProfile.cabinet || []).filter((i: string) => i !== ing);
        const { error } = await supabase.from('profiles').update({ cabinet: newCabinet }).eq('id', userProfile.id);
        
        if (!error) {
            setUserProfile({ ...userProfile, cabinet: newCabinet });
            // Update local storage if it's the current user
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user.id === userProfile.id) {
                localStorage.setItem('liquid-lore-cabinet', JSON.stringify(newCabinet));
            }
        }
    };

    if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-amber-500 animate-pulse font-serif text-xl">Loading Profile...</div>;

    return (
        <div className="min-h-screen bg-zinc-950 text-white p-6 pb-24">
            <header className="max-w-6xl mx-auto mb-16 pt-10 flex flex-col items-center text-center border-b border-zinc-800 pb-12">
                <button onClick={() => router.push('/')} className="self-start flex items-center gap-2 text-zinc-400 hover:text-amber-500 transition-colors uppercase text-xs font-bold tracking-widest mb-8">
                    <ArrowLeft size={16} /> Back to Cabinet
                </button>
                <div className="relative">
                    <div className="inline-flex items-center justify-center p-6 bg-zinc-900 rounded-full mb-6 border border-zinc-800 shadow-2xl relative overflow-hidden group">
                        <User size={48} className="text-amber-500 relative z-10" />
                        <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                </div>
                
                <h1 className="text-5xl md:text-6xl font-serif text-amber-500 mb-4 tracking-tighter">
                    {userProfile?.username || "Mixologist"}
                </h1>
                
                <div className="flex flex-col items-center gap-3 mb-6">
                    <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-4 py-2 rounded-full">
                        {expertise.icon}
                        <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-zinc-400">{expertise.label}</span>
                    </div>
                    {userProfile?.isGuest && (
                        <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full animate-pulse">
                            <ShieldCheck size={12} className="text-amber-500" />
                            <span className="text-[9px] uppercase font-bold tracking-widest text-amber-500">Local Guest Mode</span>
                        </div>
                    )}
                </div>

                {userProfile?.bio && <p className="text-zinc-400 max-w-lg italic font-serif leading-relaxed mb-4">"{userProfile.bio}"</p>}
                
                {isOwnProfile && !userProfile?.isGuest && (
                    <p className="text-zinc-600 text-[10px] font-mono tracking-widest uppercase mb-4 opacity-50">Private View • {userProfile?.id?.slice(0, 8)}</p>
                )}
                {userProfile?.isGuest && (
                    <p className="text-zinc-600 text-[10px] font-mono tracking-widest uppercase mb-4 opacity-50">Storage: Browser Local Cache</p>
                )}
            </header>

            <main className="max-w-6xl mx-auto space-y-24">
                <section>
                    <div className="flex items-end gap-3 mb-10">
                        <PenTool className="text-amber-500" size={28} />
                        <div>
                            <h2 className="text-3xl font-serif text-white leading-none">Signature Collection</h2>
                            <p className="text-[10px] uppercase text-zinc-500 font-bold tracking-[0.3em] mt-2">Recipes created by this artist</p>
                        </div>
                    </div>
                    
                    {myRecipes.length === 0 ? (
                        <div className="py-20 text-center text-zinc-600 border border-dashed border-zinc-800 rounded-[3rem] bg-zinc-900/20">
                            <Sparkles size={40} className="mx-auto mb-4 opacity-20" />
                            <p className="font-serif italic text-lg">No original compositions yet.</p>
                            {isOwnProfile && (
                                <button onClick={() => router.push('/studio')} className="mt-6 text-amber-500 hover:text-amber-400 text-xs font-bold uppercase tracking-widest border-b border-amber-500/50 pb-1">Enter the Studio</button>
                            )}
                        </div>
                    ) : (
                        <div className="grid md:grid-cols-3 gap-8">
                            {myRecipes.map((recipe) => (
                                <a href={`/custom-drink/${recipe.id}`} key={recipe.id} className="group cursor-pointer">
                                    <div className="relative overflow-hidden rounded-[2rem] aspect-[4/5] bg-zinc-900 border border-zinc-800 flex flex-col justify-end p-8 transition-transform hover:-translate-y-2 duration-500">
                                        <div className="absolute inset-0 bg-gradient-to-tr from-zinc-950 via-zinc-900/50 to-amber-900/10 grayscale group-hover:grayscale-0 transition-all duration-700" />
                                        <div className="relative z-10">
                                            <h3 className="text-2xl font-serif text-white mb-3 group-hover:text-amber-500 transition-colors">{recipe.name}</h3>
                                            <div className="flex items-center gap-2">
                                                <span className="text-amber-500 text-[9px] uppercase font-bold tracking-widest border border-amber-500/20 px-2.5 py-1 rounded-full bg-amber-500/5">Signature</span>
                                                {recipe.likes_count > 0 && (
                                                    <span className="text-zinc-500 text-[9px] uppercase font-bold py-1 flex items-center gap-1"><Heart size={8} fill="currentColor" /> {recipe.likes_count}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </a>
                            ))}
                        </div>
                    )}
                </section>

                <section>
                    <div className="flex items-end gap-3 mb-10">
                        <Wine className="text-amber-500" size={28} />
                        <div>
                            <h2 className="text-3xl font-serif text-white leading-none">Personal Cabinet</h2>
                            <p className="text-[10px] uppercase text-zinc-500 font-bold tracking-[0.3em] mt-2">The foundation of your mixology</p>
                        </div>
                    </div>
                    
                    {(!userProfile?.cabinet || userProfile.cabinet.length === 0) ? (
                        <div className="py-20 text-center text-zinc-600 border border-dashed border-zinc-800 rounded-[3rem] bg-zinc-900/20">
                            <p className="font-serif italic text-lg">Your cabinet is currently empty.</p>
                            {isOwnProfile && (
                                <button onClick={() => router.push('/')} className="mt-6 text-amber-500 hover:text-amber-400 text-xs font-bold uppercase tracking-widest border-b border-amber-500/50 pb-1">Stock your Bar</button>
                            )}
                        </div>
                    ) : (
                        <div className="bg-zinc-900/30 border border-zinc-800 p-8 rounded-[3rem]">
                            <div className="flex flex-wrap gap-3">
                                {userProfile.cabinet.map((ing: string) => (
                                    <div key={ing} className="group flex items-center gap-3 bg-zinc-900 border border-zinc-800 px-4 py-2.5 rounded-2xl hover:border-amber-500/50 transition-all">
                                        <span className="text-sm font-medium text-zinc-300">{ing}</span>
                                        {isOwnProfile && (
                                            <button 
                                                onClick={() => removeIngredient(ing)}
                                                className="text-zinc-600 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <div className="mt-8 pt-8 border-t border-zinc-800/50 flex justify-between items-center">
                                <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">{userProfile.cabinet.length} Essential Ingredients</p>
                                {isOwnProfile && (
                                    <button onClick={() => router.push('/')} className="text-amber-500 hover:text-amber-400 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
                                        Manage Inventory <ArrowLeft size={12} className="rotate-180" />
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </section>

                <section>
                    <div className="flex items-end gap-3 mb-10">
                        <Heart className="text-amber-500" size={28} />
                        <div>
                            <h2 className="text-3xl font-serif text-white leading-none">Curated Favorites</h2>
                            <p className="text-[10px] uppercase text-zinc-500 font-bold tracking-[0.3em] mt-2">Legendary classics & community gems</p>
                        </div>
                    </div>
                    
                    {favorites.length === 0 ? (
                        <div className="py-20 text-center text-zinc-600 border border-dashed border-zinc-800 rounded-[3rem] bg-zinc-900/20">
                            <p className="font-serif italic text-lg">The gallery is currently empty.</p>
                        </div>
                    ) : (
                        <div className="grid md:grid-cols-3 gap-8">
                            {favorites.map((drink: any) => (
                                <a href={`/drink/${drink.idDrink || drink.id}`} key={drink.idDrink || drink.id} className="group cursor-pointer">
                                    <div className="relative overflow-hidden rounded-[2rem] aspect-[4/5] bg-zinc-900 border border-zinc-800 transition-transform hover:-translate-y-2 duration-500">
                                        <img src={drink.strDrinkThumb || drink.image} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700 scale-100 group-hover:scale-110" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
                                        <div className="absolute bottom-0 w-full p-8">
                                            <h3 className="text-2xl font-serif text-white group-hover:text-amber-500 transition-colors uppercase tracking-tight">{drink.strDrink || drink.name}</h3>
                                            {drink.hasLore && <span className="text-amber-500 text-[9px] uppercase font-bold tracking-[0.3em] mt-2 block">✨ Premium Lore</span>}
                                        </div>
                                    </div>
                                </a>
                            ))}
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
};
