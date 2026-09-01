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
/*
 * A person, standing, seen from the front. Head as its own subpath.
 *
 * Drawn to fill the unit box in both directions, like every other outline here
 * — the figure comes out narrow because `aspect` makes the box narrow, not
 * because the path is drawn small inside a square one. Getting that wrong is
 * how the car ended up rendering at a sixth of its width.
 *
 * Which is also why the head is a *wide ellipse* here and a circle on screen.
 * The box is about four times taller than it is wide, so everything in this
 * path is stretched four times vertically when it is drawn: a circle in these
 * coordinates comes out as a tall oval, and the head has to be squashed by the
 * same factor to end up round.
 *
 * Every landmark below is a published fraction of stature — shoulder at 0.18,
 * elbow 0.37, wrist 0.52, hip 0.47, knee 0.72 down from the crown — converted
 * into this box rather than eyeballed. The first attempt was eyeballed and it
 * showed: the figure came out 8.8 heads tall against a real 7.5, with the
 * crotch at 0.62 of its height instead of 0.48, so it had a big head and stubby
 * legs. Proportions are the one thing about a human figure that everybody can
 * see is wrong without being able to say why.
 *
 * The head is a compromise and worth naming as one. A real head is markedly
 * taller than it is wide, so a round one cannot be both the right height and
 * the right width; 0.19 m across splits the difference and reads correctly.
 */
const MAN =
  // The head, round on screen: see the note above about the aspect.
  'M -0.2111 -0.446 C -0.2111 -0.4758 -0.1166 -0.5 0 -0.5 '
  + 'C 0.1166 -0.5 0.2111 -0.4758 0.2111 -0.446 '
  + 'C 0.2111 -0.4162 0.1166 -0.392 0 -0.392 '
  + 'C -0.1166 -0.392 -0.2111 -0.4162 -0.2111 -0.446 Z '
  /*
   * Neck to shoulder as a curve, not a straight line: drawn straight it comes
   * to a point at the shoulder and the figure reads as wearing a hood.
   */
  + 'M -0.1 -0.392 Q -0.32 -0.355 -0.5 -0.255 '
  // Down the outside of the arm to the hand.
  + 'L -0.485 -0.105 L -0.455 0.035 L -0.445 0.135 L -0.335 0.145 '
  // Back up the inside to the armpit. The arm is about 9 cm through at the
  // upper arm — drawn much thinner it hangs off the body like a stick.
  + 'L -0.3 0.035 L -0.29 -0.105 L -0.28 -0.235 '
  // Chest, waist, hip: the taper is what stops it reading as a plank, and the
  // gap to the arm is a couple of centimetres, so they read as separate
  // without the arm appearing to float.
  + 'L -0.26 -0.195 L -0.215 -0.06 L -0.295 0.03 '
  // Thigh, knee, ankle, and up the inside of the leg to the crotch.
  + 'L -0.275 0.2 L -0.24 0.245 L -0.2 0.5 L -0.05 0.5 L -0.035 0.02 L 0 -0.015 '
  // And the same again, mirrored.
  + 'L 0.035 0.02 L 0.05 0.5 L 0.2 0.5 L 0.24 0.245 L 0.275 0.2 '
  + 'L 0.295 0.03 L 0.215 -0.06 L 0.26 -0.195 '
  + 'L 0.28 -0.235 L 0.29 -0.105 L 0.3 0.035 L 0.335 0.145 '
  + 'L 0.445 0.135 L 0.455 0.035 L 0.485 -0.105 L 0.5 -0.255 '
  + 'Q 0.32 -0.355 0.1 -0.392 Z';

/*
 * The same figure with narrower shoulders, and a dress.
 *
 * The torso narrows to a waist and then flares to a hem, with the lower legs
 * below it — which is what makes the two figures tell apart at the size they
 * are actually drawn, where a difference of a few centimetres in shoulder width
 * is one pixel and reads as nothing at all. Here the hem is the widest thing
 * rather than the shoulders, so it is the hem that reaches the edge of the box.
 *
 * Head squashed by the aspect, as the man's is, so it draws round.
 */
