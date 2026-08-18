import { 
  Wine, 
   Martini, // Note: Martini isn't always in Lucide, let's check
  Beer, 
  CupSoda,
  GlassWater
} from 'lucide-react';

// Custom SVG Icons for a premium feel where Lucide falls short
const RocksGlass = ({ size = 24, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M18 2H6v16c0 2 2 4 6 4s6-2 6-4V2z" />
    <path d="M6 8h12" />
  </svg>
);

const CoupeGlass = ({ size = 24, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M20 2c0 4-4 7-8 7s-8-3-8-7h16z" />
    <path d="M12 9v13" />
    <path d="M8 22h8" />
  </svg>
);

const MartiniGlass = ({ size = 24, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M19 2 12 11 5 2h14z" />
    <path d="M12 11v11" />
    <path d="M8 22h8" />
  </svg>
);

const HighballGlass = ({ size = 24, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M17 2H7v18c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2V2z" />
    <line x1="7" y1="6" x2="17" y2="6" />
  </svg>
);

const FluteGlass = ({ size = 24, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M15 2c0 5-2 8-3 8s-3-3-3-8h6z" />
    <path d="M12 10v12" />
    <path d="M9 22h6" />
  </svg>
);

export const GlassIcon = ({ name, size = 18, className = "" }: { name: string, size?: number, className?: string }) => {
  const n = name?.toLowerCase() || "";
  
  if (n.includes("cocktail") || n.includes("martini")) return <MartiniGlass size={size} className={className} />;
  if (n.includes("highball") || n.includes("collins")) return <HighballGlass size={size} className={className} />;
  if (n.includes("old fashioned") || n.includes("rocks") || n.includes("whiskey")) return <RocksGlass size={size} className={className} />;
  if (n.includes("coupe") || n.includes("margarita")) return <CoupeGlass size={size} className={className} />;
  if (n.includes("champagne") || n.includes("flute")) return <FluteGlass size={size} className={className} />;
  if (n.includes("shot")) return <GlassWater size={size} className={className} />;
  if (n.includes("beer") || n.includes("pint") || n.includes("mug")) return <Beer size={size} className={className} />;
  
  return <Wine size={size} className={className} />;
};
