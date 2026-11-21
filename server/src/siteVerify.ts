import { createHmac } from 'node:crypto';
import { fetchRawHtml, safeUrl } from './crawl';

export const META_NAME = 'pothub-site-verification';
const secret = () => process.env.SITE_VERIFY_SECRET || process.env.GITHUB_CLIENT_SECRET || process.env.FLW_WEBHOOK_HASH || '';
export const hostKey = (host: string) => host.toLowerCase().replace(/^www\./, '');

/** A stable token that only this signed-in account can get for this host. Nothing is stored: the server recomputes it. */
export function verificationToken(uid: string, host: string, key = secret()): string | null {
  if (!key) return null;
  return 'pothub-' + createHmac('sha256', key).update(`site:${uid}:${hostKey(host)}`).digest('hex').slice(0, 32);
}
export const verificationTag = (token: string) => `<meta name="${META_NAME}" content="${token}">`;

/** True when the page <head> carries the verification meta tag with exactly this token. */
export function hasVerificationTag(html: string, token: string): boolean {
  const head = html.split(/<\/head\s*>/i)[0] ?? '';
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const name = /\bname\s*=\s*["']?([^"'\s>]+)/i.exec(tag)?.[1];
    const content = /\bcontent\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (name?.toLowerCase() === META_NAME && content === token) return true;
  }
  return false;
}

export type SiteCheck = { ok: true; host: string } | { ok: false; status: number; error: string };

/** Opens the site and confirms the account's verification tag is in its <head>. */
export async function checkSite(uid: string, rawUrl: string): Promise<SiteCheck> {
  const u = await safeUrl(rawUrl);
  if (!u) return { ok: false, status: 400, error: 'Enter a public http or https website URL.' };
  const token = verificationToken(uid, u.hostname);
  if (!token) return { ok: false, status: 503, error: 'Site verification is not set up on the Pothub server yet. Add SITE_VERIFY_SECRET to the server environment.' };
  const page = await fetchRawHtml(u.toString());
  if (!page) return { ok: false, status: 422, error: 'Pothub could not open this site. Check that the address is correct, public and returns a normal web page.' };
  let finalHost = u.hostname; try { finalHost = new URL(page.url).hostname; } catch { /* keep the requested host */ }
  if (hostKey(finalHost) !== hostKey(u.hostname)) return { ok: false, status: 422, error: `This address redirects to ${finalHost}. Add that address as your site instead and verify it.` };
  if (!hasVerificationTag(page.body, token)) return { ok: false, status: 403, error: 'Verification tag not found in the <head> of this page. Paste the tag inside <head>, publish the change, then verify again.' };
  return { ok: true, host: hostKey(u.hostname) };
}
