import fs from 'node:fs';
import path from 'node:path';
const roots=['server','src','pages','tests','docs'];
const files=[];
function walk(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,ent.name);if(ent.isDirectory()){if(!['node_modules','.next','coverage'].includes(ent.name))walk(full)}else if(/\.(?:js|mjs|jsx|ts|tsx|md)$/.test(ent.name))files.push(full)}}
for(const root of roots)if(fs.existsSync(root))walk(root);
files.push('ENVIRONMENT_VARIABLES.md');
const failures=[];
for(const file of [...new Set(files)]){
 const content=fs.readFileSync(file,'utf8');
 if(/process\.env\.(?:GEMINI_API_KEY|AI_FALLBACK_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|POTHUB_AI_API_KEY)\b/.test(content))failures.push(`${file}: direct platform AI key read found`);
 if(/(?:id\s*:\s*['"]pothub-ai['"]|provider\s*:\s*['"]pothub-ai['"]|use\s+PotHub\s+AI|built-in\s+AI\s+included)/i.test(content))failures.push(`${file}: platform AI provider or user-facing built-in AI copy found`);
}
if(failures.length){console.error('BYOK policy audit failed:\n'+failures.map(x=>`- ${x}`).join('\n'));process.exit(1)}
console.log(`BYOK policy audit passed (${new Set(files).size} files scanned). Direct platform AI key reads and built-in AI provider declarations are forbidden.`);
