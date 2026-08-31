/**
 * pages/custom-drink/[id].tsx
 *
 * Detail view for a community recipe published through the Creator Studio.
 * Distinct from `/drink/[id]` because custom recipes live in Supabase (`custom_recipes`)
 * rather than the curated library, and have no curated photography or historical lore.
 *
 * Server-rendered for the same reason `/drink/[id]` is: this is the page the Lounge's
 * share sheet and QR code point at, and a client-only fetch meant every shared link
 * previewed as a blank "Liquid Lore" card. The recipe is now in the HTML a crawler reads.
 *
 * A missing recipe renders the in-app not-found panel *and* sends a 404 status — the
 * friendly page is for the person, the status code is for the crawler.
 */

import { useRouter } from 'next/router';
import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import type { GetServerSideProps } from 'next';
import { ChevronLeft, Share2, QrCode, Sparkles, User } from 'lucide-react';
import { QRShare } from '../../components/QRShare';
import { GlassIcon } from '../../components/GlassIcon';
import { fetchCommunityRecipe } from '../../lib/data/community-source';
import { communityMetaDescription, type CommunityRecipe } from '../../lib/domain/community';

interface CustomDrinkPageProps {
    drink: CommunityRecipe | null;
    canonicalUrl: string;
}

export const getServerSideProps: GetServerSideProps<CustomDrinkPageProps> = async (context) => {
    const id = Array.isArray(context.params?.id) ? context.params?.id[0] : context.params?.id;

    const host = context.req.headers.host ?? 'localhost:3000';
    const protocol = host.startsWith('localhost') ? 'http' : 'https';
    const canonicalUrl = `${protocol}://${host}/custom-drink/${id ?? ''}`;

    const drink = id ? await fetchCommunityRecipe(id) : null;

    // Community recipes are editable by their author, so this page is never edge-cached
    // the way library recipes are — an edit must be visible on the next load.
    context.res.setHeader('Cache-Control', 'no-store');
    if (!drink) context.res.statusCode = 404;

    return { props: { drink, canonicalUrl } };
};

export default function CustomDrinkDetail({ drink, canonicalUrl }: CustomDrinkPageProps) {
    const router = useRouter();
    const [isQROpen, setIsQROpen] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

    const notify = (message: string) => {
        setToast(message);
        setTimeout(() => setToast(null), 2600);
    };

    if (!drink) {
        return (
            <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center gap-6 p-6 text-center">
                <Head>
                    <title>Recipe not found — Liquid Lore</title>
                    <meta name="robots" content="noindex" />
                </Head>
                <h1 className="text-4xl font-serif text-primary">Recipe not found</h1>
                <p className="text-muted-foreground max-w-sm">
                    This creation may have been removed by its author, or the link is incomplete.
                </p>
                <Link
                    href="/lounge"
                    className="px-6 py-3 bg-primary text-primary-foreground font-bold rounded-xl uppercase tracking-widest text-xs hover:scale-105 transition-transform"
                >
                    Back to the Lounge
                </Link>
            </div>
        );
    }

    const description = communityMetaDescription(drink);

    const handleShare = async () => {
        const payload = {
            title: `${drink.name} — Liquid Lore`,
            text: description,
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

    return (
        <div className="min-h-screen bg-background text-foreground pb-20 transition-colors duration-300">
            <Head>
                <title>{`${drink.name} by ${drink.author} — Liquid Lore`}</title>
                <meta name="description" content={description} />
                <link rel="canonical" href={canonicalUrl} />

                <meta property="og:type" content="article" />
                <meta property="og:title" content={`${drink.name} — Liquid Lore`} />
                <meta property="og:description" content={description} />
                <meta property="og:url" content={canonicalUrl} />
                {drink.imageUrl && <meta property="og:image" content={drink.imageUrl} />}

                <meta name="twitter:card" content={drink.imageUrl ? 'summary_large_image' : 'summary'} />
                <meta name="twitter:title" content={`${drink.name} — Liquid Lore`} />
                <meta name="twitter:description" content={description} />
                {drink.imageUrl && <meta name="twitter:image" content={drink.imageUrl} />}
            </Head>

            <div className="relative h-[40vh] bg-card flex items-center justify-center overflow-hidden">
                {drink.imageUrl ? (
                    <img src={drink.imageUrl} alt={drink.name} className="w-full h-full object-cover opacity-60" />
                ) : (
                    <span className="text-muted-foreground/10 text-9xl font-serif italic absolute select-none">#</span>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
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

                        {/* The byline is a link when we know who wrote it, plain text when the
                            profile row is gone — never a raw creator id either way. */}
                        <p className="mt-5 text-[10px] uppercase tracking-[0.25em] font-bold text-muted-foreground flex items-center gap-2">
                            <User size={12} className="text-primary" />
                            {drink.authorId ? (
                                <Link href={`/profile/${drink.authorId}`} className="hover:text-primary transition-colors">
                                    by {drink.author}
                                </Link>
                            ) : (
                                <span>by {drink.author}</span>
                            )}
                        </p>
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
                    <p className="text-xl text-muted-foreground italic font-serif leading-relaxed mb-12 mt-8 border-l-2 border-primary/20 pl-6">
                        &ldquo;{drink.story}&rdquo;
                    </p>
                )}

                <div className="grid md:grid-cols-[1fr_2fr] gap-12 border-t border-border pt-12 mt-12">
                    <div>
                        <h2 className="text-primary uppercase text-xs font-bold tracking-widest mb-6 border-b border-border pb-4">Ingredients</h2>
                        {drink.ingredients.length === 0 ? (
                            <p className="text-muted-foreground text-sm italic">The author didn&rsquo;t list any.</p>
                        ) : (
                            <ul className="space-y-4">
                                {drink.ingredients.map((ing, i) => (
                                    <li key={`${ing.name}-${i}`} className="flex justify-between gap-4 text-sm border-b border-border/40 pb-3">
                                        <span className="text-foreground">{ing.name}</span>
                                        <span className="text-primary font-mono text-right font-bold">{ing.measure}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div>
                        <h2 className="text-primary uppercase text-xs font-bold tracking-widest mb-6 border-b border-border pb-4">Instructions</h2>
                        {drink.instructions.length === 0 ? (
                            <p className="text-muted-foreground text-sm italic">The author didn&rsquo;t write any steps.</p>
                        ) : (
                            <ol className="space-y-8">
                                {drink.instructions.map((step, i) => (
                                    <li key={i} className="flex gap-6">
                                        <span className="text-4xl font-serif text-muted-foreground/30 italic">{i + 1}</span>
                                        <p className="text-lg text-foreground pt-1 leading-relaxed">{step}</p>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </div>
                </div>
            </div>

            {isQROpen && (
                <QRShare
                    url={canonicalUrl}
                    name={drink.name}
                    onClose={() => setIsQROpen(false)}
                />
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