const WOMAN =
  'M -0.225 -0.4448 C -0.225 -0.4753 -0.1243 -0.5 0 -0.5 '
  + 'C 0.1243 -0.5 0.225 -0.4753 0.225 -0.4448 '
  + 'C 0.225 -0.4143 0.1243 -0.3896 0 -0.3896 '
  + 'C -0.1243 -0.3896 -0.225 -0.4143 -0.225 -0.4448 Z '
  // Narrower shoulders, curved for the same reason the man's are.
  + 'M -0.1 -0.39 Q -0.29 -0.352 -0.45 -0.26 '
  // The arms stop above the flare of the skirt — any lower and the hands are
  // swallowed by it, since this is all one outline.
  + 'L -0.435 -0.12 L -0.41 0 L -0.4 0.06 L -0.3 0.065 '
  + 'L -0.275 0 L -0.265 -0.12 L -0.255 -0.235 '
  // Chest to a high waist, then out to the hem on a curve rather than a
  // straight taper, which reads as cloth instead of as a traffic cone.
  + 'L -0.235 -0.19 L -0.2 -0.02 Q -0.3 0.16 -0.5 0.3 '
  // Along the hem, with the lower legs below it.
  + 'L -0.17 0.3 L -0.14 0.5 L -0.045 0.5 L -0.04 0.3 '
  + 'L 0.04 0.3 L 0.045 0.5 L 0.14 0.5 L 0.17 0.3 L 0.5 0.3 '
  + 'Q 0.3 0.16 0.2 -0.02 L 0.235 -0.19 L 0.255 -0.235 '
  + 'L 0.265 -0.12 L 0.275 0 L 0.3 0.065 L 0.4 0.06 L 0.41 0 '
  + 'L 0.435 -0.12 L 0.45 -0.26 Q 0.29 -0.352 0.1 -0.39 Z';

/*
 * The Magbot Rover from the side: a boxy body carried on one big driven wheel
 * and a smaller one, with the connector stub at the back.
 */
/*
 * The Magbot from the side, measured off the photographs.
 *
 * Two corrections from the first attempt, both structural rather than cosmetic.
 * The wheel was three quarters of the body; it is closer to 45 per cent. And it
 * was drawn at the front — but the drive arrow on the deck points *away* from
 * the wheels, so this is a two-wheeler with a caster, wheels at the back. Local
 * +x is the direction of travel for every shape here, so the wheel belongs at
 * −x and the rover was previously driving backwards.
 *
 * The body is a squat box with connector sockets standing proud of the top
 * edge, which is what the top of the real one looks like and what stops the
 * silhouette reading as a plain brick.
 *
 * Cubics rather than `A` for the wheel: an arc command carries flags — `0 1 0`
 * — that are not coordinates, and both `scalePath` and the test that checks an
 * outline fills its box read every number pair as a position. An arc would have
 * them treating a large-arc flag as one.
 */
const MAGBOT_SIDE =
  // The body, corners taken off.
  'M -0.44 -0.44 L 0.44 -0.44 Q 0.5 -0.44 0.5 -0.38 L 0.5 0.22 '
  + 'Q 0.5 0.28 0.44 0.28 L -0.44 0.28 Q -0.5 0.28 -0.5 0.22 '
  + 'L -0.5 -0.38 Q -0.5 -0.44 -0.44 -0.44 Z '
  // Connector sockets along the top.
  + 'M -0.34 -0.5 L -0.2 -0.5 L -0.2 -0.42 L -0.34 -0.42 Z '
  + 'M -0.07 -0.5 L 0.07 -0.5 L 0.07 -0.42 L -0.07 -0.42 Z '
  + 'M 0.2 -0.5 L 0.34 -0.5 L 0.34 -0.42 L 0.2 -0.42 Z '
  // The driven wheel, at the back.
  + 'M -0.44 0.28 C -0.44 0.1585 -0.3415 0.06 -0.22 0.06 '
  + 'C -0.0985 0.06 0 0.1585 0 0.28 '
  + 'C 0 0.4015 -0.0985 0.5 -0.22 0.5 '
  + 'C -0.3415 0.5 -0.44 0.4015 -0.44 0.28 Z '
  // And the caster at the front, which is what keeps it level.
  + 'M 0.24 0.26 L 0.42 0.26 L 0.42 0.5 L 0.24 0.5 Z';

