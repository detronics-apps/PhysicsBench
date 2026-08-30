/**
 * Physical constants and reference values. Pure data plus a little arithmetic.
 *
 * Every number in here carries where it came from and how much it varies,
 * because the app is not allowed to present a reference value as though it
 * were a universal constant that every real measurement will match. That is
 * the difference between "gravity is 9.81" (false, and something the learner
 * would later have to unlearn) and "the standard reference value is 9.80665
 * m/s²; the actual value at your location depends on latitude and altitude and
 * lies between about 9.76 and 9.83" (true, and the foundation of everything
 * that follows).
 *
 * Three kinds of number appear here and they are labelled differently on
 * purpose:
 *
 *   exact       fixed by definition — 9.80665 m/s² is *defined* to be that
 *   measured    a real measurement with a real uncertainty
 *   nominal     a rounded, published figure used for comparison
 */

/* ------------------------------------------------------- gravitation ---- */

/**
 * Newtonian constant of gravitation, CODATA 2022: 6.67430(15)×10⁻¹¹.
 * The least precisely known of the fundamental constants — relative standard
 * uncertainty 2.2×10⁻⁵, which is enormous next to, say, the speed of light.
 */
export const G = 6.6743e-11;
export const G_UNCERTAINTY = 0.00015e-11;

/**
 * Standard gravity, gₙ. Defined — not measured — as exactly 9.80665 m/s² by
 * the 3rd CGPM in 1901, so that the kilogram-force had a fixed meaning.
 *
 * It is close to, but not the same as, the gravitational acceleration at any
 * particular point on Earth. Nowhere on Earth is it exactly this.
 */
export const G_STANDARD = 9.80665;

/** The classroom approximation. Only ever used when the learner asks for it. */
export const G_ROUNDED = 10;

export const EARTH_MASS = 5.9722e24;        // kg, measured (±0.0006e24)
export const EARTH_MEAN_RADIUS = 6.371e6;   // m, mean; equatorial 6.3781e6
export const AU = 1.495978707e11;           // m, exact by definition
export const C_LIGHT = 299792458;           // m/s, exact by definition

/**
 * Gravitational field strength of an idealised spherically symmetric body.
 *
 *   g = G·M / r²
 *
 * The mass that appears here is the mass of the *attracting* body. The mass of
 * the object being attracted does not appear at all — which is the whole
 * reason two objects of different mass fall together in a vacuum, and the
 * single most important thing in this file.
 *
 * The model assumes: spherical symmetry, no other bodies, no rotation of the
 * frame, and r measured from the centre of mass. Real planets satisfy none of
 * those exactly.
 */
export function fieldStrength(mass, radius) {
  if (!(radius > 0)) return NaN;
  return (G * mass) / (radius * radius);
}

/** How far above the surface the field has fallen to `fraction` of its value. */
export function altitudeForFraction(surfaceRadius, fraction) {
  if (!(fraction > 0) || !(surfaceRadius > 0)) return NaN;
  return surfaceRadius * (1 / Math.sqrt(fraction) - 1);
}

/* ------------------------------------------ gravitational environments -- */

/**
 * Places a learner might want to run an experiment.
 *
 * `g` is the value the simulation uses. `kind` says what sort of number it is,
 * `varies` says how much the real thing moves around, and `note` is what the
 * interface must show alongside it. None of these are optional: an environment
 * picker that says only "Moon — 1.62" is teaching that the Moon has one
 * gravity in the same way a table has one length.
 */
