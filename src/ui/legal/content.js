export const CONTACT_EMAIL = 'wytetechcompany@gmail.com';
export const LAST_UPDATED = '10 November 2026';
const mail = `mailto:${CONTACT_EMAIL}`;

/** Every page: { id, title, intro, sections: [{ h, p?: string[], ul?: string[], steps?: string[] }] } */
export const INFO_PAGES = {
  how: {
    title: 'How PotHub works',
    intro: 'A page-by-page guide: what each part of PotHub is for, what you can do there, and exactly how to do it.',
    sections: [
      { h: 'Start here', p: ['PotHub is a workspace for chatting with AI, making images and video, and building software. It uses only the AI agents you add yourself, so your keys, your models and your costs stay under your control.'], steps: ['Sign in with Google (Creator), GitHub (Developer) or Vercel.', 'Open API & Agents and add an agent: pick a function (Chat, Image, Video, Diagnosis or Fix generation), a provider, a model and your API key.', 'Go to Chat and send a message. That is all you need for the basics.'] },
      { h: 'Chat', p: ['Your main page. Everything you ask here goes to the agent you configured for the matching function.'], ul: ['Send a message with the arrow button. Tap Stop to cancel a reply that is still being written.', 'Attach files or up to two images with the paperclip. Documents, PDFs, spreadsheets and zip files are read for you.', 'Pick which agent answers with the agent button under the message box.', 'Under each reply: Copy, Regenerate and Share. Under your own message: Copy, Edit and Share. Editing re-sends from that point.', 'Ask for a file and PotHub builds it: “make this a PDF”, “give me an Excel sheet”, “export as JSON”.', 'Open a repository chat to talk about your code. Type @ to pick files, or just ask and the agent reads what it needs.'] },
      { h: 'Choosing the AI with your words', p: ['You never have to touch a setting. PotHub reads your prompt, in any wording or shape, and sends it to the right place.'], ul: ['Name a provider or model: “use Claude”, “ask Gemini”, “with gpt-4o”, “@deepseek explain this”, “claude: summarise”. PotHub sends it to your matching agent and keeps your other agents as backups.', 'Add a header line: “model: gpt-4o-mini” then your question on the next line. A JSON prompt such as {"model":"gemini","prompt":"…"} works too.', 'Use a command: “/image a red fox”, “/video waves at sunset”, “/fix the login bug”, “/debug why does this crash”.', 'Plain requests also work: “draw a lighthouse” goes to your Image agent, “fix this error” goes to Fix generation.', 'If you name a provider you have not added, PotHub uses your normal agent instead of failing.'] },
      { h: 'Library', p: ['Your history: past chats, generated images, videos and files.'], ul: ['Tap a chat to continue it. Search to find an old answer.', 'Generated files can be saved to your device from here.'] },
      { h: 'Creator tools', p: ['Launchpad, free tools and the arcade.'], ul: ['Launchpad shows your daily credits and the tools available to you.', 'Free tools run without using your agents.', 'The arcade is for a break between tasks.'] },
      { h: 'API & Agents', p: ['Where you connect AI providers. PotHub never substitutes its own AI: if no agent is set for a task, it asks you to add one.'], steps: ['Tap Add agent and choose the function it will handle.', 'Choose a provider, then a model. Use Discover models to list what your key can use.', 'Paste your API key and tap Test, then Save.', 'Add backup models. If the first one fails, PotHub tries the next, then your other agents for the same function.', 'Set one agent as default per function. Your keys are encrypted on your device.'] },
      { h: 'Prompt library', p: ['Save prompts you reuse.'], ul: ['Save a prompt, give it a name, tap it later to drop it into Chat.'] },
      { h: 'Codelab (GitHub)', p: ['For developers. Needs GitHub sign-in.'], ul: ['Repositories lists your repos. Open one to browse files, branches and commits.', 'Project is the workspace for a repository: files, an AI assistant that edits code, and a review step before anything is committed.', 'Actions shows GitHub Actions runs. Terminal runs commands through Termux on Android.', 'Nothing is written to GitHub until you approve it.'] },
      { h: 'Build & deploy, Developer tools, Build logs', p: ['Shortcuts for shipping what you build.'], ul: ['Build & deploy starts builds and deployments.', 'Developer tools diagnose errors and suggest fixes.', 'Build logs shows the output of recent builds so you can see what failed.'] },
      { h: 'Vercel Backend', p: ['Manage your Vercel projects from PotHub. Four tabs: Projects, Logs, Variables and AI backend.'], steps: ['Sign in with Vercel or add an access token. A token is the most reliable way: open vercel.com/account/settings/tokens, name it, set Scope to All projects, tap Create, copy it, paste it into PotHub and tap Save token.', 'Projects: pick the project you are working on, or import a GitHub repository.', 'Logs: see recent deployment and runtime logs.', 'Variables: add, edit or remove environment variables.', 'AI backend: let a project use its own server-side AI settings.', 'If Vercel says you must re-authenticate for a scope, tap Confirm access. You can confirm on Vercel, sign in again, or paste a token made for that scope.'] },
      { h: 'App icon & themes', p: ['Change the colour theme and the app icon. The launcher icon on Android can change too; it may take a few seconds to refresh.'] },
      { h: 'Credits', p: ['Some actions use credits. Open Credits to see your balance and buy a pack. Payments are handled by Flutterwave. Your own API usage is billed by your provider, not by PotHub.'] },
      { h: 'Settings, Security & backup, Linked accounts', ul: ['Settings: preferences and notifications.', 'Security & backup: lock the app with biometrics or a PIN, and export or restore a backup of your data.', 'Linked accounts: connect or reconnect GitHub and Vercel.'] },
      { h: 'Notifications and background work', ul: ['Allow notifications when asked. When a reply finishes while you are in another app, PotHub shows it. Tap it to jump to that chat.', 'On Android a small “PotHub is working” notice appears while a reply is being generated in the background. It keeps the reply from being cut off.', 'Push notifications that arrive even when the app is closed need the optional Firebase setup described in the setup guide.'] },
      { h: 'Gestures and shortcuts', ul: ['On a phone, swipe right from the left edge to open the menu and swipe left to close it.', 'The Android Back button closes sheets first, then goes back one screen, then leaves the app.', 'Light vibrations confirm sends, successes and errors where your device supports them.'] },
      { h: 'When something goes wrong', ul: ['“PotHub is busy”: wait a few seconds. PotHub already retries for you.', 'A file cannot be read from your repository: the path is wrong for that branch. Ask the agent to use a path from the outline or to search for the file name.', 'Sign-in problems: close the sign-in sheet and try again, or use another provider.', 'Still stuck? Email ' + CONTACT_EMAIL + ' and include the reference code shown in the error.'] },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    intro: `PotHub respects your privacy. This policy explains what we collect, why, who sees it and the choices you have. Last updated ${LAST_UPDATED}.`,
    sections: [
      { h: 'Who we are', p: [`PotHub is operated by Wyte Tech. Questions about this policy: ${CONTACT_EMAIL}.`] },
      { h: 'What we collect', ul: ['Account details from the sign-in provider you choose (Google, GitHub or Vercel): your name, email address, profile picture and a provider account ID.', 'Content you create: chats, prompts, attachments, generated files and saved agents. This is stored on your device. If cloud sync is on, an account-linked copy is stored with our cloud database so your data follows you between devices.', 'API keys you add for AI providers. They are encrypted on your device. If cloud sync is on, they are stored encrypted on our servers so they sync to your other devices.', 'Access tokens for GitHub and Vercel, stored encrypted on our servers and used only to act on your behalf when you ask.', 'Billing records: credit balance, purchases and payment references. Card details go directly to our payment processor, Flutterwave, and are never stored by PotHub.', 'Technical data: request reference IDs, error logs, device and app version, and IP address for security and rate limiting.', 'Notification data: if you turn on push notifications, a device token. Notification text is generated from your own replies on your device.'] },
      { h: 'How we use it', ul: ['To sign you in and keep your session secure.', 'To send your prompts to the AI providers you configured and return the answers.', 'To act on GitHub and Vercel only when you ask, and only with the permissions you granted.', 'To run credits, payments and fraud prevention.', 'To fix bugs, keep the service reliable and prevent abuse.'] },
      { h: 'Who receives your data', p: ['We do not sell your personal data and we do not show ads.'], ul: ['AI providers you configure (for example Google, OpenAI, Anthropic, DeepSeek, Mistral or any custom endpoint). Your prompt, attachments and chat context are sent to them to produce a reply. Their own privacy policies apply to what they receive.', 'Google Firebase for sign-in and database services, Vercel for hosting, GitHub and Vercel when you connect them, and Flutterwave for payments.', 'Authorities, when the law requires it.'] },
      { h: 'AI content', p: ['Replies are generated by third-party models and can be wrong or incomplete. Do not rely on them for medical, legal or financial decisions without checking.'] },
      { h: 'Retention', ul: ['Data on your device stays until you delete it or uninstall the app.', 'Cloud copies, account records and encrypted tokens stay while your account is active and are deleted when you ask us to delete your account.', 'Security and billing records may be kept for as long as needed to meet legal, tax and fraud-prevention obligations.'] },
      { h: 'Your choices and rights', ul: ['Disconnect GitHub or Vercel at any time from Linked accounts, and revoke PotHub in those services’ settings.', 'Turn notifications off in Settings or in your device settings.', 'Export your data from Security & backup.', `Ask us to access, correct or delete your data by emailing ${CONTACT_EMAIL}. See Data deletion for the steps.`, 'Depending on where you live you may have further rights, such as objecting to or restricting processing, or complaining to your data protection authority.'] },
      { h: 'Security', p: ['Keys and tokens are encrypted, sessions are revocable, and connections use HTTPS. No system is perfectly secure. Keep your device and accounts protected, and use the app lock in Security & backup.'] },
      { h: 'Children', p: ['PotHub is not for children under 13, or under the age of digital consent where you live. If you believe a child has used PotHub, email us and we will delete the account.'] },
      { h: 'International transfers', p: ['Our providers operate in several countries, so your data may be processed outside the country where you live. We rely on the safeguards those providers offer.'] },
      { h: 'Changes', p: ['If we change this policy we will update the date above and, for significant changes, tell you in the app.'] },
      { h: 'Contact', p: [`Email ${CONTACT_EMAIL}.`] },
    ],
  },
  terms: {
    title: 'Terms of Service',
    intro: `By using PotHub you agree to these terms. Last updated ${LAST_UPDATED}.`,
    sections: [
      { h: '1. The service', p: ['PotHub is a workspace that connects you to AI providers, GitHub and Vercel that you choose. We provide the software; the AI models and platforms belong to their providers.'] },
      { h: '2. Your account', ul: ['You must be at least 13 and able to form a binding agreement where you live.', 'Keep your sign-in and device secure. You are responsible for activity under your account.', 'Give accurate information and tell us if you suspect unauthorised access.'] },
      { h: '3. Your keys, your costs', p: ['PotHub uses the API keys and tokens you add. Charges from AI providers, GitHub, Vercel and others are between you and them. You are responsible for keeping keys private and for any usage on them.'] },
      { h: '4. Credits and payments', ul: ['Some features use credits. Prices and daily allowances are shown in the app and can change going forward.', 'Payments are processed by Flutterwave. For billing problems, email ' + CONTACT_EMAIL + ' with your payment reference.', 'Credits have no cash value and cannot be transferred. Nothing here limits rights you have under consumer law.'] },
      { h: '5. Your content', p: ['You own what you create. You give us only the permission needed to run the service: to store, process and transmit your content so PotHub works for you, including sending it to the providers you choose. You are responsible for having the right to use what you upload.'] },
      { h: '6. Acting on your accounts', p: ['When you ask PotHub to change a repository or a Vercel project, it acts with the access you granted. Review changes before approving them. Actions on GitHub and Vercel can be hard to undo; you are responsible for what you approve.'] },
      { h: '7. AI output', p: ['AI output can be inaccurate, biased or unsuitable. Check it before relying on it, and before running generated code, especially on production systems.'] },
      { h: '8. Acceptable use', p: ['You agree to follow the Acceptable Use policy.'] },
      { h: '9. Availability and changes', p: ['We work to keep PotHub reliable but do not promise uninterrupted service. Features can change or be removed. We can update these terms and will tell you about material changes.'] },
      { h: '10. Suspension and ending', p: ['You can stop using PotHub at any time and ask us to delete your account. We can suspend or end access if these terms are broken, if the law requires it, or to protect the service or other people.'] },
      { h: '11. Disclaimers', p: ['PotHub is provided “as is” and “as available”, without warranties of any kind to the fullest extent the law allows, including fitness for a particular purpose and non-infringement.'] },
      { h: '12. Limit of liability', p: ['To the fullest extent the law allows, PotHub and its operator are not liable for indirect, incidental or consequential damages, or for loss of data, profits or goodwill, arising from your use of the service. Our total liability for any claim is limited to the amount you paid us in the 12 months before the claim. Nothing excludes liability that cannot be excluded by law.'] },
      { h: '13. Governing law', p: ['These terms are governed by the laws of the country where the operator is established, without regard to conflict-of-law rules, and disputes go to the competent courts there, unless mandatory consumer law gives you a different right.'] },
      { h: '14. Contact', p: [`Email ${CONTACT_EMAIL}.`] },
    ],
  },
  aup: {
    title: 'Acceptable Use',
    intro: 'PotHub is for building and creating. These rules keep it safe for everyone.',
    sections: [
      { h: 'Do not use PotHub to', ul: ['Break the law or help others do so.', 'Create or share sexual content involving minors, or content that exploits or endangers children.', 'Harass, threaten, defraud, impersonate or deceive people, or generate disinformation meant to mislead.', 'Create malware, run attacks, or access systems or accounts you do not have permission to use.', 'Infringe other people’s copyright, trademarks or privacy.', 'Generate content that gives serious uplift toward weapons capable of mass harm.', 'Probe, overload or circumvent the security, rate limits, credit or billing systems of PotHub or its providers.', 'Share your sign-in, or resell access, without our written permission.'] },
      { h: 'Provider rules also apply', p: ['Each AI provider, GitHub and Vercel have their own usage policies. Using your key with PotHub means you must follow them as well.'] },
      { h: 'Enforcement', p: [`We can remove content, limit features or suspend accounts that break these rules. To report abuse email ${CONTACT_EMAIL}.`] },
    ],
  },
  data: {
    title: 'Data deletion',
    intro: 'You can remove your data at any time.',
    sections: [
      { h: 'On your device', ul: ['Delete individual chats, files or agents inside the app.', 'Uninstalling the Android app, or clearing site data in your browser, removes everything stored on that device.', 'Use Security & backup to export a backup first if you want to keep a copy.'] },
      { h: 'Disconnect other services', ul: ['Linked accounts: disconnect GitHub or Vercel. This removes the stored tokens from PotHub.', 'Also revoke PotHub in GitHub (Settings, Applications) and Vercel (Settings, Integrations or Tokens) if you want to be thorough.'] },
      { h: 'Delete your account and cloud data', steps: [`Email ${CONTACT_EMAIL} from the address linked to your account, with the subject “Delete my PotHub data”.`, 'Tell us which sign-in you use (Google, GitHub or Vercel).', 'We will confirm it is you, delete your account, cloud copies, encrypted keys and tokens, and reply when it is done. This normally takes up to 30 days.'] },
      { h: 'What we may keep', p: ['Payment and security records that we must keep for legal, tax or fraud-prevention reasons, for as long as the law requires.'] },
    ],
  },
  cookies: {
    title: 'Cookies and local storage',
    intro: 'PotHub uses only what it needs to work. No advertising or cross-site tracking.',
    sections: [
      { h: 'What is stored on your device', ul: ['A session cookie or secure token that keeps you signed in.', 'Browser storage (IndexedDB and local storage) for your chats, settings, saved agents and theme.', 'A service worker and small cache so the app opens quickly and can show update notices.', 'On Android, an encrypted secure-storage entry for your session and encryption key.', 'A notification preference, and a push token if you enable push.'] },
      { h: 'Control', p: ['Clear site data in your browser, or uninstall the app, to remove all of it. Blocking storage will stop sign-in and saving from working.'] },
    ],
  },
  contact: {
    title: 'Contact',
    intro: 'We read every message.',
    sections: [
      { h: 'Email', p: [`${CONTACT_EMAIL}`] },
      { h: 'Include when you write', ul: ['What you were doing and what happened.', 'The reference code shown in the error message, if there is one.', 'Your device and whether you use the app or the browser.', 'Never send passwords, API keys or tokens.'] },
      { h: 'Privacy, deletion and legal requests', p: ['Use the same address and put the topic in the subject line, for example “Delete my PotHub data” or “Privacy request”.'] },
    ],
  },
};

export const INFO_ORDER = ['how', 'privacy', 'terms', 'aup', 'data', 'cookies', 'contact'];
export const INFO_LABELS = { how: 'How it works', privacy: 'Privacy', terms: 'Terms', aup: 'Acceptable use', data: 'Data deletion', cookies: 'Cookies & storage', contact: 'Contact' };
export const CONTACT_HREF = mail;
