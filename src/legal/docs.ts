export const LEGAL_VERSION = '1.2';
export const LEGAL_EFFECTIVE = '18 November 2026';
export interface LegalDoc { id: string; title: string; sections: [string, string][]; }

export const LEGAL_DOCS: LegalDoc[] = [
  { id: 'terms', title: 'Terms of Service', sections: [
    ['Agreement', 'These Terms govern your use of Pothub (the "App"), operated by its publisher ("we", "us"). By using the App you agree to them. If you do not agree, do not use the App. You must be old enough to form a binding contract where you live.'],
    ['What the App does', 'The App is a local creative workspace. It helps you send prompts to third-party AI providers using credentials you supply, store the results on your own device, and edit and export them. We do not operate the AI models and we do not host your media.'],
    ['Free and premium use', 'Creating images and videos in the App is unlimited for everyone. Free use includes 10 attachments (files, photos or videos added to a chat) and 10 file-analysis requests (each request may read one or more attached or generated source files) every 5 hours; if the file-analysis allowance is used up, the App still answers but does not read the files and says so. Premium is prepaid for a fixed period and does not renew automatically. It removes both limits, provides a larger recent-conversation context window, and expands web search to 30 searches per day with up to 8 results per search. Free users have 3 web searches per day with up to 3 results per search. Your AI providers may apply their own prices, quotas and rate limits, which are separate from the App.'],
    ['Your responsibilities', 'You are responsible for your provider accounts, keys, charges, prompts and uploaded material, and for keeping your device secure. You must follow the Acceptable Use Policy and the terms of every provider you use.'],
    ['Changes and availability', 'We may update the App and these Terms. Material changes will be shown in the App with a new version number and effective date. The App is provided as available; features that depend on third parties may change or stop working without notice.'],
    ['Governing law', 'These Terms are governed by the laws of the Federal Republic of Nigeria, and the courts of Nigeria have jurisdiction, without removing any consumer rights you have under mandatory law where you live.'],
  ]},
  { id: 'privacy', title: 'Privacy Policy', sections: [
    ['Summary', 'Your generated media, projects, chats and editing data are stored on your device. You can download a ZIP backup and restore it later. Backup files remain under your control; we do not receive them. We process only the limited account, subscription and payment metadata described below.'],
    ['Data kept on your device', 'Projects, images, video, audio, timelines, your chat history, attachment and file-analysis counters and your encrypted provider keys are stored locally in your browser or Android app storage. We cannot access, recover or delete this data for you.'],
    ['Data we process', 'When you buy premium we process your email, a license identifier, the plan, payment references, amounts, dates and premium end date. This is stored in Google Firestore and used to verify payments, prevent duplicate credit and meet legal and accounting duties. Card details are handled in transit only: they pass through our server to be encrypted and forwarded to Flutterwave, and are never stored or logged by us. Your media and projects are never sent to us.'],
    ['Web search', 'When you switch web search on, the words of your message (up to 200 characters) are sent to our server, which looks them up with a third-party search engine and returns the results. Free accounts receive 3 searches per day and up to 3 results per search; Premium receives up to 30 searches per day and up to 8 results per search. We do not store the search text. Do not switch it on for messages containing information you would not want searched.'],
    ['Data sent to AI providers', 'When you generate, your prompt, any reference media and your API key are sent directly from your device to the provider you chose. That provider processes them under its own terms and privacy policy. We do not receive your keys or prompts.'],
    ['Retention and your rights', 'Subscription and payment records are kept for as long as needed for billing, disputes and legal obligations. You may ask about, correct or request deletion of the metadata we hold, subject to those obligations, through the Support page. Where applicable law gives you additional rights, such as under the Nigeria Data Protection Act, we will honour them.'],
    ['Security', 'We use access controls and encryption in transit on our billing systems. Keys on your device are encrypted, but no client-side protection can stop someone with full control of your unlocked device or browser tools.'],
  ]},
  { id: 'acceptable-use', title: 'Acceptable Use Policy', sections: [
    ['Rules', 'Do not use the App to create, upload or distribute content that is illegal; sexualises minors; promotes violence, hatred or harassment; infringes intellectual property or privacy rights; impersonates real people to deceive; or is designed to defraud, malware-infect or otherwise harm others.'],
    ['Providers and safety systems', 'Do not attempt to bypass the safety systems, content policies or usage limits of any AI provider or of the App, or use another person\'s keys without permission.'],
    ['Enforcement', 'You are solely responsible for what you generate. We may refuse service, suspend a subscription or end access where use breaches this policy or the law.'],
  ]},
  { id: 'byok', title: 'BYOK and Third-Party AI Provider Disclosure', sections: [
    ['Bring your own key', 'The App works with API keys that you obtain from AI providers such as OpenAI, Google, Stability AI, Black Forest Labs, Luma, Kling, fal.ai and Replicate. You pay those providers directly. We do not resell AI usage and a subscription to the App does not include provider credits.'],
    ['Your keys', 'Keys are stored on your device, are masked after saving, and are sent only to the provider they belong to. A fingerprint or device-lock prompt controls access to the key page but is not itself encryption. Create keys with spending limits and revoke them with the provider if your device is lost.'],
    ['Third-party terms', 'Each provider has separate terms, privacy policy, pricing, content rules, regional availability and rate limits. You must comply with them. Providers can change or withdraw models at any time, which may affect features in the App.'],
  ]},
  { id: 'billing', title: 'Subscription and Billing Policy', sections: [
    ['Plans and price', 'Premium is sold as prepaid access: US$3 for one month or US$36 for one year. The amount charged is shown in Nigerian naira, converted at an exchange rate displayed before you pay, rounded up to the nearest ten naira. The final payable amount and billing currency are shown before you confirm.'],
    ['No automatic renewal', 'Premium does not renew automatically and we do not store your card for future charges. When your paid period ends, premium access ends unless you choose to pay again. Paying before the end date adds the new period on top of the time you have left.'],
    ['Payment processing', 'Payments are made by card and processed by Flutterwave. Your card details are sent from the App to our server only to be encrypted and forwarded to Flutterwave in the same request; we do not store or log them. Your bank may ask for a PIN, a one-time code or a verification page. Premium access is granted only after our server confirms the payment with Flutterwave, never from what the App displays.'],
    ['Records', 'Your premium end date and payment history can be viewed in the App. Your license is also saved to the Google account you signed in with, so signing in on a new device restores it. Keep a copy somewhere safe. Contact support if a charge looks wrong.'],
  ]},
  { id: 'refunds', title: 'Cancellation and Refund Policy', sections: [
    ['Nothing to cancel', 'Because premium is prepaid and never renews automatically, there is no subscription to cancel. You simply do not pay again when the period ends.'],
    ['Refunds', 'Because premium access starts immediately, payments are generally non-refundable once the period starts, except where required by law, where we charged you in error, or where you were charged twice. Request a refund through the Support page within 14 days of the charge and include the payment reference from your receipt.'],
    ['Free use', 'Image and video creation, and 10 attachments every 5 hours, are available without payment so you can evaluate the App before buying.'],
  ]},
  { id: 'copyright', title: 'Copyright and Intellectual Property Policy', sections: [
    ['Our rights', 'The App, its design and code belong to us or our licensors. These Terms give you a limited, non-exclusive right to use the App; they do not transfer ownership.'],
    ['Your content', 'You keep whatever rights you have in your prompts and uploaded media, and you must have the right to use anything you upload as a reference. Ownership of AI-generated output varies by law and by provider terms; we make no promise that output is protectable or free of third-party rights.'],
    ['Infringement reports', 'If you believe content or conduct involving the App infringes your rights, contact us through the Support page with the work concerned, your contact details and a statement of your rights. Because media is stored on users\' devices, we cannot remove content from them, but we may act on accounts and subscriptions.'],
  ]},
  { id: 'storage', title: 'Media Storage and Data Loss Disclaimer', sections: [
    ['Downloadable backups', 'Your work lives on this device until you download a Pothub backup ZIP. The backup includes chat history, projects and saved media. Store the ZIP somewhere safe; Pothub does not receive or host your backup. Restoring merges records and does not clear unrelated local data.'],
    ['You can lose your work', 'Uninstalling the app, clearing browser or site data, resetting or losing your device, storage cleanup tools, or the browser removing data when storage is low can permanently destroy your work. We cannot restore it.'],
    ['Your responsibility', 'Download a full backup regularly and keep copies somewhere you control. The Storage page shows how much space you are using and lets you request persistent storage, which reduces but does not remove the risk.'],
  ]},
  { id: 'ai-content', title: 'AI-Generated Content Disclaimer', sections: [
    ['Accuracy', 'AI output can be wrong, misleading, offensive, biased or similar to existing works. Review everything before you rely on or publish it.'],
    ['Disclosure and rights', 'You are responsible for complying with laws and platform rules on labelling AI-generated media, and for not using generated likenesses of real people without permission.'],
    ['No professional advice', 'Output is not legal, medical, financial or other professional advice.'],
  ]},
  { id: 'liability', title: 'Limitation of Liability', sections: [
    ['Disclaimer', 'To the fullest extent permitted by law, the App is provided "as is" without warranties of any kind, including fitness for a particular purpose, uninterrupted operation or error-free output.'],
    ['Limit', 'To the fullest extent permitted by law, we are not liable for indirect, incidental or consequential loss, lost data, lost profits, or charges made by AI providers, and our total liability for any claim is limited to the amount you paid us for the App in the 12 months before the claim.'],
    ['What this does not limit', 'Nothing here excludes liability that cannot be excluded by law, including for fraud or for death or personal injury caused by negligence.'],
  ]},
];
