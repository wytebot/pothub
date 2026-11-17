import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { addPeriod, applyPayment, entitled, luhn, memoryStore, ngnAmount, settleCharge, verifySignature, type Pending, type Tx } from './billing';

const pending: Pending = { txRef: 'sub_monthly_u1_abc', customerKey: 'u1', email: 'a@b.co', plan: 'monthly', amountNgn: 4500, claimHash: 'x', createdAt: 0 };
const tx = (o: Partial<Tx> = {}): Tx => ({ id: 'chg_1', status: 'successful', amount: 4500, currency: 'NGN', reference: pending.txRef, ...o });
const now = new Date('2026-11-16T00:00:00Z');

describe('billing core', () => {
  it('accepts a valid signature and rejects tampering', () => {
    const body = Buffer.from('{"a":1}'); const sig = createHmac('sha256', 'hash').update(body).digest('base64');
    expect(verifySignature(body, sig, 'hash')).toBe(true);
    expect(verifySignature(Buffer.from('{"a":2}'), sig, 'hash')).toBe(false);
    expect(verifySignature(body, undefined, 'hash')).toBe(false);
  });
  it('rounds naira up', () => { expect(ngnAmount(3, 1501.3)).toBe(4510); expect(ngnAmount(3, 1501.3, 100)).toBe(4600); });
  it('validates card numbers with Luhn', () => { expect(luhn('4242424242424242')).toBe(true); expect(luhn('4242424242424241')).toBe(false); expect(luhn('abcd')).toBe(false); });

  it('grants access once and ignores duplicate events', async () => {
    const s = memoryStore(); await s.putPending(pending);
    expect((await settleCharge(s, tx(), now)).result).toBe('applied');
    expect(await s.getPending(pending.txRef)).toBeUndefined();
    await s.putPending(pending); // same charge id replayed (webhook + claim race)
    expect((await settleCharge(s, tx(), now)).result).toBe('duplicate');
    const sub = await s.getSub('u1');
    expect(entitled(sub, now)).toBe(true); expect(sub!.currentPeriodEnd).toBe(addPeriod(now, 'monthly').toISOString());
  });
  it('adds time when paying early and lets access lapse when not renewed', async () => {
    const s = memoryStore(); await s.putPending(pending); await settleCharge(s, tx(), now);
    await s.putPending({ ...pending, txRef: 'r2' });
    await settleCharge(s, tx({ id: 'chg_2', reference: 'r2' }), new Date('2026-11-20T00:00:00Z'));
    expect((await s.getSub('u1'))!.currentPeriodEnd.startsWith('2027-01-16')).toBe(true);
    expect(entitled(await s.getSub('u1'), new Date('2027-02-01T00:00:00Z'))).toBe(false);
  });
  it('refuses short payments, wrong currency, unknown references and unsuccessful charges', async () => {
    const s = memoryStore(); await s.putPending(pending);
    expect((await settleCharge(s, tx({ amount: 100 }), now)).reason).toMatch(/amount/);
    expect((await settleCharge(s, tx({ currency: 'USD' }), now)).reason).toMatch(/currency/);
    expect((await settleCharge(s, tx({ reference: 'zzz' }), now)).reason).toMatch(/unknown/);
    expect((await settleCharge(s, tx({ status: 'pending' }), now)).reason).toMatch(/not successful/);
    expect((await settleCharge(s, tx({ status: 'failed' }), now)).reason).toMatch(/failed/);
    expect(await s.getSub('u1')).toBeUndefined();
  });
  it('applyPayment is idempotent per payment reference', async () => {
    const s = memoryStore(); const ev = { id: 'e1', reference: 'flw:1', customerKey: 'u1', plan: 'annual' as const, amount: 1, currency: 'NGN' };
    expect(await applyPayment(s, ev, now)).toBe('applied'); expect(await applyPayment(s, { ...ev, id: 'e2' }, now)).toBe('duplicate');
  });
});
