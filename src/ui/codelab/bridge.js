// Connects the ported WyteLab modules to PotHub's authenticated api() helper.
// PotHub owns the session (bearer/cookie) so Codelab never runs a second login.
let impl=null;
const ctx={openAI:null,credits:0,openCredits:null,openMenu:null};
export const setCodelabApi=f=>{impl=f};
export const setCodelabContext=c=>Object.assign(ctx,c||{});
export const codelabContext=()=>ctx;
export async function wl(path,opts={}){
  if(!impl) throw Object.assign(new Error("Codelab is still starting. Try again in a moment."),{status:503});
  return impl(`/api/wytelab${path}`,{...opts,headers:{...(opts.headers||{})}});
}
export async function pot(path,opts={}){
  if(!impl) throw Object.assign(new Error("Codelab is still starting. Try again in a moment."),{status:503});
  return impl(path,opts);
}
