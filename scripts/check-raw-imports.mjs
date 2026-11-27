import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const scan = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? scan(path.join(dir, e.name)) : e.name.match(/\.(ts|tsx|js|jsx)$/) ? [path.join(dir, e.name)] : []);
const failures = [];
for (const file of scan(path.join(root, 'src'))) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+\?raw)['"]/g)) {
    const target = path.resolve(path.dirname(file), match[1].replace(/\?raw$/, ''));
    if (!fs.existsSync(target)) failures.push(`${path.relative(root, file)} -> missing ${match[1]}`);
  }
}
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('All ?raw import targets exist.');