/** And from above: a square body with a wheel out either side, driving +x. */
const MAGBOT_TOP =
  /*
   * The deck, driving +x, with the leading edge rounded off. It runs the full
   * width of the box because every outline here must: `aspect` is applied on
   * top of the path, so a shape that stops short of its own box is drawn
   * smaller than it is, which is how the car once rendered at a sixth of its
   * width. The wheels do the same job in the other direction.
   *
   * The wheels sit behind the middle, matching the side view and the deck
   * arrow: a two-wheeler steers on its pair and rests on a caster ahead of them.
   */
  'M -0.44 -0.41 L 0.32 -0.41 Q 0.5 -0.41 0.5 -0.2 L 0.5 0.2 '
  + 'Q 0.5 0.41 0.32 0.41 L -0.44 0.41 Q -0.5 0.41 -0.5 0.35 '
  + 'L -0.5 -0.35 Q -0.5 -0.41 -0.44 -0.41 Z '
  /*
   * A wheel out either flank, toward the back — and slim. Measured off the
   * photograph a tyre is about an eighth of the body across, where these were
   * a quarter, which made the rover look like it was on tractor wheels.
   */
  + 'M -0.38 -0.5 L -0.08 -0.5 L -0.08 -0.39 L -0.38 -0.39 Z '
  + 'M -0.38 0.39 L -0.08 0.39 L -0.08 0.5 L -0.38 0.5 Z';

/*
 * What turns the rover from a box on wheels into a recognisable Magbot: the
 * front panel, the ultrasonic sensor's two eyes, the wheel hubs and the
 * connectors along the top edge.
 *
 * Drawn as a stroked overlay rather than as holes in the body, because a hole
 * needs the subpath wound the other way and every one of these would have to be
 * reversed by hand — and because a stroke stays visible when the whole robot is
 * forty pixels wide, which is the size it is usually drawn at.
 *
 * Circles are four cubics rather than arc commands: `scalePath` reads every
 * pair of numbers after a command as a coordinate, and an arc carries flags
 * that are not coordinates.
 */
const MAGBOT_DETAIL =
  // The inset face panel, which is most of the side of the robot.
  'M -0.42 -0.36 L 0.42 -0.36 L 0.42 0.18 L -0.42 0.18 Z '
  // The module in the middle of it — the switch, the pot, whichever is fitted.
  + 'M -0.09 -0.16 L 0.09 -0.16 L 0.09 0.04 L -0.09 0.04 Z '
  /*
   * The four panel screws, as zero-length strokes. With a round line cap those
   * render as dots for a fraction of the path data four small circles would
   * cost, and they are what make the panel look bolted on rather than drawn on.
   */
  + 'M -0.37 -0.31 L -0.369 -0.31 M 0.37 -0.31 L 0.369 -0.31 '
  + 'M 0.37 0.13 L 0.369 0.13 M -0.37 0.13 L -0.369 0.13 '
  // The wheel: hub and rim.
  + 'M -0.29 0.28 C -0.29 0.2414 -0.2586 0.21 -0.22 0.21 '
  + 'C -0.1814 0.21 -0.15 0.2414 -0.15 0.28 '
  + 'C -0.15 0.3186 -0.1814 0.35 -0.22 0.35 '
  + 'C -0.2586 0.35 -0.29 0.3186 -0.29 0.28 Z '
  + 'M -0.37 0.28 C -0.37 0.2 -0.3 0.13 -0.22 0.13 '
  + 'C -0.14 0.13 -0.07 0.2 -0.07 0.28 '
  + 'C -0.07 0.36 -0.14 0.43 -0.22 0.43 '
  + 'C -0.3 0.43 -0.37 0.36 -0.37 0.28 Z '
  // Ports along the bottom edge.
  + 'M -0.3 0.28 L -0.3 0.24 M 0.12 0.28 L 0.12 0.24 M 0.24 0.28 L 0.24 0.24';

