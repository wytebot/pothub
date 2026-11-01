/**
 * Pothub runs as a normal Next.js application on Vercel so its API catch-all
 * and frontend are deployed together. Capacitor can still load the same app
 * from a local web build while using the configured remote API base URL.
 */
// Same expression as server/app.js `/api/version`: a client bundle whose id differs from the live
// server id is stale and refreshes itself (works even when the service worker cannot update).
const BUILD_ID = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || '';
const nextConfig = {
  trailingSlash: false,
  images: { unoptimized: true },
  poweredByHeader: false,
  reactStrictMode: true,
  env: { NEXT_PUBLIC_BUILD_ID: BUILD_ID },
  ...(BUILD_ID ? { generateBuildId: async () => BUILD_ID } : {}),
  async headers() {
    return [{ source: '/', headers: [{ key: 'Cache-Control', value: 'no-store, private, max-age=0, must-revalidate' }, { key: 'Pragma', value: 'no-cache' }] }];
  },
};
export default nextConfig;
