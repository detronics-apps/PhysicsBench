# Detronics PhysicsBench

**Live: https://detronics-apps.github.io/PhysicsBench/**

One object on one bench, built up in eight steps. Change something, watch what happens, measure
it, and only then see the equation that describes it. A single static page — no backend, no build
step, no dependencies, no network requests once it has loaded.

## The eight steps

This is one experiment, not eight. Every step adds one thing to the same object, and everything
from the earlier steps stays — the mass you set in step one is still the mass in step eight, and
its slider is still where you left it.

| | | The question it opens with |
|---|---|---|
| 1 | **A mass** | What is a mass, before anything happens to it? |
| 2 | **Push it** | What happens if I push harder, or make it heavier? |
| 3 | **A second mass** | Do two masses pull on each other? |
| 4 | **Grow it into a planet** | What has to change before that pull turns into weight? |
| 5 | **Stand it on something** | If gravity is still pulling, what holds it up? |
| 6 | **Make the surface grip** | What happens if the surface holds on? |
| 7 | **Put it in a fluid** | Air, water, honey — what actually changes? |
| 8 | **A second object** | What survives a collision, and what does not? |

The point of building it this way is that split across separate labs, "mass", "force", "gravity",
"friction" and "drag" look like separate subjects with separate formulas. Accumulated on one
object they are visibly one story: each step is another force joining the same vector sum, and the
sum is what decides what happens next.

Steps 3 and 4 are the spine of it. Two ordinary masses a few metres apart really do attract, with
about 4×10⁻⁹ N — roughly a millionth of the weight of a grain of sand. Grow one of them into a
planet and the *same equation* gives 9.8 m/s², while the surface under the object flattens until
"towards the centre" and "down" are the same direction. Nothing is added to make weight happen.
It is that faint tug, with a planet on the other end.

## Choosing what you can see

Nine arrows on one object is a thicket, and almost every question worth asking is about two of
them. The picker sits directly above the drawing and turns each one on or off — velocity,
acceleration, momentum, applied push, weight, normal force, friction, fluid resistance, and the
net force that is their sum. **Just what matters here** picks the two or three the current step is
actually about.

Two rules it obeys. It only offers arrows for forces that exist at that step — offering friction
before there is a surface would teach that friction is always there. And hiding an arrow never
changes the length of the others: the scales are computed over every force whether it is drawn or
not, so switching the weight arrow off cannot stretch the friction arrow and quietly break the
comparison the picker exists to enable.

Momentum and energy appear from the moment anything can move and stay for the rest of the bench —
in the readouts, the inspector, and their own graphs. They are not a later topic; they are two
more ways of describing what is already on screen.

## Physics truth

The app is built so that nothing has to be unlearned later. Every step keeps four things apart and
says which is which:

| | |
|---|---|
| **Reality** | what actually happens |
| **Model** | the mathematical description standing in for it |
| **Assumption** | something real, deliberately left out |
| **Approximation** | a number or a piece of maths deliberately simplified |

`js/models.js` refuses to build a step that has not declared all four, so this is enforced rather
than intended. Some consequences:

- **g is never looked up.** Worlds are given as a mass and a radius, and g = G·M/r² is computed.
  Change either and the weight of everything on that world changes for a reason you can watch.
  Where a computed value differs from the published figure — Jupiter and Saturn, whose quoted
  surface gravities subtract a large rotational effect this model does not include — the note says
  so rather than the app quietly storing the published number instead.
- **"Air resistance goes as v²" is only true in one regime,** and the app lets you pick honey,
  where it is flatly false. Drag uses one coefficient that varies with the Reynolds number
  (Clift–Gauvin), which collapses exactly to Stokes' law at the low end and to the familiar
  constant at the high end. In air, doubling the speed quadruples the drag; in honey it doubles
  it. One equation, two behaviours, and the readout says which regime you are in.
- **Energy is never simply lost.** Work done by the push is booked as an input, friction and drag
  are booked as heat, collisions as impact — and the number labelled *the books* does not move,
  whatever is pushed, heated or dropped.
- **Where the model runs out, it says so.** Invent a neutron star and the object is held at a
  tenth of the speed of light with an explanation, rather than shown numbers with nothing behind
  them.

Every equation is shown with its domain of validity and the wider statement it is a special case
of: F = ma with the note that force is more fundamentally dp/dt; p = mv with the note that it is
the classical case of γmv.

## Running it

