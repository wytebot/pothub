import type { ProviderId } from '../vault/vault';

export interface ProviderInfo {
  name: string;
  /** Plain-language note shown on the AI Providers page. */
  billing: string;
  /** Where the person gets a key. */
  keyFrom: string;
  image: boolean; video: boolean;
  /** true: the app can ask this provider which models exist right now. */
  lists: boolean;
  /** Added recently; shown with a Beta label until it has been proven with real keys. */
  beta?: boolean;
  keyHint?: string;
}
export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  openai: { name: 'OpenAI', billing: 'Charged to your OpenAI account per image or video. Some models need organization verification on OpenAI.', keyFrom: 'platform.openai.com', image: true, video: true, lists: true },
  gemini: { name: 'Google Gemini', billing: 'Charged to your Google AI Studio or Cloud billing account. Free-tier limits and regional availability are set by Google.', keyFrom: 'aistudio.google.com', image: true, video: true, lists: true },
  xai: { name: 'xAI (Grok)', billing: 'Charged to your xAI account per image.', keyFrom: 'console.x.ai', image: true, video: false, lists: false, beta: true },
  stability: { name: 'Stability AI', billing: 'Uses credits on your Stability AI account.', keyFrom: 'platform.stability.ai', image: true, video: false, lists: false, beta: true },
  bfl: { name: 'Black Forest Labs (FLUX)', billing: 'Uses credits on your Black Forest Labs account.', keyFrom: 'dashboard.bfl.ai', image: true, video: false, lists: false, beta: true },
  ideogram: { name: 'Ideogram', billing: 'Uses credits on your Ideogram API account.', keyFrom: 'ideogram.ai (API settings)', image: true, video: false, lists: false, beta: true },
  recraft: { name: 'Recraft', billing: 'Uses credits on your Recraft account.', keyFrom: 'recraft.ai (API settings)', image: true, video: false, lists: false, beta: true },
  together: { name: 'Together AI', billing: 'Charged to your Together AI account.', keyFrom: 'api.together.ai', image: true, video: false, lists: false, beta: true },
  leonardo: { name: 'Leonardo.Ai', billing: 'Uses credits on your Leonardo API plan.', keyFrom: 'app.leonardo.ai (API access)', image: true, video: false, lists: false, beta: true },
  luma: { name: 'Luma AI', billing: 'Charged to your Luma API account per image or video.', keyFrom: 'lumalabs.ai/api', image: true, video: true, lists: false, beta: true },
  minimax: { name: 'MiniMax (Hailuo)', billing: 'Charged to your MiniMax platform account.', keyFrom: 'minimax.io (platform)', image: true, video: true, lists: false, beta: true },
  zhipu: { name: 'Zhipu AI (CogView, CogVideoX)', billing: 'Charged to your Zhipu AI open platform account.', keyFrom: 'bigmodel.cn', image: true, video: true, lists: false, beta: true },
  byteplus: { name: 'BytePlus ModelArk (Seedream, Seedance)', billing: 'Charged to your BytePlus account.', keyFrom: 'console.byteplus.com (ModelArk)', image: true, video: true, lists: false, beta: true },
  kling: { name: 'Kling AI', billing: 'Uses credits on your Kling API account.', keyFrom: 'klingai.com (API)', image: true, video: true, lists: false, beta: true, keyHint: 'Enter your Access Key and Secret Key in their separate fields.' },
  huggingface: { name: 'Hugging Face', billing: 'Free tier limits apply; heavier use is billed by Hugging Face.', keyFrom: 'huggingface.co/settings/tokens', image: true, video: false, lists: false, beta: true },
  fal: { name: 'fal.ai', billing: 'Charged to your fal.ai account. One key opens many image and video models.', keyFrom: 'fal.ai/dashboard/keys', image: true, video: true, lists: false, beta: true },
  replicate: { name: 'Replicate', billing: 'Charged to your Replicate account. One key opens many image and video models.', keyFrom: 'replicate.com/account/api-tokens', image: true, video: true, lists: false, beta: true },
};
export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];
