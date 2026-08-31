# Changelog

## 1.0.0

The first public release.

An interactive mechanics laboratory that builds one experiment up in eight steps — a mass, a push,
a second mass, growing that second mass into a planet, a surface, friction, fluids, and a playground
with everything switched on at once. Parameters accumulate: what you set in step one is still set in
step eight, and nothing resets when you change it, so an experiment can be adjusted while it runs.

- **Eight steps on one object**, so mass, force, gravity, surfaces, friction, drag and collisions
  arrive as one story rather than eight subjects.
- **Watch the planet happen.** The second mass swings underneath the first and inflates through
  twenty-four orders of magnitude while the object above it holds exactly the same size on screen
  and the surface beneath it flattens. Nothing is added to make weight appear.
- **Every force as its own labelled arrow**, switchable, drawn to one scale per quantity so their
  lengths can be compared — and contact forces drawn from the contact rather than the centre.
- **Real materials.** Sixteen friction pairs from a skate on ice to a racing slick, each with the
  range its published values actually span; fluids with a density *and* a viscosity, so drag changes
  law between air and honey; and restitution taken from the two materials that meet, so A into B is
  a different collision from A into C.
- **A playground**: drawn walls and ramps, cannons, twenty objects each with its own shape, size and
  material, and pointer or keyboard controls to drive one — all of them forces, all on the books.
- **Graphs against time**, synchronised to the animation, with a scrubbable timeline.
- **A measurements panel** carrying momentum, energy and an invariant that does not move whatever is
  pushed, heated, dropped or fired.
- **Export** to SVG, PNG, CSV, a shareable link, and a printable PDF with per-section toggles.

### The promise it is built around

Nothing here should have to be unlearned later. g is computed from a world's mass and radius rather
than looked up. Friction does not depend on contact area, and the app demonstrates that rather than
asserting it. Every equation carries its domain of validity and the wider statement it is a special
case of, and every step separately declares what is **reality**, what is a **model**, what has been
**assumed away** and what has been **approximated** — enforced in code, not by intention.

No build step, no dependencies, no network requests after load, and nothing leaves the browser.

---

*The entries below are the development history, kept because the reasons in them are still the
reasons the code is the way it is. Their version numbers were internal — none of them was ever
published, and this release is the first.*

## 2.5.3

- **The printed sheet now starts at the drawing.** The stepper, the question that opens the step and
  the arrow picker are ways of getting to a result rather than parts of one, and a printed page is
  somewhere you already are. The transport's host went with them — it was carrying the hint line
  beneath the bar, which would otherwise have printed on its own with nothing to belong to. Since
  nothing above the drawing survives, the printed input summary now names the step, so a sheet on
  its own still says which experiment it is of.
- **Each section starts a fresh page**: the graphs, the measurements, what was set, and the working.
  A forced break at the very start of the flow is ignored by the fragmenter, so whichever section
  happens to be first — the drawing normally, the graphs if the drawing has been switched off —
  does not leave a blank sheet in front of it.
- **The theme control is a disc with one glyph**, rather than a button with a word in it. It is the
  only thing in the header that is not about the work; its meaning is in the title and the
  accessible name, where it costs no width.

## 2.5.2

- **"The drawing" folded itself away on every click.** A panel's `open` option was winning over the
  remembered state on every render, so a panel a caller wanted closed *by default* could never be
  kept open: the first click on anything inside re-rendered the sidebar and closed it again, with
  the reader's own choice sitting in the store being ignored. That panel now holds the zoom, pan and
  print controls — the things you click several times in a row — so what had been a mild oddity on
  the view toggles became unusable. `open` is now where a panel starts, and a recorded state always
  wins. The same fault was latent in the cannons and controls panels.

## 2.5.1

- **The teardrop was drawn back to front.** Local +x is the direction of travel for every outline in
  the app, and the teardrop's point was at +x — so it flew sharp end first, which is a picture of a
  shape with roughly the drag of a flat plate rather than one with a thirtieth of it. The code
  comment beside the path had said "a round nose and a long tail" the whole time. Turned round, with
  a test on the geometry so it stays that way, and the shape's note now says which end leads and
  why: almost all of the saving is in the tail, because it is the wake behind a bluff body that
  costs rather than the air in front of it.

