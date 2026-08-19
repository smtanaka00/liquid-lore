/**
 * pages/drink/[id].tsx
 *
 * A recipe in full: the story, the build, and Mixing Mode.
 *
 * Server-rendered. Sharing is a headline feature of this product — QR codes, share sheets,
 * the Lounge — and the previous client-only version meant every shared link previewed as a
 * blank "Liquid Lore" card with no title, description or image. `getServerSideProps` fetches
 * the recipe so the metadata is in the HTML that crawlers and messaging apps actually read.
 *
 * Personal data (favourite state, tasting notes) still loads client-side after hydration:
 * it is per-user and must not end up in a shared cache.
 */

import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import type { GetServerSideProps } from 'next';
import { ChevronLeft, Play, Heart, BookmarkPlus, Share2, Sparkles, QrCode, Star, Sun, Moon, BookOpen } from 'lucide-react';
import { useTheme } from 'next-themes';
import { QRShare } from '../../components/QRShare';
import { GlassIcon } from '../../components/GlassIcon';
import { supabase, isSupabaseConfigured } from '../../lib/supabase/client';
import { getCocktail } from '../../lib/data/repository';
import { convertMeasure, hasConvertibleMeasures, type MeasureUnit } from '../../lib/domain/measures';
import type { Cocktail } from '../../lib/domain/types';

interface DrinkPageProps {
  drink: Cocktail;
  canonicalUrl: string;
}

export const getServerSideProps: GetServerSideProps<DrinkPageProps> = async (context) => {
  const id = Array.isArray(context.params?.id) ? context.params?.id[0] : context.params?.id;
  if (!id) return { notFound: true };

  const { data } = await getCocktail(id);
  if (!data) return { notFound: true };

  // Prefer the slug in the URL so shared links are readable and stable.
  if (id !== data.slug) {
    return { redirect: { destination: `/drink/${data.slug}`, permanent: false } };
  }

  const host = context.req.headers.host ?? 'localhost:3000';
  const protocol = host.startsWith('localhost') ? 'http' : 'https';

  // The library changes only on re-seed, so this is safe to cache at the edge.
  context.res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');

  return {
    props: {
      drink: data,
      canonicalUrl: `${protocol}://${host}/drink/${data.slug}`,
    },
  };
};

