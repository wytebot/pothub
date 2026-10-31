const DEFAULT_USD_NGN_RATE = 1347;
export function usdNgnRate(env = process.env) {
  const configured = Number(env.POTHUB_USD_NGN_RATE);
  return Number.isFinite(configured) && configured >= 100 && configured <= 10000
    ? configured
    : DEFAULT_USD_NGN_RATE;
}
export function usdToNgn(usd, rate = DEFAULT_USD_NGN_RATE) {
  const amount = Number(usd);
  const fx = Number(rate);
  if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(fx) || fx <= 0) throw new Error('Invalid currency conversion input.');
  return Math.round(amount * fx);
}
