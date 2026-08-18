/**
 * next.config.js
 *
 * Build configuration for Liquid Lore.
 *
 * Recipe photography is served from third-party hosts, so every host we are willing to
 * render must be allow-listed here — next/image refuses unknown origins by design, and
 * an open `**` pattern is a documented DoS vector for the image optimizer.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  images: {
    remotePatterns: [
      // TheCocktailDB — drink photography for the ingested library.
      { protocol: 'https', hostname: 'www.thecocktaildb.com', pathname: '/images/**' },
      // Unsplash — editorial imagery for classics that have no CocktailDB photo.
      { protocol: 'https', hostname: 'images.unsplash.com' },
      // Supabase Storage — self-hosted assets (Milestone 4.3).
      { protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/public/**' },
    ],
    formats: ['image/avif', 'image/webp'],
  },

  // Surface the build's data provenance to the client without leaking service credentials.
  env: {
    NEXT_PUBLIC_APP_NAME: 'Liquid Lore',
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