export default function DrinkDetail({ drink, canonicalUrl }: DrinkPageProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  const [isMixingMode, setIsMixingMode] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [unit, setUnit] = useState<MeasureUnit>('oz');

  const [session, setSession] = useState<any>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [notes, setNotes] = useState<any[]>([]);
  const [isQROpen, setIsQROpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [newNote, setNewNote] = useState('');
  const [rating, setRating] = useState(0);
  const [twists, setTwists] = useState('');

  useEffect(() => setMounted(true), []);

  const notify = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2600);
  };

  // Per-user state, loaded after hydration so it never lands in a shared cache.
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) return;

      supabase.from('favorites')
        .select('id').eq('user_id', session.user.id).eq('drink_id', drink.id).maybeSingle()
        .then(({ data }) => setIsFavorite(Boolean(data)));

      supabase.from('tasting_notes')
        .select('*').eq('user_id', session.user.id).eq('drink_id', drink.id)
        .order('created_at', { ascending: false })
        .then(({ data }) => { if (data) setNotes(data); });
    });
  }, [drink.id]);

  const toggleFavorite = async () => {
    if (!session) return notify('Sign in to save favourites');

    const next = !isFavorite;
    setIsFavorite(next); // optimistic

    const { error } = next
      ? await supabase.from('favorites').insert({ user_id: session.user.id, drink_id: drink.id, kind: 'library' })
      : await supabase.from('favorites').delete().eq('user_id', session.user.id).eq('drink_id', drink.id);

    if (error) {
      setIsFavorite(!next);
      notify('Could not save that — try again');
    }
  };

  const handleShare = async () => {
    const payload = {
      title: `${drink.name} — Liquid Lore`,
      text: drink.lore ?? `How to make a ${drink.name}.`,
      url: canonicalUrl,
    };

    if (navigator.share) {
      try { await navigator.share(payload); } catch { /* dismissed — not an error */ }
      return;
    }

    try {
      await navigator.clipboard.writeText(canonicalUrl);
      notify('Link copied');
    } catch {
      notify('Could not copy the link');
    }
  };

  const submitNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return notify('Sign in to keep tasting notes');
    if (!newNote.trim() && !twists.trim() && rating === 0) return;

    const { data, error } = await supabase.from('tasting_notes').insert({
      user_id: session.user.id,
      drink_id: drink.id,
      note: newNote,
      rating,
      twists,
    }).select().single();

    if (error) {
      notify('Could not save that note');
      return;
    }

    setNotes([data, ...notes]);
    setNewNote('');
    setRating(0);
    setTwists('');
  };

  const showUnitToggle = hasConvertibleMeasures(drink.ingredients.map(i => i.amount));
  const photo = drink.photo.url ?? drink.photo.thumb;

  // ── Mixing Mode ─────────────────────────────────────────────────────────────
  // A separate full-screen render rather than a modal: it is used hands-free at arm's
  // length, so it gets the whole viewport and nothing else competes for attention.

  if (isMixingMode) {
    const total = Math.max(drink.steps.length, 1);
    return (
      <div className="min-h-screen bg-background text-foreground p-6 flex flex-col justify-between transition-colors duration-300">
        <div className="flex justify-between items-center mb-8 gap-4">
          <button
            onClick={() => setIsMixingMode(false)}
            className="text-muted-foreground font-bold uppercase tracking-widest text-[10px] hover:text-primary transition-colors"
          >
            Exit
          </button>
          <span className="text-primary font-serif text-2xl truncate">{drink.name}</span>
          <span className="text-muted-foreground font-bold uppercase tracking-widest text-[10px] whitespace-nowrap">
            Step {currentStep + 1} / {total}
          </span>
        </div>

        <div className="flex-1 flex flex-col justify-center items-center text-center max-w-3xl mx-auto px-4 min-h-[50vh]">
          <h2 className="text-primary text-[10px] font-bold tracking-[0.4em] uppercase mb-12 flex items-center gap-2">
            <Sparkles size={14} /> Instructions
          </h2>
          <p className="text-4xl md:text-6xl font-serif leading-tight text-foreground">
            {drink.steps[currentStep] ?? 'Enjoy responsibly.'}
          </p>

          <div className="mt-20 w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${((currentStep + 1) / total) * 100}%` }}
            />
          </div>
        </div>

        <div className="flex justify-between gap-6 max-w-4xl mx-auto w-full mt-12 pb-10">
          <button
            disabled={currentStep === 0}
            onClick={() => setCurrentStep(step => step - 1)}
            className="flex-1 py-6 rounded-3xl border border-border text-muted-foreground font-bold uppercase tracking-widest text-xs disabled:opacity-20 transition-all hover:bg-muted"
          >
            Previous
          </button>
          <button
            onClick={() => {
              if (currentStep < total - 1) setCurrentStep(step => step + 1);
              else setIsMixingMode(false);
            }}
            className="flex-1 py-6 rounded-3xl bg-primary text-primary-foreground font-bold text-lg hover:scale-105 transition-all shadow-xl shadow-primary/20"
          >
            {currentStep === total - 1 ? 'Finish' : 'Next Step'}
          </button>
        </div>
      </div>
    );
  }

  // ── recipe ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background text-foreground pb-20 transition-colors duration-300">
      <Head>
        <title>{`${drink.name} — Liquid Lore`}</title>
        <meta name="description" content={metaDescription(drink)} />
        <link rel="canonical" href={canonicalUrl} />

        <meta property="og:type" content="article" />
        <meta property="og:title" content={`${drink.name} — Liquid Lore`} />
        <meta property="og:description" content={metaDescription(drink)} />
        <meta property="og:url" content={canonicalUrl} />
        {photo && <meta property="og:image" content={photo} />}

        <meta name="twitter:card" content={photo ? 'summary_large_image' : 'summary'} />
        <meta name="twitter:title" content={`${drink.name} — Liquid Lore`} />
        <meta name="twitter:description" content={metaDescription(drink)} />
        {photo && <meta name="twitter:image" content={photo} />}
      </Head>

      <div className="relative h-[50vh]">
        {photo ? (
          <img
            src={photo}
            alt={drink.name}
            className="w-full h-full object-cover opacity-60 grayscale hover:grayscale-0 transition-all duration-1000"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-tr from-zinc-900 to-amber-900/20" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />

        <button
          onClick={() => router.back()}
          aria-label="Go back"
          className="absolute top-8 left-8 p-3 bg-card border border-border rounded-full hover:text-primary transition-all active:scale-95 shadow-xl"
        >
          <ChevronLeft />
        </button>

        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label="Toggle colour theme"
          className="absolute top-8 right-8 p-3 bg-card border border-border rounded-full hover:text-primary transition-all active:scale-95 shadow-xl"
        >
          {mounted && (theme === 'dark' ? <Sun size={24} /> : <Moon size={24} />)}
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-6 -mt-32 relative z-10">
        <div className="flex flex-col md:flex-row md:items-start justify-between mb-8 gap-6">
          <div>
            <div className="flex flex-wrap gap-2 mb-4">
              {drink.isClassic && (
                <span className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-full text-[10px] font-bold tracking-widest uppercase shadow-sm">
                  Classic
                </span>
              )}
              {drink.glass && (
                <span className="inline-flex items-center gap-1.5 bg-card border border-border text-muted-foreground px-3 py-1.5 rounded-full text-[10px] font-bold tracking-widest uppercase shadow-sm">
                  <GlassIcon name={drink.glass} size={14} className="text-primary" /> {drink.glass}
                </span>
              )}
              {drink.method && (
                <span className="inline-flex items-center gap-1.5 bg-card border border-border text-muted-foreground px-3 py-1.5 rounded-full text-[10px] font-bold tracking-widest uppercase shadow-sm">
                  {drink.method}
                </span>
              )}
              {drink.garnish && (
                <span className="inline-flex items-center gap-1.5 bg-primary/10 border border-primary/20 text-primary px-3 py-1.5 rounded-full text-[10px] font-bold tracking-widest uppercase shadow-sm">
                  <Sparkles size={12} /> {drink.garnish}
                </span>
              )}
            </div>
            <h1 className="text-6xl md:text-7xl font-serif text-primary pr-4 tracking-tighter leading-tight">
              {drink.name}
            </h1>
          </div>

          <div className="flex gap-3 flex-shrink-0 mt-2">
            <button onClick={() => setIsQROpen(true)} aria-label="Show QR code"
              className="p-5 bg-card border border-border rounded-full text-muted-foreground hover:text-primary hover:border-primary/50 transition-all shadow-lg active:scale-95">
              <QrCode size={24} />
            </button>
            <button onClick={handleShare} aria-label="Share this recipe"
              className="p-5 bg-card border border-border rounded-full text-muted-foreground hover:text-primary hover:border-primary/50 transition-all shadow-lg active:scale-95">
              <Share2 size={24} />
            </button>
            <button onClick={toggleFavorite} aria-label={isFavorite ? 'Remove from favourites' : 'Save to favourites'}
              aria-pressed={isFavorite}
              className="p-5 bg-card border border-border rounded-full text-primary hover:bg-muted transition-all shadow-lg active:scale-95">
              <Heart size={24} fill={isFavorite ? 'currentColor' : 'none'} />
            </button>
          </div>
        </div>

        {/* The story. When there isn't a documented one, say so plainly — the old library
            filled this space with invented history, which is the failure mode this whole
            rebuild exists to eliminate. */}
        {drink.lore ? (
          <blockquote className="mb-4 max-w-2xl border-l-4 border-primary/20 pl-8 transition-all hover:border-primary duration-1000">
            <p className="text-2xl text-muted-foreground italic font-serif leading-relaxed">
              &ldquo;{drink.lore}&rdquo;
            </p>
            {drink.loreSource && (
              <cite className="block mt-4 text-[10px] uppercase tracking-widest font-bold text-muted-foreground/60 not-italic">
                {drink.loreSource}
              </cite>
            )}
          </blockquote>
        ) : (
          <div className="mb-4 max-w-2xl border-l-4 border-border pl-8">
            <p className="text-sm text-muted-foreground leading-relaxed flex items-start gap-3">
              <BookOpen size={16} className="mt-0.5 flex-shrink-0 text-muted-foreground/50" />
              <span>
                No documented history for this one yet. We only publish stories we can stand
                behind, so this space stays empty until there&rsquo;s a real one to tell.
              </span>
            </p>
          </div>
        )}

        <p className="mb-16 text-[10px] uppercase tracking-widest font-bold text-muted-foreground/50">
          Recipe via {drink.source === 'liquid_lore_premium' ? 'Liquid Lore' : 'TheCocktailDB'}
        </p>

        <div className="grid md:grid-cols-[1fr_2fr] gap-16 border-t border-border pt-16">
          <div>
            <div className="flex justify-between items-center mb-8 gap-3">
              <h2 className="text-primary uppercase text-[10px] font-bold tracking-[0.3em]">Ingredients</h2>
              {showUnitToggle && (
                <div className="flex bg-muted rounded-lg p-1 shadow-inner border border-border" role="group" aria-label="Measurement unit">
                  {(['oz', 'ml', 'parts'] as MeasureUnit[]).map(option => (
                    <button
                      key={option}
                      onClick={() => setUnit(option)}
                      aria-pressed={unit === option}
                      className={`px-3 py-1 text-[10px] uppercase font-bold rounded-md transition-all ${unit === option ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground'}`}
                    >
                      {option === 'parts' ? 'pts' : option}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <ul className="space-y-5">
              {drink.ingredients.map((ing, i) => (
                <li key={`${ing.name}-${i}`} className="border-b border-border/40 pb-3 group">
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-foreground font-medium group-hover:text-primary transition-colors">
                      {ing.name}
                      {ing.optional && (
                        <span className="ml-2 text-[9px] uppercase tracking-widest text-muted-foreground/60 font-bold">
                          garnish
                        </span>
                      )}
                    </span>
                    <span className="text-primary font-mono text-right font-bold whitespace-nowrap">
                      {convertMeasure(ing.amount, unit)}
                    </span>
                  </div>
                  {ing.notes && (
                    <p className="mt-1.5 text-[11px] text-muted-foreground italic">{ing.notes}</p>
                  )}
                </li>
              ))}
            </ul>

            {drink.proTip && (
              <div className="mt-10 p-6 rounded-3xl bg-primary/5 border border-primary/15">
                <h3 className="text-primary uppercase text-[9px] font-bold tracking-[0.3em] mb-3 flex items-center gap-2">
                  <Sparkles size={12} /> Pro Tip
                </h3>
                <p className="text-xs text-foreground leading-relaxed">{drink.proTip}</p>
              </div>
            )}
          </div>

          <div>
            <h2 className="text-primary uppercase text-[10px] font-bold tracking-[0.3em] mb-10">Preparation</h2>
            <ol className="space-y-10">
              {drink.steps.map((step, i) => (
                <li key={i} className="flex gap-8 group">
                  <span className="text-5xl font-serif text-muted-foreground/30 italic group-hover:text-primary/40 transition-colors duration-500">
                    {i + 1}
                  </span>
                  <p className="text-lg text-foreground pt-1 leading-relaxed">{step}</p>
                </li>
              ))}
            </ol>

            {drink.steps.length > 0 && (
              <button
                onClick={() => { setIsMixingMode(true); setCurrentStep(0); }}
                className="mt-16 w-full bg-primary text-primary-foreground font-bold py-5 rounded-2xl flex items-center justify-center gap-3 hover:scale-[1.02] transition-all shadow-xl shadow-primary/20 text-sm uppercase tracking-widest"
              >
                <Play size={20} fill="currentColor" /> Enter Mixing Mode
              </button>
            )}
          </div>
        </div>

        {/* ── tasting notes ────────────────────────────────────────────────── */}
        {session ? (
          <section className="mt-24 pt-16 border-t border-border pb-12">
            <h2 className="text-primary uppercase text-[10px] font-bold tracking-[0.3em] mb-10 text-center">
              Private Tasting Notes
            </h2>

            <form onSubmit={submitNote} className="mb-16 space-y-6 max-w-2xl mx-auto bg-card border border-border p-8 rounded-3xl shadow-sm">
              <div className="flex justify-center gap-4 mb-4" role="group" aria-label="Rating">
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    aria-label={`${star} star${star > 1 ? 's' : ''}`}
                    aria-pressed={rating >= star}
                    className={`p-2 transition-all hover:scale-110 ${rating >= star ? 'text-primary' : 'text-muted-foreground/30'}`}
                  >
                    <Star size={32} fill={rating >= star ? 'currentColor' : 'none'} strokeWidth={1.5} />
                  </button>
                ))}
              </div>

              <input
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                aria-label="Tasting note"
                placeholder="General thoughts on the profile…"
                className="w-full bg-background border border-border rounded-xl px-5 py-4 focus:ring-2 focus:ring-primary outline-none transition-all text-foreground"
              />
              <input
                value={twists}
                onChange={e => setTwists(e.target.value)}
                aria-label="Your twist on this recipe"
                placeholder="Any twists? (e.g. swap bourbon for rye)"
                className="w-full bg-background border border-border rounded-xl px-5 py-4 focus:ring-2 focus:ring-primary outline-none transition-all text-foreground"
              />

              <button type="submit" className="w-full bg-muted hover:bg-primary hover:text-primary-foreground text-primary font-bold py-4 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 uppercase tracking-widest text-xs">
                <BookmarkPlus size={20} /> Save Your Note
              </button>
            </form>

            <div className="grid md:grid-cols-2 gap-6">
              {notes.map(note => (
                <article key={note.id} className="bg-card p-8 rounded-3xl border border-border hover:shadow-xl hover:shadow-primary/5 transition-all group">
                  <div className="flex justify-between items-start mb-6 gap-3">
                    <div className="flex gap-1.5">
                      {[1, 2, 3, 4, 5].map(s => (
                        <Star key={s} size={14}
                          className={note.rating >= s ? 'text-primary' : 'text-muted-foreground/20'}
                          fill={note.rating >= s ? 'currentColor' : 'none'} strokeWidth={1} />
                      ))}
                    </div>
                    <time className="text-muted-foreground text-[9px] uppercase font-bold tracking-widest whitespace-nowrap">
                      {new Date(note.created_at).toLocaleDateString()}
                    </time>
                  </div>

                  <p className="text-foreground text-sm mb-6 leading-relaxed italic">
                    &ldquo;{note.note || 'No summary provided.'}&rdquo;
                  </p>

                  {note.twists && (
                    <div className="flex items-start gap-3 text-primary/80 bg-primary/5 p-4 rounded-2xl border border-primary/10 transition-all group-hover:border-primary/30">
                      <Sparkles size={16} className="mt-0.5 flex-shrink-0" />
                      <p className="text-xs font-medium">The Twist: {note.twists}</p>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        ) : isSupabaseConfigured && (
          <section className="mt-24 pt-16 border-t border-border text-center">
            <p className="text-muted-foreground text-sm">
              <Link href="/" className="text-primary font-bold hover:underline">Sign in</Link>
              {' '}to keep private tasting notes and save this to your favourites.
            </p>
          </section>
        )}
      </div>

      {isQROpen && (
        <QRShare url={canonicalUrl} name={drink.name} onClose={() => setIsQROpen(false)} />
      )}

      {toast && (
        <div role="status" aria-live="polite"
          className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-2xl bg-card border border-border shadow-2xl text-xs font-bold uppercase tracking-[0.2em] text-foreground">
          {toast}
        </div>
      )}
    </div>
  );
}

/** Real history when we have it, otherwise the build — never an invented story. */
function metaDescription(drink: Cocktail): string {
  if (drink.lore) return drink.lore.slice(0, 200);

  const ingredients = drink.ingredients
    .filter(i => !i.optional)
    .map(i => i.name)
    .slice(0, 5)
    .join(', ');

  const method = drink.method ? `${drink.method[0].toUpperCase()}${drink.method.slice(1)}` : 'Make';
  const glass = drink.glass ? ` Served in a ${drink.glass.toLowerCase()}.` : '';

  return `${method} a ${drink.name} with ${ingredients}.${glass}`;
}
