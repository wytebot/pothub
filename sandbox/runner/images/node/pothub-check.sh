#!/bin/sh
set -u
cd /workspace || exit 2
FAIL=0
emit_pass(){ printf '[PASS] %s\n' "$1"; }
emit_fail(){ printf '[FAIL] %s\n' "$1"; FAIL=1; }
emit_skip(){ printf '[SKIP] %s\n' "$1"; }
script_exists(){ node -e 'const p=require("./package.json");process.exit(p.scripts&&p.scripts[process.argv[1]]?0:1)' "$1" >/dev/null 2>&1; }
if [ -f package.json ]; then
  if [ -d node_modules ]; then
    if script_exists build; then npm run build --if-present >/tmp/node-build.log 2>&1 && emit_pass 'Node build script' || { emit_fail 'Node build script'; cat /tmp/node-build.log; }; else emit_skip 'Node build script (no build script defined)'; fi
    if script_exists test; then npm test --if-present >/tmp/node-test.log 2>&1 && emit_pass 'Node test script' || { emit_fail 'Node test script'; cat /tmp/node-test.log; }; else emit_skip 'Node tests (no test script defined)'; fi
  else
    emit_skip 'Node build/test scripts (dependency install unavailable)'
  fi
fi
if [ -f tsconfig.json ] && command -v tsc >/dev/null 2>&1; then
  if [ -d node_modules ]; then tsc --noEmit --pretty false >/tmp/tsc.log 2>&1 && emit_pass 'TypeScript typecheck' || { emit_fail 'TypeScript typecheck'; cat /tmp/tsc.log; }; else emit_skip 'TypeScript typecheck (dependencies missing)'; fi
