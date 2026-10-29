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
};
export default nextConfig;
