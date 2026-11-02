# PotHub Rooftop Rush

- Replaces the orb jump game with a lightweight canvas stickman endless rooftop runner.
- Controls: tap/click/Space/up arrow to jump; double-tap for 2x jump height; swipe down/down arrow to slide under overhead blocks.
- Score increases with distance. Every 500-point milestone may grant 1 credit.
- Rewards are server-side, authenticated, and idempotent by account + run ID + milestone; the client refreshes its displayed balance from the API response. Offline play remains available, but a reward cannot be confirmed until connectivity/authentication is available. Pending milestones stay in memory only for the current run.
- Run and score are not written to localStorage/IndexedDB. Canvas uses device-pixel-ratio cap and requestAnimationFrame; no image assets or game engine dependency.

## Important limitations

This is lightweight anti-abuse validation, not a cryptographic proof of gameplay. Since the browser supplies the score and elapsed time, a determined user can still forge requests. For high-value rewards, use server-simulated game sessions or signed telemetry.
