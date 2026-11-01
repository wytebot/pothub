import { reconcileStaleCreditReservations } from '../server/lib.js';
const args=new Set(process.argv.slice(2));
const release=args.has('--release'),confirmed=args.has('--confirm');
if(release&&!confirmed){console.error('Refusing to mutate reservations without --confirm.');process.exit(2)}
const value=process.argv.find(x=>x.startsWith('--older-than-minutes='));
const olderThanMinutes=Math.max(15,Math.min(10080,Number(value?.split('=')[1])||60));
const result=await reconcileStaleCreditReservations({olderThanMinutes,dryRun:!release});
console.log(JSON.stringify(result,null,2));
if(!release)console.log('Dry run only. Re-run with --release --confirm after reviewing provider/delivery logs.');
