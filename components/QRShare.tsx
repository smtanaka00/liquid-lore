import React from 'react';
import { X, QrCode } from 'lucide-react';

interface QRShareProps {
  url: string;
  name: string;
  onClose: () => void;
}

export const QRShare: React.FC<QRShareProps> = ({ url, name, onClose }) => {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}&color=f59e0b&bgcolor=09090b`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-zinc-950 border border-zinc-800 p-8 rounded-[2.5rem] max-w-sm w-full relative animate-in zoom-in-95 duration-300">
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 p-2 text-zinc-500 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>

        <div className="text-center">
          <div className="inline-flex p-3 bg-amber-500/10 rounded-2xl mb-4">
            <QrCode className="text-amber-500" size={24} />
          </div>
          <h3 className="text-2xl font-serif text-white mb-2">Share the Lore</h3>
          <p className="text-zinc-500 text-xs uppercase tracking-widest font-bold mb-8">{name}</p>
          
          <div className="relative aspect-square w-full mb-8 bg-zinc-900 rounded-3xl p-6 border border-zinc-800 group">
            <div className="absolute inset-0 bg-amber-500/5 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
            <img 
              src={qrUrl} 
              alt="QR Code" 
              className="w-full h-full relative z-10 rounded-xl"
            />
          </div>

          <p className="text-zinc-400 text-xs leading-relaxed px-4">
            Have a friend scan this with their camera to instantly open this recipe on Liquid Lore.
          </p>
        </div>
      </div>
    </div>
  );
};
