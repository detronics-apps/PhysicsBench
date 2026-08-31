/**
 * The shape of an object: what it changes, and what it looks like. Pure.
 *
 * Shape affects four separate things, and the steps introduce them one at a
 * time so they do not run together:
 *
 *   how it sits on a surface  — a sphere touches at a point, a cube on a face
 *   how much of it there is   — the volume, which decides mass and buoyancy
 *   how much fluid it shoves  — the frontal area
 *   how cleanly it shoves it  — the drag coefficient
 *
 * `size` throughout is the overall extent in metres: the diameter of a sphere,
 * the edge of a cube, the length of a car. Keeping one number for size means
 * changing shape changes the shape and not accidentally the scale as well.
 *
 * Each shape also carries its own outline, as an SVG path in a unit box with
 * **y downward** — screen orientation, so the renderer scales and translates it
 * and does nothing else. A teardrop drawn as a rectangle is not a cosmetic
 * problem: the whole point of the shape control is that a streamlined body
 * looks streamlined, and a box with C_d = 0.04 written under it teaches
 * nothing.
 *
 * Every outline must span the **full** box, −0.5 to 0.5 on both axes. How
 * squat or tall the shape really is belongs to `aspect`, which the renderer
 * applies when it scales. An outline that only fills part of its box gets
 * squashed twice — that is exactly how the car ended up drawn at a sixth of its
 * own height, looking like a skirting board with wheels.
 */

/**
 * A car needs two outlines, because a car seen from the side and a car seen
 * from above are different pictures of the same object — and which one is
 * right depends on whether there is a floor to drive on.
 */
// Side on: body, greenhouse, and two wheel arches cut into the underside, so
// it reads as a car rather than as a wedge.
const CAR_SIDE = 'M -0.5 0.2 L -0.46 -0.02 L -0.28 -0.06 L -0.16 -0.46 '
  + 'L 0.1 -0.5 L 0.28 -0.06 L 0.46 0.02 L 0.5 0.2 L 0.36 0.2 '
  + 'Q 0.34 0.5 0.22 0.5 Q 0.1 0.5 0.08 0.2 L -0.2 0.2 '
  + 'Q -0.22 0.5 -0.34 0.5 Q -0.46 0.5 -0.48 0.2 Z';

