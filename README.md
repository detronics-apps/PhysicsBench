# Detronics PhysicsBench

**Live: https://detronics-apps.github.io/PhysicsBench/**

An interactive physics laboratory. Change a variable, watch what happens, measure it, and only
then see the equation that describes it. One static page — no backend, no build step, no
dependencies, no network requests once it has loaded.

The whole app runs on one idea: **change → observe → measure → explain → predict.** Nothing is
asserted that can be demonstrated instead, and no equation appears before the relationship it
describes has been seen happening.

## The experiments

| Lab | The question it opens with |
|---|---|
| **Mass & inertia** | What happens if I push a heavy thing and a light thing exactly as hard? |
| **Speed & velocity** | Two objects are both doing 5 m/s. Are they doing the same thing? |
| **Acceleration** | Can something be accelerating while it slows down? |
| **Force lab** | What happens if I push exactly as hard as friction pushes back? |
| **Gravity & projectiles** | Fire one ball horizontally and drop another. Which hits the ground first? |
| **Mass vs weight** | Drop a heavy ball and a light one together. Which lands first? |
| **Momentum** | Can a slow lorry and a fast bicycle carry the same momentum? |
| **Collisions** | What survives a crash, and what does not? |
| **Energy** | What happens to the height as the speed grows? |
| **Pendulums** | Does a heavier bob swing more slowly? |
| **Rotation & torque** | A hoop and a disc roll down the same ramp. Which wins? |
| **Engineer mode** | Can a gearbox give you something for nothing? |
| **Challenges** | Predict the answer first, then find out. |

Every lab carries a live **Physics Inspector** — mass, position, velocity, acceleration,
momentum, every force acting, and the net force — colour-keyed to the arrows on the drawing, so a
number and the arrow it belongs to are visibly the same quantity. Graphs are drawn from the same
recording as the animation, so pausing stops the trace exactly where it stops the ball.

Three modes: **Play** strips it back to the drawing and the question; **Learn** adds the
equations, the units, the graphs and the working; **Engineer** turns it into a design problem.

## Physics truth

The app is built so that nothing has to be unlearned later. Every lab keeps four things apart and
says which is which:

| | |
|---|---|
| **Reality** | what actually happens |
| **Model** | the mathematical description standing in for it |
| **Assumption** | something real, deliberately left out |
| **Approximation** | a number or a piece of maths deliberately simplified |

So the app never says "gravity is 9.81 m/s²". It says standard gravity is *defined* as exactly
9.80665 m/s², that the real value where you are standing lies between about 9.76 and 9.83
depending on latitude and altitude, and — if you switch on the 10 m/s² option for easier
arithmetic — that this is a deliberate approximation and not the value anywhere on Earth.

Every simulation declares what it is doing, in a panel that is always one click away, and
`js/models.js` refuses to build a scenario that has not declared it. Every equation is shown with
its domain of validity and with the wider statement it is a special case of: F = ma with the note
that force is more fundamentally dp/dt; p = mv with the note that it is the classical case of
γmv; T = 2π√(L/g) with the exact elliptic-integral period beside it and the error between them
displayed as a percentage.

The simulation itself is never simplified to match a lesson. The pendulum integrates
θ″ = −(g/L)·sin θ, not the linearised form, which is why its stopwatch agrees with the exact
period rather than the formula printed next to it.

## Running it

It is plain files. Any static server will do:

```bash
python -m http.server 8846
```

## Tests

The physics core is pure — no DOM, no globals — so it runs under Node's built-in test runner with
nothing to install:

```bash
npm test
```

332 cases across 22 modules. They are mostly invariants rather than examples: momentum is
conserved at every coefficient of restitution, RK4 is exact for constant acceleration, mgh is the
small-height limit of −GMm/r, an inelastic collision moves the maximum energy momentum
conservation allows, a migrated state round-trips unchanged, and every arrow stays inside its
canvas.

## Deploying to GitHub Pages

