import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { getCocktailDetail } from '../../lib/cocktail-service';
import { ChevronLeft, Play, Heart, BookmarkPlus, Share2, Sparkles, QrCode, Star, Sun, Moon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { QRShare } from '../../components/QRShare';
import { GlassIcon } from '../../components/GlassIcon';
import { supabase } from '../../lib/supabase';

export default function DrinkDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [drink, setDrink] = useState<any>(null);
  const [isMixingMode, setIsMixingMode] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [unit, setUnit] = useState<'oz' | 'ml' | 'parts'>('oz');
  const [session, setSession] = useState<any>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [notes, setNotes] = useState<any[]>([]);
  const [isQROpen, setIsQROpen] = useState(false);
  const [currentUrl, setCurrentUrl] = useState('');
  const [newNote, setNewNote] = useState('');
  const [rating, setRating] = useState(0);
  const [twists, setTwists] = useState('');
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setCurrentUrl(window.location.href);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session && id) {
        supabase.from('favorites').select('*').eq('user_id', session.user.id).eq('drink_id', id).single().then(({ data }) => {
          if (data) setIsFavorite(true);
        });
        supabase.from('tasting_notes').select('*').eq('user_id', session.user.id).eq('drink_id', id).order('created_at', { ascending: false }).then(({ data }) => {
          if (data) setNotes(data);
        });
      }
    });
    if (id) getCocktailDetail(id as string).then(setDrink);
  }, [id]);

  const toggleFavorite = async () => {
    if (!session) return alert('Please log in to save favorites');
    if (isFavorite) {
      setIsFavorite(false);
      await supabase.from('favorites').delete().eq('user_id', session.user.id).eq('drink_id', id);
    } else {
      setIsFavorite(true);
      await supabase.from('favorites').insert({ user_id: session.user.id, drink_id: id });
    }
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: drink.name,
        text: `Check out this recipe for ${drink.name} on Liquid Lore!`,
        url: window.location.href,
      }).catch(console.error);
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert('Link copied to clipboard!');
    }
  };

  const submitNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return alert('Please log in to add notes');
    if (!newNote.trim() && !twists.trim() && rating === 0) return;
    
    const noteObj = { 
        user_id: session.user.id, 
        drink_id: id, 
        note: newNote,
        rating: rating,
        twists: twists
    };
    
    const { data, error } = await supabase.from('tasting_notes').insert(noteObj).select().single();
    
    if (error) {
        console.error('Error saving note:', error);
        alert('Failed to save note. Please ensure migrations are applied.');
    } else if (data) {
      setNotes([data, ...notes]);
      setNewNote('');
      setRating(0);
      setTwists('');
    }
  };

  if (!drink) return <div className="bg-background min-h-screen" />;

  const formatMeasure = (measure: string) => {
    if (!measure) return measure;
    if (unit === 'parts') {
        const matchOz = measure.match(/([\d\s\/\.]+)\s*oz/i);
        if (matchOz) return measure.replace(/([\d\s\/\.]+)\s*oz/i, `${matchOz[1].trim()} parts`);
        return measure;
    }
    if (unit === 'oz') return measure;
    const matchOz = measure.match(/([\d\s\/\.]+)\s*oz/i);
    if (matchOz) {
      const valStr = matchOz[1].trim();
      try {
        let val = 0;
        const parts = valStr.split(' ');
        for (const p of parts) {
          if (p.includes('/')) {
            const [num, den] = p.split('/');
            val += parseFloat(num) / parseFloat(den);
          } else {
            val += parseFloat(p);
          }
        }
        return measure.replace(/([\d\s\/\.]+)\s*oz/i, `${Math.round(val * 30)} ml`);
      } catch (e) {
        return measure;
      }
    }
    return measure;
  };

  if (isMixingMode) {
    return (
      <div className="min-h-screen bg-background text-foreground p-6 flex flex-col justify-between transition-colors duration-300">
        <div className="flex justify-between items-center mb-8">
          <button onClick={() => setIsMixingMode(false)} className="text-muted-foreground font-bold uppercase tracking-widest text-[10px] hover:text-primary transition-colors">Exit</button>
          <span className="text-primary font-serif text-2xl">{drink.name}</span>
          <span className="text-muted-foreground font-bold uppercase tracking-widest text-[10px]">Step {currentStep + 1} / {drink.instructions.length}</span>
        </div>

        <div className="flex-1 flex flex-col justify-center items-center text-center max-w-2xl mx-auto px-4 min-h-[50vh]">
          <h2 className="text-primary text-[10px] font-bold tracking-[0.4em] uppercase mb-12 flex items-center gap-2">
            <Sparkles size={14} /> Instructions
          </h2>
          <p className="text-4xl md:text-6xl font-serif leading-tight text-foreground">{drink.instructions[currentStep]}</p>
          
          <div className="mt-20 w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div 
                className="h-full bg-primary transition-all duration-500" 
                style={{ width: `${((currentStep + 1) / drink.instructions.length) * 100}%` }} 
            />
          </div>
        </div>

        <div className="flex justify-between gap-6 max-w-4xl mx-auto w-full mt-12 pb-10">
          <button
            disabled={currentStep === 0}
            onClick={() => setCurrentStep(prev => prev - 1)}
            className="flex-1 py-6 rounded-3xl border border-border text-muted-foreground font-bold uppercase tracking-widest text-xs disabled:opacity-20 transition-all hover:bg-muted"
          >
            Previous
          </button>
          <button
            onClick={() => {
              if (currentStep < drink.instructions.length - 1) {
                setCurrentStep(prev => prev + 1);
              } else {
                setIsMixingMode(false);
              }
            }}
            className="flex-1 py-6 rounded-3xl bg-primary text-primary-foreground font-bold text-lg hover:scale-105 transition-all shadow-xl shadow-primary/20"
          >
            {currentStep === drink.instructions.length - 1 ? 'Finish' : 'Next Step'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-20 transition-colors duration-300">
      <div className="relative h-[50vh]">
        <img src={drink.image} className="w-full h-full object-cover opacity-60 grayscale hover:grayscale-0 transition-all duration-1000" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
        <button onClick={() => router.back()} className="absolute top-8 left-8 p-3 bg-card border border-border rounded-full hover:text-primary transition-colors transition-all active:scale-95 shadow-xl"><ChevronLeft /></button>
        
        <button 
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="absolute top-8 right-8 p-3 bg-card border border-border rounded-full hover:text-primary transition-colors transition-all active:scale-95 shadow-xl"
        >
                {mounted && (theme === 'dark' ? <Sun size={24} /> : <Moon size={24} />)}
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-6 -mt-32 relative z-10">
        <div className="flex flex-col md:flex-row md:items-start justify-between mb-8 gap-6">
          <div>
            <div className="flex flex-wrap gap-2 mb-4">
                {drink.glass && (
                    <span className="inline-flex items-center gap-1.5 bg-card border border-border text-muted-foreground px-3 py-1.5 rounded-full text-[10px] font-bold tracking-widest uppercase shadow-sm">
                        <GlassIcon name={drink.glass} size={14} className="text-primary" /> {drink.glass}
                    </span>
                )}
                {drink.garnish && (
                    <span className="inline-flex items-center gap-1.5 bg-primary/10 border border-primary/20 text-primary px-3 py-1.5 rounded-full text-[10px] font-bold tracking-widest uppercase shadow-sm">
                        <Sparkles size={12} /> {drink.garnish}
                    </span>
                )}
            </div>
            <h1 className="text-7xl font-serif text-primary pr-4 tracking-tighter leading-tight">{drink.name}</h1>
          </div>
          <div className="flex gap-3 flex-shrink-0 mt-2">
            <button onClick={() => setIsQROpen(true)} className="p-5 bg-card border border-border rounded-full text-muted-foreground hover:text-primary hover:border-primary/50 transition-all shadow-lg active:scale-95">
              <QrCode size={24} />
            </button>
            <button onClick={handleShare} className="p-5 bg-card border border-border rounded-full text-muted-foreground hover:text-primary hover:border-primary/50 transition-all shadow-lg active:scale-95">
              <Share2 size={24} />
            </button>
            <button onClick={toggleFavorite} className="p-5 bg-card border border-border rounded-full text-primary hover:bg-muted transition-all shadow-lg active:scale-95">
              <Heart size={24} fill={isFavorite ? 'currentColor' : 'none'} />
            </button>
          </div>
        </div>
        <p className="text-2xl text-muted-foreground italic font-serif leading-relaxed mb-16 max-w-2xl border-l-4 border-primary/20 pl-8 transition-all hover:border-primary duration-1000">"{drink.story}"</p>

        <div className="grid md:grid-cols-[1fr_2fr] gap-16 border-t border-border pt-16">
          <div>
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-primary uppercase text-[10px] font-bold tracking-[0.3em]">Ingredients</h3>
              <div className="flex bg-muted rounded-lg p-1 shadow-inner border border-border">
                <button onClick={() => setUnit('oz')} className={`px-3 py-1 text-[10px] uppercase font-bold rounded-md transition-all ${unit === 'oz' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground'}`}>oz</button>
                <button onClick={() => setUnit('ml')} className={`px-3 py-1 text-[10px] uppercase font-bold rounded-md transition-all ${unit === 'ml' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground'}`}>ml</button>
                <button onClick={() => setUnit('parts')} className={`px-3 py-1 text-[10px] uppercase font-bold rounded-md transition-all ${unit === 'parts' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground'}`}>pts</button>
              </div>
            </div>
            <ul className="space-y-5">
              {drink.ingredients.map((ing: any, i: number) => (
                <li key={i} className="flex justify-between text-sm border-b border-border/40 pb-3 group">
                  <span className="text-foreground font-medium group-hover:text-primary transition-colors">{ing.name}</span>
                  <span className="text-primary font-mono text-right font-bold">{formatMeasure(ing.measure)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-primary uppercase text-[10px] font-bold tracking-[0.3em] mb-10">Preparation</h3>
            <div className="space-y-10">
              {drink.instructions.map((step: string, i: number) => (
                <div key={i} className="flex gap-8 group">
                  <span className="text-5xl font-serif text-muted-foreground/30 italic group-hover:text-primary/40 transition-colors duration-500">{i + 1}</span>
                  <p className="text-lg text-foreground pt-1 leading-relaxed">{step}</p>
                </div>
              ))}
            </div>
            <button
              onClick={() => { setIsMixingMode(true); setCurrentStep(0); }}
              className="mt-16 w-full bg-primary text-primary-foreground font-bold py-5 rounded-2xl flex items-center justify-center gap-3 hover:scale-[1.02] transition-all shadow-xl shadow-primary/20 text-sm uppercase tracking-widest"
            >
              <Play size={20} fill="currentColor" /> ENTER MIXING MODE
            </button>
          </div>
        </div>

        {session && (
          <div className="mt-24 pt-16 border-t border-border pb-12">
            <h3 className="text-primary uppercase text-[10px] font-bold tracking-[0.3em] mb-10 text-center">Private Tasting Notes</h3>
            <form onSubmit={submitNote} className="mb-16 space-y-6 max-w-2xl mx-auto bg-card border border-border p-8 rounded-3xl shadow-sm">
              <div className="flex justify-center gap-4 mb-4">
                {[1, 2, 3, 4, 5].map(star => (
                    <button 
                        key={star} 
                        type="button" 
                        onClick={() => setRating(star)}
                        className={`p-2 transition-all hover:scale-110 ${rating >= star ? 'text-primary' : 'text-muted'}`}
                    >
                        <Star size={32} fill={rating >= star ? 'currentColor' : 'none'} strokeWidth={1.5} />
                    </button>
                ))}
              </div>
              <div className="space-y-4">
                <input
                    value={newNote}
                    onChange={e => setNewNote(e.target.value)}
                    placeholder="General thoughts on the profile..."
                    className="w-full bg-background border border-border rounded-xl px-5 py-4 focus:ring-2 focus:ring-primary outline-none transition-all text-foreground"
                />
                <input
                    value={twists}
                    onChange={e => setTwists(e.target.value)}
                    placeholder="Any twists? (e.g. swap bourbon for rye)"
                    className="w-full bg-background border border-border rounded-xl px-5 py-4 focus:ring-2 focus:ring-primary outline-none transition-all text-foreground"
                />
              </div>
              <button type="submit" className="w-full bg-muted hover:bg-primary hover:text-primary-foreground text-primary font-bold py-4 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 uppercase tracking-widest text-xs">
                <BookmarkPlus size={20} /> SAVE YOUR STORY
              </button>
            </form>
            <div className="grid md:grid-cols-2 gap-6">
              {notes.map(note => {
                // ... same parsing logic ...
                let displayNote = note.note;
                let displayRating = note.rating;
                let displayTwists = note.twists;
                
                return (
                    <div key={note.id} className="bg-card p-8 rounded-3xl border border-border hover:shadow-xl hover:shadow-primary/5 transition-all group">
                        <div className="flex justify-between items-start mb-6">
                            <div className="flex gap-1.5">
                                {[1,2,3,4,5].map(s => (
                                    <Star key={s} size={14} className={displayRating >= s ? 'text-primary' : 'text-muted-foreground/20'} fill={displayRating >= s ? 'currentColor' : 'none'} strokeWidth={1} />
                                ))}
                            </div>
                            <span className="text-muted-foreground text-[9px] uppercase font-bold tracking-widest">{new Date(note.created_at).toLocaleDateString()}</span>
                        </div>
                        <p className="text-foreground text-sm mb-6 leading-relaxed italic">"{displayNote || "No summary provided."}"</p>
                        {displayTwists && (
                            <div className="flex items-start gap-3 text-primary/80 bg-primary/5 p-4 rounded-2xl border border-primary/10 transition-all group-hover:border-primary/30">
                                <Sparkles size={16} className="mt-0.5 flex-shrink-0" />
                                <p className="text-xs font-medium">The Twist: {displayTwists}</p>
                            </div>
                        )}
                    </div>
                );
              })}
            </div>
          </div>
        )}
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
