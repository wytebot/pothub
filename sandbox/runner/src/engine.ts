export type CheckKind = 'pass' | 'fail' | 'skip';
export interface Check { name: string; status: CheckKind; detail?: string; durationMs?: number; }
export interface EnginePlan { image: string; commands: string[]; labels: string[]; }

/** Pure project detection; the command runner itself is baked into the isolated image. */
export function detectEngine(files: string[], options: { nodeImage?: string; flutterImage?: string } = {}): EnginePlan {
  const names = files.map((x) => x.replace(/\\/g, '/').toLowerCase());
  const has = (p: string) => names.includes(p.toLowerCase());
  const flutter = has('pubspec.yaml') || names.some((p) => p.endsWith('/pubspec.yaml'));
  const android = has('app/src/main/AndroidManifest.xml') || names.some((p) => p.endsWith('/app/src/main/androidmanifest.xml'));
  const mobile = flutter || android;
  const node = has('package.json') || names.some((p) => p.endsWith('/package.json'));
  const py = has('pyproject.toml') || has('requirements.txt') || names.some((p) => p.endsWith('.py'));
  const go = has('go.mod') || names.some((p) => p.endsWith('/go.mod'));
  const rust = has('cargo.toml') || names.some((p) => p.endsWith('/cargo.toml'));
  const php = has('composer.json') || names.some((p) => p.endsWith('/composer.json'));
  const java = has('pom.xml') || has('build.gradle') || has('build.gradle.kts') || names.some((p) => p.endsWith('/pom.xml'));
  const labels: string[] = [];
  if (flutter) labels.push('Flutter/Dart'); else if (android) labels.push('Android');
  if (node) labels.push('Node.js');
  if (py) labels.push('Python');
  if (go) labels.push('Go');
  if (rust) labels.push('Rust');
  if (php) labels.push('PHP');
  if (java) labels.push('Java/JVM');
  if (!labels.length) labels.push('generic source');
  const commands: string[] = [];
  if (flutter) commands.push('flutter analyze', 'flutter test', 'flutter build apk --debug'); else if (android) commands.push('Gradle tests and debug APK build');
  if (node) commands.push('Node syntax/type/build/test checks');
  if (py) commands.push('Python compile/test checks');
  if (go) commands.push('go test ./...');
  if (rust) commands.push('cargo test --offline');
  if (php) commands.push('PHP lint / Composer tests');
  if (java) commands.push('Maven/Gradle checks');
  return { image: mobile ? (options.flutterImage || 'pothub/engine-flutter:latest') : (options.nodeImage || 'pothub/engine:latest'), commands, labels };
}

export function safeArchivePath(input: string): string | null {
  const p = input.replace(/\\/g, '/');
  if (!p || p.startsWith('/') || /^[a-z]:/i.test(p) || p.split('/').some((part) => part === '..')) return null;
  const clean = p.split('/').filter((part) => part && part !== '.').join('/');
  if (!clean || clean.length > 240 || /[\u0000-\u001f]/.test(clean)) return null;
  return clean;
}
