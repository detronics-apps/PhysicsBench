# Changelog

## 2.2.0

Inputs on one side, everything the experiment says back on the other — and the sliders became
fields you can type into.

### What changed

- **The sidebar is inputs and nothing else.** Everything measured — how it is moving, the forces on
  it, where it is — has moved into the viewport under the graphs, in a panel of its own. A readout
  at the top of a column of controls meant scrolling past a control to read a number and past a
  number to reach a control.
- **Live commentary moved up** to sit beside the drawing it is commenting on, rather than three
  sections below it.
- **Every slider's value is a field you can type into.** Click it, type, press Enter. It takes the
  same engineering notation as the rest of the app (1.5k, 4k7, 0R47), clamps a value past the ends
  of the slider rather than refusing it, and puts the old value back if you type something that is
  not a number. A slider is the right control for finding out what a quantity does and the wrong one
  for setting it to 9.81.
- **The pointer control is a thruster you aim, not a magnet that is always on.** An arrow shows
  where the pointer lies from the object whether or not anything is being applied; press and hold to
  thrust along it, for exactly as long as you hold. The force is the same however far away the
  pointer is — only its direction comes from where you point, which is a fact about thrusters rather
  than the fact about springs the old model was quietly teaching.
- **The drawing is something you select before it takes the arrow keys.** Until you click it, the
  arrow keys scroll the page, which is what they should do; once selected they steer, and Escape
  hands them back. It only becomes a tab stop at the step where the keys have something to do.

### Fixes found while verifying

- **banner('danger', …) was not a level the renderer knew**, so it fell through to info in silence.
  Both of the warnings that say the model has run out — the object has passed a tenth of the speed
  of light; the Newtonian answer at this field strength should not be believed — have been rendered
  as neutral grey notes for as long as they have existed. A test now pins every level a caller asks
  for against every level the renderer honours.
- **The energy graph at the two-masses step drew a flat line through a stack of identical ticks.**
  The scaler treated any range under 10⁻¹⁵ as a single point, which is a statement about metres
  applied to joules: the kinetic energy there is around 10⁻¹⁹ J, a perfectly good range. The check
  is now relative to the magnitude.
- **Axis numbers were rounded away to nothing.** Every tick on that same graph read 0.00, telling
  the reader the quantity is zero when it is the subject of the step. A common power of ten now
  comes out to the axis label — the ticks read 0, 2, 4, 6, 8 and the unit reads N ×10⁻⁹ — and a step
  of 0.25 no longer prints as 0.3.
- **The unit label shared the right-aligned column the y-tick numbers live in**, and the time label
  was anchored at exactly the x where the last x-tick is centred. Both overlapped in every graph.
  Each now has a row of its own, reserved by the layout rather than hoped for by the renderer.
- **The first and last x-tick numbers strayed outside the plot** — the first into the y-tick column,
  where it touched the bottom number; the last off the right-hand edge of the graph.
- **A live readout of 2.5×10¹⁷ m/s² printed as twenty-three digits**, breaking the layout it landed
  in. Fixed decimals exist for legibility, so past the point where they stop delivering any they
  give way to 2.53×10¹⁷.
- **"Holds up 72358% of its weight"** — arithmetically right, unreadable. A share of the weight
  while it is a share; a multiple once it is more.
- **The inspector pushed the page sideways on a phone.** Its value column does not wrap, which only
  stayed invisible while it lived inside the sidebar's own scroll container.

Verified across 192 rendered frames and 384 graphs spanning 96 parameter combinations — every step,
both worlds, six shapes, four fluids, with walls, cannons, driving and thrusting on: no NaN reaching
the DOM, nothing outside its canvas, no label touching another in a drawing or on an axis, and every
export free of unresolved custom properties. Checked again at 375 px.

## 2.1.0

The bench stops being a diagram: you can now change things while it runs, put it in deep space,
draw the scene, and drive an object around it.

### What changed

- **Changing a value no longer restarts the run.** Set something moving, then drag the push angle
  and watch the path bend from where the object actually is. Sliders now commit on every movement
  of the thumb rather than on release, so the change is something you watch rather than something
  you submit. Only a change that alters *what bodies exist* — a different step, an object added —
  rebuilds anything.
