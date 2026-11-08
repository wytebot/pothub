import React from 'react';
import { PIN_ALL_ITEM, activeMention, applyMention, rankFiles, showPinAll } from '../lib/repo-mentions.js';

/** State for the "@file" picker. Returns onKeyDown(e) -> true when the key was consumed by the picker. */
export default function useRepoMentions({ enabled, files, text, caret, onApply, pinned = false, onPinAll }) {
  const mention = enabled ? activeMention(text, caret) : null;
  const items = React.useMemo(() => { if (!mention) return []; const ranked = rankFiles(files, mention.query, 8); return !pinned && onPinAll && showPinAll(mention.query) ? [PIN_ALL_ITEM, ...ranked] : ranked; }, [mention?.start, mention?.query, files, pinned]); // eslint-disable-line react-hooks/exhaustive-deps
  const [index, setIndex] = React.useState(0);
  const [dismissed, setDismissed] = React.useState(-1);
  React.useEffect(() => { setIndex(0); }, [mention?.start, mention?.query]);
  React.useEffect(() => { if (!mention) setDismissed(-1); }, [mention]);
  const open = !!mention && items.length > 0 && dismissed !== mention.start;
  const pick = React.useCallback((item) => {
    if (!mention || !item) return;
    if (item.pinAll) { onApply({ text: text.slice(0, mention.start) + text.slice(Math.max(caret, mention.start + 1)), caret: mention.start }); onPinAll?.(); return; }
    onApply(applyMention(text, caret, mention, item.path));
  }, [mention, text, caret, onApply, onPinAll]);
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