// From above: a rounded nose, a squared-off tail.
const CAR_TOP = 'M -0.5 -0.38 Q -0.44 -0.5 -0.32 -0.5 L 0.28 -0.5 '
  + 'Q 0.46 -0.46 0.5 0 Q 0.46 0.46 0.28 0.5 L -0.32 0.5 '
  + 'Q -0.44 0.5 -0.5 0.38 Z';

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
    aspect: 1,
    rolls: true,
    circle: true,
    align: 'none',
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
    aspect: 1,
    rolls: false,
    align: 'surface',
    path: 'M -0.5 -0.5 L 0.5 -0.5 L 0.5 0.5 L -0.5 0.5 Z',
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
    aspect: 0.1,
    rolls: false,
    align: 'surface',
    // Full box: how thin a plate actually is comes from `aspect`, not from here.
    path: 'M -0.5 -0.5 L 0.5 -0.5 L 0.5 0.5 L -0.5 0.5 Z',
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
    aspect: 0.5,
    rolls: false,
    align: 'travel',
    // A round nose and a long tail, because that is where the saving is: it is
    // the wake behind a bluff body that costs, not the air in front of it.
    path: 'M -0.5 0 Q -0.5 -0.5 -0.28 -0.5 Q 0.1 -0.44 0.5 0 '
      + 'Q 0.1 0.44 -0.28 0.5 Q -0.5 0.5 -0.5 0 Z',
    note: 'Thirty times less drag than a flat plate of the same frontal area. '
      + 'Almost all of the saving is in the tail, not the nose.',
  },
  {
    id: 'cylinder',
    label: 'Cylinder, side on',
    cd: 0.82,
    volume: (s) => (Math.PI * s * s * s) / 4,
    area: (s) => s * s,
    support: (s) => s / 2,
    aspect: 1,
    rolls: true,
    circle: true,
    align: 'none',
    note: 'Rolls along its side. Pipes, masts, cables and legs are all cylinders.',
  },
  {
    id: 'car',
    label: 'Car',
    cd: 0.32,
    // A car is mostly air. Its volume is nothing like its bounding box, which
    // matters the moment buoyancy is switched on.
    volume: (s) => 0.09 * s ** 3,
    area: (s) => 0.13 * s * s,
    support: (s) => s * 0.2,
    aspect: 0.4,
    rolls: false,
    // On the ground it lies along the ground and faces the way it drives; in
    // the air it points where it is going.
    align: 'travel',
    wheeled: true,
    path: CAR_SIDE,
    pathTop: CAR_TOP,
    note: 'Drawn from the side where there is a floor to drive on, and from '
      + 'above in space. A modern hatchback is around C_d 0.32; the drag figure '
      + 'quoted in a brochure is usually C_d·A, which is the number that '
      + 'actually decides the fuel bill.',
  },
  {
    id: 'spaceship',
    label: 'Spaceship',
    // A shape that only has to get through vacuum can afford to be any shape at
    // all; this one is quoted as if it had to fly through air, because in this
    // app it might have to.
    cd: 0.12,
    volume: (s) => 0.06 * s ** 3,
    area: (s) => 0.06 * s * s,
    support: (s) => s * 0.16,
    aspect: 0.32,
    rolls: false,
    align: 'travel',
    // Nose to the right, swept wings, engine bells at the tail.
    path: 'M 0.5 0 L 0.18 -0.24 L -0.08 -0.28 L -0.16 -0.5 L -0.3 -0.5 '
      + 'L -0.34 -0.3 L -0.5 -0.24 L -0.5 0.24 L -0.34 0.3 L -0.3 0.5 '
      + 'L -0.16 0.5 L -0.08 0.28 L 0.18 0.24 Z',
    note: 'Points where it is going, which is the one thing a spaceship drawing '
      + 'must get right — and note that pointing somewhere is not the same as '
      + 'going somewhere. Turn it in deep space and nothing about its velocity '
      + 'changes until a force acts. Only the thrust cares which way the nose is.',
  },
  {
    id: 'balloon',
    label: 'Balloon',
    cd: 0.5,
    volume: (s) => 0.42 * s ** 3,
    area: (s) => (Math.PI * s * s) / 4,
    // Exactly half the drawn height, or it rests with its neck through the floor.
    support: (s) => s * 0.6,
    aspect: 1.2,
    rolls: false,
    align: 'surface',
    // Rounded top, tapering to a neck — and drawn so the neck is at the bottom,
    // which is the only orientation anyone has ever seen a balloon in.
    path: 'M 0 -0.5 Q 0.5 -0.5 0.5 -0.1 Q 0.5 0.2 0.1 0.42 '
      + 'L 0.07 0.5 L -0.07 0.5 L -0.1 0.42 Q -0.5 0.2 -0.5 -0.1 '
      + 'Q -0.5 -0.5 0 -0.5 Z',
    note: 'The shape that makes buoyancy obvious: fill it with something less '
      + 'dense than the fluid around it and it goes up, for exactly the reason a '
      + 'stone goes down.',
  },
];

export const shapeById = (id) => SHAPES.find((s) => s.id === id) || SHAPES[0];

/**
 * How a shape meets the ground, and what that changes.
 *
 * The honest answer to "does a bigger box grip better?" is no, and it is one of
 * the genuinely surprising results in mechanics: sliding friction is μN and the
 * apparent contact area is not in it. Real surfaces touch only at their high
 * points, and the *real* contact area is set by the load — spread the same
 * weight over twice the area and the pressure halves, leaving the same tiny
 * patches actually touching. Doubling a cube's width changes nothing.
 *
 * What does change, and changes enormously, is whether the thing rolls. A ball
 * on the same surface as a box is not a little easier to move, it is fifty to
 * a few hundred times easier, because rolling resistance comes from the
 * surfaces flexing rather than from asperities being sheared off.
 *
 * So this is where the shape's contact actually matters, and it matters by
 * being a different mechanism rather than a bigger number.
 */
