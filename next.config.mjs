/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      // Supabase Storage hosts owner-uploaded menu item photos (menu-photos bucket).
      { protocol: "https", hostname: "hacxmfxknczlftgmdrmg.supabase.co" },
    ],
  },
  // The driver page URL carries the driver's magic-link token — never leak it
  // through the Referer header (Google Maps / tel: links) or search indexing.
  async headers() {
    return [
      {
        source: "/driver/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
