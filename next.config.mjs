/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      // Supabase Storage will host owner-uploaded menu item photos once connected.
      // Add your Supabase project's storage hostname here after setup, e.g.:
      // { protocol: 'https', hostname: '<project-ref>.supabase.co' },
    ],
  },
};

export default nextConfig;