fi
JS_FILES=$(find . -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.cjs' \) -not -path './node_modules/*' -not -path './.git/*' | head -200)
if [ -n "$JS_FILES" ]; then
  JS_FAIL=0
  for f in $JS_FILES; do node --check "$f" >/tmp/jscheck.log 2>&1 || { printf '%s: ' "$f"; cat /tmp/jscheck.log; JS_FAIL=1; }; done
  [ "$JS_FAIL" -eq 0 ] && emit_pass 'JavaScript syntax' || emit_fail 'JavaScript syntax'
fi
PY_FILES=$(find . -type f -name '*.py' -not -path './.venv/*' -not -path './venv/*' -not -path './.git/*' | head -300)
if [ -n "$PY_FILES" ]; then
  python3 -m compileall -q . && emit_pass 'Python compile' || emit_fail 'Python compile'
  if command -v pytest >/dev/null 2>&1 && ( [ -d .venv ] || [ -d venv ] || [ -f requirements.txt ] || [ -f pyproject.toml ); then
    pytest -q >/tmp/pytest.log 2>&1 && emit_pass 'Python pytest' || { emit_fail 'Python pytest'; cat /tmp/pytest.log; }
  else emit_skip 'Python tests (pytest dependencies not detected)'; fi
fi
if [ -f go.mod ]; then GOPROXY=off go test ./... >/tmp/go.log 2>&1 && emit_pass 'Go tests' || { emit_fail 'Go tests (offline)'; cat /tmp/go.log; }; fi
if [ -f Cargo.toml ]; then cargo test --offline >/tmp/cargo.log 2>&1 && emit_pass 'Rust tests (offline)' || { emit_fail 'Rust tests (offline)'; cat /tmp/cargo.log; }; fi
if [ -f composer.json ]; then
  PHP_FAIL=0
  for f in $(find . -type f -name '*.php' -not -path './vendor/*' | head -300); do php -l "$f" >/tmp/php.log 2>&1 || { cat /tmp/php.log; PHP_FAIL=1; }; done
  [ "$PHP_FAIL" -eq 0 ] && emit_pass 'PHP syntax' || emit_fail 'PHP syntax'
  if [ -d vendor ] && grep -q '"test"[[:space:]]*:' composer.json; then composer test --no-interaction >/tmp/composer.log 2>&1 && emit_pass 'Composer tests' || { emit_fail 'Composer tests'; cat /tmp/composer.log; }; else emit_skip 'Composer tests (vendor dependencies or test script missing)'; fi
fi
if [ -f pom.xml ]; then mvn -o -q test >/tmp/maven.log 2>&1 && emit_pass 'Maven tests (offline)' || { emit_fail 'Maven tests (offline)'; cat /tmp/maven.log; }; fi
if [ -f build.gradle ] || [ -f build.gradle.kts ]; then if command -v gradle >/dev/null 2>&1; then gradle --offline test >/tmp/gradle.log 2>&1 && emit_pass 'Gradle tests (offline)' || { emit_fail 'Gradle tests (offline)'; cat /tmp/gradle.log; }; else emit_skip 'Gradle tests (Gradle engine unavailable)'; fi; fi
if [ -f app/src/main/AndroidManifest.xml ] && [ -f ./gradlew ]; then sh ./gradlew --offline test >/tmp/android-test.log 2>&1 && emit_pass 'Android Gradle tests' || { emit_fail 'Android Gradle tests'; cat /tmp/android-test.log; }; sh ./gradlew --offline assembleDebug >/tmp/android-build.log 2>&1 && emit_pass 'Android debug APK build' || { emit_fail 'Android debug APK build'; cat /tmp/android-build.log; }; fi

# Shell scripts, Ruby and C/C++ syntax checks.
SH_FILES=$(find . -type f -name '*.sh' -not -path './node_modules/*' -not -path './.git/*' | head -200)
if [ -n "$SH_FILES" ]; then SH_FAIL=0; for f in $SH_FILES; do sh -n "$f" >/tmp/shcheck.log 2>&1 || { printf '%s: ' "$f"; cat /tmp/shcheck.log; SH_FAIL=1; }; done; [ "$SH_FAIL" -eq 0 ] && emit_pass 'Shell syntax' || emit_fail 'Shell syntax'; fi
RB_FILES=$(find . -type f -name '*.rb' -not -path './vendor/*' | head -200)
if [ -n "$RB_FILES" ]; then RB_FAIL=0; for f in $RB_FILES; do ruby -c "$f" >/tmp/rbcheck.log 2>&1 || { printf '%s: ' "$f"; cat /tmp/rbcheck.log; RB_FAIL=1; }; done; [ "$RB_FAIL" -eq 0 ] && emit_pass 'Ruby syntax' || emit_fail 'Ruby syntax'; fi
C_FILES=$(find . -type f -name '*.c' -not -path './node_modules/*' -not -path './.git/*' | head -200)
if [ -n "$C_FILES" ]; then C_FAIL=0; for f in $C_FILES; do gcc -fsyntax-only "$f" >/tmp/ccheck.log 2>&1 || { printf '%s: ' "$f"; cat /tmp/ccheck.log; C_FAIL=1; }; done; [ "$C_FAIL" -eq 0 ] && emit_pass 'C syntax' || emit_fail 'C syntax'; fi
CPP_FILES=$(find . -type f \( -name '*.cc' -o -name '*.cpp' -o -name '*.cxx' \) -not -path './node_modules/*' -not -path './.git/*' | head -200)
if [ -n "$CPP_FILES" ]; then CPP_FAIL=0; for f in $CPP_FILES; do g++ -fsyntax-only "$f" >/tmp/cppcheck.log 2>&1 || { printf '%s: ' "$f"; cat /tmp/cppcheck.log; CPP_FAIL=1; }; done; [ "$CPP_FAIL" -eq 0 ] && emit_pass 'C++ syntax' || emit_fail 'C++ syntax'; fi
if [ -f CMakeLists.txt ]; then cmake -S . -B /tmp/pothub-cmake >/tmp/cmake-config.log 2>&1 && cmake --build /tmp/pothub-cmake --parallel 1 >/tmp/cmake-build.log 2>&1 && emit_pass 'CMake configure/build' || { emit_fail 'CMake configure/build'; cat /tmp/cmake-config.log /tmp/cmake-build.log; }; fi
# Parse common structured configuration formats.
JSON_FILES=$(find . -type f -name '*.json' -not -path './node_modules/*' -not -path './.git/*' | head -300)
if [ -n "$JSON_FILES" ]; then JSON_FAIL=0; for f in $JSON_FILES; do python3 -c 'import json,sys;json.load(open(sys.argv[1]))' "$f" >/tmp/jsoncheck.log 2>&1 || { printf '%s: ' "$f"; cat /tmp/jsoncheck.log; JSON_FAIL=1; }; done; [ "$JSON_FAIL" -eq 0 ] && emit_pass 'JSON syntax' || emit_fail 'JSON syntax'; fi
YAML_FILES=$(find . -type f \( -name '*.yml' -o -name '*.yaml' \) -not -path './node_modules/*' -not -path './.git/*' | head -300)
if [ -n "$YAML_FILES" ]; then YAML_FAIL=0; for f in $YAML_FILES; do python3 -c 'import yaml,sys;yaml.safe_load(open(sys.argv[1]))' "$f" >/tmp/yamlcheck.log 2>&1 || { printf '%s: ' "$f"; cat /tmp/yamlcheck.log; YAML_FAIL=1; }; done; [ "$YAML_FAIL" -eq 0 ] && emit_pass 'YAML syntax' || emit_fail 'YAML syntax'; fi
TOML_FILES=$(find . -type f -name '*.toml' -not -path './node_modules/*' -not -path './.git/*' | head -300)
if [ -n "$TOML_FILES" ]; then TOML_FAIL=0; for f in $TOML_FILES; do python3 -c 'import tomllib,sys;tomllib.load(open(sys.argv[1],"rb"))' "$f" >/tmp/tomlcheck.log 2>&1 || { printf '%s: ' "$f"; cat /tmp/tomlcheck.log; TOML_FAIL=1; }; done; [ "$TOML_FAIL" -eq 0 ] && emit_pass 'TOML syntax' || emit_fail 'TOML syntax'; fi
XML_FILES=$(find . -type f -name '*.xml' -not -path './node_modules/*' -not -path './.git/*' | head -300)
if [ -n "$XML_FILES" ]; then XML_FAIL=0; for f in $XML_FILES; do python3 -c 'import xml.etree.ElementTree as ET,sys;ET.parse(sys.argv[1])' "$f" >/tmp/xmlcheck.log 2>&1 || { printf '%s: ' "$f"; cat /tmp/xmlcheck.log; XML_FAIL=1; }; done; [ "$XML_FAIL" -eq 0 ] && emit_pass 'XML syntax' || emit_fail 'XML syntax'; fi

if [ -f pubspec.yaml ]; then
  if command -v flutter >/dev/null 2>&1 && [ -f .dart_tool/package_config.json ]; then flutter analyze --no-pub >/tmp/flutter-analyze.log 2>&1 && emit_pass 'Flutter analyze' || { emit_fail 'Flutter analyze'; cat /tmp/flutter-analyze.log; }; flutter test --no-pub >/tmp/flutter-test.log 2>&1 && emit_pass 'Flutter tests' || { emit_fail 'Flutter tests'; cat /tmp/flutter-test.log; }; flutter build apk --debug --no-pub >/tmp/flutter-build.log 2>&1 && emit_pass 'Flutter debug APK build' || { emit_fail 'Flutter debug APK build'; cat /tmp/flutter-build.log; }; else emit_skip 'Flutter analyze/tests/build (Flutter image or pub dependencies unavailable)'; fi
fi
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
