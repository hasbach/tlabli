/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      // Supabase Storage hosts owner-uploaded menu item photos (menu-photos bucket).
      { protocol: "https", hostname: "hacxmfxknczlftgmdrmg.supabase.co" },
    ],
  },
};

export default nextConfig;
