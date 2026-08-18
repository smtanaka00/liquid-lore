import { useState } from 'react';
import { supabase } from '../lib/supabase';

export function Auth({ onLogin }: { onLogin: () => void }) {
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');

        try {
            const { error } = await supabase.auth.signInWithOtp({
                email,
                options: {
                    emailRedirectTo: window.location.origin,
                },
            });

            if (error) throw error;
            setMessage('Check your email for the login link!');
        } catch (error: any) {
            setMessage(error.error_description || error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-3xl max-w-sm w-full">
                <h2 className="text-3xl font-serif text-amber-500 mb-2">Welcome Back</h2>
                <p className="text-zinc-400 mb-6 text-sm">Sign in via Magic Link to save your cabinet across devices.</p>

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <input
                            type="email"
                            placeholder="Your email address"
                            value={email}
                            required
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500 transition-colors"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-amber-600 hover:bg-amber-500 text-black font-bold py-3 rounded-xl transition-colors disabled:opacity-50"
                    >
                        {loading ? 'Sending...' : 'Send Magic Link'}
                    </button>
                </form>

                {message && <p className="mt-4 text-sm text-center text-amber-500">{message}</p>}
            </div>
        </div>
    );
}
