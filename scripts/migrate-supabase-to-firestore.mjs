/** One-time migration utility. Run locally with temporary legacy Supabase credentials.
 * Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FIREBASE_SERVICE_ACCOUNT_JSON.
 * Destination collections must be empty; this deliberately refuses a potentially destructive merge.
 */
import { getApps, initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const required=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','FIREBASE_SERVICE_ACCOUNT_JSON'];
for(const k of required)if(!process.env[k])throw new Error(`Missing ${k}; this variable is for this one-time local migration only.`);
if(!getApps().length)initializeApp({credential:cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)),...(process.env.FIREBASE_PROJECT_ID?{projectId:process.env.FIREBASE_PROJECT_ID}:{})});
const firestore=getFirestore(),base=process.env.SUPABASE_URL.replace(/\/$/,'');
const tables=['profiles','credit_orders','credit_ledger','repair_tasks','monitored_projects','app_notifications','notification_subscriptions','vercel_connections','vercel_oauth_states'];
function idFor(table,row){if(table==='monitored_projects')return `${String(row.github_id)}__${String(row.project_id).replaceAll('/','_')}`;const key={profiles:'github_id',credit_orders:'reference',credit_ledger:'id',repair_tasks:'id',app_notifications:'id',notification_subscriptions:'endpoint',vercel_connections:'github_id',vercel_oauth_states:'nonce_hash'}[table];if(key)return String(row[key]);throw new Error(`No document ID mapping for ${table}`)}
async function readTable(table){let offset=0,all=[];while(true){const r=await fetch(`${base}/rest/v1/${table}?select=*&limit=1000&offset=${offset}`,{headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,Accept:'application/json'}});if(!r.ok)throw new Error(`Supabase export failed for ${table}: HTTP ${r.status} ${String(await r.text()).slice(0,300)}`);const rows=await r.json();all.push(...rows);if(rows.length<1000)break;offset+=rows.length;}return all}
const data={};for(const table of tables){data[table]=await readTable(table);console.log(`Read ${data[table].length} records from ${table}`)}
if(process.argv.includes('--dry-run')){console.log('Dry run only; no Firestore writes performed.');process.exit(0)}
for(const table of tables){const existing=await firestore.collection(table).limit(1).get();if(!existing.empty)throw new Error(`Destination collection ${table} is not empty. Stop and reconcile before importing; no data has been written yet.`)}
let batch=firestore.batch(),count=0;for(const table of tables){for(const row of data[table]){const id=idFor(table,row);batch.set(firestore.collection(table).doc(id),row);count++;if(count%400===0){await batch.commit();batch=firestore.batch();console.log(`Imported ${count} records...`)}}}if(count%400)await batch.commit();console.log(`Migration complete: ${count} documents imported. Verify account balances, pending orders, and encrypted Vercel credentials before removing legacy Supabase credentials.`);
