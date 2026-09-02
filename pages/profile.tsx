/**
 * pages/profile.tsx
 *
 * The signed-in user's own profile. `/profile/[id]` is the public view of someone else's.
 *
 * Deliberately not server-rendered and marked `noindex`: everything on it — the cabinet,
 * the favourites — is private to the session in this browser, so there is nothing here a
 * crawler or a shared-link preview should ever see.
 */

import Head from 'next/head';
import { UserProfile } from '../components/UserProfile';

export default function ProfilePage() {
    return (
        <>
            <Head>
                <title>Your Profile — Liquid Lore</title>
                <meta name="robots" content="noindex, nofollow" />
            </Head>
            <UserProfile />
        </>
    );
}
