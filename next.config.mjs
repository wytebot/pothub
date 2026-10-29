/**
 * Pothub frontend migrated to Next.js. Static export keeps the same browser UI
 * usable by Capacitor; the existing Vercel /api serverless entrypoints remain
 * the backend and continue to own all secrets and operations.
 */
const nextConfig = {
  output: 'export',
  trailingSlash: false,
  images: { unoptimized: true },
  poweredByHeader: false,
  reactStrictMode: true,
};
export default nextConfig;
