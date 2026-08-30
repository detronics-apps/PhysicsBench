/**
 * Gravitation between two masses. Pure.
 *
 * The point of this module — and of the two stages that use it — is that
 * "gravity" and "weight" are not separate topics. Two 1 kg masses a metre apart
 * really do pull on each other, with a force of 6.7×10⁻¹¹ N. That is about the
 * weight of a bacterium, which is why nobody notices it, and why the effect only
 * becomes obvious once one of the masses is the size of a planet.
 *
 * So the app never hands the learner a value of g. It hands them a mass and a
 * radius and computes g from them, because that is where g comes from:
 *
 *     g = G · M / r²
 *
 * Change the planet's mass or its radius and the weight of everything standing
 * on it changes. Nothing else has to be told to the learner — they can watch it.
 */

import { G } from './constants.js';
import { sub, len, norm, scale } from './vec.js';

/**
 * The force each of two masses exerts on the other. Equal and opposite.
 *
 *     F = G · m₁ · m₂ / r²
 *
 * Note it takes two masses and one distance. There is no "which one is doing
 * the pulling" — both are, equally, and the reason the small one visibly moves
 * and the big one does not is entirely down to F = ma afterwards.
 */
export function attraction(m1, m2, distance) {
  if (!(distance > 0)) return Infinity;
  return (G * m1 * m2) / (distance * distance);
}

/** The same thing as a vector on body A, pointing towards body B. */
export function attractionVector(a, b) {
  const offset = sub(b.pos, a.pos);
  const distance = len(offset);
  if (!(distance > 1e-9)) return { x: 0, y: 0 };
  return scale(norm(offset), attraction(a.mass, b.mass, distance));
}

/**
 * The gravitational field strength at the surface of a sphere.
 *
 * The falling object's mass is not a parameter, and cannot be — that is the
 * whole reason everything falls together.
 */
export function surfaceGravity(mass, radius) {
  if (!(radius > 0)) return NaN;
  return (G * mass) / (radius * radius);
}

/** And at any distance from the centre. */
export const fieldAt = (mass, distance) => (distance > 0 ? (G * mass) / (distance * distance) : NaN);

/** The mass a body of a given radius needs in order to have a given surface g. */
export const massForGravity = (g, radius) => (g * radius * radius) / G;

/** The radius a body of a given mass needs in order to have a given surface g. */
export const radiusForGravity = (g, mass) => Math.sqrt((G * mass) / g);

/** Mean density, which is what actually decides surface gravity for a given size. */
export const density = (mass, radius) =>
  (radius > 0 ? mass / ((4 / 3) * Math.PI * radius ** 3) : NaN);

/** Escape speed, for the "how hard would you have to throw it?" question. */
export const escapeSpeed = (mass, radius) =>
  (radius > 0 ? Math.sqrt((2 * G * mass) / radius) : NaN);

/**
 * Real bodies, given as mass and radius — never as a value of g.
 *
 * Every g in the app is computed from these two numbers, so a learner who
 * doubles the mass or halves the radius watches the weight change for a reason
 * rather than because a different number was looked up.
 *
 * Masses and mean radii are the IAU/NASA figures. Where the computed g differs
 * from the published "surface gravity", the note says why — usually rotation,
 * or the fact that a gas giant has no surface to stand on.
 */
export const WORLDS = [
  {
    id: 'ceres',
    label: 'Ceres',
    mass: 9.384e20,
    radius: 4.73e5,
    note: 'The largest asteroid. You could throw a ball into orbit by hand — '
      + 'almost. Escape speed is about 510 m/s, so not quite.',
  },
  {
    id: 'pluto',
    label: 'Pluto',
    mass: 1.303e22,
    radius: 1.188e6,
    note: 'About a sixteenth of Earth\'s surface gravity.',
  },
  {
    id: 'moon',
    label: 'The Moon',
    mass: 7.346e22,
    radius: 1.7374e6,
    note: 'A sixth of Earth\'s, and effectively no atmosphere — which is why the '
      + 'hammer and feather drop worked there in front of a camera.',
  },
  {
    id: 'mercury',
    label: 'Mercury',
    mass: 3.3011e23,
    radius: 2.4397e6,
    note: 'Almost exactly the same surface gravity as Mars, from less than half '
      + 'the radius — because it is far denser.',
  },
  {
    id: 'mars',
    label: 'Mars',
    mass: 6.4171e23,
    radius: 3.3895e6,
    note: 'A thin atmosphere, about 0.6% of Earth\'s pressure at the surface.',
  },
  {
    id: 'venus',
    label: 'Venus',
    mass: 4.8675e24,
    radius: 6.0518e6,
    note: 'Nearly Earth\'s gravity, with an atmosphere about 90 times denser. '
      + 'Anything falling there is dominated by drag.',
  },
  {
    id: 'earth',
    label: 'Earth',
    mass: 5.9722e24,
    radius: 6.371e6,
    note: 'Computing g from the mean radius gives about 9.82 m/s². The standard '
      + 'value of 9.80665 m/s² is a defined convention, and the real value at '
      + 'sea level runs from about 9.78 at the equator to 9.83 at the poles — '
      + 'partly because Earth is not a sphere, partly because it spins.',
  },
  {
    id: 'uranus',
    label: 'Uranus',
    mass: 8.681e25,
    radius: 2.5362e7,
    note: 'Slightly less than Earth, despite being fifteen times the mass — '
      + 'because it is four times the radius, and g goes as 1/r².',
  },
  {
    id: 'neptune',
    label: 'Neptune',
    mass: 1.02413e26,
    radius: 2.4622e7,
    note: 'Quoted at the 1-bar level; there is no surface to stand on.',
  },
  {
    id: 'saturn',
    label: 'Saturn',
    mass: 5.6834e26,
    radius: 5.8232e7,
    note: 'Less dense than water. Ninety-five Earth masses and barely more '
      + 'surface gravity than Earth, because it is enormous. G·M/r² gives about '
      + '11.2 m/s² here; the usually quoted 10.44 subtracts the effect of a '
      + 'ten-hour day, which this model does not include — Saturn is visibly '
      + 'squashed by its own rotation.',
  },
  {
    id: 'jupiter',
    label: 'Jupiter',
    mass: 1.89813e27,
    radius: 6.9911e7,
    note: 'Computed here from the equatorial radius at the 1-bar level, giving '
      + 'about 25.9 m/s². The usually quoted 24.79 m/s² subtracts the effect of '
      + 'Jupiter\'s very fast rotation, which this model does not include.',
  },
  {
    id: 'sun',
    label: 'The Sun',
    mass: 1.9885e30,
    radius: 6.957e8,
    note: 'At the photosphere — the layer we see. There is no solid surface.',
  },
  {
    id: 'neutron-star',
    label: 'A neutron star',
    mass: 2.8e30,
    radius: 1.2e4,
    note: 'Roughly 1.4 solar masses inside a 12 km radius. Surface gravity is '
      + 'about two hundred billion times Earth\'s, and the Newtonian answer this '
      + 'app computes is badly wrong there — general relativity is not optional '
      + 'at that field strength.',
  },
];

