// Image and video creation are unlimited for everyone. Premium unlocks expanded context and deeper web research, and removes the attachment limit.
// Set only after the billing server confirms an active subscription (see billing/api.ts).
export const isPremium = () => Number(localStorage.getItem('billing.entitledUntil') ?? 0) > Date.now();
