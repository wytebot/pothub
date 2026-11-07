# PotHub Termux execution provider

## What is wired

- Capacitor `TermuxRuntime` plugin exposes `status`, `run`, and `stop`.
- `run` invokes Termux's documented `com.termux.RUN_COMMAND` intent with a bash command, optional working directory, and a result `PendingIntent`.
- Results return `stdout`, `stderr`, `exitCode`, and an execution ID.
- `src/lib/agent-runtime.js` provides a shared provider interface for Creator, Codelab, diagnosis, and other agents to call. Callers must obtain explicit user approval (`approved: true`) before executing a command.
- Browser builds report cloud as the available provider; native builds can select Termux when installed.
- Android configuration copies and registers the native plugin and result receiver and declares Termux package visibility and `com.termux.permission.RUN_COMMAND`.

## Android setup

1. Install Termux from its official F-Droid or GitHub distribution (avoid mixing signatures from different sources).
2. Open Termux and run `whoami` once so the shell environment is initialized.
3. In Termux `~/.termux/termux.properties`, set `allow-external-apps = true`, then run `termux-reload-settings`.
4. Build/regenerate Android and run `npm run android:configure`; rebuild the APK.
5. Approve PotHub's Android permission to invoke Termux when prompted by the OS/provider.

## Calling the shared runtime

```js
import { getExecutionCapabilities, executeAgentCommand } from '@/lib/agent-runtime';
const capabilities = await getExecutionCapabilities();
const result = await executeAgentCommand({
  command: 'npm run build',
  cwd: '/data/data/com.termux/files/home/workspaces/my-project',
  approved: true, // set only after a user approval action
  provider: 'auto'
});
```

## Important limits / safety

- Termux must be installed and allow external apps. The app cannot silently enable this Termux-side setting.
- A project directory must be accessible to Termux. PotHub's private app sandbox is not automatically visible to Termux; use an explicitly shared workspace under Termux home or shared storage. Do not pass private app paths and assume they work.
- `RUN_COMMAND` is an Android Intent interface, not an HTTP API.
- The current callback-mode bridge returns command output when Termux completes the invocation. It does not yet provide streaming PTY output or a reliable per-process kill handle. `stop()` deliberately reports unsupported instead of falsely claiming that a process was killed. Use a cancellable cloud runner for workflows requiring guaranteed process termination until a session-based Termux backend is added.
- Never send secrets in command arguments or log output. Avoid executing untrusted repository scripts without user approval; shell commands can modify or delete files and access data available to the Termux user.
- The cloud provider is an interface hook only; a cloud execution function must be supplied by the caller. No new hosted shell service is provisioned by this patch.
