# PotHub Termux execution (live streaming)

Commands run on the phone inside Termux. Output streams live, Stop really kills the process tree, and jobs survive PotHub being closed (re-attach from Codelab → Menu → **Termux**).

## How it works
Termux's RUN_COMMAND intent only returns output when a command finishes, so each command is a **job**:
`$HOME/.pothub/jobs/<id>/{out,pid,exit,cmd}` inside Termux. A long-lived runner executes the command (in its own process group) and appends to `out`; PotHub polls with short background commands that return a base64 chunk plus state (adaptive 0.6–2 s). stdout and stderr are interleaved in one log, like a terminal.

| Piece | File |
|---|---|
| Native bridge (`status`, `requestPermission`, `openTermux`, `exec`) | `android-template/.../TermuxRuntimePlugin.java`, `TermuxResultReceiver.java` |
| Jobs, streaming, stop, re-attach, project upload (tar) | `src/lib/termux-core.js` (pure, unit-tested) |
| Capacitor binding + readiness check | `src/lib/termux.js` |
| Agent provider API (`executeAgentCommand`, `stopAgentCommand`, `syncProjectToTermux`) | `src/lib/agent-runtime.js` |
| UI: connection setup, multi-step runs, live output, project sync, job list | `src/ui/codelab/pages/Terminal.jsx` |

## Fixes to the previous Termux bridge
- Results were read from top-level intent extras; Termux sends them inside a `result` Bundle, so stdout/exit code were always empty.
- `npm run android:configure` runs `scripts/configure-android.mjs`, which had no Termux wiring (it lived only in a stray root `configure-android.mjs`). It is now in `scripts/`; that root file is a stale duplicate you can delete.
- The `RUN_COMMAND` runtime permission was never requested; it is now.
- A missing `allow-external-apps` made calls hang forever; calls now time out with a clear message.
- The 12,000-character command cap is gone. Only OS limits remain (128 KB per argument): bigger commands are sent automatically as a script file.

## Chat agents use Termux automatically (Creator chat)
When Termux is connected (checked at launch and when PotHub returns to the foreground), the app sends `termux:{available:true}` with each chat request and the server tells the model how to ask for a command. Without a connected Termux nothing changes.

1. The model ends a reply with one ```` ```pothub-run ```` block (optional first line `cwd: <folder>`).
2. The chat shows a card with the exact command. **Nothing runs until you press Run** (every command, every time). Destructive-looking commands show a warning and need a second tap.
3. Output streams live inside the card; Stop kills the process tree.
4. The result (exit code + last 8,000 characters of output) is sent back as the next message beginning `TERMUX RESULT`, so the agent can diagnose and propose the next command.

Rules given to the model: one command per reply, never claim a command ran before a result arrives, `pkg` not `apt`, no sudo, non-interactive only, no secrets in commands. Skip marks the card skipped and sends nothing. If you switch chats while a command runs, the result stays on the card and is not sent into the other chat. Not covered: the repository chat (`sendEdit` in WorkspaceSection), Diagnosis and Fix flows still answer in text only.

Files: `src/lib/termux-actions.js` (protocol), `src/ui/useTermuxChat.js`, `src/ui/TermuxRunCard.jsx`, `server/termux-tool-prompt.js`, plus small edits in `server/app.js`, `src/ui/App.jsx`, `src/ui/WorkspaceSection.jsx`, `src/ui/styles.css`.

## Setup (once)
1. Install Termux from F-Droid or GitHub releases.
2. In Termux run: `mkdir -p ~/.termux && echo 'allow-external-apps = true' >> ~/.termux/termux.properties && termux-reload-settings`
3. `npm run android:configure`, rebuild the APK, open Codelab → Menu → Termux → *Allow PotHub* → *Check again*.

## Agent usage
```js
import { executeAgentCommand } from '@/lib/agent-runtime'; // or a relative path
const ctl = new AbortController();
const r = await executeAgentCommand({ command: 'npm test', cwd: '~/.pothub/workspaces/me__repo',
  approved: true /* only after the person approved */, signal: ctl.signal,
  onOutput: (t) => append(t), onState: (s) => setState(s) });
// r: { success, exitCode, state, output, jobId, stopped, durationMs }
```

## Limits (honest)
- Polling, not a socket: expect up to ~1 s of display lag.
- Android 12+ may kill Termux's background processes (phantom-process killer) or battery-restrict it; a job then reports `lost`. Exempt Termux from battery optimisation.
- Only the Android app can use Termux. The cloud provider remains a hook; no hosted shell is provisioned.
- On screen only the last 400,000 characters are rendered and 5 MB retained in memory; the full log stays at `~/.pothub/jobs/<id>/out`.
- Commands have full Termux access. Every run asks for approval first; secrets are masked in saved app logs.
- Not verified here: the Java compiled only against hand-written stubs, and nothing ran on a real device or in a Next build. Test on a phone before shipping.