export function contactKind(shapeId) {
  const shape = shapeById(shapeId);
  if (shape.rolls) {
    return {
      mode: 'rolling',
      label: 'rolls',
      note: 'It rolls, so what resists it is not sliding friction at all: it is '
        + 'the small deformation of the ball and the surface under the contact, '
        + 'which is one to three orders of magnitude weaker. This is why wheels '
        + 'were worth inventing.',
    };
  }
  if (shape.wheeled) {
    return {
      mode: 'rolling',
      label: 'runs on wheels',
      note: 'The body does not touch the ground; the wheels do, and they roll. '
        + 'Rolling resistance is what a car coasts against, and it is why a car '
        + 'left out of gear on a slight slope will move at all.',
    };
  }
  return {
    mode: 'sliding',
    label: 'slides',
    note: 'It slides, so friction is μ·N — and the area it slides on is not in '
      + 'that expression. A wider box of the same mass has exactly the same '
      + 'friction, because spreading the same weight over more area drops the '
      + 'pressure in proportion and leaves the same real contact.',
  };
}

/** Does this shape roll rather than slide? */
export const rollsOn = (shapeId) => contactKind(shapeId).mode === 'rolling';

/**
 * The outline to draw, given whether the scene has a "down" in it.
 *
 * `null` means a circle, which is a shape SVG already has a better primitive
 * for than any path would be.
 */
export function outline(shapeId, { topDown = false } = {}) {
  const shape = shapeById(shapeId);
  if (shape.circle) return null;
  return topDown && shape.pathTop ? shape.pathTop : shape.path;
}

/**
 * Everything about an object of a given shape, size and material.
 *
 * Mass may be set directly, in which case the density is what follows — or
 * derived from a density, in which case making it bigger makes it heavier.
 * Volume is the quantity buoyancy needs, and it is nothing like the bounding
 * box for a car or a balloon.
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
    // How tall it is drawn, relative to its length.
    height: size * shape.aspect,
    // A car does not roll, but it runs on wheels that do — and what meets the
    // ground is what decides which mechanism resists it.
    rolls: rollsOn(shape.id),
    align: shape.align || 'surface',
  };
}

/** The size a shape needs to have a given mass at a given density. */
export function sizeFor(shapeId, mass, density) {
  const shape = shapeById(shapeId);
  if (!(mass > 0) || !(density > 0)) return 0;
  // Every volume function here is a constant times s³, so one sample inverts it.
  const unit = shape.volume(1);
  return unit > 0 ? Math.cbrt(mass / density / unit) : 0;
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
 * The range matters more than the exact figures: expanded polystyrene to
 * osmium is a factor of over a thousand, and that is what makes "same size,
 * different mass" — and floating — possible to set up at all.
 */
export const MATERIALS = [
  { id: 'helium', label: 'Helium', density: 0.166 },
  { id: 'air', label: 'Air', density: 1.225 },
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

// Named rather than positional: an index here means adding a material to the
// list quietly changes what an unknown id falls back to, which is the kind of
// bug that survives a test suite by moving the answer and the expectation
// together.
export const materialById = (id) =>
  MATERIALS.find((m) => m.id === id) || MATERIALS.find((m) => m.id === 'aluminium');

/**
 * Whether this object floats in that fluid, and by how much.
 *
 * Density is the whole answer, and it is a comparison rather than a property:
 * steel floats in mercury and a helium balloon floats in air. This is no longer
 * a note the app has to apologise for — buoyancy is modelled, and the object
 * really does rise.
 */
export function floats(objectDensity, fluidDensity) {
  if (!(fluidDensity > 0)) {
    return { floats: false, ratio: Infinity, text: 'Nothing floats in a vacuum: with no fluid there is nothing to be pushed aside.' };
  }
  const ratio = objectDensity / fluidDensity;
  return {
    floats: ratio < 1,
    ratio,
    text: ratio < 1
      ? `Less dense than the fluid — ${(ratio * 100).toFixed(0)}% of it — so the upward `
        + 'push from the fluid it displaces beats its own weight and it rises. '
        + 'Nothing was added to make that happen: it is the same buoyant force a '
        + 'sinking object also feels, only now it is the bigger of the two.'
      : `${ratio.toFixed(1)}× the density of the fluid, so it sinks. Buoyancy still `
        + `cancels ${((1 / ratio) * 100).toFixed(0)}% of its weight, which is why the same `
        + 'stone is easier to lift underwater.',
  };
}
