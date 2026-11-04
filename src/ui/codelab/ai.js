// AI in Codelab is PotHub Chat. The repository diagnostics call hands off to the chat area.
import {codelabContext} from "./bridge";
export async function diagnose(){codelabContext().openAI?.();throw Object.assign(new Error("Opening PotHub Chat AI for this repository."),{code:"USE_POTHUB_CHAT"})}
export async function diagnoseRepo(){return diagnose()}
