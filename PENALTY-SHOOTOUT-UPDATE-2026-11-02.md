# PotHub Offline Arcade — Penalty Shootout

Added **Last Kick**, a second game in Offline Arcade, while preserving Rooftop Rush.

- Arcade landing page lets players choose Rooftop Rush or Last Kick.
- Last Kick uses drag-to-aim and release-to-kick controls, with responsive pointer/touch handling.
- Canvas renders a perspective pitch, goal net, stadium tiers, floodlights, crowd colors, stickman taker and stickman goalkeeper.
- Goalkeeper reacts to shot direction and dives; goals are counted only when the shot lands inside the goal and outside the keeper's save reach.
- HUD includes goals, shots, conversion percentage and consecutive-goal streak; reset match is available.
- Sound cues can be muted. Penalty scoring is local-only and does not award credits.

Validation performed: TypeScript JSX transpilation/syntax checks for App.jsx, ArcadeHub.jsx and PenaltyShootout.jsx; server/app.js node syntax check; existing targeted chat/composer tests (8/8 passed). Full production build and physical-device gameplay testing were not run.
