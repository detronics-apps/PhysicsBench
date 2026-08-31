/**
 * Pairs of real surfaces, and the friction coefficients they actually have.
 * Pure.
 *
 * A slider from 0 to 2 lets you set μs to 1.7, and nothing on the bench says
 * that no ordinary pair of dry solids does that. Naming the pairs fixes it: you
 * pick "rubber on dry asphalt" and read 0.9, pick "steel on ice" and read 0.03,
 * and the range between them is the range the world actually offers. The slider
 * stays, because asking "what would 1.7 do?" is a fair question — it is just no
 * longer the only way in.
 *
 * **Every number here is indicative.** Published figures for the same pair of
 * materials differ by more than a factor of two with surface finish,
 * cleanliness, temperature, contact pressure and sliding speed; several of them
 * are not really constants at all. The `spread` field says how far apart the
 * published values run, because a coefficient quoted to two decimals with no
 * range attached is the kind of false precision this app exists to avoid.
 *
 * Two things worth knowing that the numbers themselves do not say:
 *
 *   μk is *usually* below μs, and that gap is why a stuck object lurches when
 *   it finally moves. It is not a law — for a few pairs they are equal, and
 *   PTFE is the everyday example.
 *
 *   μ can exceed 1. It is not a percentage or an efficiency, and nothing caps
 *   it at one — a warm racing slick is around 1.4, which is why a racing car
 *   can brake harder than g and a road car cannot.
 *
 *   μ does not depend on how much surface is touching. This is the one most
 *   people find hardest to believe, and it is why `rolling` sits beside it: the
 *   enormous difference a shape makes is rolling versus sliding, not a wider
 *   footprint. `rolling` is the coefficient for something that rolls on this
 *   pair, and it is one to three orders of magnitude below the sliding value.
 *
 * The rolling figures deserve their own caveat. Rolling resistance comes from
 * the rolling body and the surface flexing under the contact, so it depends far
 * more on how soft the wheel is and how big it is than on which two materials
 * are named — a bicycle tyre at 100 psi and the same tyre at 30 psi differ by
 * more than any two entries in this list. They are quoted here as a property of
 * the pair, which is a simplification the app declares.
 */

export const SURFACES = [
  {
    id: 'racing-slick',
    label: 'Warm racing slick on dry asphalt',
    muS: 1.4,
    muK: 1.2,
    rolling: 0.014,
    spread: '1.1 to 1.8, and only when hot',
    note: 'Comfortably above 1, which settles the question of whether μ is a '
      + 'percentage: it is not, and nothing caps it at one. A cold slick is far '
      + 'worse than a road tyre, which is why the first lap is the dangerous one.',
  },
  {
    id: 'rubber-concrete',
    label: 'Rubber on dry concrete',
    muS: 1.0,
    muK: 0.8,
    rolling: 0.013,
    spread: '0.6 to 1.2',
    note: 'About as much grip as any everyday pair has. A rubber-soled shoe on a '
      + 'dry path is close to the limit of what ordinary materials manage, and '
      + 'it is why you can walk up a fairly steep slope without slipping.',
  },
  {
    id: 'rubber-asphalt-dry',
    label: 'Tyre on dry asphalt',
    muS: 0.9,
    muK: 0.7,
    rolling: 0.012,
    spread: '0.7 to 1.0',
    note: 'What a car has on a good dry road. It is also why a car brakes at '
      + 'about 0.9 g and no harder — the tyres, not the brakes, set the limit.',
  },
  {
    id: 'rubber-asphalt-wet',
    label: 'Tyre on wet asphalt',
    muS: 0.6,
    muK: 0.45,
    rolling: 0.015,
    spread: '0.4 to 0.7',
    note: 'A third less grip than dry, from the same tyre on the same road. '
      + 'Stopping distance goes as 1/μ, so the same speed needs half as far '
      + 'again to stop in.',
  },
  {
    id: 'tyre-gravel',
    label: 'Tyre on loose gravel',
    muS: 0.55,
    muK: 0.4,
    rolling: 0.035,
    spread: '0.3 to 0.7',
    note: 'Loose surfaces are awkward to describe this way. Much of what slows '
      + 'you is stones being shoved aside and rolling over each other rather '
      + 'than friction between two surfaces, so one coefficient stands in for '
      + 'something that is not really Coulomb friction at all.',
  },
  {
    id: 'wood-wood',
    label: 'Wood on wood',
    muS: 0.5,
    muK: 0.3,
    rolling: 0.01,
    spread: '0.25 to 0.6',
    note: 'A wide gap between the two values, so a wooden drawer sticks and then '
      + 'goes with a jerk.',
  },
  {
    id: 'leather-wood',
    label: 'Leather on wood',
    muS: 0.4,
    muK: 0.3,
    rolling: 0.012,
    spread: '0.3 to 0.5',
    note: 'The pair in an old drive belt, and in the soles of shoes on a floor.',
  },
  {
    id: 'steel-steel',
    label: 'Steel on steel, dry',
    muS: 0.74,
    muK: 0.57,
    rolling: 0.0015,
    spread: '0.4 to 0.8',
    note: 'Clean dry steel grips far better than most people expect. The figure '
      + 'falls through the floor the moment anything gets between the surfaces.',
  },
  {
    id: 'steel-steel-oiled',
    label: 'Steel on steel, oiled',
    muS: 0.15,
    muK: 0.09,
    rolling: 0.001,
    spread: '0.05 to 0.2',
    note: 'A film of oil, and the same two pieces of steel are five times more '
      + 'slippery. Most of a machine\'s design is about keeping that film there.',
  },
  {
    id: 'aluminium-steel',
    label: 'Aluminium on steel',
    muS: 0.61,
    muK: 0.47,
    rolling: 0.002,
    spread: '0.4 to 0.7',
  },
  {
    id: 'brass-steel',
    label: 'Brass on steel',
    muS: 0.51,
    muK: 0.44,
    rolling: 0.002,
    spread: '0.35 to 0.6',
  },
  {
    id: 'glass-glass',
    label: 'Glass on glass',
    muS: 0.94,
    muK: 0.4,
    rolling: 0.002,
    spread: '0.4 to 1.0',
    note: 'The widest gap of any pair here: it holds hard and then lets go '
      + 'almost completely. Two clean flat sheets can also stick outright, which '
      + 'is a different effect again and not friction.',
  },
  {
    id: 'rubber-ice',
    label: 'Rubber on ice',
    muS: 0.15,
    muK: 0.1,
    rolling: 0.01,
    spread: '0.05 to 0.2',
    note: 'A tyre on ice, and about a sixth of what the same tyre has on dry '
      + 'asphalt.',
  },
  {
    id: 'ice-ice',
    label: 'Ice on ice',
    muS: 0.1,
    muK: 0.03,
    rolling: 0.005,
    spread: '0.02 to 0.15',
    note: 'And it depends strongly on temperature: ice near its melting point is '
      + 'far more slippery than ice at −30 °C, because a thin liquid-like layer '
      + 'forms on the surface.',
  },
  {
    id: 'steel-ice',
    label: 'Steel on ice — a skate',
    muS: 0.03,
    muK: 0.02,
    rolling: 0.002,
    spread: '0.01 to 0.05',
    note: 'The lowest of any common pair, and the reason skating works. Note '
      + 'that it is not simply "pressure melts the ice" — that explanation is '
      + 'still repeated and does not survive the arithmetic.',
  },
  {
    id: 'ptfe-steel',
    label: 'PTFE on steel',
    muS: 0.04,
    muK: 0.04,
    rolling: 0.002,
    spread: '0.03 to 0.1',
    note: 'The slipperiest solid pair in ordinary use, and one of the few where '
      + 'the two coefficients are effectively the same — so it does not stick '
      + 'and lurch, it just slides.',
  },
  {
    id: 'frictionless',
    label: 'Frictionless — an idealisation',
    muS: 0,
    muK: 0,
    rolling: 0,
    spread: 'exactly zero, which nothing is',
    note: 'Not a material. It is the assumption a first physics course makes to '
      + 'get the other forces into view, and it is worth being able to switch to '
      + 'deliberately — as long as it is labelled as the fiction it is.',
  },
];

