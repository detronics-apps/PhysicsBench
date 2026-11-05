# Interactive — a fourth mode, with no sidebar

The plan, reviewed and settled. Nothing here is built yet. It replaces an earlier draft that added
gestures to the existing phone layout; that draft solved the wrong problem.

## The problem, measured

Today, with nothing dismissed:

| | Portrait 375 × 812 | Landscape 812 × 375 |
|---|---|---|
| Furniture above the drawing | **774 px** | **608 px** |
| The drawing | **200 px** — a quarter of the screen | **416 px — taller than the screen**, so it is never all visible |
| Transport below it | 125 px | 57 px |
| Drawing → first control | 511 px | 591 px |
| Whole page | 2812 px, 3402 at step 6 | **3777 px — 10.1 screens** |

Portrait gives the drawing a quarter of the phone under 774 px of apparatus. Landscape is worse: the
page is ten screens long, and the drawing is taller than the viewport, so even after scrolling to it
you cannot see all of it.

Gestures would not have fixed that. The layout is the problem.

## The mode

**A fourth chip beside Simple · Advanced · Expert: Interactive.** It is a *layout*, not a detail
level. Choosing it hides the header, the level bar, the step bar, the arrow picker, the sidebar, the
graphs, the measurements, the teaching panels and the footer; gives the screen to the drawing and
its timeline; and puts every sidebar input onto the drawing, reached by tapping the thing it
belongs to.

**A phone opens in it.** Not a width test — 812 px wide in landscape looks like a tablet. The test
is a coarse pointer and a *smaller* dimension under about 560 px, which catches a phone held either
way and leaves a tablet alone. And it is a **default, not an override**: the moment you press the X
or pick a level chip, that choice is stored and reload respects it. Nobody gets put back into a mode
they just left.

What it gives back, same two phones:

| | Portrait | Landscape |
|---|---|---|
| Drawing, no graph | **756 px** (3.8×) | **375 px**, all of it, 812 wide |
| Drawing, graph open | **666 px** (3.3×) | 295 px |
| Scrolling | none | none |

## The one rule

**Nothing new is invented. Every sheet is a sidebar section, rendered by the function that renders
it today.**

Tapping an object opens `objectSection()`. Tapping the planet opens `worldSection()`. Tapping the
sky opens `fluidSection()`. Same fields, same parsing, same `data-field` names, same engineering
notation, same validation, same tests. The mode is a new *route* to the controls, never a second
copy of them — a second copy is two things to keep in step, and it would drift within a month.

Three consequences, and they are what keep this honest:

- **A layout never changes a value, and never restarts the clock.** The rule the levels follow:
  `render()`, never `rebuild()`.
- **Nothing is reachable only here.** Leave the mode and every control is where it was.
- **The physics is untouched.** No module under `js/` changes except one new pure one.

## The screen, portrait

```
┌──────────────────────────────────────────┐
│ (S) (3/6)                         (☰)(✕) │  level · step · menu · exit
│  v  hint, folded                         │
│                                          │
│                  ▲ properties            │
│         ◀ move  (  ●  )  forces ▶        │  satellites, beside the body
│                                          │
│                 the drawing              │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ velocity ————————————                │ │  one thin graph, swappable
│ └──────────────────────────────────────┘ │
│ (📈) ⏮ ⏸ ⏭ ────●──── 1.0×   12.2 m/s     │  graphs button + transport
└──────────────────────────────────────────┘
```

Four round 44 px buttons, floating over the drawing so they cost no height:

- **(S)** top left — the current level. Tap for Simple · Advanced · Expert, which changes what the
  sheets show without leaving the mode. It reads S, A or E.
- **(3/6)** beside it — the step. Tap for the six steps, Examples, How to use, Things to find.
- **(☰)** top right — Add, Remove, Arrows, How this works.
- **(✕)** beside it — leave Interactive, back to the page layout.

The transport owns the bottom edge, because it is the one thing always needed and the bottom edge is
where the thumb is. The graph strip sits directly above it.

## Landscape

375 px of height cannot afford to give any away, so landscape differs in two ways and nothing else:

- **The furniture floats instead of claiming height.** The transport becomes a centred pill over the
  bottom of the drawing and the graph strip a translucent band, so the drawing keeps the full 375 px
  rather than 319.
- **The sheet opens on the right, not the bottom** — about 320 px of the 812, leaving ~490 px of
  drawing visible while you edit. A bottom sheet in landscape covers the thing you are changing;
  a side sheet is why every landscape phone app uses one.

Everything else — targets, satellites, menu, graphs — is identical. Orientation is a media query,
not a second code path.

## What a tap opens

Precedence, first hit wins: **body → cannon → wall → water → ground/planet → sky**.

| Tapped | Sheet | Today's function |
|---|---|---|
| The main body | The object | `objectSection()` |
| Another object | That object's row | `objectsSection()` |
| A wall | That wall's row | `wallsSection()` |
| A cannon | That cannon's row | `cannonsSection()` |
| The planet disc, or the water strip | The world it is on | `worldSection()` |
| The ground line | The surface | `surfaceSection()` |
| The sky / background | The fluid it moves through | `fluidSection()` |
| Empty space | deselects | — |

**Edits are live, and the button says Done** — not Accept. Everything in the app is live: the arrow
redraws as the slider moves, which is the feedback that makes a slider worth dragging. The timeline
is the undo — pause, scrub back, or reset.

The satellites, when a body is selected — **beside it, never on it**, so the thing being edited is
never under your thumb:

