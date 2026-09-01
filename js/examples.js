/**
 * Prepared experiments, shipped with the app. Pure.
 *
 * Each one is a *sparse patch*, not a saved file: only what differs from the
 * defaults. Two reasons, and both matter more than the brevity. A dozen lines
 * can be read and argued with, where a 1.5 kB blob of state cannot. And a patch
 * inherits later changes to the defaults instead of freezing today's — an
 * example that pins every field is a copy of the app as it was on the day it
 * was written, and it rots from then on.
 *
 * Everything goes out through `migrate`, the same door share links and saved
 * projects use. That is what makes these survive the app changing underneath
 * them: in the last week the surface step was deleted, the push force stopped
 * being allowed to go negative, and `sandbox` split into two features. A
 * hand-written scene that skipped the migration would have quietly broken on
 * each of those, and nobody would have found out until a visitor clicked it.
 */

import { migrate, VECTOR_IDS } from './state.js';

/**
 * The arrows a demonstration turns on, and — just as important — the ones it
 * turns off.
 *
 * Named rather than patched, because the default set is the one that suits the
 * *bench*, not any particular experiment. A demonstration about buoyancy that
 * inherits a sensible default with buoyancy switched off shows a ball sitting
 * in water and reads as broken; one about friction with nine arrows on it shows
 * a thicket. Listing exactly what to draw is the only version of this that
 * cannot drift.
 */
const arrowsFor = (wanted) => Object.fromEntries(
  VECTOR_IDS.map((id) => [id, wanted.includes(id)]),
);

export const EXAMPLES = [
  {
    id: 'crate-on-a-slope',
    title: 'A crate on a slope',
    blurb: 'Friction takes exactly the value needed to hold it — until it cannot.',
    watch: 'It is not sliding, and nothing is holding it but friction. Tilt the '
      + 'ground under "The world it is on" and watch the friction arrow grow to '
      + 'match: it is never more than it has to be. Past about 27° it runs out '
      + 'of grip and lets go — and then drops from μs 0.5 to μk 0.3, which is '
      + 'why it does not creep away but lurches.',
    stage: 'friction',
    /*
     * 24° against a slip angle of 26.6°, so it is held at about nine tenths of
     * everything friction has. Sitting flat would make the point badly: the
     * friction arrow would be nothing at all, and "it takes the value needed"
     * needs the value to be visibly non-zero and visibly short of its limit.
     */
    params: {
      shapeId: 'cube',
      size: 0.3,
      mass: 12,
      materialId: 'pine',
      slopeDeg: 24,
      // Wood on wood, which is a real pair rather than two round numbers.
      muS: 0.5,
      muK: 0.3,
      // Nothing is pushing it. The whole question is what holds it up.
      pushForce: 0,
      pushSeconds: 0,
      v0: 0,
      x0: 0,
      dropHeight: 0,
      fluidId: 'air',
      worldMode: 'planet',
      objects: [],
      walls: [],
      cannons: [],
    },
    arrows: ['weight', 'normal', 'friction', 'net'],
  },
];

export const exampleById = (id) => EXAMPLES.find((e) => e.id === id) || null;

/**
 * An example as a complete state, ready to be dropped into the app.
 *
 * `migrate` fills in everything the patch does not mention and coerces
 * everything it does, so a mistake in one of these lands as a sane value rather
 * than as a NaN somewhere in the physics.
 */
export function exampleState(id) {
  const example = exampleById(id);
  if (!example) return null;
  return migrate({
    stage: example.stage,
    bench: example.params,
    vectors: arrowsFor(example.arrows || []),
    view: example.view,
  });
}
