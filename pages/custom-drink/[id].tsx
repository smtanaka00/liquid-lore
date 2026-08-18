/**
 * pages/custom-drink/[id].tsx
 *
 * Detail view for a community recipe published through the Creator Studio.
 * Distinct from `/drink/[id]` because custom recipes live in Supabase (`custom_recipes`)
 * rather than the curated library, and have no photography or historical lore.
 */

import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase/client';
import { ChevronLeft, Share2, QrCode, Sparkles } from 'lucide-react';
import { QRShare } from '../../components/QRShare';
import { GlassIcon } from '../../components/GlassIcon';

export default function CustomDrinkDetail() {
    const router = useRouter();
    const { id } = router.query;
    const [drink, setDrink] = useState<any>(null);
    const [notFound, setNotFound] = useState(false);
    const [isQROpen, setIsQROpen] = useState(false);
    const [currentUrl, setCurrentUrl] = useState('');

    useEffect(() => {
        setCurrentUrl(window.location.href);
    }, []);

    useEffect(() => {
        if (!id) return;
        supabase
            .from('custom_recipes')
            .select('*')
            .eq('id', id)
            .single()
            .then(({ data, error }) => {
                if (error || !data) setNotFound(true);
                else setDrink(data);
            });
    }, [id]);

    const handleShare = () => {
        if (navigator.share) {
            navigator.share({
                title: drink.name,
                text: `Check out this custom recipe for ${drink.name} on Liquid Lore!`,
                url: window.location.href,
            }).catch(() => { /* user dismissed the share sheet — not an error */ });
        } else {
            navigator.clipboard.writeText(window.location.href);
        }
    };

    if (notFound) {
        return (
            <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center gap-6 p-6 text-center">
                <h1 className="text-4xl font-serif text-primary">Recipe not found</h1>
                <p className="text-muted-foreground max-w-sm">
                    This creation may have been removed by its author, or the link is incomplete.
                </p>
                <button
                    onClick={() => router.push('/lounge')}
                    className="px-6 py-3 bg-primary text-primary-foreground font-bold rounded-xl uppercase tracking-widest text-xs hover:scale-105 transition-transform"
                >
                    Back to the Lounge
                </button>
            </div>
        );
    }

    if (!drink) return <div className="bg-background min-h-screen" />;

    // Studio guarantees these, but a hand-edited row shouldn't crash the page.
    const ingredients: any[] = Array.isArray(drink.ingredients) ? drink.ingredients : [];
    const instructions: string[] = Array.isArray(drink.instructions) ? drink.instructions : [];

    return (
        <div className="min-h-screen bg-background text-foreground pb-20 transition-colors duration-300">
            <div className="relative h-[40vh] bg-card flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
                <span className="text-muted-foreground/10 text-9xl font-serif italic absolute select-none">#</span>
                <button
                    onClick={() => router.back()}
                    aria-label="Go back"
                    className="absolute top-8 left-8 p-3 bg-card border border-border rounded-full z-20 hover:text-primary transition-colors shadow-xl"
                >
                    <ChevronLeft />
                </button>
            </div>

            <div className="max-w-4xl mx-auto px-6 -mt-20 relative z-10">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-4">
                    <div>
                        <div className="flex flex-wrap items-center gap-3 mb-4">
                            <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase border border-primary/20">
                                Community Recipe
                            </span>
                            {drink.glass && (
                                <span className="bg-card border border-border text-muted-foreground px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase flex items-center gap-1.5">
                                    <GlassIcon name={drink.glass} size={12} className="text-primary" /> {drink.glass}
                                </span>
                            )}
                            {drink.garnish && (
                                <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase border border-primary/20 flex items-center gap-1.5">
                                    <Sparkles size={12} /> {drink.garnish}
                                </span>
                            )}
                        </div>
                        <h1 className="text-6xl md:text-7xl font-serif text-primary pr-4 leading-tight">{drink.name}</h1>
                    </div>
                    <div className="flex gap-2 flex-shrink-0 mt-4">
                        <button
                            onClick={() => setIsQROpen(true)}
                            aria-label="Show QR code"
                            className="p-4 bg-card border border-border rounded-full text-muted-foreground hover:text-primary transition-colors shadow-lg"
                        >
                            <QrCode size={24} />
                        </button>
                        <button
                            onClick={handleShare}
                            aria-label="Share recipe"
                            className="p-4 bg-card border border-border rounded-full text-muted-foreground hover:text-primary transition-colors shadow-lg"
                        >
                            <Share2 size={24} />
                        </button>
                    </div>
                </div>

                {drink.story && (
                    <p className="text-xl text-muted-foreground italic font-serif leading-relaxed mb-12 border-l-2 border-primary/20 pl-6">
                        &ldquo;{drink.story}&rdquo;
                    </p>
                )}

                <div className="grid md:grid-cols-[1fr_2fr] gap-12 border-t border-border pt-12 mt-12">
                    <div>
                        <h2 className="text-primary uppercase text-xs font-bold tracking-widest mb-6 border-b border-border pb-4">Ingredients</h2>
                        <ul className="space-y-4">
                            {ingredients.map((ing: any, i: number) => (
                                <li key={i} className="flex justify-between gap-4 text-sm border-b border-border/40 pb-3">
                                    <span className="text-foreground">{ing.name}</span>
                                    <span className="text-primary font-mono text-right font-bold">{ing.measure}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div>
                        <h2 className="text-primary uppercase text-xs font-bold tracking-widest mb-6 border-b border-border pb-4">Instructions</h2>
                        <div className="space-y-8">
                            {instructions.map((step: string, i: number) => (
                                <div key={i} className="flex gap-6">
                                    <span className="text-4xl font-serif text-muted-foreground/30 italic">{i + 1}</span>
                                    <p className="text-lg text-foreground pt-1 leading-relaxed">{step}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {isQROpen && (
                <QRShare
                    url={currentUrl}
                    name={drink.name}
                    onClose={() => setIsQROpen(false)}
                />
            )}
        </div>
    );
}