export const worldById = (id) => WORLDS.find((w) => w.id === id) || WORLDS.find((w) => w.id === 'earth');

/** Everything the interface needs about a chosen or invented world. */
export function describeWorld({ mass, radius, id = 'custom' }) {
  const known = WORLDS.find((w) => w.id === id);
  const g = surfaceGravity(mass, radius);
  return {
    id,
    label: known ? known.label : 'Custom world',
    mass,
    radius,
    g,
    density: density(mass, radius),
    escapeSpeed: escapeSpeed(mass, radius),
    note: known ? known.note : 'A world of your own. g follows from the mass and '
      + 'the radius, so changing either changes what everything on it weighs.',
    // How far from realistic this is, if it was invented.
    relativisticallyWrong: g > 1e9,
  };
}

/**
 * How far apart two everyday masses would have to be for their attraction to
 * be noticeable — which is the point that "gravity is very weak indeed".
 */
export function everydayComparison(m1, m2, distance) {
  const force = attraction(m1, m2, distance);
  // Something recognisable to compare it with: a grain of sand weighs about
  // 10 μN on Earth, a mosquito about 25 μN.
  const grainOfSand = 1e-5;
  return {
    force,
    asFractionOfGrain: force / grainOfSand,
    text: force < grainOfSand
      ? `${force.toExponential(2)} N — about ${(grainOfSand / force).toExponential(1)} times `
        + 'less than the weight of a single grain of sand. Gravity between '
        + 'everyday objects is real, and utterly negligible.'
      : `${force.toExponential(2)} N.`,
  };
}

/**
 * The geometry of drawing a very large sphere.
 *
 * This is what makes the fourth stage work. As a world grows, the piece of it
 * near the small object flattens: the sag of the arc across a window of width
 * `span` is about span²/(8R). Past a few thousand kilometres of radius that sag
 * is under a pixel, and the horizon has become a straight line — which is the
 * whole reason "the ground" looks flat and "down" looks like one fixed
 * direction.
 *
 * Returns the sag in metres so the renderer can draw the arc honestly and stop
 * bothering once it is invisible.
 */
export function horizonSag(radius, span) {
  if (!(radius > 0)) return 0;
  if (span >= 2 * radius) return radius;         // the whole body is in view
  return radius - Math.sqrt(Math.max(0, radius * radius - (span / 2) ** 2));
}

/** How far away the horizon is, for an eye `height` above a sphere. */
export const horizonDistance = (radius, height) =>
  (radius > 0 && height > 0 ? Math.sqrt(height * (2 * radius + height)) : 0);

/**
 * Is this world big enough that treating its field as uniform is reasonable?
 *
 * The test the app uses: over the height of the experiment, does g change by
 * less than a tenth of a percent? If so, the flat-ground uniform-field model is
 * a good one and the app says so. If not — a small asteroid, or an experiment
 * hundreds of kilometres tall — it says that too.
 */
export function uniformFieldValid(radius, experimentHeight, tolerance = 0.001) {
  if (!(radius > 0)) return { valid: false, change: 1 };
  const top = fieldAt(1, radius + experimentHeight);
  const bottom = fieldAt(1, radius);
  const change = Math.abs((top - bottom) / bottom);
  return {
    valid: change <= tolerance,
    change,
    text: change <= tolerance
      ? `Over ${experimentHeight < 1000 ? `${experimentHeight.toFixed(1)} m` : `${(experimentHeight / 1000).toFixed(0)} km`}, `
        + `g changes by ${(change * 100).toFixed(4)}%. Treating the field as uniform costs nothing measurable.`
      : `Over this height g changes by ${(change * 100).toFixed(2)}%, which is enough to matter. `
        + 'The uniform-field model is starting to break down here.',
  };
}
