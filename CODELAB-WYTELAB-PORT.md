# Codelab = WyteLab port
- src/ui/CodelabWorkspace.jsx + src/ui/codelab/*: WyteLab pages/components running on the PotHub session.
- server/wytelab-github.js + /api/wytelab/* in server/app.js: WyteLab GitHub operations (PR create and revert cost 1 credit).
- Sidebar: WyteLab menu items (no APK/Partner) + Chat AI; edit page toolbar has Chat AI.
- Run `npm install` (new deps: CodeMirror packages, @uiw/react-codemirror, jszip) before building.
