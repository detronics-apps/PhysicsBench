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
    teach: {
      how: 'Weight pulls straight down, and on a slope that pull splits in two. '
        + 'One part presses into the surface — the normal force pushes back with '
        + 'exactly that much, which is why the crate does not sink into the ramp. '
        + 'The other part runs down the slope, and there is nothing to balance it '
        + 'but friction. So friction takes whatever value cancels it: 47.9 N '
        + 'here, not because anything chose that number but because that is what '
        + 'is left over.',
      tryThis: [
        'Drag the tilt under "The world it is on" up one degree at a time and '
        + 'watch the friction arrow grow to match. It is never longer than it '
        + 'has to be.',
        'Keep going past 27°. The crate lets go — and the friction arrow does '
        + 'not vanish, it *drops*, because sliding friction is weaker than the '
        + 'static kind that was holding it.',
        'Set the surface to "steel on steel, oiled" and try again. It lets go at '
        + '8.5°, on the same crate, with the same weight.',
        'Change the mass. The angle it slips at does not move — which is the '
        + 'surprising part, and worth sitting with.',
      ],
      watch: [
        'The net force is exactly zero while it is held. Four arrows on screen '
        + 'and they add to nothing.',
        'The normal force is *shorter* than the weight, and shrinks as you tilt. '
        + 'Only part of the weight presses into the ramp.',
        'The moment it breaks away, the friction arrow shortens rather than '
        + 'disappearing.',
      ],
      learn: 'Static friction is not a fixed force, it is a limit. It supplies '
        + 'whatever is needed up to μs·N and then gives way — and because both '
        + 'the pull along the slope and the limit scale with weight, the angle at '
        + 'which things slide depends on the surfaces and not on how heavy the '
        + 'object is.',
    },
  },
  {
    id: 'five-densities',
    title: 'Five densities, one fluid',
    blurb: 'The same five balls sort themselves differently in air, in water and in honey.',
    watch: 'Five spheres the same size, differing only in what they are made of, '
      + 'and the fluid decides which way each one goes. In water three rise and '
      + 'two sink. Switch to honey and the rubber one joins them — nothing about '
      + 'the ball changed, the fluid got denser than it is. Switch to air and '
      + 'every one of them falls, because air is eight hundred times thinner than '
      + 'water and nothing here is that light. Buoyancy is the weight of the '
      + 'fluid pushed aside, so the only question is which is denser.',
    stage: 'fluid',
    /*
     * Same shape, same size, five densities — so the only thing that differs
     * between them is the one thing the demonstration is about. Give them
     * different sizes as well and every result has two explanations.
     *
     * The masses are each material's density times the volume of a 0.4 m
     * sphere, which is what makes the balls actually *be* pine and rubber
     * rather than merely labelled as such.
     *
     * Rubber is the one to watch and the one selected: at 1100 kg/m³ it sits
     * between water and honey, so it is the only ball that changes its mind
     * between the two.
     *
     * The lightest ball is polystyrene and not helium, and that is a limit of
     * the solver rather than a choice. Helium against water is a density ratio
     * of one to six thousand: the buoyant force gives it 59,000 m/s² and a
     * single 1/120 s step hands it 491 m/s against a terminal velocity of
     * three. The drag correction that follows overshoots, and it diverges —
     * seven million metres a second, in a fixed-step explicit integrator that
     * cannot resolve something that stiff. Polystyrene is one to fifty and
     * perfectly stable. Arranging an example so the solver cannot cope would
     * be teaching the reader about our timestep instead of about buoyancy.
     */
    params: {
      shapeId: 'sphere',
      size: 0.4,
      materialId: 'polystyrene',
      mass: 0.67021,
      x0: -3,
      dropHeight: 2,
      v0: 0,
      pushForce: 0,
      pushSeconds: 0,
      slopeDeg: 0,
      fluidId: 'water',
      worldMode: 'planet',
      objects: [
        { id: 'o2', shapeId: 'sphere', size: 0.4, materialId: 'balsa', mass: 5.36165, x: -1.5, y: 2, vx: 0, vy: 0 },
        { id: 'o3', shapeId: 'sphere', size: 0.4, materialId: 'pine', mass: 16.75516, x: 0, y: 2, vx: 0, vy: 0 },
        { id: 'o4', shapeId: 'sphere', size: 0.4, materialId: 'rubber', mass: 36.86135, x: 1.5, y: 2, vx: 0, vy: 0 },
        { id: 'o5', shapeId: 'sphere', size: 0.4, materialId: 'steel', mass: 263.05602, x: 3, y: 2, vx: 0, vy: 0 },
      ],
      walls: [],
      cannons: [],
    },
    select: 'o4',
    arrows: ['weight', 'buoyancy', 'drag', 'net'],
    teach: {
      how: 'Every one of these balls displaces the same 0.0335 m³ of fluid, '
        + 'because they are the same size. So they all feel the same buoyant '
        + 'force — the weight of that much fluid, pushing up. What differs is '
        + 'their own weight. Rise or sink is that one comparison and nothing '
        + 'else: is the ball heavier than the fluid it shoved out of the way?',
      tryThis: [
        'Press Play. In water, three rise and two sink.',
        'Switch the fluid to honey and run it again. The rubber ball changes '
        + 'sides — nothing about the ball changed, the fluid got denser than it '
        + 'is.',
        'Switch to air. Now every one of them falls — air is eight hundred times '
        + 'thinner than water, and nothing here is that light. Watch how '
        + 'differently they fall, though.',
        'Click each ball to put the readouts on it, and compare its density with '
        + 'the fluid density in the panel.',
      ],
      watch: [
        'The buoyancy arrows are all the same length. Same volume, same fluid, '
        + 'same push — the differences are entirely in the weight arrows.',
        'The rubber ball at 1100 kg/m³ sits between water at 997 and honey at '
        + '1420. It is the only one that answers differently in the two.',
        'In air the sinking balls keep accelerating for a long time; in honey '
        + 'everything reaches a steady speed almost at once. That is drag, and '
        + 'it is a separate effect from buoyancy.',
      ],
      learn: 'Floating is a comparison of two densities and nothing more. It has '
        + 'nothing to do with how heavy a thing is on its own — a steel ship '
        + 'floats and a steel ball does not, because what counts is the density '
        + 'of the whole object including the air inside it.',
    },
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
    /*
     * Which object the numbers follow. It matters once a scene has more than
     * three things on it, because past that the drawing shows values for the
     * selected one only — so a five-object comparison that leaves this alone
     * puts the readout on whichever object happens to be first rather than on
     * the one the example is about.
     */
    selectedId: example.select,
    // So the app can show this example's own explanation, and keep showing it
    // across a reload or through a share link.
    exampleId: example.id,
  });
}
