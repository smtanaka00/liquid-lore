import React from 'react';
import { X, QrCode } from 'lucide-react';

interface QRShareProps {
  url: string;
  name: string;
  onClose: () => void;
}

export const QRShare: React.FC<QRShareProps> = ({ url, name, onClose }) => {
  // Rendered black-on-white rather than in brand colours: low-contrast QR codes are
  // rejected by a meaningful share of phone cameras, and a code that doesn't scan is
  // worse than one that's off-palette.
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=8&data=${encodeURIComponent(url)}`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-background border border-border p-8 rounded-[2.5rem] max-w-sm w-full relative animate-in zoom-in-95 duration-300">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-6 right-6 p-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X size={20} />
        </button>

        <div className="text-center">
          <div className="inline-flex p-3 bg-primary/10 rounded-2xl mb-4">
            <QrCode className="text-primary" size={24} />
          </div>
          <h3 className="text-2xl font-serif text-foreground mb-2">Share the Lore</h3>
          <p className="text-muted-foreground text-xs uppercase tracking-widest font-bold mb-8">{name}</p>

          <div className="relative aspect-square w-full mb-8 bg-white rounded-3xl p-6 border border-border group">
            <img
              src={qrUrl}
              alt={`QR code linking to the ${name} recipe`}
              className="w-full h-full relative z-10"
            />
          </div>

          <p className="text-muted-foreground text-xs leading-relaxed px-4">
            Have a friend scan this with their camera to instantly open this recipe on Liquid Lore.
          </p>
        </div>
      </div>
    </div>
  );
};
