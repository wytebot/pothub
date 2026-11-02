import {codelabContext} from "../bridge";
export default function Billing(){
  const c=codelabContext();
  return <div className="page"><header><div><span className="eyebrow">ACCOUNT</span><h1>Billing</h1></div></header>
    <section className="panel"><h3>PotHub credits</h3>
      <p>Codelab uses your PotHub credit balance. Reading, editing, committing and Actions are free; pull requests, repository deletion, and revert cost 1 credit each.</p>
      <p><b>{c.credits}</b> credits available</p>
      <button className="primary" onClick={()=>c.openCredits?.()}>Buy or view credits</button></section></div>;
}