Plain files. Any static server will do:

```bash
python -m http.server 8846
```

## Tests

The physics core is pure — no DOM, no globals — so it runs under Node's built-in test runner with
nothing to install:

```bash
npm test
```

229 cases across 17 modules, and they are invariants rather than examples: momentum is conserved
at every coefficient of restitution, work done equals kinetic energy gained, the drag correlation
matches Stokes' law to 3% where Stokes applies, the attraction between two bodies is equal and
opposite whatever their masses, a migrated state round-trips unchanged, and every arrow stays
inside its canvas.

## Deploying to GitHub Pages

Push to `main`, then **Settings → Pages → Deploy from a branch → `main` / `(root)`**.
`.nojekyll` is already present. There is nothing to build.

## Layout of the code

```
index.html            the shell; everything else is built by JS
css/tokens.css        the Detronics palette as light/dark custom properties
css/layout.css        header, viewport, sidebar, footer
css/components.css    buttons, the stepper, the arrow picker, force colours
css/patterns.css      the layout rules that exist because something broke without them
css/print.css         the printable sheet

js/vec.js             2D vectors; x right, y UP, angles anticlockwise
js/constants.js       G, standard gravity, c — and which of them are defined
js/gravitation.js     G·m₁·m₂/r², the worlds, and when a sphere becomes flat
js/drag.js            Reynolds number, the fluids, and why honey is not thick air
js/shapes.js          what shape changes: how it sits, its area, its drag
js/models.js          reality / model / assumption / approximation, and the equations
js/integrator.js      RK4 and semi-implicit Euler
js/forces.js          weight, normal, friction, drag — each named, never just a net
js/world.js           bodies, contact, collisions, the energy ledger, one step of time
js/stages.js          the eight steps, and what each one turns on
js/kinematics.js      the constant-acceleration relations and a solver
js/collide.js         one-dimensional and planar impacts at any restitution
js/energy.js          an energy audit that relocates rather than loses
js/momentum.js        p = mv, impulse, and how wrong that is near c
js/camera.js          metres to pixels, and the rules for drawing an arrow
js/graph.js           graph geometry: ticks, scales, paths that stay in their box
js/recorder.js        the recording the animation and the graphs both read
js/state.js           one parameter object, localStorage, URL-hash sharing
js/main.js            the shell, the clock, and the two render paths
js/ui/bench.js        the controls, readouts and teaching panels
js/ui/vectors.js      the arrow picker
js/ui/                renderers, the inspector, the transport, DOM helpers
tests/                node --test over the pure modules
```

The rule that keeps this workable: **everything under `js/` except `js/ui/` is pure.** No DOM, no
globals, no `window`. That is what lets the physics be tested without a browser.

## Privacy

Nothing you enter leaves your browser. No analytics, no cookies, no fonts or scripts from other
hosts. Settings are kept in `localStorage` on your own device. Share links encode the experiment
into the URL fragment, which browsers never transmit to a server. Saving downloads a JSON file;
opening one reads it locally.

## Accuracy

**Values.** G is the CODATA figure 6.67430×10⁻¹¹, and the least precisely known of the fundamental
constants. Planetary masses and mean radii are the IAU/NASA figures; every g is computed from
them. Standard gravity, 9.80665 m/s², is a defined convention rather than a measurement and is
used only where a scene has no world in it. Fluid densities and viscosities are at 20 °C — honey
in particular runs from about 2 to over 100 Pa·s with temperature, and the app says so.

**Indicative figures.** Friction coefficients and the high-Reynolds drag coefficients are typical
textbook values, labelled as such. Published μ for the same pair of materials can differ by more
than a factor of two with surface finish, cleanliness and contact pressure.

**Numerics.** Contact-heavy motion uses semi-implicit Euler with a trapezoidal position update at
2 ms substeps, which is exact under constant acceleration — a two-second fall drifts by about
10⁻¹² J. Collisions are resolved with the closed-form one-dimensional solution rather than
iteratively, so the simulation and the table beside it agree to five decimal places. Terminal
speeds are found by search rather than by the closed form, because the drag coefficient is not
constant.

**What is not modelled.** Rotation of bodies, buoyancy, wind, air-density variation with altitude,
deformation, the drag crisis above the critical Reynolds number, the recoil of a planet, and where
lost energy goes after it is accounted for. Each is declared in the step that assumes it away,
along with what would change if it were not.

## Licence

MIT.
