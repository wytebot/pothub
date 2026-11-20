/** Offline handling: a request that cannot be sent waits here and carries on by itself when the connection returns. */
export const NET_WAIT = 'net:wait';
let paused = 0;
export const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;
/** How many requests are waiting for the connection right now. */
export const pausedRequests = () => paused;

export function waitOnline(signal?: AbortSignal): Promise<void> {
  if (isOnline()) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    paused++; window.dispatchEvent(new Event(NET_WAIT));
    const finish = () => { window.removeEventListener('online', back); signal?.removeEventListener('abort', stop); paused = Math.max(0, paused - 1); window.dispatchEvent(new Event(NET_WAIT)); };
    // a short pause after the "online" signal lets the connection settle before the request is sent again
    const back = () => { finish(); setTimeout(resolve, 700); };
    const stop = () => { finish(); reject(new Error('Cancelled.')); };
    window.addEventListener('online', back);
    if (signal?.aborted) stop(); else signal?.addEventListener('abort', stop, { once: true });
  });
}
