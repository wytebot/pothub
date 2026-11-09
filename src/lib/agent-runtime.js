import { getTermuxStatus, termux } from './termux';

/**
 * Shared execution-provider interface for every PotHub agent (Chat, Diagnosis, Fix, Codelab, Creator...).
 *  - 'termux': runs on the person's phone inside Termux, with live output, a real Stop, and exit codes.
 *  - 'cloud' : only if the caller supplies a cloudExecute function (PotHub provisions no hosted shell itself).
 */
export async function getExecutionCapabilities() {
  const status = await getTermuxStatus();
  const local = Boolean(status.installed && status.permissionGranted);
  return {
    platform: status.platform,
    local,
    cloud: true,
    providers: local ? ['termux', 'cloud'] : ['cloud'],
    termux: status,
  };
}

/**
 * Run one command. Execution only happens after the calling UI has obtained explicit user approval.
 * Streaming: pass onOutput(text) / onState(state) / onStart(jobId); pass an AbortSignal to stop the command.
 * stdout and stderr arrive interleaved in `output` (as a terminal shows them).
 */
export async function executeAgentCommand({ command, cwd = '', approved = false, provider = 'auto', cloudExecute, onOutput, onState, onStart, signal } = {}) {
  if (!String(command || '').trim()) throw new Error('Enter a command to execute.');
  if (!approved) throw new Error('Approve this command before execution.');
  const capabilities = await getExecutionCapabilities();
  const useTermux = (provider === 'termux' || provider === 'auto') && capabilities.local;
  if (useTermux) {
    const result = await termux.run({ command: String(command), cwd: String(cwd || ''), onOutput, onState, onStart, signal });
    return { ...result, provider: 'termux', executionId: result.jobId, stdout: result.output, stderr: '' };
  }
  if (provider === 'termux') throw new Error(capabilities.termux?.message || 'Termux is unavailable on this device.');
  if (typeof cloudExecute === 'function') return { ...(await cloudExecute({ command, cwd, onOutput, onState, onStart, signal })), provider: 'cloud' };
  throw new Error('No execution provider is configured. Connect Termux on Android or supply a cloud runner.');
}

/** Stop a running command. For Termux this terminates the whole process group of the job. */
export async function stopAgentCommand({ executionId, provider = 'termux', cloudStop } = {}) {
  if (provider === 'termux') return termux.stop(String(executionId || ''));
  if (typeof cloudStop === 'function') return cloudStop({ executionId });
  return { stopped: false, message: 'No cancellation provider is configured.' };
}

/** Copy a project ({path: text | {__wydevBinary, base64}}) into Termux at ~/.pothub/workspaces/<name>. */
export async function syncProjectToTermux({ name, files, mirror = true, approved = false, onProgress, signal } = {}) {
  if (!approved) throw new Error('Approve sending files to Termux first.');
  return termux.writeProject({ name, files, mirror, onProgress, signal });
}
