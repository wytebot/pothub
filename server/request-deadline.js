export function setRequestDeadline(req,budgetMs=48000){if(req&&!Number.isFinite(Number(req.pothubDeadlineAt)))req.pothubDeadlineAt=Date.now()+Math.max(1,Number(budgetMs)||48000);return Number(req?.pothubDeadlineAt)||Date.now()+48000}
export function remainingRequestMs(req){return Math.max(0,setRequestDeadline(req)-Date.now())}
export function requestDeadlineSignal(req,capMs=40000){return AbortSignal.timeout(Math.max(1,Math.min(Math.max(1,Number(capMs)||40000),remainingRequestMs(req))))}
