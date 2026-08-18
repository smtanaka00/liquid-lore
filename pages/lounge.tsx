import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Users, Heart, BookmarkPlus, User } from 'lucide-react';
import { useRouter } from 'next/router';

export default function Lounge() {
    const router = useRouter();
    const [recipes, setRecipes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [session, setSession] = useState<any>(null);
    const [likedRecipes, setLikedRecipes] = useState<string[]>([]);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            if (session) {
                supabase.from('recipe_likes').select('recipe_id').eq('user_id', session.user.id).then(({ data }) => {
                    if (data) setLikedRecipes(data.map(d => d.recipe_id));
                });
            }
        });

        supabase
            .from('custom_recipes')
            .select('*')
            .order('created_at', { ascending: false })
            .then(({ data }) => {
                if (data) setRecipes(data);
                setLoading(false);
            });
    }, []);

    const toggleLike = async (e: React.MouseEvent, recipeId: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (!session) return alert('Please log in to like recipes');

        const isLiked = likedRecipes.includes(recipeId);
        if (isLiked) {
            setLikedRecipes(prev => prev.filter(id => id !== recipeId));
            setRecipes(prev => prev.map(r => r.id === recipeId ? { ...r, likes_count: (r.likes_count || 1) - 1 } : r));
            await supabase.from('recipe_likes').delete().eq('user_id', session.user.id).eq('recipe_id', recipeId);
        } else {
            setLikedRecipes(prev => [...prev, recipeId]);
            setRecipes(prev => prev.map(r => r.id === recipeId ? { ...r, likes_count: (r.likes_count || 0) + 1 } : r));
            await supabase.from('recipe_likes').insert({ user_id: session.user.id, recipe_id: recipeId });
        }
        
        // Update the count in the main table
        const { data: updatedRecipe } = await supabase.from('custom_recipes').select('likes_count').eq('id', recipeId).single();
        const currentCount = updatedRecipe?.likes_count || 0;
        await supabase.from('custom_recipes').update({ likes_count: isLiked ? currentCount - 1 : currentCount + 1 }).eq('id', recipeId);
    };

    const saveToFavorites = async (e: React.MouseEvent, recipeId: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (!session) return alert('Please log in to save favorites');
        
        const { error } = await supabase.from('favorites').insert({ user_id: session.user.id, drink_id: recipeId });
        if (error) {
            if (error.code === '23505') alert('Already in your favorites!');
            else alert(error.message);
        } else {
            alert('Saved to favorites!');
        }
    };

    return (
        <div className="min-h-screen bg-background text-foreground p-6 pb-24 transition-colors duration-300">
            <header className="max-w-6xl mx-auto mb-16 pt-10 flex flex-col items-center text-center">
                <button onClick={() => router.push('/')} className="self-start flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors uppercase text-xs font-bold tracking-widest mb-8">
                    <ArrowLeft size={16} /> Back to Cabinet
                </button>
                <div className="inline-flex items-center justify-center p-4 bg-muted rounded-full mb-6 text-primary shadow-inner">
                    <Users size={32} />
                </div>
                <h1 className="text-5xl md:text-6xl font-serif text-primary tracking-tighter mb-4">The Lounge</h1>
                <p className="text-muted-foreground uppercase tracking-[0.3em] text-[10px] font-bold max-w-xl">Community Creations from around the world</p>
            </header>

            <main className="max-w-6xl mx-auto">
                {loading ? (
                    <div className="text-center py-20 text-primary animate-pulse flex items-center justify-center gap-3">
                        <Users size={20} /> Loading the feed...
                    </div>
                ) : recipes.length === 0 ? (
                    <div className="text-center py-20 bg-card border border-border rounded-3xl shadow-sm">
                        <h3 className="text-xl font-serif text-foreground mb-2">It's quiet in here</h3>
                        <p className="text-muted-foreground mb-6">Be the first to create a custom drink in the Studio.</p>
                        <button onClick={() => router.push('/studio')} className="px-6 py-3 bg-primary text-primary-foreground font-bold rounded-xl hover:scale-105 transition-all shadow-lg hover:shadow-primary/20">
                            Go to Creator Studio
                        </button>
                    </div>
                ) : (
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {recipes.map((recipe) => (
                            <div key={recipe.id} className="relative group">
                                <a href={`/custom-drink/${recipe.id}`} className="block">
                                    <div className="relative overflow-hidden rounded-3xl aspect-[4/5] bg-card border border-border flex flex-col justify-end p-8 transition-all duration-500 hover:border-primary/30 shadow-sm hover:shadow-2xl hover:shadow-primary/5">
                                        <div className="absolute inset-0 bg-gradient-to-tr from-black via-zinc-900/50 to-amber-900/10 grayscale group-hover:grayscale-0 transition-all duration-700 opacity-60" />
                                        <div className="relative z-10">
                                            <h3 className="text-3xl font-serif text-white mb-3 group-hover:text-primary transition-colors leading-tight">{recipe.name}</h3>
                                            <p className="text-zinc-400 text-sm line-clamp-2 italic font-serif mb-6 opacity-0 group-hover:opacity-100 transition-opacity duration-500">"{recipe.story}"</p>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-primary text-[9px] uppercase font-bold tracking-widest border border-primary/20 px-2.5 py-1 rounded-full bg-primary/5">Community</span>
                                                    <div className="flex items-center gap-2 text-zinc-400 group-hover:text-primary transition-colors">
                                                        <Heart size={12} fill={likedRecipes.includes(recipe.id) ? 'currentColor' : 'none'} className={likedRecipes.includes(recipe.id) ? 'text-primary' : ''} />
                                                        <span className="text-[10px] font-bold">{recipe.likes_count || 0}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </a>
                                
                                <div className="absolute top-6 right-6 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                                    <button 
                                        onClick={(e) => toggleLike(e, recipe.id)}
                                        className={`p-3 rounded-full border backdrop-blur-md transition-all ${likedRecipes.includes(recipe.id) ? 'bg-primary border-primary/40 text-black shadow-lg shadow-primary/20' : 'bg-black/60 border-white/10 text-zinc-400 hover:text-primary shadow-xl'}`}
                                    >
                                        <Heart size={18} fill={likedRecipes.includes(recipe.id) ? 'currentColor' : 'none'} />
                                    </button>
                                    <button 
                                        onClick={(e) => saveToFavorites(e, recipe.id)}
                                        className="p-3 rounded-full bg-black/60 border border-white/10 text-zinc-400 hover:text-primary backdrop-blur-md shadow-xl transition-all"
                                    >
                                        <BookmarkPlus size={18} />
                                    </button>
                                    <button 
                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/profile/${recipe.creator_id}`); }}
                                        className="p-3 rounded-full bg-black/60 border border-white/10 text-zinc-400 hover:text-primary backdrop-blur-md shadow-xl transition-all"
                                    >
                                        <User size={18} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
