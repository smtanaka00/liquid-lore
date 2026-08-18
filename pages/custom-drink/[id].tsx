import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { ChevronLeft, Play, Share2, QrCode, Sparkles } from 'lucide-react';
import { QRShare } from '../../components/QRShare';
import { GlassIcon } from '../../components/GlassIcon';

export default function CustomDrinkDetail() {
    const router = useRouter();
    const { id } = router.query;
    const [drink, setDrink] = useState<any>(null);
    const [isQROpen, setIsQROpen] = useState(false);
    const [currentUrl, setCurrentUrl] = useState('');

    useEffect(() => {
        setCurrentUrl(window.location.href);
    }, []);

    useEffect(() => {
        if (id) {
            supabase
                .from('custom_recipes')
                .select('*')
                .eq('id', id)
                .single()
                .then(({ data }) => {
                    if (data) setDrink(data);
                });
        }
    }, [id]);

    const handleShare = () => {
        if (navigator.share) {
            navigator.share({
                title: drink.name,
                text: `Check out this custom recipe for ${drink.name} on Liquid Lore!`,
                url: window.location.href,
            }).catch(console.error);
        } else {
            navigator.clipboard.writeText(window.location.href);
            alert('Link copied to clipboard!');
        }
    };

    if (!drink) return <div className="bg-black min-h-screen" />;

    return (
        <div className="min-h-screen bg-zinc-950 text-white pb-20">
            <div className="relative h-[40vh] bg-zinc-900 flex items-center justify-center">
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-900/50 to-transparent" />
                <span className="text-zinc-800 text-9xl font-serif italic absolute opacity-50">#</span>
                <button onClick={() => router.back()} className="absolute top-8 left-8 p-3 bg-black/50 rounded-full z-20 hover:bg-black transition-colors"><ChevronLeft /></button>
            </div>

            <div className="max-w-4xl mx-auto px-6 -mt-20 relative z-10">
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <div className="flex items-center gap-3 mb-4">
                            <span className="bg-amber-500/10 text-amber-500 px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase border border-amber-500/20">Community Recipe</span>
                            {drink.glass && (
                                <span className="bg-zinc-900 border border-zinc-800 text-zinc-400 px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase flex items-center gap-1.5">
                                    <GlassIcon name={drink.glass} size={12} className="text-amber-500" /> {drink.glass}
                                </span>
                            )}
                            {drink.garnish && (
                                <span className="bg-amber-500/10 text-amber-500 px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase border border-amber-500/20 flex items-center gap-1.5">
                                    <Sparkles size={12} /> {drink.garnish}
                                </span>
                            )}
                        </div>
                        <h1 className="text-6xl md:text-7xl font-serif text-amber-500 pr-4 leading-tight">{drink.name}</h1>
                    </div>
                    <div className="flex gap-2 flex-shrink-0 mt-4">
                        <button onClick={() => setIsQROpen(true)} className="p-4 bg-zinc-900 border border-zinc-800 rounded-full text-zinc-400 hover:text-amber-500 transition-colors">
                            <QrCode size={24} />
                        </button>
                        <button onClick={handleShare} className="p-4 bg-zinc-900 border border-zinc-800 rounded-full text-zinc-400 hover:text-amber-500 transition-colors">
                            <Share2 size={24} />
                        </button>
                    </div>
                </div>
                {drink.story && <p className="text-xl text-zinc-400 italic font-serif leading-relaxed mb-12 border-l-2 border-zinc-800 pl-6">"{drink.story}"</p>}

                <div className="grid md:grid-cols-[1fr_2fr] gap-12 border-t border-zinc-800 pt-12 mt-12">
                    <div>
                        <h3 className="text-amber-500 uppercase text-xs font-bold tracking-widest mb-6 border-b border-zinc-800 pb-4">Ingredients</h3>
                        <ul className="space-y-4">
                            {drink.ingredients.map((ing: any, i: number) => (
                                <li key={i} className="flex justify-between text-sm border-b border-zinc-900 pb-3">
                                    <span className="text-zinc-300">{ing.name}</span>
                                    <span className="text-amber-600 font-mono text-right">{ing.measure}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div>
                        <h3 className="text-amber-500 uppercase text-xs font-bold tracking-widest mb-6 border-b border-zinc-800 pb-4">Instructions</h3>
                        <div className="space-y-8">
                            {drink.instructions.map((step: string, i: number) => (
                                <div key={i} className="flex gap-6">
                                    <span className="text-4xl font-serif text-zinc-800 italic">{i + 1}</span>
                                    <p className="text-lg text-zinc-300 pt-1 leading-relaxed">{step}</p>
                                </div>
                            ))}
                        </div>
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
