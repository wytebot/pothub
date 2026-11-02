# Rooftop Rush gameplay fixes — 2026-11-02

- Fixed mouse/touch input so pointer-up handles a tap exactly once and keyboard click activation still works.
- Made double-tap boost usable during the initial jump (once per jump), instead of requiring the character to be grounded again.
- Added a run phase with alternating leg motion and opposing arm motion; airborne pose is distinct.
- Clamped frame delta to prevent a long background/tab pause from causing a giant physics step when the animation resumes.
- Clarified reward errors so the UI distinguishes counted score from confirmed credit awards.

Validation: ByteBounceGame JSX transpilation passed; targeted existing chat/composer tests passed (8/8). Full production build and live device gameplay were not run in this environment.
