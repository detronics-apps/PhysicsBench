/**
 * The shape of the object, and what shape changes. Pure.
 *
 * Shape affects three separate things, and the stages introduce them one at a
 * time so they do not run together:
 *
 *   how it sits on a surface  — a sphere touches at a point, a cube on a face
 *   how much fluid it shoves  — the frontal area
 *   how cleanly it shoves it  — the drag coefficient
 *
 * `size` throughout is the overall extent in metres: the diameter of a sphere,
 * the edge of a cube. Keeping one number for size means changing shape changes
 * the shape and not accidentally the scale as well.
 */

/**
 * Every shape gives its volume, its frontal area and its high-Reynolds drag
 * coefficient from that one size.
 *
 * `cd` here is the *inertial* coefficient only. At low Reynolds number the
 * viscous term takes over and shape barely matters — a cube in honey is not
 * three times harder to move than a sphere. `js/drag.js` handles that.
 */
export const SHAPES = [
  {
    id: 'sphere',
    label: 'Sphere',
    cd: 0.47,
    volume: (s) => (Math.PI * s ** 3) / 6,
    area: (s) => (Math.PI * s * s) / 4,
    support: (s) => s / 2,
    rolls: true,
    note: 'Touches the ground at a single point, and rolls. The drag figure is '
      + 'for the subcritical range; above the critical Reynolds number a smooth '
      + 'sphere drops to about 0.1, which is the effect a golf ball\'s dimples '
      + 'exist to trigger and which this app does not model.',
  },
  {
    id: 'cube',
    label: 'Cube',
    cd: 1.05,
    volume: (s) => s ** 3,
    area: (s) => s * s,
    support: (s) => s / 2,
    rolls: false,
    note: 'Sits on a face. Twice the drag of a sphere of the same width, for the '
      + 'same reason a brick is harder to throw than a ball.',
  },
  {
    id: 'plate',
    label: 'Flat plate, face on',
    cd: 1.28,
    volume: (s) => s * s * (s / 10),
    area: (s) => s * s,
    support: (s) => s / 20,
    rolls: false,
    note: 'The bluntest common shape. Presenting the same area edge-on instead '
      + 'would cut the drag by more than ten times — which is why a sheet of '
      + 'paper falls so differently depending on how you drop it.',
  },
  {
    id: 'streamlined',
    label: 'Streamlined teardrop',
    cd: 0.04,
    volume: (s) => 0.28 * s ** 3,
    area: (s) => (Math.PI * s * s) / 8,
    support: (s) => s / 4,
    rolls: false,
    note: 'Thirty times less drag than a flat plate of the same frontal area. '
      + 'Almost all of the saving is in the tail, not the nose: it is the wake '
      + 'behind a bluff body that costs, not the air in front of it.',
  },
  {
    id: 'cylinder',
    label: 'Cylinder, side on',
    cd: 0.82,
    volume: (s) => (Math.PI * s * s * s) / 4,
    area: (s) => s * s,
    support: (s) => s / 2,
    rolls: true,
    note: 'Rolls along its side. A common enough shape that its drag figure is '
      + 'worth knowing — pipes, masts, cables and legs are all cylinders.',
  },
];

export const shapeById = (id) => SHAPES.find((s) => s.id === id) || SHAPES[0];

/**
 * Everything about an object of a given shape, size and material.
 *
 * Mass comes from volume × density rather than being set directly, because that
 * is the honest relationship: make it bigger and it gets heavier, change the
 * material and it gets heavier without getting bigger. The bench lets the mass
 * be set directly too, in which case the density is what follows.
 */
export function describe({ shapeId, size, density = null, mass = null }) {
  const shape = shapeById(shapeId);
  const volume = shape.volume(size);
  const resolvedMass = mass !== null && Number.isFinite(mass)
    ? mass
    : volume * (density ?? 1000);

  return {
    shape,
    size,
    volume,
    mass: resolvedMass,
    density: volume > 0 ? resolvedMass / volume : NaN,
    area: shape.area(size),
    cd: shape.cd,
    // How far the centre sits above the surface it rests on.
    support: shape.support(size),
    rolls: shape.rolls,
  };
}

/** The size a shape needs to have a given mass at a given density. */
export function sizeFor(shapeId, mass, density) {
  const shape = shapeById(shapeId);
  if (!(mass > 0) || !(density > 0)) return 0;
  const volume = mass / density;
  // Every volume function here is a constant times s³, so one sample inverts it.
  const unit = shape.volume(1);
  return unit > 0 ? Math.cbrt(volume / unit) : 0;
}

/**
 * How much difference the shape makes to drag, all else equal.
 *
 * Reported as a ratio against a sphere, because "1.28" means nothing on its own
 * and "2.7 times a sphere of the same width" means quite a lot.
 */
export function dragComparison(shapeId, size) {
  const shape = shapeById(shapeId);
  const sphere = shapeById('sphere');
  const mine = shape.cd * shape.area(size);
  const theirs = sphere.cd * sphere.area(size);
  return {
    ratio: theirs > 0 ? mine / theirs : NaN,
    cdA: mine,
    text: `C_d·A = ${mine.toPrecision(3)} m², which is ${(mine / theirs).toFixed(2)}× `
      + 'a sphere of the same width.',
  };
}

/**
 * Materials, so a size and a shape can produce a believable mass.
 *
 * The range matters more than the exact figures: expanded polystyrene to lead
 * is a factor of nearly six hundred, and that is what makes "same size,
 * different mass" possible to set up at all.
 */
export const MATERIALS = [
  { id: 'polystyrene', label: 'Expanded polystyrene', density: 20 },
  { id: 'balsa', label: 'Balsa', density: 160 },
  { id: 'pine', label: 'Pine', density: 500 },
  { id: 'water', label: 'Water (ice)', density: 917 },
  { id: 'concrete', label: 'Concrete', density: 2400 },
  { id: 'glass', label: 'Glass', density: 2500 },
  { id: 'aluminium', label: 'Aluminium', density: 2700 },
  { id: 'steel', label: 'Steel', density: 7850 },
  { id: 'lead', label: 'Lead', density: 11340 },
  { id: 'osmium', label: 'Osmium', density: 22590 },
];

export const materialById = (id) => MATERIALS.find((m) => m.id === id) || MATERIALS[6];

/** Would this object float in that fluid? Density is the whole answer. */
export function floats(objectDensity, fluidDensity) {
  if (!(fluidDensity > 0)) return { floats: false, text: 'Nothing floats in a vacuum.' };
  const ratio = objectDensity / fluidDensity;
  return {
    floats: ratio < 1,
    ratio,
    text: ratio < 1
      ? 'Less dense than the fluid, so in reality it would float. This '
        + 'simulation does not model buoyancy, so it will sink anyway — that is '
        + 'an assumption of the model, not a result of it.'
      : `${ratio.toFixed(1)}× the density of the fluid, so it sinks. Buoyancy `
        + `would still reduce its effective weight by ${((1 / ratio) * 100).toFixed(0)}%, `
        + 'which this simulation does not model either.',
  };
}
