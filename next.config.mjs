/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep builds resilient for the MVP; turn ESLint on later if you add it.
  eslint: { ignoreDuringBuilds: true },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
};

export default nextConfig;