/** From above: the deck panel, the direction arrow, and tread across the tyres. */
const MAGBOT_TOP_DETAIL =
  // The deck panel.
  'M -0.42 -0.32 L 0.28 -0.32 L 0.28 0.32 L -0.42 0.32 Z '
  /*
   * The button pad: a centre and four arrows around it, as squares. Anything
   * more faithful than a plus of five pads is illegible at the size this is
   * drawn, and a plus is instantly readable as a control.
   */
  + 'M -0.13 -0.04 L -0.05 -0.04 L -0.05 0.04 L -0.13 0.04 Z '
  + 'M -0.13 -0.17 L -0.05 -0.17 L -0.05 -0.09 L -0.13 -0.09 Z '
  + 'M -0.13 0.09 L -0.05 0.09 L -0.05 0.17 L -0.13 0.17 Z '
  + 'M -0.26 -0.04 L -0.18 -0.04 L -0.18 0.04 L -0.26 0.04 Z '
  + 'M 0 -0.04 L 0.08 -0.04 L 0.08 0.04 L 0 0.04 Z '
  // The arrow that says which way it drives, which is the whole point of a
  // view from above: nothing else in the outline distinguishes front from back.
  + 'M 0.14 -0.16 L 0.4 0 L 0.14 0.16 '
  // Tread across both tyres.
  + 'M -0.3 -0.5 L -0.3 -0.39 M -0.22 -0.5 L -0.22 -0.39 M -0.14 -0.5 L -0.14 -0.39 '
  + 'M -0.3 0.39 L -0.3 0.5 M -0.22 0.39 L -0.22 0.5 M -0.14 0.39 L -0.14 0.5';

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
    /*
     * Blunt end forward, tapering to a point behind — and that is the whole
     * claim the shape is making, so the drawing had better agree with it.
     *
     * It was mirrored: the point led and the round end trailed, which is a
     * picture of a shape with roughly the drag of a flat plate rather than one
     * with a thirtieth of it. Local +x is the direction of travel for every
     * shape here, so the round end belongs there.
     */
    path: 'M 0.5 0 Q 0.5 -0.5 0.28 -0.5 Q -0.1 -0.44 -0.5 0 '
      + 'Q -0.1 0.44 0.28 0.5 Q 0.5 0.5 0.5 0 Z',
    note: 'Thirty times less drag than a flat plate of the same frontal area, and '
      + 'the round end is the one that goes first. Almost all of the saving is in '
      + 'the long tail rather than the blunt nose: it is the wake behind a bluff '
      + 'body that costs, not the air in front of it. Turn a teardrop around and '
      + 'most of the advantage goes with it.',
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
  {
    /*
     * A person, standing.
     *
     * `size` is the width across the shoulders, not the height — every shape
     * here is measured across, and `aspect` is what makes this one nearly four
     * times taller than it is wide. The object panel prints the height beside
     * it, so the number a reader recognises is still on screen.
     *
     * The density is the interesting part: about 985 kg/m³, a whisker under
     * water. That is why a person floats with their lungs full and sinks with
     * them empty, and it is worth putting one in the fluid step to watch.
     */
    id: 'human-m',
    label: 'Person (man)',
    cd: 1.15,
    // 73 kg at 985 kg/m³ is 0.074 m³, across a 0.45 m shoulder width.
    volume: (s) => 0.813 * s ** 3,
    // A standing adult presents roughly 0.68 m² to the wind.
    area: (s) => 3.36 * s * s,
    support: (s) => (s * 3.91) / 2,
    aspect: 3.91,
    rolls: false,
    align: 'surface',
    path: MAN,
    note: 'Reference adult male: 1.76 m, 73 kg, about 0.68 m² of frontal area. '
      + 'C_d near 1.15 standing — a person is a bluff body, which is why getting '
      + 'low on a bicycle is worth so much. The density comes out just under '
      + 'water at roughly 985 kg/m³, so a person floats with full lungs and '
      + 'sinks with empty ones.',
  },
  {
    id: 'human-f',
    label: 'Person (woman)',
    cd: 1.15,
    // 60 kg at 985 kg/m³ is 0.061 m³, across a 0.40 m shoulder width.
    volume: (s) => 0.952 * s ** 3,
    area: (s) => 3.44 * s * s,
    support: (s) => (s * 4.08) / 2,
    aspect: 4.08,
    rolls: false,
    align: 'surface',
    path: WOMAN,
    note: 'Reference adult female: 1.63 m, 60 kg, about 0.55 m² of frontal area. '
      + 'The same density as any other person, near 985 kg/m³ — terminal velocity '
      + 'in air differs between the two through mass over area, not through '
      + 'anything about the shape.',
  },
  {
    /*
     * The Magbot Rover, which Detronics sells.
     *
     * It has wheels and still does not roll, and that is the point worth making
     * rather than a detail to smooth over: the N20 gearmotors driving them are
     * heavily reduced and will not back-drive, so an unpowered Magbot does not
     * coast. The rubber tyres grip instead, and it stops in very little
     * distance. Marking it `wheeled` would have handed it rolling resistance —
     * a hundred times weaker — and sent it gliding across the bench like a
     * trolley, which is the opposite of how the real one behaves.
     */
    id: 'magbot',
    label: 'Magbot Rover',
    // A bluff box presents the same face to the air as a flat plate does.
    cd: 1.28,
    // 12 cm on a side is 0.00173 m³, and 600 g in it gives about 347 kg/m³.
    volume: (s) => s ** 3,
    area: (s) => s * s,
    support: (s) => s / 2,
    aspect: 1,
    rolls: false,
    // Drawn from the side where there is a floor to drive on, from above in space.
    align: 'travel',
    path: MAGBOT_SIDE,
    pathTop: MAGBOT_TOP,
    detail: MAGBOT_DETAIL,
    detailTop: MAGBOT_TOP_DETAIL,
    note: 'A Detronics Magbot Rover: 12 cm, 600 g, 0.00173 m³. It runs on rubber '
      + 'tyres driven through N20 gearmotors, and those will not back-drive — so '
      + 'unpowered it does not coast the way a car does. It grips and stops '
      + 'almost at once, which is what you want from something that has to hold '
      + 'a line across a table.',
  },
];

