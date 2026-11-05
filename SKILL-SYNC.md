# PhysicsBench: skill sync

Skill revision: r10

Which revision of the `detronics-app` skill this app is in step with. To bring it up to date later:
read this number, take every entry above it in the skill's `CHANGELOG.md`, run each entry's Detect
line against this app, and apply each entry's Applies-to criterion.

This app is where r5 to r9 were worked out, so it is the reference implementation for them rather
than a recipient of them.

## Adopted

- **r10** · mobile-first as a standing standard — 2026-11-05 *(both of its unusual items came out
  of this app: the on-screen keyboard read as a rotation, and a panel rebuilt mid-typing)*
- **r9** · the feature menu, `STORY.md`, revision tracking — 2026-11-05
- **r8** · Interactive, the full-screen drawing mode — 2026-11-05 *(built here; step 1 of 7 shipped)*
- **r7** · the legal surface, and notices that fold — 2026-11-05 *(v1.9.0)*
- **r6** · teaching content: examples, questions, achievements, hints — 2026-09-26 *(v1.7.0, v1.8.0)*
- **r5** · notices that close, and the level audit — 2026-09-25
- **r4** · the furniture, matched across the benches — 2026-09-24 *(v1.6.0)*
- **r3** · nothing moves under the reader — 2026-09-21
- **r2** · levels, the accordion, the chrome links, the self-teaching shell — 2026-09-20
- **r1** · the baseline — from the first commit

## Skipped, and why

- **E-series snapping** (r1) — electronics only. There are no preferred values in mechanics.
- **Decision reports** (`references/decision-tools.md`) — this app teaches a subject rather than
  helping somebody choose between options. Its graphs answer "what is happening?", not "which should
  I buy?".
- **The family and home branch** — this is a work-and-learning app; cool tokens, full chrome.

## Outstanding against r8

Interactive is complete: the mode, tapping a thing to change it, every tap target, the menu, the
graph strip, and the gestures. What remains is tuning from use rather than unbuilt pieces.
