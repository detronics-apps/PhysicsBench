# Interactive — a fourth mode, with no sidebar

A plan, for review. Nothing here is built yet. It replaces an earlier draft that added gestures to
the existing phone layout; that draft solved the wrong problem.

## The problem, measured

On a 375 × 812 phone, at step 1, with nothing dismissed:

| | |
|---|---|
| Furniture above the drawing | **774 px** — header 56, level bar 74, step bar 46, step block 226, a notice 96, arrow picker 313 |
| The drawing | **200 px** — a quarter of the screen, starting below the fold |
| Transport below it | 125 px |
| Drawing → first control | **511 px**, so the two are never on screen together |
| Whole page | 2812 px at step 1, **3402 px at step 6** — 4.2 screens, 67 fields |

Reaching the mass means scrolling past the drawing; watching the result means scrolling back. The
thing you are looking at is the one thing you cannot touch, and on the later steps the controls are
spread over four screens.

Gestures on the drawing would not have fixed that. The layout is the problem.

## The mode

**A fourth chip beside Simple · Advanced · Expert: Interactive.**

It is a *layout*, not a detail level. Choosing it:

- hides the header, the level bar, the step bar, the arrow picker, the sidebar, the graphs, the
  measurements, the teaching panels and the footer;
- gives the whole screen to the drawing and its timeline;
- puts every input that was in the sidebar onto the drawing, reachable by tapping the thing it
  belongs to.

Budget on the same phone: furniture ≤ 180 px, so the drawing gets **666–756 px instead of 200** —
between 3.3× and 3.8× what it has now, and no scrolling at all.

## The one rule

**Nothing new is invented. Every sheet is a sidebar section, rendered by the function that renders
it today.**

Tapping an object opens `objectSection()`. Tapping the planet opens `worldSection()`. Tapping the
sky opens `fluidSection()`. Same fields, same parsing, same `data-field` names, same engineering
notation, same validation, same tests. The mode is a new *route* to the controls, never a second
copy of them — a second copy is two things to keep in step, and it would drift within a month.

Three consequences, and they are what keep this honest:

- **A layout never changes a value, and never restarts the clock.** The same rule the levels follow:
  `render()`, never `rebuild()`.
- **Nothing is reachable only here.** Leave the mode and every control is where it was.
- **The physics is untouched.** No module under `js/` changes except one new pure one.

## The screen

```
┌──────────────────────────────────────────┐
│ (3/6)                                 ☰  │  step pill · menu
│ v hint, folded                           │
│                                          │
│                  ▲ properties            │
│         ◀ move  (  ●  )  forces ▶        │  satellites, next to the body
│                                          │
│                 the drawing              │
│                                          │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ velocity ————————————                │ │  one thin graph, swappable
│ └──────────────────────────────────────┘ │
│ 📈  ⏮ ⏸ ⏭  ────●──────  1.0×  12.2 m/s   │  graphs button + transport
└──────────────────────────────────────────┘
```

The transport owns the bottom edge, because it is the one thing always needed and the bottom edge
is where the thumb is. The graph strip sits directly above it. The corner buttons float over the
drawing, so they cost no height.

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

The satellites, when a body is selected — **beside it, never on it**, so the thing being edited is
never under your thumb:

- **◀ move** arms the drag, so a drag moves the body and a drag anywhere else still pans.
- **▲ properties** opens the sheet above.
- **forces ▶** opens The push, plus Take the controls where the step has it, with the arrow
  previewing on the body as the slider moves.

The cluster is clamped inside the screen and flips to whichever side has room. It follows a moving
body; the sheet, once open, does not — it is anchored to the bottom and stays put.

## The menu (☰, top right)

- **Add** — another object · a shape you draw on the screen · a wall · a cannon. Only what the
  current step has: the add list is built from the step's features, so it can never offer a wall
  on a step that cannot draw one.
- **Remove** — the list of what you have added, each with a delete.
- **Arrows** — the picker that is 313 px of the page today.
- **Steps** — the six, plus Examples, How to use, Things to find.
- **How this works** — the teaching panel for this step.
- **Leave Interactive** — the three detail levels, so the way out is next to the way in.

## The graphs (bottom left)

Tap it and a drawer lists the step's graphs — three to seven of them, from `channelsFor()`. Tap one
and it becomes the thin strip above the transport. Tap another and it swaps. Tap the strip to put it
away. One at a time, deliberately: two graphs on a phone are two unreadable graphs.

Scrubbing the strip scrubs the timeline, exactly as the full graphs do now.

