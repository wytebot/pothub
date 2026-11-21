export const LEGAL_VERSION = '2.2';
export const LEGAL_EFFECTIVE = '20 November 2026';
export interface LegalDoc { id: string; title: string; sections: [string, string][]; }

export const LEGAL_DOCS: LegalDoc[] = [
  { id: 'terms', title: 'Terms of Service', sections: [
    ['Agreement', 'These Terms govern your use of Pothub (the "App"), operated by its publisher ("we", "us"). By using the App you agree to them. If you do not agree, do not use the App. You must be old enough to form a binding contract where you live.'],
    ['What the App does', 'The App is a text-first AI workspace for chat, writing, research, code and document analysis. It sends requests to third-party AI providers using credentials you supply. We do not operate the AI models.'],
    ['BYOK use', 'Core chat, coding, file analysis, web search, site diagnosis and backlink snippets are available on the free tier with your own API keys. Website configuration is limited to one site on Free and up to five sites for Pro when subscription entitlements and checkout are enabled. AI providers may charge for API usage and enforce their own limits.'],
    ['Your responsibilities', 'You are responsible for your provider accounts, keys, charges, prompts and uploaded material, and for keeping your device secure. You must follow the Acceptable Use Policy and the terms of every provider you use.'],
    ['Changes and availability', 'We may update the App and these Terms. Material changes will be shown in the App with a new version number and effective date. The App is provided as available; features that depend on third parties may change or stop working without notice.'],
    ['Governing law', 'These Terms are governed by the laws of the Federal Republic of Nigeria, and the courts of Nigeria have jurisdiction, without removing any consumer rights you have under mandatory law where you live.'],
  ]},
  { id: 'privacy', title: 'Privacy Policy', sections: [
    ['Summary', 'Your chats, projects, provider keys, website configuration and diagnosis reports are kept on your device or in session-only browser storage. You can download a ZIP backup and restore it later. Backup files remain under your control; we do not receive them. Publisher crawling is optional: if you explicitly opt in, Pothub stores small article metadata and text excerpts in Firestore for shared citation discovery; they stop being eligible after 30 days and physical deletion depends on TTL configuration. We do not store AI keys or prompts on our servers.'],
    ['Data kept on your device', 'Your chat history, attachments, configured website URLs, diagnosis reports (session-only) and encrypted provider keys are stored locally in your browser or Android app storage. We cannot access, recover or delete this data for you.'],
    ['Data we process', 'Google sign-in is used for account authentication. Search/crawl requests are rate-limited; where server-side Firebase rate limiting is configured, only hashed rate-limit identifiers and counters are stored. Publisher index excerpts are stored only after the optional sharing checkbox is selected. Your chats, documents and provider keys are not sent to Pothub servers.'],
    ['Web search', 'Pothub may automatically search the web when current or externally verifiable information would improve a response. Search queries are sent to our server and a third-party search provider. Search is free for all accounts, subject to fair-use protections and provider availability. We do not store search text. Avoid asking Pothub to search for private information.'],
    ['Data sent to AI providers', 'When you use AI with a key saved on your device, your text prompt, attached documents and API key are sent directly from your device to the provider you chose. When you use a backend you connected, your prompt and attached documents pass through that backend, which adds the key from its own environment and forwards the request to the provider; the key never reaches your device. You are responsible for the backend you connect. Either way the provider processes your content under its own terms and privacy policy.'],
    ['Retention and your rights', 'Authentication and security records are kept only as needed to operate and secure the service. You may contact Support with privacy questions. Where applicable law gives you additional rights, such as under the Nigeria Data Protection Act, we will honour them.'],
    ['Security', 'We use access controls and encryption in transit on our research service. Keys on your device are encrypted, but no client-side protection can stop someone with full control of your unlocked device or browser tools.'],
  ]},
  { id: 'acceptable-use', title: 'Acceptable Use Policy', sections: [
    ['Rules', 'Do not use the App to create, upload or distribute content that is illegal; sexualises minors; promotes violence, hatred or harassment; infringes intellectual property or privacy rights; impersonates real people to deceive; or is designed to defraud, malware-infect or otherwise harm others.'],
    ['Providers and safety systems', 'Do not attempt to bypass the safety systems, content policies or usage limits of any AI provider or of the App, or use another person\'s keys without permission.'],
    ['Enforcement', 'You are solely responsible for what you generate. We may refuse service, suspend a subscription or end access where use breaches this policy or the law.'],
  ]},
  { id: 'byok', title: 'BYOK and Third-Party AI Provider Disclosure', sections: [
    ['Bring your own key', 'The App works with API keys that you obtain from AI providers such as OpenAI, Google, Anthropic, xAI, DeepSeek, Mistral, Groq, OpenRouter and Together AI for text services. You pay those providers directly. We do not resell AI usage or provider credits.'],
    ['Background jobs', 'When Background jobs is switched on in Settings, the request and your provider key are sent over HTTPS to the Pothub server so the answer can finish while the App is closed. The key is held in memory for that one job only; it is never written to disk or a database and is never logged. The finished answer is kept for 48 hours so the App can collect it, then deleted. Switch the setting off to run jobs only on your device.'],
    ['Your keys', 'Keys saved on your device are stored there, are masked after saving, and are sent only to the provider they belong to. Keys held by a backend you connect are not stored in the App at all: the App keeps only the backend's address, and the backend adds the key when it forwards your request to the provider. A fingerprint or device-lock prompt controls access to the key page but is not itself encryption. Create keys with spending limits and revoke them with the provider if your device is lost.'],
    ['Third-party terms', 'Each provider has separate terms, privacy policy, pricing, content rules, regional availability and rate limits. You must comply with them. Providers can change or withdraw models at any time, which may affect features in the App.'],
  ]},
  { id: 'copyright', title: 'Copyright and Intellectual Property Policy', sections: [
    ['Our rights', 'The App, its design and code belong to us or our licensors. These Terms give you a limited, non-exclusive right to use the App; they do not transfer ownership.'],
    ['Your content', 'You keep whatever rights you have in your prompts and uploaded text documents. Ownership of AI output varies by law and by provider terms; we make no promise that output is protectable or free of third-party rights.'],
    ['Infringement reports', 'If you believe content or conduct involving the App infringes your rights, contact us through the Support page with the work concerned, your contact details and a statement of your rights. Because media is stored on users\' devices, we cannot remove content from them, but we may act on accounts and subscriptions.'],
  ]},
  { id: 'storage', title: 'Media Storage and Data Loss Disclaimer', sections: [
    ['Downloadable backups', 'Your work lives on this device until you download a Pothub backup ZIP. Backups from older versions may also contain legacy project/media records. Store the ZIP somewhere safe; Pothub does not receive or host your backup. Restoring merges records and does not clear unrelated local data.'],
    ['You can lose your work', 'Uninstalling the app, clearing browser or site data, resetting or losing your device, storage cleanup tools, or the browser removing data when storage is low can permanently destroy your work. We cannot restore it.'],
    ['Your responsibility', 'Download a full backup regularly and keep copies somewhere you control. The Storage page shows how much space you are using and lets you request persistent storage, which reduces but does not remove the risk.'],
  ]},
  { id: 'ai-content', title: 'AI-Generated Content Disclaimer', sections: [
    ['Accuracy', 'AI output can be wrong, misleading, offensive, biased or similar to existing works. Review everything before you rely on or publish it.'],
    ['Disclosure and rights', 'You are responsible for complying with laws and platform rules applicable to your AI-generated text and any material you upload.'],
    ['No professional advice', 'Output is not legal, medical, financial or other professional advice.'],
  ]},
  { id: 'liability', title: 'Limitation of Liability', sections: [
    ['Disclaimer', 'To the fullest extent permitted by law, the App is provided "as is" without warranties of any kind, including fitness for a particular purpose, uninterrupted operation or error-free output.'],
    ['Limit', 'To the fullest extent permitted by law, we are not liable for indirect, incidental or consequential loss, lost data, lost profits, or charges made by AI providers, and our total liability for any claim is limited to the amount you paid us for the App in the 12 months before the claim.'],
    ['What this does not limit', 'Nothing here excludes liability that cannot be excluded by law, including for fraud or for death or personal injury caused by negligence.'],
  ]},
];