export const ENVIRONMENTS = [
  {
    id: 'earth',
    label: 'Earth (standard)',
    short: 'Earth',
    g: G_STANDARD,
    kind: 'exact',
    varies: '±0.035 m/s² across the surface',
    note: 'Standard gravity gₙ is defined as exactly 9.80665 m/s². It is a '
      + 'conventional reference value, not a measurement: the actual value where '
      + 'you are standing depends on latitude, altitude and the rock beneath you, '
      + 'and lies roughly between 9.764 and 9.834 m/s².',
  },
  {
    id: 'earth-equator',
    label: 'Earth, sea level at the equator',
    short: 'Equator',
    g: 9.780,
    kind: 'measured',
    varies: 'about 9.78 m/s²',
    note: 'Lower than at the poles for two reasons: the equator is further from '
      + "Earth's centre, and the rotation of the Earth means part of the "
      + 'gravitational force is spent keeping you moving in a circle.',
  },
  {
    id: 'earth-poles',
    label: 'Earth, sea level at the poles',
    short: 'Poles',
    g: 9.832,
    kind: 'measured',
    varies: 'about 9.83 m/s²',
    note: 'The highest surface value on Earth: closest to the centre, and no '
      + 'rotational effect at the axis.',
  },
  {
    id: 'moon',
    label: 'The Moon',
    short: 'Moon',
    g: 1.62,
    kind: 'nominal',
    varies: '±0.01 m/s²',
    note: 'About one sixth of Earth\'s. The Moon has no appreciable atmosphere, '
      + 'so the no-air-resistance model is very close to the truth there — which '
      + 'is why the hammer and feather drop worked on Apollo 15.',
  },
  {
    id: 'mars',
    label: 'Mars',
    short: 'Mars',
    g: 3.71,
    kind: 'nominal',
    varies: '±0.02 m/s²',
    note: 'Mars has a thin atmosphere — about 0.6% of Earth\'s surface pressure — '
      + 'so air resistance exists but is small.',
  },
  {
    id: 'jupiter',
    label: 'Jupiter (at the 1-bar level)',
    short: 'Jupiter',
    g: 24.79,
    kind: 'nominal',
    varies: 'equatorial value; ~23.1 m/s² including rotation',
    note: 'Jupiter has no surface. This is the value at the depth where the '
      + 'pressure equals one bar, which is the convention used for gas giants. '
      + 'It is also equatorial: including the effect of Jupiter\'s fast rotation '
      + 'gives about 23.1 m/s².',
  },
  {
    id: 'venus',
    label: 'Venus',
    short: 'Venus',
    g: 8.87,
    kind: 'nominal',
    varies: '±0.02 m/s²',
    note: 'Very close to Earth\'s, but the atmosphere is about 90 times denser, '
      + 'so anything falling there is dominated by drag.',
  },
  {
    id: 'sun',
    label: 'The Sun (photosphere)',
    short: 'Sun',
    g: 274,
    kind: 'nominal',
    varies: 'at the visible surface',
    note: 'There is no solid surface; this is the field strength at the '
      + 'photosphere, the layer we see.',
  },
  {
    id: 'orbit',
    label: 'In orbit (apparent weightlessness)',
    short: 'Orbit',
    g: 0,
    kind: 'model',
    varies: 'real local g at 400 km is about 8.7 m/s²',
    note: 'This is the one entry that is a deliberate fiction, and the app says '
      + 'so. Gravity at the height of the Space Station is still about 89% of its '
      + 'value at the ground. Things float because the station and everything in '
      + 'it are falling together — free fall, not absence of gravity. Setting g '
      + 'to zero here models what an astronaut *feels*, not what is happening.',
  },
  {
    id: 'custom',
    label: 'Custom value',
    short: 'Custom',
    g: G_STANDARD,
    kind: 'chosen',
    varies: 'whatever you set',
    note: 'Set any value you like, including zero or a negative one. Physics '
      + 'does not stop working when the numbers stop being realistic — but the '
      + 'result stops describing anywhere real.',
  },
];

export const environmentById = (id) => ENVIRONMENTS.find((e) => e.id === id) || ENVIRONMENTS[0];

/* ------------------------------------------------------------- fluids --- */

/**
 * Air density at sea level, 15 °C, 101 325 Pa — the International Standard
 * Atmosphere. Real air is anywhere from about 0.9 to 1.3 kg/m³ depending on
 * altitude, temperature and humidity.
 */
export const AIR_DENSITY_ISA = 1.225;
export const WATER_DENSITY = 997;    // at 25 °C

export const FLUIDS = [
  { id: 'vacuum', label: 'Vacuum', density: 0, note: 'No fluid, so no drag and no buoyancy. This is the idealisation most textbook problems assume without saying so.' },
  { id: 'air', label: 'Air (sea level, 15 °C)', density: AIR_DENSITY_ISA, note: 'The International Standard Atmosphere value. Real air varies with altitude, temperature and humidity.' },
  { id: 'thin-air', label: 'Air at 10 km altitude', density: 0.414, note: 'About a third of sea-level density, which is why airliners cruise up there.' },
  { id: 'mars-air', label: 'Martian atmosphere', density: 0.020, note: 'About 1.6% of Earth\'s sea-level density.' },
  { id: 'water', label: 'Water', density: WATER_DENSITY, note: 'Roughly 800 times denser than air. Buoyancy also becomes significant, and this simulation does not model it.' },
];

export const fluidById = (id) => FLUIDS.find((f) => f.id === id) || FLUIDS[1];