## 2.5.0

Eleven things, of which four were bugs.

### Fixed

- **A shape rotating past straight up did a slow barrel-roll.** Pointing just left of vertical and
  just right of it are drawn two degrees apart, but the target angles describing them sit on
  opposite sides of zero — the mirror accounts for the other 180°. Easing between the two
  descriptions sent the shape the long way round while the mirror had already switched. The drawing
  is continuous across that switch, so the number now jumps and the easing is skipped.
- **A rolling ball turned the wrong way.** `perp` returns the *left* perpendicular, so on a level
  floor it points backwards, and it was being used to measure how far the ball had rolled. The
  friction code never noticed because it only ever compares that tangent's sign against itself.
- **The view could only zoom itself.** A shot arcing away or a planet arriving pulled the framing
  out until the experiment was a speck, with no way back short of resetting it.
- **The pair table rendered blank**, because the table helper takes column objects and keyed rows
  and I gave it arrays.

### What changed

- **Step 5 is "Surface" and step 6 is "Friction."**
- **Zoom, pan, Home and a grid-size control.** Home is not "fit once" — it hands the framing back to
  the scene so it goes on following. The grid can be fixed to a spacing, which is what you want when
  comparing two runs at different scales and not what you want otherwise.
- **Bounciness comes from what things are made of.** A coefficient of restitution has never belonged
  to one object: rubber into rubber is 0.85, rubber into steel 0.80, rubber into modelling clay
  0.13. Every object, and every cannon, picks a material, and a table shows what each pairing on the
  bench is worth. The single-value slider is still there as an option.
- **Friction and the normal force are drawn from the contact**, not from the centre of mass — at the
  trailing corner of a sliding box, which is where a textbook draws them and where a reader looks.
- **Each step opens the panels it adds and folds away the ones it inherited**, once, on the first
  visit. By the last step the sidebar is eleven panels long and all of them were introduced earlier.
- **Density is on screen from the first step**, with volume, C_d and frontal area beside it, and a
  panel explaining what a density is and why it is the first *ratio* in the app.
- **C_d is on every shape in the picker**, and choosing a shape sets it to a real example at a real
  size and mass — a car is 4.4 m and 1400 kg, which works out at 183 kg/m³ because a car is mostly
  air, and a party balloon at 0.3 kg/m³, which is why it floats.
- **Print and PDF choose what to include**: the drawing, the inputs, the measurements, the graphs,
  the working. The inputs are written out as values, because a result without the settings that
  produced it is not something anyone can check or repeat. "Save as PDF" is a printer as far as a
  browser is concerned, so there is no second renderer to keep in step.

Verified across 244 rendered frames and 256 graphs — every step, both worlds, all eight shapes,
manual and automatic framing, fixed and material bounciness: no NaN, nothing outside the canvas but
cannon shots, no label collisions, every export clean.

## 2.4.2

- **The shape can be changed at every step, not only from step five.** For the first three it
  changes nothing about the motion, and the control says so rather than leaving it to be guessed:
  with no surface to rest on and no fluid to push through, a shape has nothing to act on. Being able
  to find that out by trying it is better than being prevented from asking. At step four it decides
  how the object sits when it lands, and from step five onwards it does everything it always did.
- **The C_d·A comparison now only appears where there is a fluid**, since that is the only thing it
  is about.

### Fixes found while verifying

- **Every shape rested at the same height on a planet.** Body-to-body contact treats everything as a
  circle — the point-mass assumption showing through, and right for two objects meeting side on —
  but resting on a planet is not that case: the surface is locally flat, so what decides the height
  is the distance from the centre to the underside, exactly as on the ground. A flat plate hovered
  ten times too high. It stayed invisible until the shape could be changed at that step.
- **Cannon shots no longer carry arrows**, for the same reason they carry no label and no trail.
  Twenty shots with six arrows each is a hundred and twenty arrows over a drawing trying to show
  four — and since a shot is allowed to leave the canvas, an arrow attached to one left with it,
  which quietly broke "nothing is drawn outside the drawing" for everything else.

## 2.4.1