## Where the teaching goes

The mission does not get dropped because the sidebar did. In this mode:

- the **step pill** shows `3/6` and opens the step list;
- the **hint** for the step stays, folded, under the pill — it is one line until you open it, and it
  still disappears when you have done the thing;
- **achievements** still toast;
- **How this works** is in the menu, one tap away;
- the **readouts** fold into the transport row: the one number the step is about, with the rest in
  the properties sheet.

Nothing is removed. Everything is one tap instead of one scroll.

## What gets built

```
js/targets.js        pure, tested. What is under this point, by precedence, and which
                     section belongs to each kind of thing. Hit-tested in SCREEN space
                     with a minimum radius — a 0.4 m ball at phone zoom is a 20 px
                     target and a finger is 44 px.
js/ui/stage-ui.js    the overlay: step pill, menu, satellites, sheet, graph strip.
js/gestures.js       pure, tested. Tap vs drag, and what a pull means as a velocity.
                     Last piece only.
```

One new pure module, one new UI module, one later. Everything else is CSS behind
`[data-layout="interactive"]` and one new state field.

State: `state.ui.layout = 'page' | 'interactive'` and `state.ui.strip = <graph id>`. The layout is
**a separate field from the level**, not a fourth rank — `atLeast()` is called in several hundred
places, and a fourth rank would turn every `at('expert')` either always-true or always-false. The
graph groups need an `id` each; they have only labels today.

## Build order

Each is independently useful and independently shippable.

1. **The mode exists.** The chip, `data-layout`, the CSS, and a menu holding only the way out.
   Verifiable immediately: the drawing goes from 200 px to ~756 px on a phone.
2. **Tap to select, and the properties satellite.** `js/targets.js`, the cluster, the object sheet.
   This is the commit that pays for the mode — edit the mass without leaving the picture.
3. **The rest of the targets.** Planet, ground, water, sky, wall, cannon.
4. **Add, Remove, Arrows** in the menu.
5. **The forces satellite**, with the arrow previewing as you drag the slider.
6. **The graph strip and drawer.**
7. **The gestures.** Drag to move, pull to throw, pinch to zoom.

## The traps, named in advance

- **`100dvh`, never `100vh`** — on a phone `100vh` is taller than the visible page, so the transport
  sits under the URL bar.
- **`env(safe-area-inset-*)`** on all four corner buttons, or the notch and the home bar eat them.
- **`touch-action: none` on the stage**, or the browser pans the page instead and nothing works.
  Easy to forget, and it looks like every gesture is broken.
- **The overlay must not be rebuilt per frame.** `paint()` runs on every animation frame; the
  satellites are built when the selection changes and only their `transform` is written per frame.
  Same class as the scroll and focus preservation already in `render()`.
- **The sheet is a native `<dialog>`** — top layer, Escape, focus trap and a backdrop for free, and
  it escapes the `overflow: auto` clipping context that the sidebar tooltips were bitten by.
- **One layout renders at a time.** Both at once would put two elements on screen with the same
  `data-field`, which is what every test selects by.

## What I would not do

- **Not a replacement.** The page layout stays the default and stays exactly as it is.
- **Not an auto-switch.** A phone is not moved into this mode on its behalf; it is offered once.
- **Not a second set of controls.** If a sheet ever needs a field the sidebar does not have, the
  field goes in the sidebar first.
- **Not polish** — no haptics, no inertia, no animation — until the six pieces are real and have
  been used on an actual phone.

## Questions, before any of it

1. **Which detail level do the sheets use?** My answer: the one you last picked, so choosing
   Interactive does not throw away the Simple/Advanced/Expert choice. The alternative is that
   Interactive always shows Advanced.
2. **Live, or adjust-then-accept?** You said adjust and accept. Everything in the app is live
   today — the arrow redraws as the slider moves, which is the feedback. My answer: keep it live and
   label the button **Done**. Say if you want a real draft you confirm.
3. **The water strip — world or fluid?** My answer: the water strip is the planet's surface made of
   water, so it opens The world it is on; the sky opens The fluid it moves through.
4. **Does a phone get told this exists?** My answer: no switch, but one dismissible line on a narrow
   screen the first time.
5. **A delete arm on the cluster?** A fourth satellite below the body to remove the selected object,
   or only the menu's Remove list. My answer: menu only — a delete under your thumb on a phone is a
   mistake waiting to happen.

Once it is built and has been used, the mode goes into the `detronics-app` skill, so the other
benches get the same one.