/**
 * Drag coefficients. Every one of these is indicative.
 *
 * C_d is not a property of a shape alone — it depends on the Reynolds number,
 * which depends on speed, size and the fluid. A smooth sphere's C_d falls from
 * about 0.47 to about 0.1 as it crosses the critical Reynolds number, which is
 * the entire reason a golf ball has dimples. Treating it as a constant is a
 * modelling choice, and a good one for a first pass.
 */
export const DRAG_SHAPES = [
  { id: 'sphere', label: 'Smooth sphere', cd: 0.47, note: 'Valid for Reynolds numbers roughly 10³–2×10⁵. Above that it drops sharply.' },
  { id: 'rough-sphere', label: 'Dimpled sphere (golf ball)', cd: 0.25, note: 'The dimples trip the boundary layer into turbulence early, which delays separation and cuts drag.' },
  { id: 'cube', label: 'Cube, face on', cd: 1.05, note: '' },
  { id: 'plate', label: 'Flat plate, edge to the flow', cd: 1.28, note: 'The bluntest common shape.' },
  { id: 'streamlined', label: 'Streamlined teardrop', cd: 0.04, note: 'Thirty times less drag than a flat plate of the same frontal area.' },
  { id: 'skydiver', label: 'Skydiver, belly to earth', cd: 1.0, note: 'Frontal area around 0.7 m². Head-down, both fall together and terminal speed roughly doubles.' },
  { id: 'custom', label: 'Custom', cd: 0.47, note: 'Set your own.' },
];

export const dragShapeById = (id) => DRAG_SHAPES.find((s) => s.id === id) || DRAG_SHAPES[0];

/* ----------------------------------------------------------- friction --- */

/**
 * Coefficients of friction. Indicative only, and the ranges are wide.
 *
 * μ is not a material constant in the way density is. Published values for
 * "steel on steel" span more than a factor of two depending on surface finish,
 * cleanliness, contact pressure and whether anything has been sliding recently.
 * These are typical dry textbook figures; a real design uses measured data.
 */
export const SURFACES = [
  { id: 'frictionless', label: 'Frictionless (ideal)', muS: 0, muK: 0, note: 'Not a real surface. It is a modelling choice that isolates the other forces.' },
  { id: 'ice', label: 'Steel on ice', muS: 0.1, muK: 0.03, note: 'Very low, and it drops further with speed as a thin water film forms.' },
  { id: 'ptfe', label: 'PTFE on steel', muS: 0.04, muK: 0.04, note: 'About the lowest of any solid pair in common use.' },
  { id: 'wood', label: 'Wood on wood', muS: 0.5, muK: 0.3, note: 'Varies a great deal with grain direction and finish.' },
  { id: 'steel-dry', label: 'Steel on steel, dry', muS: 0.74, muK: 0.57, note: 'Clean and dry. Any oil at all roughly halves it.' },
  { id: 'steel-oiled', label: 'Steel on steel, oiled', muS: 0.15, muK: 0.09, note: '' },
  { id: 'rubber-asphalt', label: 'Rubber on dry asphalt', muS: 0.9, muK: 0.8, note: 'Can exceed 1 for soft racing compounds — μ has no theoretical ceiling of 1.' },
  { id: 'rubber-wet', label: 'Rubber on wet asphalt', muS: 0.5, muK: 0.4, note: '' },
  { id: 'custom', label: 'Custom', muS: 0.4, muK: 0.3, note: 'Set your own.' },
];

export const surfaceById = (id) => SURFACES.find((s) => s.id === id) || SURFACES[0];

/* --------------------------------------------------------- materials ---- */

/** Densities, so a "steel ball" can have a mass that follows from its size. */
export const MATERIALS = [
  { id: 'polystyrene', label: 'Expanded polystyrene', density: 20 },
  { id: 'wood', label: 'Pine', density: 500 },
  { id: 'water', label: 'Water', density: 997 },
  { id: 'concrete', label: 'Concrete', density: 2400 },
  { id: 'aluminium', label: 'Aluminium', density: 2700 },
  { id: 'steel', label: 'Steel', density: 7850 },
  { id: 'lead', label: 'Lead', density: 11340 },
];

export const materialById = (id) => MATERIALS.find((m) => m.id === id) || MATERIALS[5];

/** Mass of a solid sphere of a given radius and density. */
export const sphereMass = (radius, density) => (4 / 3) * Math.PI * radius ** 3 * density;

/** Frontal area of a sphere — the disc it presents to the oncoming air. */
export const sphereArea = (radius) => Math.PI * radius * radius;