- **The second mass now swings round the first rather than sliding at it.** It follows an arc,
  spiralling in to the separation it needs, and only starts growing once it is directly underneath.
  A straight line from wherever it happened to be sitting read as the mass being shoved into
  position — and starting level with the object, the first thing it did was set off sideways, which
  looks like the wrong direction because it is not yet obviously going anywhere. An arc is
  unambiguous from the first frame: it is going *round*, and round to underneath. It always takes
  the short way, so a mass starting on the left sweeps the other way.
- **And it no longer jumps on the first frame.** The animation was laid out in the coordinates the
  *next* step uses, so the object leapt up to its drop height as the run began — a lurch in the one
  thing the whole demonstration is claiming stays put. It is now laid out where step three already
  has everything, and the object does not move at all for the entire run. What matters at the end is
  the gap between the object and the surface, and a constant offset is invisible because the camera
  frames on the object.

## 2.4.0

Shapes that lie on the floor and point where they are going, cannon shots that behave like
scenery rather than apparatus, and the difference a shape actually makes at a contact.

### What changed

- **Cannon shots pass through each other.** They are what is being fired at the experiment, not the
  experiment, and a stream of them ricocheting off one another turns a demonstration into a ball
  pit. Everything else on the bench still stops them.
- **They no longer hold the camera.** A shot fired hard is off the side of the bench in half a
  second, and a view that kept it in frame would zoom out until the experiment was a dot. It is
  allowed to leave.
- **A spent shot fades over three seconds and is removed.** Only once it has come to rest — a body
  that vanishes takes its momentum with it, and this app puts the total on screen as a conserved
  quantity, so nothing is removed while it still has any. Its potential energy is moved onto the
  ledger on the way out, and the step it disappears on moves the books by exactly zero.
- **Shapes lie along the surface they are on.** Tilt the floor and a box on it tilts too; drop one
  onto a slope and it swings into line at a visible rate as it lands. This is a drawing rule, not a
  new physics model — nothing here has a moment of inertia, and the assumption saying so is now
  declared alongside the rest.
- **Shapes with a nose point where they are going**, and are mirrored rather than turned upside down
  when they travel left. A car on the ground lies along the ground and faces the way it drives; in
  the air it points along its velocity.
- **A new spaceship shape**, which exists to make the point that pointing somewhere and going
  somewhere are different things: turn it in deep space and its velocity does not change until a
  force acts.
- **A rolling ball's spoke now turns by exactly the distance it has covered**, θ = s/R, which is the
  only rotation in the app that corresponds to anything.

### The shape of a contact — what it changes, and what it does not

This was asked for as "a bigger cube should have more friction", and it does not, so it is not what
was built.

Sliding friction is μ·N and the apparent contact area is not in it. Real surfaces touch only at
their high points, and the real contact area is set by the load: spread the same weight over twice
the area and the pressure halves, leaving the same patches actually touching. A wider box of the
same mass has exactly the same friction, and the app now demonstrates that rather than asserting it
— change the size at a fixed mass and watch the number not move.

What does change, and changes enormously, is **rolling versus sliding**, which the app did not model
at all: spheres slid with the same μ as boxes. Rolling resistance is a different mechanism —
the ball and the ground flexing under the contact rather than surfaces being sheared — and it is ten
to a thousand times weaker. On a twelve-degree slope a sphere now rolls away while a cube does not
move at all. A car runs on wheels and rolls; the arrow is named for the mechanism actually acting,
because calling rolling resistance "friction" is how the two come to be thought of as the same thing
with a different number.

### Known and not fixed

A hard landing books about half a per cent of its own impact energy short, so "the books" steps by a
few hundredths of a joule when something drops onto the ground fast. It predates this release —
identical with the change reverted — and it is one-off per impact rather than accumulating.

A rolling shot takes a long time to stop, because that is what rolling means: a ball leaving a
cannon at 6 m/s needs about twelve seconds to come to rest, and until it does it does not fade. The
twenty-object cap and the "bench is full" banner handle the rest.

Verified across 155 rendered frames and 169 graphs spanning every step, both worlds, all eight
shapes, sixteen surface pairs, solidity both ways and every frame of the planet growth: no NaN
reaching the DOM, nothing outside its canvas, no label touching another, every export free of
unresolved custom properties.

