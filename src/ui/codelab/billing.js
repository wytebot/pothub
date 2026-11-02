import {codelabContext} from "./bridge";
// Codelab bills through PotHub credits, not a separate WyteLab subscription.
const pro=async()=>({plan:"pro",credits:codelabContext().credits});
const unavailable=async()=>{codelabContext().openCredits?.();return {ok:true}};
export const billing={status:pro,config:pro,checkout:unavailable,verify:pro,authorize:unavailable,resolve:pro,recover:pro,cancel:pro};
