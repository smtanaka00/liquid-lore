import { useEffect, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';

export const ConnectivityToast = () => {
    const [status, setStatus] = useState<'online' | 'offline' | null>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const handleOnline = () => {
            setStatus('online');
            setVisible(true);
            setTimeout(() => setVisible(false), 3000);
        };
        const handleOffline = () => {
            setStatus('offline');
            setVisible(true);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    if (!visible && status !== 'offline') return null;

    return (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] transition-all duration-500 transform ${visible ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'}`}>
            <div className={`px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 backdrop-blur-xl border ${status === 'online' ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}>
                {status === 'online' ? <Wifi size={18} /> : <WifiOff size={18} />}
                <span className="text-[10px] uppercase font-bold tracking-[0.2em]">
                    {status === 'online' ? 'Back Online: Sync Active' : 'Offline: Using Local Cache'}
                </span>
            </div>
        </div>
    );
};
