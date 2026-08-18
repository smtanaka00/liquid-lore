import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/router';

export default function Studio() {
    const router = useRouter();
    const [session, setSession] = useState<any>(null);

    const [name, setName] = useState('');
    const [story, setStory] = useState('');
    const [ingredients, setIngredients] = useState([{ name: '', measure: '' }]);
    const [instructions, setInstructions] = useState(['']);
    const [glass, setGlass] = useState('');
    const [garnish, setGarnish] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            if (!session) router.push('/'); // redirect if not logged in
        });
    }, [router]);

    if (!session) return <div className="min-h-screen bg-black" />;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');

        const recipe = {
            creator_id: session.user.id,
            name,
            story,
            ingredients: ingredients.filter(i => i.name.trim()),
            instructions: instructions.filter(i => i.trim()),
            glass,
            garnish
        };

        const { error } = await supabase.from('custom_recipes').insert(recipe);

        setLoading(false);
        if (error) {
            setMessage(error.message);
        } else {
            router.push('/lounge');
        }
    };

    return (
        <div className="min-h-screen bg-background text-foreground p-6 pb-24 transition-colors duration-300">
            <header className="max-w-3xl mx-auto mb-12 pt-6 flex justify-between items-center">
                <button onClick={() => router.push('/')} className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors uppercase text-[10px] font-bold tracking-widest transition-all">
                    <ArrowLeft size={14} /> Back to Cabinet
                </button>
                <h1 className="text-3xl font-serif text-primary">Creator Studio</h1>
            </header>

            <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-12">
                <section className="bg-card border border-border p-8 rounded-[40px] space-y-8 shadow-sm">
                    <h2 className="text-xl font-serif text-foreground border-b border-border pb-4 flex items-center gap-2">
                        <span className="w-2 h-6 bg-primary rounded-full" /> The Essentials
                    </h2>
                    <div className="space-y-6">
                        <div>
                            <label className="block text-[10px] uppercase text-primary font-bold tracking-[0.2em] mb-3">Drink Name</label>
                            <input required type="text" value={name} onChange={e => setName(e.target.value)} className="w-full bg-background border border-border rounded-2xl px-5 py-4 focus:ring-2 focus:ring-primary outline-none transition-all shadow-inner" placeholder="e.g. Midnight Mirage" />
                        </div>
                        <div>
                            <label className="block text-[10px] uppercase text-primary font-bold tracking-[0.2em] mb-3">The Lore (Story)</label>
                            <textarea value={story} onChange={e => setStory(e.target.value)} className="w-full bg-background border border-border rounded-2xl px-5 py-4 min-h-[120px] focus:ring-2 focus:ring-primary outline-none transition-all shadow-inner" placeholder="What inspired this drink? Describe the mood, the flavors, and the story..." />
                        </div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-8">
                        <div>
                            <label className="block text-[10px] uppercase text-primary font-bold tracking-[0.2em] mb-3">Glassware</label>
                            <select value={glass} onChange={e => setGlass(e.target.value)} className="w-full bg-background border border-border rounded-2xl px-5 py-4 focus:ring-2 focus:ring-primary outline-none transition-all shadow-inner text-foreground">
                                <option value="">Select Glass...</option>
                                <option value="Cocktail glass">Cocktail (Martini)</option>
                                <option value="Highball glass">Highball</option>
                                <option value="Old Fashioned glass">Old Fashioned (Rocks)</option>
                                <option value="Coupe glass">Coupe</option>
                                <option value="Champagne flute">Champagne Flute</option>
                                <option value="Collins glass">Collins</option>
                                <option value="Whiskey sour glass">Whiskey Sour</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] uppercase text-primary font-bold tracking-[0.2em] mb-3">Garnish</label>
                            <input type="text" value={garnish} onChange={e => setGarnish(e.target.value)} className="w-full bg-background border border-border rounded-2xl px-5 py-4 focus:ring-2 focus:ring-primary outline-none transition-all shadow-inner" placeholder="e.g. Lemon Twist" />
                        </div>
                    </div>
                </section>

                <section className="bg-card border border-border p-8 rounded-[40px] space-y-8 shadow-sm">
                    <div className="flex justify-between items-center border-b border-border pb-4">
                        <h2 className="text-xl font-serif text-foreground flex items-center gap-2">
                             <span className="w-2 h-6 bg-primary rounded-full" /> Ingredients
                        </h2>
                        <button type="button" onClick={() => setIngredients([...ingredients, { name: '', measure: '' }])} className="text-primary hover:scale-110 p-2 transition-transform"><Plus size={24} /></button>
                    </div>

                    <div className="space-y-4">
                        {ingredients.map((ing, i) => (
                            <div key={i} className="flex gap-4 items-start group">
                                <input required placeholder="Ingredient (e.g. Gin)" value={ing.name} onChange={e => { const newI = [...ingredients]; newI[i].name = e.target.value; setIngredients(newI); }} className="flex-1 bg-background border border-border rounded-2xl px-5 py-4 focus:ring-2 focus:ring-primary outline-none transition-all shadow-inner" />
                                <input required placeholder="Measure (e.g. 2 oz)" value={ing.measure} onChange={e => { const newI = [...ingredients]; newI[i].measure = e.target.value; setIngredients(newI); }} className="w-32 bg-background border border-border rounded-2xl px-5 py-4 focus:ring-2 focus:ring-primary outline-none transition-all shadow-inner" />
                                <button type="button" onClick={() => setIngredients(ingredients.filter((_, idx) => idx !== i))} className="p-4 text-muted-foreground hover:text-destructive hover:bg-muted rounded-2xl mt-0.5 transition-colors"><Trash2 size={20} /></button>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="bg-card border border-border p-8 rounded-[40px] space-y-8 shadow-sm">
                    <div className="flex justify-between items-center border-b border-border pb-4">
                        <h2 className="text-xl font-serif text-foreground flex items-center gap-2">
                             <span className="w-2 h-6 bg-primary rounded-full" /> Instructions
                        </h2>
                        <button type="button" onClick={() => setInstructions([...instructions, ''])} className="text-primary hover:scale-110 p-2 transition-transform"><Plus size={24} /></button>
                    </div>

                    <div className="space-y-6">
                        {instructions.map((inst, i) => (
                            <div key={i} className="flex gap-6 items-start">
                                <span className="w-10 h-14 flex-shrink-0 flex items-center justify-center font-serif text-muted-foreground-30 text-4xl italic">{i + 1}</span>
                                <textarea required placeholder="Mix, shake, stir..." value={inst} onChange={e => { const newI = [...instructions]; newI[i] = e.target.value; setInstructions(newI); }} className="flex-1 bg-background border border-border rounded-2xl px-5 py-4 min-h-[100px] focus:ring-2 focus:ring-primary outline-none transition-all shadow-inner" />
                                <button type="button" onClick={() => setInstructions(instructions.filter((_, idx) => idx !== i))} className="p-4 text-muted-foreground hover:text-destructive hover:bg-muted rounded-2xl mt-2 transition-colors"><Trash2 size={20} /></button>
                            </div>
                        ))}
                    </div>
                </section>

                {message && <div className="text-destructive text-center bg-destructive/10 py-4 rounded-2xl border border-destructive/20 font-bold uppercase text-[10px] tracking-widest">{message}</div>}

                <button disabled={loading} type="submit" className="w-full bg-primary text-primary-foreground font-bold py-6 rounded-3xl transition-all disabled:opacity-50 text-base uppercase tracking-[0.2em] shadow-xl shadow-primary/20 hover:scale-[1.01] active:scale-95">
                    {loading ? 'Publishing Lore...' : 'Publish to Lounge'}
                </button>
            </form>
        </div>
    );
}
