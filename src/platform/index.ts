import { Capacitor } from '@capacitor/core';

export interface Platform {
  kind: 'web' | 'android';
  init(): void;
  /** Saves a file for the user. Resolves 'cancelled' if they dismiss the dialog. */
  saveFile(blob: Blob, fileName: string): Promise<'saved' | 'cancelled'>;
}

const web: Platform = {
  kind: 'web',
  init() { if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js').catch(() => {}); },
  async saveFile(blob, fileName) {
    const w = window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<{ createWritable(): Promise<{ write(b: Blob): Promise<void>; close(): Promise<void> }> }> };
    if (w.showSaveFilePicker) {
      try {
        const h = await w.showSaveFilePicker({ suggestedName: fileName });
        const s = await h.createWritable(); await s.write(blob); await s.close();
        return 'saved';
      } catch (e) { if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'; /* fall through to download */ }
    }
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: fileName });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return 'saved';
  },
};

const android: Platform = {
  kind: 'android',
  init() {
    void (async () => {
      const [{ App }, { StatusBar, Style }] = await Promise.all([import('@capacitor/app'), import('@capacitor/status-bar')]);
      await StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
      await StatusBar.setBackgroundColor({ color: '#0d0d0d' }).catch(() => {});
      await App.addListener('backButton', ({ canGoBack }) => { const hashPath = location.hash.slice(1) || '/'; if (hashPath !== '/') { if (canGoBack) history.back(); else location.hash = '#/'; } else if (canGoBack) history.back(); else void App.exitApp(); });
    })();
  },
  async saveFile(blob, fileName) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
    // Base64 round trip holds the whole file in memory; large-file streaming comes with the native media work.
    const data = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
    const { uri } = await Filesystem.writeFile({ path: fileName, data, directory: Directory.Cache });
    try { await Share.share({ title: fileName, url: uri }); return 'saved'; }
    catch { return 'cancelled'; }
  },
};

export const platform: Platform = Capacitor.isNativePlatform() ? android : web;
