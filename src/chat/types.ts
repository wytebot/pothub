import type { AttachmentMeta } from '../agent/attachments';
import type { WebSource } from '../agent/research';

export interface ChatMessage {
  id: string; role: 'user' | 'assistant'; text: string; state?: 'working' | 'done' | 'error';
  kind?: 'text' | 'image' | 'video'; media?: string[]; jobId?: string;
  /** user messages: what was attached (names only, the bytes are not kept in the saved chat) */
  files?: AttachmentMeta[];
  /** assistant messages: a short friendly note under the reply (a problem, or something worth knowing) */
  note?: string; providers?: boolean; notes?: string[];
  /** assistant messages: a file that was built for the person (only lives while the app is open) */
  fileOut?: { name: string; size: number; mime?: string };
  /** assistant messages: the sites the web research drew on, shown under the reply. Only set when web results were used. */
  sources?: WebSource[];
}
