// Vite exposes every VITE_* variable to the browser. Reject secret-looking names before bundling.
import { existsSync, readFileSync } from 'node:fs';
const forbidden = /(?:SECRET|PRIVATE|PASSWORD|TOKEN|CREDENTIAL|SERVICE_ACCOUNT|ENCRYPTION_KEY|WEBHOOK_HASH|API_KEY|ACCESS_KEY|(?:OPENAI|GEMINI|ANTHROPIC|FLUTTERWAVE|STRIPE|PAYPAL).*KEY|(?:^|_)KEY$)/i;
const explicitlyPublic = new Set(['VITE_POTHUB_WEB_PUSH_VAPID_KEY']);
const keys = new Set(Object.keys(process.env));
for (const file of ['.env', '.env.local', '.env.production', '.env.production.local', '.env.development', '.env.development.local']) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.trim().match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match) keys.add(match[1]);
  }
}
const bad = [...keys].filter((key) => key.startsWith('VITE_') && !explicitlyPublic.has(key) && forbidden.test(key));
if (bad.length) {
  console.error(`Refusing to build: private-looking environment variables use the public VITE_ prefix: ${bad.join(', ')}`);
  process.exit(1);
}
