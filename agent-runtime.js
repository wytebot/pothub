import { Capacitor, registerPlugin } from '@capacitor/core';

const TermuxRuntime = registerPlugin('TermuxRuntime');

/** Shared execution-provider interface for all PotHub agents. */
export async function getExecutionCapabilities() {
  if (!Capacitor.isNativePlatform()) return { platform: 'browser', local: false, cloud: true, providers: ['cloud'] };
  try {
    const status = await TermuxRuntime.status();
    return { platform: 'android', local: !!status.installed, cloud: true, providers: status.installed ? ['termux', 'cloud'] : ['cloud'], termux: status };
  } catch (error) {
    return { platform: 'android', local: false, cloud: true, providers: ['cloud'], error: error?.message || String(error) };
  }
}

/** Executes only after the calling UI has obtained explicit user approval. */
export async function executeAgentCommand({ command, cwd = '', approved = false, provider = 'auto', cloudExecute } = {}) {
  if (!String(command || '').trim()) throw new Error('Enter a command to execute.');
  if (!approved) throw new Error('Approve this command before execution.');
  const capabilities = await getExecutionCapabilities();
  if ((provider === 'termux' || (provider === 'auto' && capabilities.local)) && capabilities.local) {
    const result = await TermuxRuntime.run({ command: String(command), cwd: String(cwd || ''), approved: true });
    return { ...result, provider: 'termux', success: Number(result.exitCode) === 0 };
  }
  if (provider === 'termux' && !capabilities.local) throw new Error(capabilities.termux?.message || 'Termux is unavailable on this device.');
  if (typeof cloudExecute === 'function') return { ...(await cloudExecute({ command, cwd })), provider: 'cloud' };
  throw new Error('No execution provider is configured. Connect Termux on Android or configure the PotHub cloud runner.');
}

export async function stopAgentCommand({ executionId, provider = 'cloud', cloudStop } = {}) {
  if (provider === 'termux') return TermuxRuntime.stop({ executionId: String(executionId || '') });
  if (typeof cloudStop === 'function') return cloudStop({ executionId });
  return { stopped: false, message: 'No cancellation provider is configured.' };
}
