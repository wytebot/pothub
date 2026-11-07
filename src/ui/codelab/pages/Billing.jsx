import {codelabContext} from "../bridge";
export default function Billing(){
  const c=codelabContext();
  return <div className="page"><header><div><span className="eyebrow">ACCOUNT</span><h1>Billing</h1></div></header>
    <section className="panel"><h3>PotHub plan</h3>
      <p>Codelab uses your PotHub plan. Free accounts get 20 agent actions per day; Premium is unlimited. Reading, editing, committing, Actions, pull requests, repository deletion and revert are not counted.</p>
      <p><b>{c.planLabel||"Loading your plan…"}</b></p>
      <button className="primary" onClick={()=>c.openCredits?.()}>View plan and billing</button></section></div>;
}
