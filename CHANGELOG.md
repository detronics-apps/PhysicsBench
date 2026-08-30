# Changelog

## 2.0.0

Rebuilt as one bench that grows in eight steps, rather than thirteen separate labs.

### What changed

- **The Play / Learn / Engineer mode switch is gone.** There is one view.
- **Thirteen tabs became eight steps** on one object: a mass, a push, a second mass, growing that
  second mass into a planet, standing the object on a surface, giving the surface grip, putting it
  in a fluid, and colliding it with something. Parameters accumulate — the mass set in step one is
  the mass in step eight.
- **The Pendulum, Rotation & Torque, Engineer and Challenge labs were removed** along with the
  "what if?" comparison, none of which have a place in that sequence.
- **Every arrow on the object can be hidden.** A picker above the drawing turns each of the nine
  on or off, offers only the ones that exist at that step, and never rescales the ones still
  showing when one is hidden.
- **The graphs stay**, and momentum and energy now appear from the moment anything can move rather
  than arriving as a later topic.
- **The tests were cut from 333 to 229** — the ones that checked prose lengths, label completeness
  and registry consistency are gone, and the physics invariants are all still there.

### New physics

- **Mutual gravitation.** Two masses attract by G·m₁·m₂/r², drawn as a force pointing at the thing
  pulling. `js/gravitation.js` gives worlds as a mass and a radius and computes g from them, so
  changing either changes what everything on that world weighs. A world too large to draw as a
  circle is drawn as the arc of its surface, and that arc straightens on its own as it grows —
  which is why the ground looks flat.
- **Reynolds-number-dependent drag.** One coefficient (Clift–Gauvin) that collapses exactly to
  Stokes' law below Re ≈ 1 and to the familiar constant above Re ≈ 10³. Air, water, honey,
  glycerol and engine oil, each with a density *and* a viscosity. Doubling the speed quadruples
  the drag in air and doubles it in honey, from the same equation.
- **Shape.** Sphere, cube, flat plate, streamlined teardrop and cylinder, each deciding how the
  object sits on a surface, how much fluid it shoves aside and how cleanly. At low Reynolds number
  the shape stops mattering, as it should.
- **A full energy ledger.** Work done by the push is booked as an input, friction and drag as
  heat, collisions as impact — so the totals balance while something is being pushed. They did
  not before, and an app printing "total energy" beside a number that visibly climbs had taught
  the opposite of what it meant to.

### Fixes found while verifying

- Two forces sharing the `weight` id put a zero uniform-field row above the real gravitational
  pull, hiding it entirely. Same-id forces are now merged into one arrow.
- A zero weight printed as a bare "0.00 N" read as "this object is weightless"; it now says the
  surface is level and the weight has nothing to do.
- An inviscid fluid was treated as Re = 0 rather than Re → ∞, which made a vacuum behave like
  treacle.
- Pushing a penetrating body out of the ground handed it free potential energy that nothing
  accounted for, so the totals crept upward through a long contact. Contacts now book the actual
  mechanical energy lost.
- Bodies could pass through each other, and the 1/r² singularity then flung the small one away at
  a fraction of the speed of light. Solid objects now collide.
- A camera scale floor could stop a large scene fitting, pushing its contents off the canvas — the
  failure it was meant to prevent, arriving from the other side.
- Trails kept points from outside the camera window once it began following the object, leaving a
  stray line thousands of pixels outside the viewBox and wrecking every export.
- A field strong enough to matter integrated to NaN and silently emptied the drawing. The
  simulation now holds at a tenth of the speed of light and says why.

Verified across 297 rendered frames spanning 99 parameter combinations — nothing outside its
canvas, no NaN reaching the DOM, every export free of unresolved custom properties.

## 1.0.0

First release: thirteen labs over one simulation core, with the reality / model / assumption /
approximation disclosure, a live Physics Inspector, synchronised graphs, three modes, side-by-side
comparison and predict-first challenges.
