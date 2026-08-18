import { useRouter } from 'next/router';
import { UserProfile } from '../../components/UserProfile';

export default function PublicProfilePage() {
    const router = useRouter();
    const { id } = router.query;

    if (!id) return null;

    return <UserProfile profileId={id as string} />;
}