Push to `main`, then **Settings → Pages → Deploy from a branch → `main` / `(root)`**.
`.nojekyll` is already present. There is nothing to build.

## Layout of the code

```
index.html            the shell; everything else is built by JS
css/tokens.css        the Detronics palette as light/dark custom properties
css/layout.css        header, viewport, sidebar, footer
css/components.css    buttons, sections, banners, the force and vector colours
css/patterns.css      the layout rules that exist because something broke without them
css/print.css         the printable sheet

js/vec.js             2D vectors; x right, y UP, angles anticlockwise
js/constants.js       g, G, planets, fluids, friction — each with its provenance
js/models.js          reality / model / assumption / approximation, and every equation
js/integrator.js      RK4 and semi-implicit Euler
js/forces.js          weight, normal, friction, drag — each named, never just a net
js/world.js           bodies, ground, contact, collisions, one step of time
js/kinematics.js      the constant-acceleration relations and a solver
js/projectile.js      the exact no-drag solution, and the numeric one with drag
js/pendulum.js        small-angle and exact periods, and the double pendulum
js/collide.js         one-dimensional and planar impacts at any restitution
js/energy.js          an energy audit that relocates rather than loses
js/momentum.js        p = mv, impulse, and how wrong that is at relativistic speed
js/rotation.js        moment of inertia, torque, and the rolling race
js/engineer.js        motors, gears, traction and mechanical advantage
js/camera.js          metres to pixels, and the rules for drawing an arrow
js/graph.js           graph geometry: ticks, scales, paths that stay in their box
js/recorder.js        the recording the animation and the graphs both read
js/scenarios.js       each lab's world, and what it is honest about
js/compare.js         "what if?" — two runs, one variable apart
js/challenges.js      predict first, then run
js/lessons.js         the progression, and the misconception each step corrects
js/state.js           one state object, localStorage, URL-hash sharing
js/main.js            the shell, the clock, and the two render paths
js/ui/                DOM helpers, renderers, the inspector, the transport
js/ui/tools/          one controller per lab
tests/                node --test over the pure modules
```

The rule that keeps this workable: **everything under `js/` except `js/ui/` is pure.** No DOM, no
globals, no `window`. That is what lets the physics be tested without a browser.

## Privacy

Nothing you enter leaves your browser. No analytics, no cookies, no fonts or scripts from other
hosts. Settings are kept in `localStorage` on your own device. Share links encode the current
experiment into the URL fragment, which browsers never transmit to a server. Saving a project
downloads a JSON file; opening one reads it locally.

## Accuracy

**Values.** Standard gravity is the CGPM-defined 9.80665 m/s². Planetary surface gravities are
the nominal figures from the NASA planetary fact sheets, with the gas giants quoted at the 1-bar
level because they have no surface. G is the CODATA value 6.67430×10⁻¹¹. Air density is the
International Standard Atmosphere sea-level value of 1.225 kg/m³.

**Indicative figures.** Coefficients of friction and drag coefficients are typical textbook
values and are labelled as such in the app. Published μ for the same pair of materials can differ
by more than a factor of two with surface finish, cleanliness and contact pressure; C_d depends on
the Reynolds number and is not a property of a shape alone. A real design uses measured data.

**Numerics.** Free flight, projectiles and pendulums use fourth-order Runge–Kutta, which is exact
for constant acceleration, so simulated free fall agrees with v = u + at to the last digit.
Contact-heavy scenes use semi-implicit Euler with a trapezoidal position update at 2 ms substeps,
which is also exact under constant acceleration; energy drift over a two-second fall is around
10⁻¹² J. Collisions are resolved with the closed-form one-dimensional solution rather than
iteratively, so the simulated result and the table printed beside it agree to five decimal places.

**What is not modelled.** Rotation of bodies in the 2D world (the Rotation lab handles that
separately), buoyancy, wind, air-density variation with altitude, deformation, and where lost
energy goes after it is accounted for. Each of these is declared in the lab that assumes it away,
along with what would change if it were not.

## Licence

MIT.
