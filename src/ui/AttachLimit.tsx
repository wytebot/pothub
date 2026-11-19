import { ATTACH_LIMIT, ATTACH_WINDOW_MS, clockLabel, useAttachStatus, waitLabel } from '../quota/attachments';
import { ANALYSIS_LIMIT, ANALYSIS_WINDOW_MS, useAnalysisStatus } from '../quota/analysis';
import { Dialog } from './Dialog';

/** Shown when free attachments run out (or the last one is used): says exactly when they come back. */
export function AttachLimitDialog({ lastOne, onClose }: { lastOne?: boolean; onClose: () => void }) {
  const s = useAttachStatus(); const now = Date.now();
  const back = s.resetsAt;
  const hours = ATTACH_WINDOW_MS / 3_600_000;
  return (
    <Dialog title={lastOne ? 'That was your last free attachment' : 'Free attachments used up'} onClose={onClose}
      actions={<><a className="btn" href="#/billing" onClick={onClose}>See Premium</a><button className="btn primary" onClick={onClose}>Got it</button></>}>
      {s.unlimited || !back
        ? <p role="status">Your attachments are available again. You can attach files now.</p>
        : <>
          <p>Free accounts get <strong>{ATTACH_LIMIT} attachments every {hours} hours</strong>. Your attachments come back at:</p>
          <p className="attach-back" role="status"><strong>{clockLabel(back, now)}</strong><span className="muted small"> · in {waitLabel(back - now)}</span></p>
          <p className="muted small">Chatting, writing, and making images and videos stay unlimited in the meantime. Premium removes the attachment limit.</p>
        </>}
    </Dialog>
  );
}

/** Shown once, when the free file analyses run out. Pothub keeps answering; it just cannot read attached files until the time shown. */
export function AnalysisLimitDialog({ onClose }: { onClose: () => void }) {
  const s = useAnalysisStatus(); const now = Date.now(); const back = s.resetsAt;
  return (
    <Dialog title="Free file analysis used up" onClose={onClose}
      actions={<><a className="btn" href="#/billing" onClick={onClose}>See Premium</a><button className="btn primary" onClick={onClose}>Got it</button></>}>
      {s.unlimited || back === null
        ? <p role="status">File analysis is available again.</p>
        : <>
          <p>Free accounts get <strong>{ANALYSIS_LIMIT} file analyses every {ANALYSIS_WINDOW_MS / 3_600_000} hours</strong>. Pothub can read your attached files again at:</p>
          <p className="attach-back" role="status"><strong>{clockLabel(back, now)}</strong><span className="muted small"> · in {waitLabel(back - now)}</span></p>
          <p className="muted small">Until then Pothub still answers your questions, but it cannot analyze attached files, and it will tell you when a file was not read.</p>
        </>}
    </Dialog>
  );
}
