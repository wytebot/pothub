import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { detectEngine, safeArchivePath } from './engine.js';

test('detects project engines from manifests', () => {
  const plan = detectEngine(['package.json', 'requirements.txt', 'go.mod', 'Cargo.toml', 'composer.json', 'pom.xml']);
  assert.deepEqual(plan.labels, ['Node.js', 'Python', 'Go', 'Rust', 'PHP', 'Java/JVM']);
  assert.ok(plan.commands.length >= 5);
  assert.equal(plan.image, 'pothub/engine:latest');
});

test('Flutter projects select the optional mobile engine', () => {
  assert.equal(detectEngine(['pubspec.yaml']).image, 'pothub/engine-flutter:latest');
});

test('Android projects select the optional mobile engine', () => {
  assert.equal(detectEngine(['app/src/main/AndroidManifest.xml', 'settings.gradle']).image, 'pothub/engine-flutter:latest');
});

test('rejects traversal and absolute archive paths', () => {
  assert.equal(safeArchivePath('../escape'), null);
  assert.equal(safeArchivePath('/root/file'), null);
  assert.equal(safeArchivePath('C:\\secret\\file'), null);
  assert.equal(safeArchivePath('src/../outside'), null);
  assert.equal(safeArchivePath('src/main.ts'), 'src/main.ts');
});
