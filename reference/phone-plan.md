# Making the bench usable with a thumb

A plan, for review. Nothing here is built yet.

## The problem, stated honestly

On a phone the layout stacks: drawing, then transport, then the sidebar. That was the right call
— a drawer hides the controls behind a gesture nobody discovers — but it means **every change is
scroll down, adjust, scroll back up to see what happened**. The thing you are looking at is the
one thing you cannot touch.

And the drawing is the app. Everything else is apparatus.

## The principle

**On a phone, the drawing becomes a control surface. The sidebar stays exactly as it is.**

Nothing is removed and nothing moves. The sidebar is the complete, precise, nameable version of
every control and it keeps that job — it is where you type 1.5e9, pick a material, read a
coefficient. What is added is a direct route to the four things somebody actually changes while
watching: **where a thing is, how heavy it is, how fast it is going, and which way**.

Two rules follow, and they are what keep this from becoming a second app:

- **The drawing never becomes the only way to do something.** Every gesture has a sidebar
  equivalent that already exists. A gesture is a shortcut, never a feature.
- **A gesture changes one quantity.** If a drag would change two things at once, it is the wrong
  gesture.

## What is already there

Worth saying, because this is far less work than it looks:

- `pointerToWorld()` converts a pointer event to metres through `getScreenCTM`, so it is already
  correct under letterboxing and zoom — and it already works for touch, because pointer events are
  touch events.
- `setPointerCapture` is already used for the pan and wall-drawing drags.
- `state.selectedId` already exists and already drives which body the readouts follow.
- `state.ui.tool` already arbitrates who owns a `pointerdown` (`none` / `wall` / `arc` / `pan`).
- The control step already applies a force towards the pointer, so "the pointer can move a body"
  is a solved problem in the physics.

So the work is a gesture layer on top of an input layer that already speaks the right language.

## The five pieces, in the order I would build them

### 1 · Tap a body to select it

The smallest useful change and the foundation for the rest. Tap anything on the drawing and it
becomes `selectedId`: the readouts follow it, and a quiet ring marks it.

- Hit-testing is a pure function — point, bodies, a generous radius — so it is tested without a
  browser. **Generous** matters: a 0.4 m ball at a phone zoom is a 20 px target, and a finger is
  44 px. Hit-test in *screen* space with a minimum radius, not in world space.
- Tapping empty space deselects.
- This must not fight the existing "click the drawing to take the arrow keys" behaviour. Taking
  the keyboard happens on the *first* tap anywhere; selecting happens on a tap that lands on a
  body. Both can be true at once.

### 2 · Drag a body to move it

Press and drag. While paused, this sets where the body starts (`x0`/`y0`, or the object's entry in
`objects`). While running, it tows — the control force that already exists.

- **Commit on `pointerup`, never during.** Same rule as the sliders: a drag that writes to state on
  every move triggers a render that replaces the element being dragged. Paint during, commit after.
- The body follows the finger exactly, like the pan already does — measured against the grab point,
  not the previous frame, so it cannot drift.
- A drag that starts on empty space is a pan. That is the precedence: body first, then tool, then
  pan.

### 3 · Pull a velocity arrow

**This is the one that would change how the app feels.** Press a body, drag away, release: the
length of the pull is the speed, its direction is the direction. An arrow previews it as you drag,
in the same green the velocity arrow already uses.

Nothing else on the bench makes a vector feel like a vector. It is also exactly the gesture every
physics game has taught people already — pull back and let go.

- Scale is the question to settle: a 200 px pull should mean something sensible at every zoom.
  Probably "pull length in metres × a factor", so it is zoom-independent and the preview arrow is
  literally the velocity arrow.
- A tap with no drag is a tap (piece 1). The threshold wants measuring on a real phone, not
  guessing — somewhere around 10 px.
- Needs a modifier to distinguish from piece 2. Options to decide: long-press then drag for
  velocity and plain drag for position, or the reverse, or a two-state toggle on the selected
  body's ring. **This is the main open question.**

### 4 · A small editor on the selected body

Tap a selected body again (or tap its ring) and a compact card appears beside it with the three or
four things worth changing in the moment: **mass, speed, direction**, and the material picker.

- Big targets, few of them, no prose — the Simple level's rule, applied harder.
- It must not cover the body it is editing. Place it on the opposite side of the body from the
  centre of the drawing, the way the arrow labels already avoid each other.
- Every field in it already exists in the sidebar; this is a shortcut to four of them.
- It closes on a tap elsewhere, on scroll, and on Escape.

### 5 · Pinch to zoom, two-finger drag to pan

Standard, expected, and currently absent — zoom is two buttons and pan is a tool you have to arm.

- Pinch must be zoom-about-the-pinch-centre, not about the middle of the screen, or it feels broken.
- Requires `touch-action: none` on the stage, or the browser pans and zooms the *page* instead and
  none of the above works at all. **This is the first thing to do and the easiest to forget.**
- The existing buttons stay. They are how this works on a desktop with a mouse.

## How it should be built

The pattern the rest of the app already follows:

```
js/gestures.js        pure: pointer samples in, an intent out. Tested without a browser.
js/ui/stage-input.js  the listeners, the capture, the preview painting.
```

A gesture is a small state machine — down, moved far enough, up — and the interesting parts (did
this count as a tap or a drag? which body was hit? what velocity does this pull mean at this zoom?)
are all pure functions of numbers. They belong in a tested module, not in an event handler. That is
the same split as `camera.js` and `segments.js`, and it is why those were debuggable.

## What I would not do

- **Not a drawer for the sidebar.** The current stacking is right; this adds to it.
- **Not a separate phone layout.** One layout that reflows, as now. These gestures should work with
  a mouse on a desktop too, and mostly will for free.
- **Not gesture-only anything.** If the only way to set a direction is to pull an arrow, then
  precision is gone and so is the keyboard user.
- **Not haptics, inertia or animation polish** until the five pieces above are real and have been
  used on an actual phone.

## The open questions for review

1. **Piece 3's modifier.** How does the app tell "move this" from "throw this"? Long-press, a mode
   toggle on the ring, or something else. Everything else here is settled; this is not.
2. **Dragging while running.** Does dragging a moving body tow it (physical, already implemented)
   or teleport it (direct, and a lie about momentum)? I lean towards towing, with the readouts
   showing the control force so the lie is never told.
3. **How much of the editor.** Three fields or six? I lean three — mass, speed, direction — with
   "more" opening the sidebar section it mirrors.
4. **Whether any of this needs an achievement.** Probably one, for the first time somebody throws
   something by pulling it.

## The first commit, if this is approved

`touch-action: none` on the stage, `js/gestures.js` with hit-testing and tap-versus-drag, and piece
1 — tap to select. That is small, independently useful, and proves the hit-testing is generous
enough on a real phone before anything is built on top of it.