## 2.3.1

- **A cannon could not hit the only object on the bench.** Whether bodies were solid depended on how
  many of them there were — which looks like a free optimisation, since one body has nothing to
  collide with, and is a correctness bug: cannons add their shots while the world is running, long
  after that count was taken. A bench holding one object and a cannon was therefore built with
  collisions switched off, and every shot sailed straight through the thing it was aimed at. The
  pair loop over a single body is empty anyway, so the check bought nothing even when it was right.
- **The collisions switch was somewhere nobody would look for it.** It sat at the bottom of a panel
  headed "Other objects (0 of 19)", and a cannon shot hitting the object that was already there
  involves no other objects at all. It now has a section of its own, next to the cannons that feed
  it, with a note on what a given coefficient of restitution actually keeps.
- **"Fires every: once, at the start" was cut off** at the eleven-character field beside the slider.

## 2.3.0

Real surfaces instead of a bare number, solidity you can switch off, and the third step now shows
you the fourth one happening rather than asking you to believe it.

### What changed

- **Step 7 is "Fluids and objects" and step 8 is "Playground."** The last step is where everything
  from the first seven is switched on at once, and calling it "a second object" undersold it.
- **Friction is picked from real pairs of surfaces.** Steel on ice at 0.03, wood on wood at 0.5,
  tyre on dry asphalt at 0.9, a warm racing slick at 1.4 — sixteen pairs, each with the range
  published values actually span and a note on what makes it interesting. The sliders stay
  underneath, because "what would 1.7 do?" is a fair question; it is just no longer the only way in.
  Beside them are the two numbers a coefficient is hard to picture without: the tilt it starts to
  slide at, and the braking it allows in g.
- **Solid objects can be made not solid.** One switch, applying to every pair on the bench including
  whatever the cannons fire. With twenty objects it is the difference between a pile-up and a swarm.
  It is held on under mutual gravitation, and not as a preference: 1/r² has no limit at zero
  separation, and bodies that can pass through each other find it.
- **"Make it a planet" now shows you what it means.** The second mass slides under the first and
  then inflates — the same equation and the same code path, with the mass climbing twenty-four
  orders of magnitude while the object above it does not move and does not change size on screen.
  The surface never moves either: it stays where the object was dropped from, so the run ends
  exactly where the fourth step begins, with nothing snapping into place. The caption reads out the
  surface gravity as it climbs, from 10⁻⁷ m/s² to 9.82.

### Fixes found while verifying

- **"Drop it from" did nothing, and then did the opposite.** `dropHeight` was never declared in the
  state, so `migrate` rebuilt the parameters without it on every reload and every share link; and
  `applyLive` kept its own copy of the starting-position logic that knew nothing about it, so
  dragging the slider put the object at y = 0 rather than raising it. There is now one function that
  decides where an object starts, called by both paths.
- **A world a few hundred pixels across was drawn as a circle running a thousand pixels past every
  edge of the canvas**, with its label placed at a centre that was off the bottom of the drawing.
  Invisible on screen, because SVG clips to its viewBox; very visible in an export. The arc branch
  is not a fallback for "too big to draw" — it is the correct picture of a surface crossing the view
  at any radius — so the test is now simply whether the circle fits.
- **The growth would have stalled in a background tab.** `requestAnimationFrame` stops there
  entirely, and while progress is measured from the wall clock rather than counted in frames, the
  run needed something other than a frame to finish it. It now also declines to animate at all if
  the tab is hidden when it starts, because nobody is watching.
- **The default coefficients matched no named pair**, so the new selector opened on "a value of my
  own" — the app admitting on first sight that it did not know what its own defaults represented.

Verified across 153 rendered frames and 183 graphs — every step, both worlds, every surface pair,
solidity both ways, three drop heights, and every frame of the growth at 2% intervals, plus five
custom worlds from a 500 m rock to a neutron star: no NaN reaching the DOM, nothing outside its
canvas, no label touching another, every export free of unresolved custom properties. Checked again
at 375 px.

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

## The first build

Thirteen labs over one simulation core, with the reality / model / assumption /
approximation disclosure, a live Physics Inspector, synchronised graphs, three modes, side-by-side
comparison and predict-first challenges.
