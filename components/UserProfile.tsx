/**
 * UserProfile.tsx
 *
 * The profile surface, used for both the signed-in user's own page (`/profile`) and
 * another mixologist's public page (`/profile/[id]`). `profileId` decides which:
 * absent means "me", present means "them", and ownership gates the edit affordances.
 *
 * Guests have no row in `profiles`, so their cabinet is read from localStorage and the
 * page renders in a clearly-labelled local-only mode rather than erroring.
 */

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase/client';
import { ArrowLeft, User, Heart, PenTool, Sparkles, ShieldCheck, Trophy, Medal, Wine, Trash2 } from 'lucide-react';
import { useRouter } from 'next/router';
import Link from 'next/link';
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
                // Guest: no auth row exists, so the cabinet lives only in this browser.
                setIsOwnProfile(true);
                const localCabinet = localStorage.getItem('liquid-lore-cabinet');
                setUserProfile({
                    username: 'Guest Mixologist',
                    cabinet: localCabinet ? JSON.parse(localCabinet) : [],
                    isGuest: true
                });
                setLoading(false);
                return;
            }

            setIsOwnProfile(session?.user?.id === targetId);

            const { data: profile } = await supabase.from('profiles').select('*').eq('id', targetId).single();
            setUserProfile(profile || { id: targetId }); // a user can exist before their profile row does

            loadProfileData(targetId);
        };

        checkUser();
    }, [profileId, router]);

    const loadProfileData = async (userId: string) => {
        const { data: recipes } = await supabase
            .from('custom_recipes')
            .select('*')
            .eq('creator_id', userId)
            .order('created_at', { ascending: false });
        if (recipes) setMyRecipes(recipes);

        const { data: favs } = await supabase.from('favorites').select('drink_id').eq('user_id', userId);
        if (favs && favs.length > 0) {
            const detailedFavs = await Promise.all(favs.map(f => getCocktailDetail(f.drink_id)));
            setFavorites(detailedFavs.filter(Boolean));
        }
        setLoading(false);
    };

    const getExpertise = (recipeCount: number) => {
        if (recipeCount >= 10) return { label: 'Master Mixologist', icon: <Trophy size={16} className="text-primary" /> };
        if (recipeCount >= 3) return { label: 'Professional Barman', icon: <Medal size={16} className="text-muted-foreground" /> };
        return { label: 'Enthusiast', icon: <ShieldCheck size={16} className="text-primary/50" /> };
    };

    const expertise = getExpertise(myRecipes.length);

    const removeIngredient = async (ing: string) => {
        if (!isOwnProfile || !userProfile) return;

        const newCabinet = (userProfile.cabinet || []).filter((i: string) => i !== ing);

        // Guests have no profile row to update — persist locally and stop there.
        if (userProfile.isGuest) {
            localStorage.setItem('liquid-lore-cabinet', JSON.stringify(newCabinet));
            setUserProfile({ ...userProfile, cabinet: newCabinet });
            return;
        }

        const { error } = await supabase.from('profiles').update({ cabinet: newCabinet }).eq('id', userProfile.id);
        if (!error) {
            setUserProfile({ ...userProfile, cabinet: newCabinet });
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user.id === userProfile.id) {
                localStorage.setItem('liquid-lore-cabinet', JSON.stringify(newCabinet));
            }
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center text-primary animate-pulse font-serif text-xl">
                Loading Profile…
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background text-foreground p-6 pb-24 transition-colors duration-300">
            <header className="max-w-6xl mx-auto mb-16 pt-10 flex flex-col items-center text-center border-b border-border pb-12">
                <Link href="/" className="self-start flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors uppercase text-xs font-bold tracking-widest mb-8">
                    <ArrowLeft size={16} /> Back to Cabinet
                </Link>
                <div className="relative">
                    <div className="inline-flex items-center justify-center p-6 bg-card rounded-full mb-6 border border-border shadow-2xl relative overflow-hidden group">
                        <User size={48} className="text-primary relative z-10" />
                        <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                </div>

                <h1 className="text-5xl md:text-6xl font-serif text-primary mb-4 tracking-tighter">
                    {userProfile?.username || 'Mixologist'}
                </h1>

                <div className="flex flex-col items-center gap-3 mb-6">
                    <div className="flex items-center gap-2 bg-card border border-border px-4 py-2 rounded-full">
                        {expertise.icon}
                        <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-muted-foreground">{expertise.label}</span>
                    </div>
                    {userProfile?.isGuest && (
                        <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 px-3 py-1 rounded-full">
                            <ShieldCheck size={12} className="text-primary" />
                            <span className="text-[9px] uppercase font-bold tracking-widest text-primary">Local Guest Mode</span>
                        </div>
                    )}
                </div>

                {userProfile?.bio && (
                    <p className="text-muted-foreground max-w-lg italic font-serif leading-relaxed mb-4">
                        &ldquo;{userProfile.bio}&rdquo;
                    </p>
                )}

                {isOwnProfile && !userProfile?.isGuest && (
                    <p className="text-muted-foreground/60 text-[10px] font-mono tracking-widest uppercase mb-4">
                        Private View • {userProfile?.id?.slice(0, 8)}
                    </p>
                )}
                {userProfile?.isGuest && (
                    <p className="text-muted-foreground/60 text-[10px] font-mono tracking-widest uppercase mb-4">
                        Storage: Browser Local Cache
                    </p>
                )}
            </header>

            <main className="max-w-6xl mx-auto space-y-24">
                <section>
                    <div className="flex items-end gap-3 mb-10">
                        <PenTool className="text-primary" size={28} />
                        <div>
                            <h2 className="text-3xl font-serif text-foreground leading-none">Signature Collection</h2>
                            <p className="text-[10px] uppercase text-muted-foreground font-bold tracking-[0.3em] mt-2">Recipes created by this artist</p>
                        </div>
                    </div>

                    {myRecipes.length === 0 ? (
                        <div className="py-20 text-center text-muted-foreground border border-dashed border-border rounded-[3rem] bg-card/40">
                            <Sparkles size={40} className="mx-auto mb-4 opacity-20" />
                            <p className="font-serif italic text-lg">No original compositions yet.</p>
                            {isOwnProfile && (
                                <Link href="/studio" className="mt-6 inline-block text-primary hover:text-primary/80 text-xs font-bold uppercase tracking-widest border-b border-primary/50 pb-1">
                                    Enter the Studio
                                </Link>
                            )}
                        </div>
                    ) : (
                        <div className="grid md:grid-cols-3 gap-8">
                            {myRecipes.map((recipe) => (
                                <Link href={`/custom-drink/${recipe.id}`} key={recipe.id} className="group cursor-pointer">
                                    {/* Signature tiles stay dark in both themes — they are artwork, not chrome. */}
                                    <div className="relative overflow-hidden rounded-[2rem] aspect-[4/5] bg-zinc-900 border border-border flex flex-col justify-end p-8 transition-transform hover:-translate-y-2 duration-500">
                                        <div className="absolute inset-0 bg-gradient-to-tr from-zinc-950 via-zinc-900/50 to-amber-900/20 grayscale group-hover:grayscale-0 transition-all duration-700" />
                                        <div className="relative z-10">
                                            <h3 className="text-2xl font-serif text-white mb-3 group-hover:text-primary transition-colors">{recipe.name}</h3>
                                            <div className="flex items-center gap-2">
                                                <span className="text-primary text-[9px] uppercase font-bold tracking-widest border border-primary/20 px-2.5 py-1 rounded-full bg-primary/10">Signature</span>
                                                {recipe.likes_count > 0 && (
                                                    <span className="text-zinc-400 text-[9px] uppercase font-bold py-1 flex items-center gap-1">
                                                        <Heart size={8} fill="currentColor" /> {recipe.likes_count}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </section>

                <section>
                    <div className="flex items-end gap-3 mb-10">
                        <Wine className="text-primary" size={28} />
                        <div>
                            <h2 className="text-3xl font-serif text-foreground leading-none">Personal Cabinet</h2>
                            <p className="text-[10px] uppercase text-muted-foreground font-bold tracking-[0.3em] mt-2">The foundation of your mixology</p>
                        </div>
                    </div>

                    {(!userProfile?.cabinet || userProfile.cabinet.length === 0) ? (
                        <div className="py-20 text-center text-muted-foreground border border-dashed border-border rounded-[3rem] bg-card/40">
                            <p className="font-serif italic text-lg">Your cabinet is currently empty.</p>
                            {isOwnProfile && (
                                <Link href="/" className="mt-6 inline-block text-primary hover:text-primary/80 text-xs font-bold uppercase tracking-widest border-b border-primary/50 pb-1">
                                    Stock your Bar
                                </Link>
                            )}
                        </div>
                    ) : (
                        <div className="bg-card/60 border border-border p-8 rounded-[3rem]">
                            <div className="flex flex-wrap gap-3">
                                {userProfile.cabinet.map((ing: string) => (
                                    <div key={ing} className="group flex items-center gap-3 bg-card border border-border px-4 py-2.5 rounded-2xl hover:border-primary/50 transition-all">
                                        <span className="text-sm font-medium text-foreground">{ing}</span>
                                        {isOwnProfile && (
                                            <button
                                                onClick={() => removeIngredient(ing)}
                                                aria-label={`Remove ${ing} from cabinet`}
                                                className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <div className="mt-8 pt-8 border-t border-border flex justify-between items-center">
                                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                                    {userProfile.cabinet.length} Essential Ingredients
                                </p>
                                {isOwnProfile && (
                                    <Link href="/" className="text-primary hover:text-primary/80 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
                                        Manage Inventory <ArrowLeft size={12} className="rotate-180" />
                                    </Link>
                                )}
                            </div>
                        </div>
                    )}
                </section>

                <section>
                    <div className="flex items-end gap-3 mb-10">
                        <Heart className="text-primary" size={28} />
                        <div>
                            <h2 className="text-3xl font-serif text-foreground leading-none">Curated Favorites</h2>
                            <p className="text-[10px] uppercase text-muted-foreground font-bold tracking-[0.3em] mt-2">Legendary classics &amp; community gems</p>
                        </div>
                    </div>

                    {favorites.length === 0 ? (
                        <div className="py-20 text-center text-muted-foreground border border-dashed border-border rounded-[3rem] bg-card/40">
                            <p className="font-serif italic text-lg">The gallery is currently empty.</p>
                        </div>
                    ) : (
                        <div className="grid md:grid-cols-3 gap-8">
                            {favorites.map((drink: any) => (
                                <Link href={`/drink/${drink.id}`} key={drink.id} className="group cursor-pointer">
                                    <div className="relative overflow-hidden rounded-[2rem] aspect-[4/5] bg-card border border-border transition-transform hover:-translate-y-2 duration-500">
                                        <img
                                            src={drink.image}
                                            alt={drink.name}
                                            loading="lazy"
                                            className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700 scale-100 group-hover:scale-110"
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
                                        <div className="absolute bottom-0 w-full p-8">
                                            <h3 className="text-2xl font-serif text-white group-hover:text-primary transition-colors tracking-tight">{drink.name}</h3>
                                            {drink.hasLore && (
                                                <span className="text-primary text-[9px] uppercase font-bold tracking-[0.3em] mt-2 block">✨ Premium Lore</span>
                                            )}
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
};
