// "Pin all files": a per-repository switch (the repo chat is one chat per repo) that tells PotHub to give the agent the whole
// repository through the terminal flow instead of only the files that were @mentioned.
const memory = new Map();
const keyOf = (repo) => `pothub:pin-all:${repo}`;

export function isRepoPinned(repo) {
  if (!repo) return false;
  if (memory.has(repo)) return memory.get(repo);
  let on = false;
  try { on = globalThis.localStorage?.getItem(keyOf(repo)) === '1'; } catch { /* storage can be blocked */ }
  memory.set(repo, on);
  return on;
}

export function setRepoPinned(repo, on) {
  if (!repo) return;
  memory.set(repo, !!on);
  try { if (on) globalThis.localStorage?.setItem(keyOf(repo), '1'); else globalThis.localStorage?.removeItem(keyOf(repo)); } catch { /* best effort */ }
}
