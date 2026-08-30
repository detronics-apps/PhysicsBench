# Changelog

## 1.0.0

First release.

Thirteen labs — mass and inertia, speed and velocity, acceleration, forces, gravity and
projectiles, mass versus weight, momentum, collisions, energy, pendulums, rotation and torque,
Engineer mode and Challenges — over one simulation core.

- **The honesty layer.** Every lab declares its reality, its model, its assumptions and its
  approximations through `js/models.js`, which refuses to build a scenario that has not. Every
  equation is shown with its domain of validity and the wider statement it is a special case of.
  Switching on the 10 m/s² classroom value is recorded as an approximation, not a value.
- **Live Physics Inspector**, colour-keyed to the arrows on the drawing, so a number and its arrow
  are visibly the same quantity.
- **Graphs from the same recording as the animation**, with a playhead that stops where the
  animation stops and a timeline that scrubs recorded frames rather than re-simulating.
- **Play / Learn / Engineer modes**, and a discovery prompt per lab that names the misconception
  it corrects, why that misconception is reasonable, and what actually happens.
- **"What if?" comparison**, which warns when more than one variable changed and points at the
  relationship a ratio suggests rather than announcing it.
- **Challenge mode**, which asks for a prediction before it will grade anything and never says
  "wrong".
- Save, load, share link, print, SVG, PNG and CSV export. Everything local; the share link keeps
  its payload in the URL fragment.

Notes on the physics core, all covered by the 332 tests:

- RK4 is exact for constant acceleration, so simulated free fall agrees with v = u + at to the
  last digit and any later disagreement is physics rather than arithmetic.
- The world stepper takes its position from the mean of the old and new velocities, so a
  two-second fall drifts by about 10⁻¹² J rather than enough to show in the second decimal place.
- Friction can stop a body but never drive one backwards, which cures the twitch that otherwise
  leaves a stopped box creeping slowly up a ramp.
- Collisions are resolved with the closed-form solution along the line of centres, and the carts
  share one height so that impacts are genuinely head-on — at different heights they resolve along
  a tilted line and leak energy sideways, disagreeing with the table printed beside them.
- Every scene reserves room for its arrows in pixels rather than in metres, so nothing is drawn
  outside its canvas. Verified across 118 parameter combinations at three points in time each.
