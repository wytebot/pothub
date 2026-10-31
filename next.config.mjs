/**
 * Pothub runs as a normal Next.js application on Vercel so its API catch-all
 * and frontend are deployed together. Capacitor can still load the same app
 * from a local web build while using the configured remote API base URL.
 */
const nextConfig = {
  trailingSlash: false,
  images: { unoptimized: true },
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [{ source: '/', headers: [{ key: 'Cache-Control', value: 'no-store, private, max-age=0, must-revalidate' }, { key: 'Pragma', value: 'no-cache' }] }];
  },
};
export default nextConfig;
