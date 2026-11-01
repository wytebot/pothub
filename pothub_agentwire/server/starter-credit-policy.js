export function starterGrantEligibility({deviceClaimExists=false,ipClaimsToday=0,ipDailyLimit=5}={}){
  const count=Number(ipClaimsToday||0);return !deviceClaimExists&&Number.isFinite(count)&&count<ipDailyLimit;
}