export const shapeById = (id) => SHAPES.find((s) => s.id === id) || SHAPES[0];

/**
 * A real example of each shape, at its real size and mass.
 *
 * Picking "car" and getting something 40 cm long weighing a kilogram teaches
 * the wrong thing twice over: the drawing is not a car, and the density that
 * falls out of it is not a car's either. Choosing a shape now sets both to
 * something that exists, and both stay adjustable afterwards.
 *
 * The densities these produce are the interesting part, and they are all real:
 * a car works out at about 180 kg/m³ because a car is mostly air, and a party
 * balloon at 0.27 kg/m³ because it is mostly helium — which is what lets it
 * float in air at 1.225.
 */
export const TYPICAL = {
  'human-m': { size: 0.45, mass: 73, of: 'an adult man' },
  'human-f': { size: 0.4, mass: 60, of: 'an adult woman' },
  magbot: { size: 0.12, mass: 0.6, of: 'a Magbot Rover' },
  sphere: { size: 0.22, mass: 0.43, of: 'a football' },
  cube: { size: 0.3, mass: 12, of: 'a packed crate' },
  plate: { size: 0.3, mass: 0.6, of: 'a sheet of plywood' },
  streamlined: { size: 0.5, mass: 8, of: 'a wooden teardrop' },
  cylinder: { size: 0.3, mass: 8, of: 'a short log' },
  car: { size: 4.4, mass: 1400, of: 'a family hatchback' },
  balloon: { size: 0.3, mass: 0.003, of: 'a helium party balloon' },
  spaceship: { size: 37, mass: 78000, of: 'a Space Shuttle orbiter' },
};

