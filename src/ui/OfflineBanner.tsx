import { useEffect, useState } from 'react';
import { isOnline, NET_WAIT, pausedRequests } from '../models/online';

/** Shown only while the device is offline. Saved chats and projects keep working; anything waiting to send continues by itself. */
export function OfflineBanner() {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1); const ev = ['online', 'offline', NET_WAIT];
    for (const e of ev) window.addEventListener(e, f);
    return () => { for (const e of ev) window.removeEventListener(e, f); };
  }, []);
  if (isOnline()) return null;
  const waiting = pausedRequests() > 0;
  return <div className="offline-banner" role="status">{waiting ? 'You’re offline. Your request is paused and will continue automatically when you’re back online.' : 'You’re offline. Your saved chats and projects still open; anything you send will wait and continue when you’re back online.'}</div>;
}
