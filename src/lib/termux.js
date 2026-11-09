import { Capacitor, registerPlugin } from '@capacitor/core';
import { createTermuxClient } from './termux-core';

export { cleanTerminalText, redactSecrets, safeWorkspaceName, TERMUX_HOME } from './termux-core';

// Native bridge (android-template/.../TermuxRuntimePlugin.java). Only exists inside the Android APK.
const Plugin = registerPlugin('TermuxRuntime');

export const isNativeAndroid = () => {
  try { return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'; } catch { return false; }
};

const OUTDATED = 'This APK was built before Termux streaming support was added. Rebuild the APK, then run "npm run android:configure".';
const isMissingPlugin = (error) => /not implemented|unimplemented|not available/i.test(String(error?.message || error || ''));

/** Fast, side-effect-free status: installed? permission granted? (No command is run.) */
export async function getTermuxStatus() {
  if (!isNativeAndroid()) {
    return { platform: 'browser', supported: false, installed: false, permissionGranted: false, message: 'Termux runs commands on your Android phone. Open PotHub in the Android app to use it.' };
  }
  try {
    return { platform: 'android', ...(await Plugin.status()) };
  } catch (error) {
    if (isMissingPlugin(error)) return { platform: 'android', supported: false, outdated: true, installed: false, permissionGranted: false, message: OUTDATED };
    return { platform: 'android', supported: false, installed: false, permissionGranted: false, message: String(error?.message || error) };
  }
}

export async function requestTermuxPermission() {
  if (!isNativeAndroid()) throw new Error('Termux is only available in the Android app.');
  try { return await Plugin.requestPermission(); } catch (error) { throw isMissingPlugin(error) ? new Error(OUTDATED) : error; }
}

export async function openTermux() {
  if (!isNativeAndroid()) throw new Error('Termux is only available in the Android app.');
  try { await Plugin.openTermux(); } catch (error) { throw isMissingPlugin(error) ? new Error(OUTDATED) : error; }
}

// `approved: true` here is the native-side guard. Whether a person approved a *specific* command is decided by the
// caller (Terminal page dialog, or executeAgentCommand's `approved` argument).
const exec = (options) => Plugin.exec({ ...options, approved: true });

/** Streaming client: run(), follow(), stop(), list(), writeProject(), probe(). */
export const termux = createTermuxClient({ exec });

/** Full readiness check: status, then a real round trip to Termux (proves allow-external-apps works). */
export async function checkTermux() {
  const status = await getTermuxStatus();
  if (!status.installed || !status.permissionGranted) return { ...status, connected: false };
  try {
    const probe = await termux.probe();
    return { ...status, connected: true, probe };
  } catch (error) {
    return { ...status, connected: false, error: String(error?.message || error) };
  }
}