export const surfaceById = (id) => SURFACES.find((s) => s.id === id) || null;

/**
 * Which named pair a set of coefficients corresponds to, if any.
 *
 * Used so the selector shows what you last chose rather than snapping back to
 * "custom" the moment the sliders are read back out — and shows "custom"
 * honestly when the numbers have been dragged somewhere no pair sits.
 */
export const ROLLING_DEFAULT = 0.01;

/** The rolling coefficient for a pair, or a plausible one if it has none. */
export const rollingFor = (pair) => (pair && Number.isFinite(pair.rolling)
  ? pair.rolling
  : ROLLING_DEFAULT);

export function matchSurface(muS, muK, tolerance = 0.005) {
  return SURFACES.find((s) => Math.abs(s.muS - muS) <= tolerance
    && Math.abs(s.muK - muK) <= tolerance) || null;
}

/**
 * The angle a ramp has to reach before this pair lets go.
 *
 * tan θ = μs, which is the whole of it — and it is also how μs is measured in
 * practice, with a plank and a protractor. Worth showing beside the number
 * because a degree is something you can picture and 0.74 is not.
 */
export const slipAngle = (muS) => (Math.atan(Math.max(0, muS)) * 180) / Math.PI;

/**
 * How hard a braking stop this pair allows, as a multiple of g.
 *
 * a = μk·g, so the multiple *is* μk. Saying it that way turns an abstract
 * coefficient into a number anyone who has braked hard has felt.
 */
export const brakingG = (muK) => Math.max(0, muK);

/** A one-line summary of what a pair means, for the control's hint. */
export function describeSurface(pair) {
  if (!pair) return 'Dragged to a value of your own. Every named pair below is an '
    + 'indicative figure; there is nothing wrong with asking what a made-up one does.';
  const parts = [
    `μs ${pair.muS}, μk ${pair.muK} — published values run about ${pair.spread}.`,
  ];
  if (pair.muS > 0) {
    parts.push(`It starts to slide at ${slipAngle(pair.muS).toFixed(1)}°, and can stop `
      + `at about ${brakingG(pair.muK).toFixed(2)} g.`);
    parts.push(`Something that rolls on it meets about ${rollingFor(pair)} instead — `
      + `${Math.round(pair.muK / Math.max(1e-9, rollingFor(pair)))} times less.`);
  }
  if (pair.note) parts.push(pair.note);
  return parts.join(' ');
}
