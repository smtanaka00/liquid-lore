/**
 * pages/studio.tsx
 *
 * The Creator Studio: a four-step wizard for composing and publishing a recipe.
 *
 * It was one long form whose only validation was the browser's `required` attribute, so a
 * drink could reach the Lounge as a name and one blank instruction. The steps exist to
 * make the work legible — essentials, ingredients, method, finishing touches — and each
 * one is gated on `validateStep`, so a problem is reported next to the field that caused
 * it instead of as a Postgres error after publishing.
 *
 * All rules live in `lib/domain/recipe-draft.ts`. This file owns presentation, the photo
 * upload, and the insert; it decides nothing about what a valid recipe is.
 *
 * The flavour tags are fetched from the library's own vocabulary rather than hardcoded —
 * the same reason the browse filters are generated (M8): a hand-written chip list drifts
 * away from the data and starts offering tags that match nothing.
 */

import { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { supabase, isSupabaseConfigured } from '../lib/supabase/client';
import { Plus, Trash2, ArrowLeft, ArrowRight, Check, ImagePlus, Loader2, X } from 'lucide-react';
import { fetchFlavorVocabulary } from '../lib/api-client';
import {
  emptyDraft,
  validateStep,
  firstInvalidStep,
  isPublishable,
  toInsertRow,
  STUDIO_STEPS,
  STEP_TITLES,
  LIMITS,
  type RecipeDraft,
  type StudioStep,
} from '../lib/domain/recipe-draft';

const GLASSWARE = [
  'Cocktail glass', 'Highball glass', 'Old Fashioned glass', 'Coupe glass',
  'Champagne flute', 'Collins glass', 'Whiskey sour glass', 'Copper mug', 'Hurricane glass',
];

/** Matches the bucket's own limit in `0006_studio.sql`; checked here so the user is told
 *  before a 5 MB upload is attempted and rejected by Storage. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

export default function Studio() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  const [draft, setDraft] = useState<RecipeDraft>(emptyDraft);
  const [stepIndex, setStepIndex] = useState(0);
  /** Errors stay hidden until the user tries to leave a step — validating as they type
   *  would flag "give your drink a name" before they have typed the first letter. */
  const [showErrors, setShowErrors] = useState(false);

  const [flavors, setFlavors] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState('');

  const step: StudioStep = STUDIO_STEPS[stepIndex];
  const errors = useMemo(() => validateStep(draft, step), [draft, step]);
  const isLastStep = stepIndex === STUDIO_STEPS.length - 1;

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setCheckingSession(false);
      return;
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setCheckingSession(false);
      if (!session) router.push('/');
    });
  }, [router]);

  useEffect(() => {
    fetchFlavorVocabulary().then(vocab => setFlavors(vocab.map(f => f.tag)));
  }, []);

  // ── draft edits ───────────────────────────────────────────────────────────

  const patch = (fields: Partial<RecipeDraft>) => setDraft(prev => ({ ...prev, ...fields }));

  const setIngredient = (index: number, field: 'name' | 'measure', value: string) => {
    setDraft(prev => ({
      ...prev,
      ingredients: prev.ingredients.map((ing, i) => (i === index ? { ...ing, [field]: value } : ing)),
    }));
  };

  const setStep = (index: number, value: string) => {
    setDraft(prev => ({
      ...prev,
      instructions: prev.instructions.map((s, i) => (i === index ? value : s)),
    }));
  };

  // Never drop to zero rows: an empty list gives the user nothing to type into and no
  // obvious way back.
  const removeAt = <T,>(list: T[], index: number, blank: T): T[] =>
    list.length > 1 ? list.filter((_, i) => i !== index) : [blank];

  const toggleFlavor = (tag: string) => {
    setDraft(prev => ({
      ...prev,
      flavorProfiles: prev.flavorProfiles.includes(tag)
        ? prev.flavorProfiles.filter(t => t !== tag)
        : prev.flavorProfiles.length < LIMITS.flavorsMax
          ? [...prev.flavorProfiles, tag]
          : prev.flavorProfiles,
    }));
  };

  // ── navigation ────────────────────────────────────────────────────────────

  const goNext = () => {
    if (errors.length > 0) return setShowErrors(true);
    setShowErrors(false);
    setStepIndex(i => Math.min(i + 1, STUDIO_STEPS.length - 1));
  };

  const goBack = () => {
    setShowErrors(false);
    setStepIndex(i => Math.max(i - 1, 0));
  };

  /** Jumping backwards is always allowed; jumping forwards only over valid steps. */
  const jumpTo = (index: number) => {
    if (index <= stepIndex) {
      setShowErrors(false);
      setStepIndex(index);
      return;
    }
    for (let i = stepIndex; i < index; i++) {
      if (validateStep(draft, STUDIO_STEPS[i]).length > 0) {
        setStepIndex(i);
        setShowErrors(true);
        return;
      }
    }
    setShowErrors(false);
    setStepIndex(index);
  };

  // ── photo ─────────────────────────────────────────────────────────────────

  const uploadImage = async (file: File) => {
    if (!session) return;

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setMessage('That file is not a JPEG, PNG, WebP or AVIF image.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setMessage('That image is over 5 MB — the limit for recipe photos.');
      return;
    }

    setUploading(true);
    setMessage('');

    // The path must start with the user's id: the bucket's RLS policies key ownership off
    // that first segment. The timestamp keeps two uploads of the same filename apart.
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${session.user.id}/${Date.now()}.${extension}`;

    const { error } = await supabase.storage.from('recipe-images').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });

    setUploading(false);

    if (error) {
      // Most likely cause is a project that hasn't run 0006_studio.sql yet. Say so, and
      // let the recipe be published without a photo rather than blocking on it.
      setMessage(`Could not upload that image (${error.message}). You can publish without one.`);
      return;
    }

    const { data } = supabase.storage.from('recipe-images').getPublicUrl(path);
    patch({ imageUrl: data.publicUrl });
  };

  // ── publish ───────────────────────────────────────────────────────────────

  const publish = async () => {
    const invalid = firstInvalidStep(draft);
    if (invalid) {
      // Send the user to the problem instead of refusing where they are standing.
      setStepIndex(STUDIO_STEPS.indexOf(invalid));
      setShowErrors(true);
      return;
    }

    setPublishing(true);
    setMessage('');

    const { data, error } = await supabase
      .from('custom_recipes')
      .insert(toInsertRow(draft, session.user.id))
      .select('id')
      .single();

    if (error) {
      setPublishing(false);
      setMessage(error.message);
      return;
    }

    router.push(`/custom-drink/${data.id}`);
  };

  // ── render ────────────────────────────────────────────────────────────────

  if (checkingSession) return <div className="min-h-screen bg-background" />;

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center gap-6 p-6 text-center">
        <Head><title>Creator Studio — Liquid Lore</title></Head>
        <h1 className="text-4xl font-serif text-primary">The Studio is offline</h1>
        <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
          Publishing needs a Supabase project. Add your keys to{' '}
          <code className="text-primary font-mono text-xs">.env.local</code> to switch it on —
          browsing and your cabinet work without it.
        </p>
        <button onClick={() => router.push('/')} className="px-6 py-3 bg-primary text-primary-foreground font-bold rounded-xl uppercase tracking-widest text-xs">
          Back to Cabinet
        </button>
      </div>
    );
  }

  if (!session) return <div className="min-h-screen bg-background" />;

  return (
    <div className="min-h-screen bg-background text-foreground p-6 pb-24 transition-colors duration-300">
      <Head>
        <title>Creator Studio — Liquid Lore</title>
        <meta name="robots" content="noindex" />
      </Head>

      <header className="max-w-3xl mx-auto mb-10 pt-6 flex justify-between items-center gap-4">
        <button onClick={() => router.push('/')} className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors uppercase text-[10px] font-bold tracking-widest">
          <ArrowLeft size={14} /> Back to Cabinet
        </button>
        <h1 className="text-3xl font-serif text-primary">Creator Studio</h1>
      </header>

      {/* ── step rail ────────────────────────────────────────────────────── */}
      <nav aria-label="Studio progress" className="max-w-3xl mx-auto mb-12">
        <ol className="flex items-center gap-2">
          {STUDIO_STEPS.map((s, i) => {
            const done = i < stepIndex && validateStep(draft, s).length === 0;
            const current = i === stepIndex;
            return (
              <li key={s} className="flex-1">
                <button
                  onClick={() => jumpTo(i)}
                  aria-current={current ? 'step' : undefined}
                  className={`w-full text-left group ${current ? '' : 'opacity-70 hover:opacity-100'} transition-opacity`}
                >
                  <div className={`h-1.5 rounded-full mb-3 transition-colors ${current ? 'bg-primary' : done ? 'bg-primary/40' : 'bg-muted'}`} />
                  <span className="flex items-center gap-1.5 text-[9px] uppercase font-bold tracking-[0.2em] text-muted-foreground">
                    {done && <Check size={10} className="text-primary" />}
                    <span className={current ? 'text-primary' : ''}>{STEP_TITLES[s]}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="max-w-3xl mx-auto space-y-8">
        <section className="bg-card border border-border p-8 rounded-[40px] space-y-8 shadow-sm">
          {/* ── 1. essentials ─────────────────────────────────────────────── */}
          {step === 'essentials' && (
            <>
              <h2 className="text-xl font-serif text-foreground border-b border-border pb-4 flex items-center gap-2">
                <span className="w-2 h-6 bg-primary rounded-full" /> {STEP_TITLES.essentials}
              </h2>
              <div>
                <label htmlFor="drink-name" className="block text-[10px] uppercase text-primary font-bold tracking-[0.2em] mb-3">Drink Name</label>
                <input
                  id="drink-name" type="text" value={draft.name} maxLength={LIMITS.nameMax}
                  onChange={e => patch({ name: e.target.value })}
                  className="w-full bg-background border border-border rounded-2xl px-5 py-4 focus:ring-2 focus:ring-primary outline-none transition-all shadow-inner"
                  placeholder="e.g. Midnight Mirage"
                />
              </div>
              <div>
                <label htmlFor="drink-story" className="block text-[10px] uppercase text-primary font-bold tracking-[0.2em] mb-3">
                  The Lore <span className="text-muted-foreground normal-case tracking-normal font-medium">— optional</span>
                </label>
                <textarea
                  id="drink-story" value={draft.story} maxLength={LIMITS.storyMax}
                  onChange={e => patch({ story: e.target.value })}
                  className="w-full bg-background border border-border rounded-2xl px-5 py-4 min-h-[140px] focus:ring-2 focus:ring-primary outline-none transition-all shadow-inner"
                  placeholder="What inspired this drink? The mood, the flavours, the night it came from…"
                />
                {/* Left blank rather than padded: an honest empty story is the rule the
                    whole library rebuild was about. */}
                <p className="mt-2 text-right text-[10px] text-muted-foreground font-mono">
                  {draft.story.trim().length} / {LIMITS.storyMax}
                </p>
              </div>
            </>
          )}

          {/* ── 2. ingredients ────────────────────────────────────────────── */}
          {step === 'ingredients' && (
            <>
              <div className="flex justify-between items-center border-b border-border pb-4">
                <h2 className="text-xl font-serif text-foreground flex items-center gap-2">
                  <span className="w-2 h-6 bg-primary rounded-full" /> {STEP_TITLES.ingredients}
                </h2>
                <button
                  type="button"
                  onClick={() => patch({ ingredients: [...draft.ingredients, { name: '', measure: '' }] })}
                  disabled={draft.ingredients.length >= LIMITS.ingredientsMax}
                  aria-label="Add an ingredient"
                  className="text-primary hover:scale-110 p-2 transition-transform disabled:opacity-30"
                >
                  <Plus size={24} />
                </button>
              </div>

              <div className="space-y-4">
                {draft.ingredients.map((ing, i) => (
                  <div key={i} className="flex gap-4 items-start">
                    <input
                      aria-label={`Ingredient ${i + 1}`} placeholder="Ingredient (e.g. Gin)"
                      value={ing.name} maxLength={LIMITS.ingredientNameMax}
                      onChange={e => setIngredient(i, 'name', e.target.value)}
                      className="flex-1 min-w-0 bg-background border border-border rounded-2xl px-5 py-4 focus:ring-2 focus:ring-primary outline-none transition-all shadow-inner"
                    />
                    <input
                      aria-label={`Measure for ingredient ${i + 1}`} placeholder="2 oz"
                      value={ing.measure} maxLength={LIMITS.measureMax}
                      onChange={e => setIngredient(i, 'measure', e.target.value)}
                      className="w-28 bg-background border border-border rounded-2xl px-5 py-4 focus:ring-2 focus:ring-primary outline-none transition-all shadow-inner"
                    />
                    <button
                      type="button"
                      onClick={() => patch({ ingredients: removeAt(draft.ingredients, i, { name: '', measure: '' }) })}
                      aria-label={`Remove ingredient ${i + 1}`}
                      className="p-4 text-muted-foreground hover:text-destructive hover:bg-muted rounded-2xl transition-colors"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── 3. method ─────────────────────────────────────────────────── */}
          {step === 'method' && (
            <>
              <div className="flex justify-between items-center border-b border-border pb-4">
                <h2 className="text-xl font-serif text-foreground flex items-center gap-2">
                  <span className="w-2 h-6 bg-primary rounded-full" /> {STEP_TITLES.method}
                </h2>
                <button
                  type="button"
                  onClick={() => patch({ instructions: [...draft.instructions, ''] })}
                  disabled={draft.instructions.length >= LIMITS.stepsMax}
                  aria-label="Add a step"
                  className="text-primary hover:scale-110 p-2 transition-transform disabled:opacity-30"
                >
                  <Plus size={24} />
                </button>
              </div>

              <div className="space-y-6">
                {draft.instructions.map((inst, i) => (
                  <div key={i} className="flex gap-4 items-start">
                    <span aria-hidden className="w-8 pt-3 flex-shrink-0 font-serif text-muted-foreground/40 text-3xl italic">{i + 1}</span>
                    <textarea
                      aria-label={`Step ${i + 1}`} placeholder="Shake hard with ice, then strain…"
                      value={inst} maxLength={LIMITS.stepMax}
                      onChange={e => setStep(i, e.target.value)}
                      className="flex-1 min-w-0 bg-background border border-border rounded-2xl px-5 py-4 min-h-[100px] focus:ring-2 focus:ring-primary outline-none transition-all shadow-inner"
                    />
                    <button
                      type="button"
                      onClick={() => patch({ instructions: removeAt(draft.instructions, i, '') })}
                      aria-label={`Remove step ${i + 1}`}
                      className="p-4 text-muted-foreground hover:text-destructive hover:bg-muted rounded-2xl transition-colors"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── 4. finishing touches ──────────────────────────────────────── */}
          {step === 'finish' && (
            <>
              <h2 className="text-xl font-serif text-foreground border-b border-border pb-4 flex items-center gap-2">
                <span className="w-2 h-6 bg-primary rounded-full" /> {STEP_TITLES.finish}
              </h2>

              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <label htmlFor="glassware" className="block text-[10px] uppercase text-primary font-bold tracking-[0.2em] mb-3">Glassware</label>
                  <select
                    id="glassware" value={draft.glass} onChange={e => patch({ glass: e.target.value })}
                    className="w-full bg-background border border-border rounded-2xl px-5 py-4 focus:ring-2 focus:ring-primary outline-none transition-all shadow-inner text-foreground"
                  >
                    <option value="">Select glass…</option>
                    {GLASSWARE.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="garnish" className="block text-[10px] uppercase text-primary font-bold tracking-[0.2em] mb-3">Garnish</label>
                  <input
                    id="garnish" type="text" value={draft.garnish} maxLength={LIMITS.garnishMax}
                    onChange={e => patch({ garnish: e.target.value })}
                    className="w-full bg-background border border-border rounded-2xl px-5 py-4 focus:ring-2 focus:ring-primary outline-none transition-all shadow-inner"
                    placeholder="e.g. Lemon twist"
                  />
                </div>
              </div>

              <fieldset>
                <legend className="text-[10px] uppercase text-primary font-bold tracking-[0.2em] mb-3">
                  Flavour tags
                  <span className="ml-2 text-muted-foreground normal-case tracking-normal font-medium">
                    up to {LIMITS.flavorsMax} — these make your drink findable
                  </span>
                </legend>
                <div className="flex flex-wrap gap-2">
                  {flavors.map(tag => {
                    const picked = draft.flavorProfiles.includes(tag);
                    const full = !picked && draft.flavorProfiles.length >= LIMITS.flavorsMax;
                    return (
                      <button
                        key={tag} type="button" onClick={() => toggleFlavor(tag)}
                        aria-pressed={picked} disabled={full}
                        className={`px-4 py-2 rounded-full text-[10px] uppercase font-bold tracking-widest border transition-all ${
                          picked
                            ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                            : 'bg-background text-muted-foreground border-border hover:border-primary/50 disabled:opacity-30'
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <div>
                <span className="block text-[10px] uppercase text-primary font-bold tracking-[0.2em] mb-3">
                  Photograph <span className="text-muted-foreground normal-case tracking-normal font-medium">— optional, up to 5 MB</span>
                </span>

                {draft.imageUrl ? (
                  <div className="relative rounded-3xl overflow-hidden border border-border">
                    <img src={draft.imageUrl} alt="Your uploaded drink" className="w-full h-56 object-cover" />
                    <button
                      type="button" onClick={() => patch({ imageUrl: null })}
                      aria-label="Remove the photograph"
                      className="absolute top-4 right-4 p-2.5 rounded-full bg-black/70 text-white hover:text-primary backdrop-blur-md transition-colors"
                    >
                      <X size={18} />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center gap-3 h-40 border border-dashed border-border rounded-3xl cursor-pointer hover:border-primary/50 transition-colors text-muted-foreground">
                    {uploading ? <Loader2 size={26} className="animate-spin text-primary" /> : <ImagePlus size={26} />}
                    <span className="text-[10px] uppercase font-bold tracking-widest">
                      {uploading ? 'Uploading…' : 'Choose an image'}
                    </span>
                    <input
                      type="file" accept={ACCEPTED_IMAGE_TYPES.join(',')} className="sr-only" disabled={uploading}
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.target.value = ''; }}
                    />
                  </label>
                )}
              </div>

              {/* ── review ─────────────────────────────────────────────────── */}
              <div className="pt-6 border-t border-border">
                <h3 className="text-[10px] uppercase text-primary font-bold tracking-[0.2em] mb-4">Before you publish</h3>
                <dl className="grid sm:grid-cols-3 gap-4 text-sm">
                  <div>
                    <dt className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold mb-1">Name</dt>
                    <dd className="font-serif text-lg text-foreground truncate">{draft.name.trim() || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold mb-1">Ingredients</dt>
                    <dd className="font-serif text-lg text-foreground">{draft.ingredients.filter(i => i.name.trim()).length}</dd>
                  </div>
                  <div>
                    <dt className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold mb-1">Steps</dt>
                    <dd className="font-serif text-lg text-foreground">{draft.instructions.filter(s => s.trim()).length}</dd>
                  </div>
                </dl>
              </div>
            </>
          )}

          {/* Errors surface only once the user has tried to move on, and are announced
              so a screen reader hears why the step did not advance. */}
          {showErrors && errors.length > 0 && (
            <ul role="alert" className="space-y-2 bg-destructive/10 border border-destructive/20 rounded-2xl p-5">
              {errors.map(error => (
                <li key={error} className="text-destructive text-xs font-bold uppercase tracking-widest">{error}</li>
              ))}
            </ul>
          )}

          {message && (
            <p role="alert" className="text-destructive text-center bg-destructive/10 py-4 px-5 rounded-2xl border border-destructive/20 text-xs font-bold">
              {message}
            </p>
          )}
        </section>

        {/* ── controls ───────────────────────────────────────────────────── */}
        <div className="flex gap-4">
          {stepIndex > 0 && (
            <button
              onClick={goBack}
              className="px-8 py-5 rounded-3xl border border-border text-muted-foreground font-bold uppercase tracking-widest text-[10px] hover:bg-muted transition-all flex items-center gap-2"
            >
              <ArrowLeft size={14} /> Back
            </button>
          )}

          {isLastStep ? (
            <button
              onClick={publish}
              disabled={publishing || !isPublishable(draft)}
              className="flex-1 bg-primary text-primary-foreground font-bold py-5 rounded-3xl transition-all disabled:opacity-40 text-sm uppercase tracking-[0.2em] shadow-xl shadow-primary/20 hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-3"
            >
              {publishing ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {publishing ? 'Publishing…' : 'Publish to Lounge'}
            </button>
          ) : (
            <button
              onClick={goNext}
              className="flex-1 bg-primary text-primary-foreground font-bold py-5 rounded-3xl transition-all text-sm uppercase tracking-[0.2em] shadow-xl shadow-primary/20 hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-3"
            >
              Continue <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
