/**
 * pages/profile/[id].tsx
 *
 * Another mixologist's public page. `/profile` (no id) is the signed-in user's own.
 *
 * Server-rendered for its metadata: the Lounge links here from every card, so these URLs
 * get shared, and a client-only render previewed all of them as the same blank card.
 * Only public columns are fetched — the cabinet belongs to its owner and is loaded
 * client-side by `UserProfile`, never put in this page's HTML.
 */

import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import { UserProfile } from '../../components/UserProfile';
import { fetchPublicProfile, fetchCommunityFeed } from '../../lib/data/community-source';
import { profileMetaDescription, type PublicProfile } from '../../lib/domain/community';

interface PublicProfilePageProps {
    profile: PublicProfile | null;
    recipeCount: number;
    canonicalUrl: string;
}

export const getServerSideProps: GetServerSideProps<PublicProfilePageProps> = async (context) => {
    const id = Array.isArray(context.params?.id) ? context.params?.id[0] : context.params?.id;

    const host = context.req.headers.host ?? 'localhost:3000';
    const protocol = host.startsWith('localhost') ? 'http' : 'https';
    const canonicalUrl = `${protocol}://${host}/profile/${id ?? ''}`;

    const profile = id ? await fetchPublicProfile(id) : null;

    // The count comes from the feed's exact count with a one-row window, so it costs a
    // `head`-style query rather than fetching every recipe just to measure the list.
    const recipeCount = profile
        ? (await fetchCommunityFeed({ creatorId: profile.id, limit: 1 })).total
        : 0;

    // A profile changes whenever its owner publishes; never edge-cache it.
    context.res.setHeader('Cache-Control', 'no-store');
    if (!profile) context.res.statusCode = 404;

    return { props: { profile, recipeCount, canonicalUrl } };
};

export default function PublicProfilePage({ profile, recipeCount, canonicalUrl }: PublicProfilePageProps) {
    if (!profile) {
        return (
            <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center gap-6 p-6 text-center">
                <Head>
                    <title>Mixologist not found — Liquid Lore</title>
                    <meta name="robots" content="noindex" />
                </Head>
                <h1 className="text-4xl font-serif text-primary">Mixologist not found</h1>
                <p className="text-muted-foreground max-w-sm">
                    This profile may have been closed, or the link is incomplete.
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

    const title = `${profile.username} — Liquid Lore`;
    const description = profileMetaDescription(profile, recipeCount);

    return (
        <>
            <Head>
                <title>{title}</title>
                <meta name="description" content={description} />
                <link rel="canonical" href={canonicalUrl} />

                <meta property="og:type" content="profile" />
                <meta property="og:title" content={title} />
                <meta property="og:description" content={description} />
                <meta property="og:url" content={canonicalUrl} />
                {profile.avatarUrl && <meta property="og:image" content={profile.avatarUrl} />}

                <meta name="twitter:card" content={profile.avatarUrl ? 'summary_large_image' : 'summary'} />
                <meta name="twitter:title" content={title} />
                <meta name="twitter:description" content={description} />
                {profile.avatarUrl && <meta name="twitter:image" content={profile.avatarUrl} />}
            </Head>

            <UserProfile profileId={profile.id} initialProfile={profile} />
        </>
    );
}
