import React from 'react';
import { activeMention, applyMention, rankFiles } from '../lib/repo-mentions.js';

/** State for the "@file" picker. Returns onKeyDown(e) -> true when the key was consumed by the picker. */
export default function useRepoMentions({ enabled, files, text, caret, onApply }) {
  const mention = enabled ? activeMention(text, caret) : null;
  const items = React.useMemo(() => (mention ? rankFiles(files, mention.query, 8) : []), [mention?.start, mention?.query, files]); // eslint-disable-line react-hooks/exhaustive-deps
  const [index, setIndex] = React.useState(0);
  const [dismissed, setDismissed] = React.useState(-1);
  React.useEffect(() => { setIndex(0); }, [mention?.start, mention?.query]);
  React.useEffect(() => { if (!mention) setDismissed(-1); }, [mention]);
  const open = !!mention && items.length > 0 && dismissed !== mention.start;
  const pick = React.useCallback((item) => { if (mention && item) onApply(applyMention(text, caret, mention, item.path)); }, [mention, text, caret, onApply]);
  const onKeyDown = (e) => {
    if (!open) return false;
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => (i + 1) % items.length); return true; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => (i - 1 + items.length) % items.length); return true; }
    if ((e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) || e.key === 'Tab') { e.preventDefault(); pick(items[index] || items[0]); return true; }
    if (e.key === 'Escape') { e.preventDefault(); setDismissed(mention.start); return true; }
    return false;
  };
  return { open, items, index, setIndex, pick, onKeyDown };
}