export const typicalFor = (id) => TYPICAL[id] || TYPICAL.sphere;

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
 * The markings drawn on top of an outline, or `null` for shapes that have none.
 *
 * Stroked, never filled, and never load-bearing: nothing here changes a volume,
 * an area or where the thing rests. It exists so a Magbot looks like a Magbot
 * rather than like a box, and a shape without any is not worse off for it.
 */
export function detail(shapeId, { topDown = false } = {}) {
  const shape = shapeById(shapeId);
  if (!shape.detail) return null;
  return topDown && shape.detailTop ? shape.detailTop : shape.detail;
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
  { id: 'helium', label: 'Helium', density: 0.166, bounce: 0.1 },
  { id: 'air', label: 'Air', density: 1.225, bounce: 0.1 },
  { id: 'rubber', label: 'Rubber', density: 1100, bounce: 0.85 },
  { id: 'polystyrene', label: 'Expanded polystyrene', density: 20, bounce: 0.25 },
  { id: 'balsa', label: 'Balsa', density: 160, bounce: 0.35 },
  { id: 'pine', label: 'Pine', density: 500, bounce: 0.5 },
  { id: 'water', label: 'Water (ice)', density: 917, bounce: 0.4 },
  { id: 'clay', label: 'Modelling clay', density: 1700, bounce: 0.02 },
  { id: 'concrete', label: 'Concrete', density: 2400, bounce: 0.4 },
  { id: 'glass', label: 'Glass', density: 2500, bounce: 0.85 },
  { id: 'aluminium', label: 'Aluminium', density: 2700, bounce: 0.6 },
  { id: 'steel', label: 'Steel', density: 7850, bounce: 0.75 },
  { id: 'lead', label: 'Lead', density: 11340, bounce: 0.2 },
  { id: 'osmium', label: 'Osmium', density: 22590, bounce: 0.6 },
];

/**
 * How bouncy a collision between two materials is.
 *
 * The coefficient of restitution belongs to the *pair*, not to either object —
 * a rubber ball on concrete and the same ball on modelling clay behave nothing
 * alike, and neither number is a property the ball carries around with it. So
 * each material here has a bounciness against a hard, unyielding surface, and
 * the pair value is the geometric mean of the two.
 *
 * That mean is a rule of thumb, not a law, and it is declared as an
 * approximation. What it does get right is the shape of the thing: pairing
 * anything with clay gives a dead collision, because a nearly zero factor
 * dominates the product however lively the other side is. That is exactly how
 * dropping a superball into putty behaves.
 *
 * Two caveats the numbers cannot carry. Restitution falls as the impact gets
 * faster — the same ball is measurably less bouncy thrown hard than dropped —
 * and it depends on shape and temperature as well as material. These are the
 * low-speed, room-temperature figures.
 */
export function pairBounce(aId, bId) {
  const a = materialById(aId);
  const b = materialById(bId);
  const value = Math.sqrt(Math.max(0, a.bounce ?? 0.5) * Math.max(0, b.bounce ?? 0.5));
  return Math.min(1, Math.max(0, value));
}

/** What that pairing is like, for the hint beside it. */
export function describeBounce(aId, bId) {
  const e = pairBounce(aId, bId);
  const a = materialById(aId).label.toLowerCase();
  const b = materialById(bId).label.toLowerCase();
  const kept = Math.round(e * e * 100);
  if (e < 0.1) {
    return `${a} on ${b} is e ≈ ${e.toFixed(2)} — very nearly dead. They come away `
      + 'together and almost all of the kinetic energy goes into deforming them.';
  }
  return `${a} on ${b} is e ≈ ${e.toFixed(2)}, so an impact keeps about ${kept}% of the `
    + 'kinetic energy along the line of the collision. All of the momentum '
    + 'survives either way.';
}

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