- **◀ move** arms the drag, so a drag moves the body while a drag anywhere else still pans.
- **▲ properties** opens the sheet.
- **forces ▶** opens The push, plus Take the controls where the step has it, with the arrow
  previewing on the body as the slider moves.

No delete arm. A delete under your thumb on a phone is a mistake waiting to happen; removal is in
the menu's Remove list.

The cluster is clamped inside the screen and flips to whichever side has room. It follows a moving
body; the sheet, once open, does not — it is anchored and stays put.

## The menu (☰)

- **Add** — another object · a shape you draw on the screen · a wall · a cannon. Only what the
  current step has: the list is built from the step's features, so it can never offer a wall on a
  step that cannot draw one.
- **Remove** — what you have added, each with a delete.
- **Arrows** — the picker that is 313 px of the page today.
- **How this works** — the teaching panel for this step.

## The graphs (📈)

Tap it and a drawer lists the step's graphs — three to seven, from `channelsFor()`. Tap one and it
becomes the thin strip; tap another and it swaps; tap the strip to put it away. One at a time,
deliberately: two graphs on a phone are two unreadable graphs. Scrubbing the strip scrubs the
timeline, exactly as the full graphs do now.

## Where the teaching goes

The mission does not get dropped because the sidebar did:

- the **step button** shows `3/6` and opens the walk;
- the **hint** stays, folded, under it — one line until you open it, and it still disappears when
  you have done the thing;
- **achievements** still toast;
- **How this works** is one tap, in the menu;
- the **readouts** fold into the transport row: the number the step is about, with the rest in the
  properties sheet.

Nothing is removed. Everything is one tap instead of one scroll.

## What gets built

```
js/targets.js        pure, tested. What is under this point, by precedence, and which
                     section belongs to each kind of thing. Hit-tested in SCREEN space
                     with a minimum radius — a 0.4 m ball at phone zoom is a 20 px
                     target and a finger is 44 px.
js/ui/stage-ui.js    the overlay: the four corner buttons, satellites, sheet, graph strip.
js/gestures.js       pure, tested. Tap vs drag, and what a pull means as a velocity.
                     Last piece only.
```

One new pure module, one new UI module, one later. Everything else is CSS behind
`[data-layout="interactive"]` and one new state field.

State: `state.ui.layout = 'page' | 'interactive' | null` — **null means never chosen**, which is
what lets a phone default into it and still respect an explicit exit. Plus `state.ui.strip`, the
graph in the strip. The layout is **a separate field from the level**, not a fourth rank:
`atLeast()` is called in several hundred places, and a fourth rank would turn every `at('expert')`
either always-true or always-false. The graph groups need an `id` each; they have only labels today.

## Build order

Each is independently useful and independently shippable.

1. **The mode exists.** The chip, `data-layout`, the CSS for both orientations, the phone default,
   and the four corner buttons with only the level and the exit live. Verifiable immediately: the
   drawing goes from 200 px to 756 px in portrait, and from a scroll-and-still-clipped 416 px to all
   375 px in landscape.
2. **Tap to select, and the properties satellite.** `js/targets.js`, the cluster, the object sheet.
   This is the commit that pays for the mode — change the mass without leaving the picture.
3. **The rest of the targets.** Planet, ground, water, sky, wall, cannon.
4. **Add, Remove and Arrows** in the menu.
5. **The forces satellite**, with the arrow previewing as you drag the slider.
6. **The graph strip and drawer.**
7. **The gestures.** Drag to move, pull to throw, pinch to zoom.

## The traps, named in advance

- **Detect the phone by its smaller dimension, not its width.** A phone in landscape is 812 px wide;
  a width test would send exactly the case this mode was asked for into the page layout.
- **`100dvh`, never `100vh`** — `100vh` is taller than the visible page on a phone, so the transport
  sits under the URL bar. Worse in landscape, where the bar is a larger share of the height.
- **`env(safe-area-inset-*)`** on all four corner buttons — and the insets move when the phone
  rotates: in landscape the notch is on the left, not the top.
- **`touch-action: none` on the stage**, or the browser pans the page instead and nothing works.
  Easy to forget, and it looks like every gesture is broken.
- **The overlay must not be rebuilt per frame.** `paint()` runs on every animation frame; the
  satellites are built when the selection changes and only their `transform` is written per frame.
  Same class as the scroll and focus preservation already in `render()`.
- **The sheet is a native `<dialog>`** — top layer, Escape, focus trap and a backdrop for free, and
  it escapes the `overflow: auto` clipping context the sidebar tooltips were bitten by.
- **One layout renders at a time.** Both at once puts two elements on screen with the same
  `data-field`, which is what every test selects by.

## What I would not do

- **Not a replacement.** The page layout stays the default on a desktop and stays exactly as it is.
- **Not an override.** A phone *defaults* into the mode; it is never pushed back in after leaving.
- **Not a second set of controls.** If a sheet ever needs a field the sidebar does not have, the
  field goes in the sidebar first.
- **Not polish** — no haptics, no inertia, no animation — until the six pieces are real and have
  been used on an actual phone.

## Settled in review

1. **The level stays reachable** — a round S/A/E button in the top left, inside the mode.
2. **Edits are live.** The timeline is the pause and the reset.
3. **The water strip opens The world it is on**; the sky opens The fluid.
4. **A phone opens in Interactive**, portrait or landscape, with an X next to the menu to leave.
5. **No delete arm** under the body.

Once it is built and has been used, the mode goes into the `detronics-app` skill, so the other
benches get the same one.