- **Deep space, from step five onwards.** One control removes the floor and the gravitational field
  together, which is the honest pairing: there is no such thing as a world with gravity and nothing
  to stand on. Weight, the normal force and friction go with them, and the arrow picker stops
  offering them rather than offering chips that do nothing.
- **Draw walls and obstacles.** Drag on the drawing to lay down a ramp, a barrier or the side of a
  box, or add four at once. A body rests on a drawn wall exactly as it rests on the ground — same
  normal force, same friction, same settling — and rolls off the end of it, because a segment has
  ends.
- **Cannons.** They give an object an initial velocity and then have nothing more to do with it,
  which is the same lesson as the timed push in step two.
- **Up to twenty objects**, each with its own size, mass and shape, in a list you can add to,
  remove from and edit. Cannon shots count towards the twenty, and when the bench is full the
  cannons stop and say so rather than quietly dropping shots.
- **Take the controls.** Connect an object to the pointer or to the arrow keys and drive it — over
  a ramp you drew, if you like. Both are *forces*: they join the same vector sum as weight and
  friction, get their own arrow, and have their work booked on the same ledger. Moving the object
  directly would give it infinite acceleration and no momentum history, and every arrow around it
  would then be describing a motion that F = ma had no part in.
- **Arrow labels no longer land on each other.** Every label on the drawing is now placed once, as
  a set, so it can be moved out of the way of the others. On a crowded bench the numbers follow the
  selection and the rest keep their arrows — forty pieces of text on one canvas is not a labelling
  problem that spacing can fix.
- **The shapes look like the shapes.** Every outline is drawn from its own path: the teardrop was a
  rectangle before. A car is drawn side-on where there is a floor to drive on and from above in
  space, and there is a balloon.

### New physics

- **Buoyancy**, modelled rather than assumed away. F = ρ_fluid · V · g, so an object less dense
  than the fluid rises — nothing is switched on to make that happen, the comparison simply comes
  out the other way. Volume is taken from the shape, so a car and a cube of the same width displace
  very different amounts. Potential energy is computed against the buoyant mass, which is what keeps
  a floating object from rising for free.
- **Walls as surfaces.** One contact routine serves the ground and every drawn segment, so a ball
  dropped on the floor and the same ball dropped on a wall drawn along the floor bounce to the same
  height, to six decimal places.
- **A spring to the pointer**, with damping near critical, declared as a model. Its stiffness scales
  with mass so a 900 kg car and a 1 kg ball handle the same, which means the strength setting reads
  as an acceleration and F = ma decides the rest.

### Fixes found while verifying

- **A cannon minted energy.** Every shot arrived holding kinetic energy that nothing had paid for,
  and the figure the app labels *the books* — the one it promises does not move — climbed by half a
  muzzle-energy each time it fired. A cannon does work on its shot; that work is now booked, along
  with the potential energy of the height it is fired from.
- **Shape outlines were squashed twice**, once by their own coordinates and again by the shape's
  aspect ratio, which drew the car at a sixth of its height. Outlines now fill their box and the
  aspect is applied once. A test pins it, because both halves look correct on their own.
- **Labels were told they were 11 pixels tall when they render at 14 to 15**, so the placer moved
  them by less than their own height and declared them clear while they still touched.
- **The zero-weight note was stale**, explaining an absent weight in terms of a level surface in
  scenes that have no surface at all. It now says what is actually true: there is no field here, and
  the object has not become weightless.
- **A balloon rested with its neck through the floor** — its support height and its drawn height
  disagreed. Every shape's support is now exactly half its drawn height, and a test checks all of
  them.
- **The friction clamp read the ground's normal** whatever the body was standing on, which would
  have let a box creep sideways for ever on a drawn ramp at any other angle.

Verified across 450 rendered frames spanning 150 parameter combinations — every step, both worlds,
every shape, four fluids, with walls, cannons and driving switched on: no NaN reaching the DOM,
nothing outside its canvas, no label touching another, and every export free of unresolved custom
properties.

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
- **The tests were cut from 333 to 239** — the ones that checked prose lengths, label completeness
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
