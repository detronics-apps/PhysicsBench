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
  {
    id: 'rolling-against-sliding',
    title: 'A ball and a box on the same slope',
    blurb: 'Same wood, same mass, same size, same slope. One rolls away; the other does not move.',
    watch: 'Nothing separates these two but their shape, and the result is not '
      + 'that one is a little easier to move than the other — it is that one '
      + 'moves and one does not. Rolling and sliding are different mechanisms, '
      + 'and on this surface they are fifty times apart.',
    stage: 'fluid',
    /*
     * Step six rather than five, because a second object is needed to put them
     * side by side and the extra objects arrive here. The fluid is set to
     * vacuum so drag and buoyancy stay out of it: the whole comparison is about
     * what happens at the contact, and air would put a second difference
     * between two objects that are meant to differ in exactly one way.
     *
     * Eight degrees is chosen to sit between the two thresholds. A ball on wood
     * starts rolling past about 0.6°, a box on wood starts sliding past 26.6°,
     * and eight is comfortably inside that gap — so the same slope gives
     * opposite answers, which is the whole demonstration.
     *
     * They start apart, with the ball downhill, so it rolls away from the box
     * rather than into it.
     */
    params: {
      shapeId: 'sphere',
      size: 0.3,
      mass: 5,
      materialId: 'pine',
      x0: -1,
      dropHeight: 0,
      v0: 0,
      pushForce: 0,
      pushSeconds: 0,
      slopeDeg: 8,
      // Wood on wood, so both objects meet exactly the same surface.
      muS: 0.5,
      muK: 0.3,
      fluidId: 'vacuum',
      worldMode: 'planet',
      objects: [
        { id: 'o2', shapeId: 'cube', size: 0.3, materialId: 'pine', mass: 5, x: 2, y: 0, vx: 0, vy: 0 },
      ],
      walls: [],
      cannons: [],
    },
    arrows: ['weight', 'normal', 'friction', 'rolling', 'net'],
    teach: {
      how: 'The box is held by dry friction, which can supply up to μs times '
        + 'the normal force — on wood that is 0.5, and an eight-degree slope '
        + 'only asks for 0.14 of it. The ball is not held by friction at all. '
        + 'It rolls, and what resists rolling is the contact flexing and '
        + 'springing back imperfectly, worth about 0.01. The slope asks for more '
        + 'than that, so the ball goes.',
      tryThis: [
        'Press Play. The ball rolls away and the box does not move.',
        'Lower the tilt a degree at a time. The ball keeps going down to about '
        + 'half a degree — below that even rolling resistance is enough.',
        'Now raise it past 27°. The box finally lets go, at a slope fifty times '
        + 'steeper than the one that moved the ball.',
        'Change the ball to a cube in the object panel. It stops dead, on the '
        + 'same slope, with the same mass and the same wood.',
      ],
      watch: [
        'The arrows are labelled differently: the box has a friction arrow, the '
        + 'ball has a rolling resistance arrow. They are not the same force '
        + 'under two names.',
        'The ball\'s arrow is so short it is barely there, next to a box arrow '
        + 'long enough to cancel the whole pull down the slope.',
        'The box\'s net force is exactly zero while it sits. The ball\'s is not, '
        + 'which is why it accelerates the whole way down.',
      ],
      learn: 'A wheel is not a slippier surface — it is a different mechanism. '
        + 'Sliding friction tears surfaces across each other and costs μN; '
        + 'rolling only has to flex the contact and costs a hundredth of that. '
        + 'That gap, not lubrication, is why wheels were worth inventing.',
    },
  },
  {
    id: 'target-shooting',
    title: 'Three targets, one cannon',
    blurb: 'One shot lands. The other two need a different angle or a different speed.',
    watch: 'The cannon never changes what it does — it is the arc that decides '
      + 'which shelf gets hit. One target sits on the path the shot already '
      + 'takes; one is too high for it and one is too far. Neither can be '
      + 'reached by aiming harder in the same direction.',
    stage: 'collide',
    /*
     * The middle shelf is on the trajectory the default settings already
     * produce, so something happens on the first shot rather than the example
     * opening with three misses and no clue why.
     *
     * The other two are deliberately unreachable without changing something,
     * and they fail in opposite directions: the high one is above the apex, so
     * it needs more height; the far one is past where the shot lands, so it
     * needs more range. Aiming higher gets the first and loses the second,
     * which is the thing worth discovering — for a given speed there is a limit
     * to how far a thing can be thrown, and the angle that reaches highest is
     * not the angle that reaches furthest.
     *
     * The trajectory was measured with drag on, not worked out on paper: air
     * takes about half a metre off the range at these speeds, which is enough
     * to move a shelf from a hit to a miss.
     */
    params: {
      shapeId: 'sphere',
      size: 0.3,
      // Balsa, so a hit visibly knocks it off rather than shrugging.
      materialId: 'balsa',
      mass: 2.262,
      x0: 4.15,
      dropHeight: 1.75,
      v0: 0,
      pushForce: 0,
      pushSeconds: 0,
      slopeDeg: 0,
      fluidId: 'air',
      worldMode: 'planet',
      collisions: true,
      objects: [
        // Too high: it sits above the apex of the default arc.
        { id: 'o2', shapeId: 'sphere', size: 0.3, materialId: 'balsa', mass: 2.262, x: 0.6, y: 3.4, vx: 0, vy: 0 },
        // Too far: the default shot is on the ground before it gets here.
        { id: 'o3', shapeId: 'sphere', size: 0.3, materialId: 'balsa', mass: 2.262, x: 8.6, y: 0.6, vx: 0, vy: 0 },
      ],
      walls: [
        { x1: 3.6, y1: 1.75, x2: 4.8, y2: 1.75, bulge: 0, restitution: 0.2, mu: 0.6 },
        { x1: 0.0, y1: 3.4, x2: 1.2, y2: 3.4, bulge: 0, restitution: 0.2, mu: 0.6 },
        { x1: 8.0, y1: 0.6, x2: 9.2, y2: 0.6, bulge: 0, restitution: 0.2, mu: 0.6 },
      ],
      cannons: [
        {
          id: 'cannon1', x: -6, y: 0.5, angleDeg: 35, speed: 12,
          mass: 0.6, size: 0.18, shapeId: 'sphere',
          /*
           * Clay, at a bounce of 0.02, so a shot arrives and stays arrived.
           *
           * With a steel shot every trajectory turned into pinball: six bounces
           * off the shelves and the floor, the path doubling back on itself,
           * and targets "hit" by a ricochet from behind. That is not target
           * shooting and it is not a readable arc.
           */
          materialId: 'clay',
          muS: 2, muK: 1.5, rolling: 0.25,
          // Slow enough to change something between shots and watch the result.
          everySeconds: 3,
        },
      ],
    },
    arrows: ['velocity', 'weight', 'net'],
    teach: {
      how: 'Once a shot has left the barrel nothing is pushing it along. Its '
        + 'sideways speed only changes because of air; its upward speed is '
        + 'taken away by gravity at the same rate whatever the shot is doing, '
        + 'which is what bends the path into an arc. Where that arc goes is '
        + 'settled entirely at the moment of firing, by the angle and the speed '
        + 'and nothing else.',
      tryThis: [
        'Press Play and watch the first shot. At 35° and 12 m/s it hits the '
        + 'middle shelf.',
        'Raise the angle to 42°, leaving the speed alone. That reaches the high '
        + 'shelf — seven degrees, and nothing else changed.',
        'Put it back to 35° and raise the muzzle speed to 15 m/s instead. Now '
        + 'the far shelf is in reach, and the high one is not.',
        'Hunt for the angle that throws furthest at a fixed speed. It is about '
        + '43° here — a little under the 45° of the textbook, because there is '
        + 'air in the way and the cannon is above the ground it lands on.',
      ],
      watch: [
        'The velocity arrow turns as the shot flies: long and upward at first, '
        + 'horizontal at the top, long and downward at the end. Its length is '
        + 'the speed and its direction is the heading.',
        'The weight arrow never changes — not at the top, not on the way down. '
        + 'Gravity is not stronger at the end of the arc, the shot has simply '
        + 'been falling for longer.',
        'At the very top the shot is not motionless. It has stopped going up '
        + 'and is still going sideways at nearly its launch speed.',
        'Angle buys height and speed buys range, and they are not '
        + 'interchangeable — no amount of aiming higher will reach the far '
        + 'shelf, and no amount of speed at 35° will reach the high one.',
      ],
      learn: 'A projectile is doing two independent things at once: moving '
        + 'sideways at a steady rate, and falling. Neither affects the other. '
        + 'Every question about range and height is answered by working out how '
        + 'long it is in the air and multiplying — which is why a faster shot '
        + 'goes further mostly because it stays up longer, not because it is '
        + 'travelling faster along the ground.',
    },
  },
  {
    id: 'rover-on-a-track',
    title: 'Drive the rover round a flooded track',
    blurb: 'Arrow keys or WASD. The water is both the brake and the speed limit.',
    watch: 'Hold a key and the rover does not keep gaining speed — it settles at '
      + 'one. Let go and it stops in about a third of a metre. Both of those are '
      + 'the water, and between them they are what makes it driveable at all.',
    stage: 'collide',
    /*
     * Water is the point of this one, not the track.
     *
     * The keys apply a force, so in an empty world the rover would accelerate
     * for as long as a key was held and never stop once released — true, and
     * unusable as a driving example. Filling the track with water puts a drag
     * force on the other side of the sum, and because drag grows with the
     * square of the speed it settles the rover at the speed where the two
     * cancel. That gives brakes and a top speed out of one mechanism.
     *
     * Deep space is how the view gets to be from above: `topDown` is chosen
     * when there is no ground and no field, so a plan view and a floor are the
     * same switch. There being no gravity also means buoyancy is exactly zero
     * here — ρVg with g at nothing — so the water only ever resists motion,
     * which is the one thing this example wants from it.
     *
     * The chicane on each long side is there because a constant-radius oval
     * only ever asks one question. A corner that reverses makes the momentum
     * you built up on the straight into a problem to solve.
     */
    params: {
      shapeId: 'magbot',
      size: 0.12,
      mass: 0.6,
      // On the right-hand straight, halfway along it.
      x0: 1.95,
      y0: 0,
      v0: 0,
      pushForce: 0,
      pushSeconds: 0,
      worldMode: 'space',
      fluidId: 'water',
      collisions: true,
      // 30 m/s² of engine settles at about 1.39 m/s in water, which is a lap of
      // this track in roughly eight seconds.
      control: { mode: 'keyboard', targetId: 'main', strength: 30 },
      objects: [],
      cannons: [],
      /*
       * Both walls are offsets of one centreline, 0.45 m either side, so the
       * lane is 0.9 m wide the whole way round including through the chicanes.
       * Drawing the two walls independently does not hold the width: it pinches
       * wherever the curvature changes. The centreline is a path — straight,
       * turn, straight — which is what keeps every join tangent-continuous;
       * a kink in it opens a gap in both walls.
       *
       * Each chicane turns one way, twice back, then out again, so it nets to
       * no change in heading and no change in offset, and the loop still closes.
       */
      walls: [
        { x1: 2.4, y1: 0, x2: 2.4, y2: 0.5, bulge: 0, restitution: 0.3, mu: 0.5 },
        { x1: 2.4, y1: 0.5, x2: 1.25, y2: 1.65, bulge: -0.3368, restitution: 0.3, mu: 0.5 },
        { x1: 1.25, y1: 1.65, x2: 0.3638, y2: 1.3664, bulge: -0.0726, restitution: 0.3, mu: 0.5 },
        { x1: 0.3638, y1: 1.3664, x2: -0.3638, y2: 1.3664, bulge: 0.1164, restitution: 0.3, mu: 0.5 },
        { x1: -0.3638, y1: 1.3664, x2: -1.25, y2: 1.65, bulge: -0.0726, restitution: 0.3, mu: 0.5 },
        { x1: -1.25, y1: 1.65, x2: -2.4, y2: 0.5, bulge: -0.3368, restitution: 0.3, mu: 0.5 },
        { x1: -2.4, y1: 0.5, x2: -2.4, y2: -0.5, bulge: 0, restitution: 0.3, mu: 0.5 },
        { x1: -2.4, y1: -0.5, x2: -1.25, y2: -1.65, bulge: -0.3368, restitution: 0.3, mu: 0.5 },
        { x1: -1.25, y1: -1.65, x2: -0.3638, y2: -1.3664, bulge: -0.0726, restitution: 0.3, mu: 0.5 },
        { x1: -0.3638, y1: -1.3664, x2: 0.3638, y2: -1.3664, bulge: 0.1164, restitution: 0.3, mu: 0.5 },
        { x1: 0.3638, y1: -1.3664, x2: 1.25, y2: -1.65, bulge: -0.0726, restitution: 0.3, mu: 0.5 },
        { x1: 1.25, y1: -1.65, x2: 2.4, y2: -0.5, bulge: -0.3368, restitution: 0.3, mu: 0.5 },
        { x1: 2.4, y1: -0.5, x2: 2.4, y2: 0, bulge: 0, restitution: 0.3, mu: 0.5 },
        { x1: 1.5, y1: 0, x2: 1.5, y2: 0.5, bulge: 0, restitution: 0.3, mu: 0.5 },
        { x1: 1.5, y1: 0.5, x2: 1.25, y2: 0.75, bulge: -0.0732, restitution: 0.3, mu: 0.5 },
        { x1: 1.25, y1: 0.75, x2: 0.8862, y2: 0.6336, bulge: -0.0298, restitution: 0.3, mu: 0.5 },
        { x1: 0.8862, y1: 0.6336, x2: -0.8862, y2: 0.6336, bulge: 0.2836, restitution: 0.3, mu: 0.5 },
        { x1: -0.8862, y1: 0.6336, x2: -1.25, y2: 0.75, bulge: -0.0298, restitution: 0.3, mu: 0.5 },
        { x1: -1.25, y1: 0.75, x2: -1.5, y2: 0.5, bulge: -0.0732, restitution: 0.3, mu: 0.5 },
        { x1: -1.5, y1: 0.5, x2: -1.5, y2: -0.5, bulge: 0, restitution: 0.3, mu: 0.5 },
        { x1: -1.5, y1: -0.5, x2: -1.25, y2: -0.75, bulge: -0.0732, restitution: 0.3, mu: 0.5 },
        { x1: -1.25, y1: -0.75, x2: -0.8862, y2: -0.6336, bulge: -0.0298, restitution: 0.3, mu: 0.5 },
        { x1: -0.8862, y1: -0.6336, x2: 0.8862, y2: -0.6336, bulge: 0.2836, restitution: 0.3, mu: 0.5 },
        { x1: 0.8862, y1: -0.6336, x2: 1.25, y2: -0.75, bulge: -0.0298, restitution: 0.3, mu: 0.5 },
        { x1: 1.25, y1: -0.75, x2: 1.5, y2: -0.5, bulge: -0.0732, restitution: 0.3, mu: 0.5 },
        { x1: 1.5, y1: -0.5, x2: 1.5, y2: 0, bulge: 0, restitution: 0.3, mu: 0.5 },
      ],
    },
    arrows: ['velocity', 'control', 'drag', 'net'],
    teach: {
      how: 'Holding a key applies a steady force and F = ma turns it into an '
        + 'acceleration. The water pushes back with a drag force that grows '
        + 'with the square of the speed, so the faster the rover goes the '
        + 'harder the water resists. It stops speeding up at the point where '
        + 'drag has grown to match the thrust: the net force is then zero and '
        + 'the speed holds steady. Let go and the thrust vanishes while the '
        + 'drag does not, which is what stops it.',
      tryThis: [
        'Drive a lap. Notice the rover reaches a speed and stays there rather '
        + 'than getting faster and faster.',
        'Let go on a straight and watch how far it drifts. It is about a third '
        + 'of a metre, and it is under 0.05 m/s within a second and a bit.',
        'Turn the engine strength up from 30 to 90 — three times the thrust. '
        + 'The top speed does not treble, it goes from about 1.4 to about 2.4 '
        + 'm/s. Nine times the thrust would be needed to treble it.',
        'Take a chicane at full speed, then take it braking first. The rover '
        + 'that arrives slower gets through without touching a wall.',
        'Switch the fluid to air and try the same lap. The brakes are gone.',
      ],
      watch: [
        'The control arrow is a fixed length while a key is held — the engine '
        + 'does not know or care how fast the rover is going.',
        'The drag arrow starts at nothing and grows as the rover speeds up. '
        + 'Watch it until it is exactly as long as the control arrow.',
        'At that moment the net force arrow disappears. That is what a top '
        + 'speed is: not the engine running out, but the resistance catching up.',
        'Let go and the control arrow vanishes while the drag arrow does not — '
        + 'so the net force now points backwards, and that is the brake.',
      ],
      learn: 'Anything moving through a fluid has a top speed, and it is set by '
        + 'where drag catches thrust rather than by the engine. Because drag '
        + 'goes with the square of the speed, the arithmetic is unkind: four '
        + 'times the push buys twice the speed, and nine times buys three. That '
        + 'is the same sum that decides a terminal velocity for a falling '
        + 'skydiver, the top speed of a ship, and why the last few miles per '
        + 'hour of a car cost more engine than all the rest put together.',
    },
  },
  {
    id: 'rocket-to-orbit',
    title: 'A Falcon 9, straight up to the ISS',
    blurb: 'Real mass, real thrust. It reaches the height the ISS flies at, '
      + 'and falls straight back down again.',
    watch: 'It gets to 408 km, which is where the ISS is. It is still not in '
      + 'orbit and never will be, because an orbit is a sideways speed and this '
      + 'rocket has none. Height was the easy part.',
    stage: 'fluid',
    /*
     * Every input is the real figure for a Falcon 9 Block 5: 549,054 kg on the
     * pad and 7.607 MN of sea-level thrust from the nine Merlins. The burn is
     * the one number chosen rather than looked up, and it barely is: 370
     * seconds of that thrust, pointed straight up, tops out at 408 km, and the
     * ISS orbits at about 400. The real rocket does the same job in about the
     * same time by tipping over and spending it on speed instead.
     *
     * Aiming at the height rather than at orbit is what makes the example
     * honest. Reaching orbit needs 7,660 m/s sideways; burning straight up for
     * the full nine minutes gets nowhere near it, and calling that "trying to
     * reach orbit" would have taught that the attempt was close. It was not.
     * Getting to the altitude and falling straight back is the whole lesson.
     *
     * It also puts the weight arrow somewhere useful. Over 16 km it lost half a
     * percent and you had to read the number; over 408 km it loses 11.7% -
     * 5.39 MN on the pad against 4.76 at the top - which is visible on the
     * arrow while you watch.
     *
     * Three things this cannot model, none of which spoil the lesson:
     *
     * - Constant mass. Nine tenths of a real Falcon 9 is propellant, so the
     *   real one lightens as it burns and ends up pulling around 3.5 g. Ours
     *   never lightens, which makes it a sluggish, pessimistic rocket.
     * - Straight up. A real launch pitches over within seconds, because the
     *   point is sideways speed. Going straight up is the mistake on show.
     * - The drawn shape is far stubbier than a real rocket, so its frontal area
     *   comes out near 294 m2 against a true 10.8 and the drag reads about
     *   fifteen times high. Even overstated it peaks at 541 kN, 7% of thrust,
     *   which is the honest headline either way: air is not what makes this
     *   hard.
     */
    params: {
      shapeId: 'spaceship',
      // The real length of a Falcon 9, at the cost of a stubbier frontal area.
      size: 70,
      // Block 5 on the pad, fully fuelled.
      mass: 549054,
      materialId: 'clay',
      x0: 0,
      dropHeight: 0,
      v0: 0,
      // Nine Merlin 1D engines at sea level.
      pushForce: 7607000,
      pushAngleDeg: 90,
      // Long enough to arrive at the height the ISS flies at, and no longer.
      pushSeconds: 370,
      slopeDeg: 0,
      fluidId: 'atmosphere',
      worldMode: 'planet',
      objects: [],
      cannons: [],
      walls: [],
    },
    arrows: ['velocity', 'applied', 'weight', 'drag', 'net'],
    teach: {
      how: 'Thrust up, weight down, drag against the motion. A Falcon 9 leaves '
        + 'the pad with 7.61 MN of thrust against 5.39 MN of weight, so only '
        + '2.2 MN is left to accelerate 549 tonnes - about 4 m/s2, less than '
        + 'half a g. It is barely winning at the start, which is why a launch '
        + 'looks so slow for the first few seconds. As it climbs, gravity '
        + 'itself weakens and the same thrust buys more.',
      tryThis: [
        'Press Play and watch the elevation. It crosses 100 km - the Karman '
        + 'line, the usual edge of space - after about 228 seconds.',
        'Keep watching. It reaches 400 km, the height the ISS flies at, around '
        + '503 seconds, tops out at 408 km, and then comes all the way back.',
        'Read the weight at the top: 4.76 MN against 5.39 MN on the pad. An '
        + 'eighth of its weight, gone, on the same rocket.',
        'Now set the angle to 0 and fire it sideways instead. It stays low and '
        + 'goes fast, which is much closer to what a real launch does after the '
        + 'first minute.',
        'Watch it at 2x. The recorder keeps the whole climb at that speed, so '
        + 'you can scrub back to the launch after it has landed.',
      ],
      watch: [
        'At liftoff the thrust arrow is barely longer than the weight arrow. '
        + 'The whole launch runs on the difference between two nearly equal '
        + 'numbers.',
        'The weight arrow visibly shrinks as it climbs, losing an eighth of its '
        + 'length by the top. This is the same g = G*M/r^2 that was invisible '
        + 'on a 16 km flight.',
        'The drag arrow is a spike near 8 km and then simply gone. Above 100 km '
        + 'there is nothing left to push out of the way.',
        'When the motor cuts at 370 s the rocket is 273 km up and still climbing '
        + 'at 1547 m/s. It coasts for another three minutes before it turns '
        + 'round.',
      ],
      learn: 'Getting to space is easy; staying there is the hard part. This '
        + 'rocket reaches the exact height the ISS flies at, on real thrust and '
        + 'a real amount of fuel, and falls straight back - because an orbit is '
        + 'not an altitude. It is going sideways fast enough that the ground '
        + 'curves away as quickly as you fall towards it. The ISS does that at '
        + 'about 7660 m/s. Ours arrives at the same height doing nothing '
        + 'sideways at all, which is why it comes home. That gap, not the '
        + 'height, is what a launch really spends its fuel on, and why real '
        + 'rockets tip over almost as soon as they clear the tower.',
    },
  },
  {
    id: 'two-in-orbit',
    title: 'Two masses going round each other',
    blurb: 'Nothing is holding it up and nothing is pushing it along. It is '
      + 'falling, and missing.',
    watch: 'The small one never gets any closer and never gets away. Take its '
      + 'sideways speed off and it drops straight in; add too much and it '
      + 'leaves. An orbit is the one speed in between.',
    stage: 'two-masses',
    /*
     * An orbit needs a sideways velocity, and the bench already had one - `v0`
     * has always set the main body moving horizontally. What it needed was the
     * geometry: put the small mass directly above the large one and that
     * horizontal velocity is tangential, which is the whole trick. Sitting them
     * side by side, as the step does by default, makes the same number radial
     * and the two just fall together.
     *
     * The masses are chosen backwards from the answer. A twenty-second orbit at
     * three metres wants G*M = 4*pi^2*r^3/T^2, which is 2.66 - so the pair
     * comes to 3.99e10 kg, split 81:1 because that is the Earth and its Moon.
     * The ratio is what makes it visibly *mutual*: the big one swings around a
     * point rather than sitting still, which is the thing a diagram of the
     * solar system never shows.
     *
     * The pair drifts about a metre over ninety seconds, because only the small
     * mass is given a velocity and the centre of mass keeps whatever momentum
     * that adds. At 81:1 the drift is a thirtieth of the orbit and reads as the
     * pair sailing gently along, which is what a real binary does anyway.
     * Measured over 90 s: separation holds between 3.000 and 3.036 m across
     * four and a half orbits.
     */
    params: {
      shapeId: 'sphere',
      size: 0.3,
      // A twentieth of a percent of the pair, like the Moon against the Earth.
      mass: 4.869e8,
      materialId: 'concrete',
      x0: 0,
      // Directly above the other mass, so v0 is tangential rather than radial.
      y0: 3,
      // sqrt(G*M/r): the one speed that neither falls in nor climbs away.
      v0: 0.9425,
      pushForce: 0,
      pushSeconds: 0,
      otherMass: 3.9439e10,
      otherSize: 0.7,
      otherX: 0,
      objects: [],
      cannons: [],
      walls: [],
    },
    arrows: ['velocity', 'weight', 'acceleration'],
    teach: {
      how: 'The two masses pull on each other with G*m1*m2/r^2, and nothing '
        + 'else acts at all - there is no floor, no air and no push. Left '
        + 'alone they would simply fall together. What stops that is the '
        + 'sideways speed: by the time the small one has fallen a little way '
        + 'towards the big one, it has also moved sideways far enough that the '
        + 'big one is in a new direction. It keeps falling and keeps missing, '
        + 'and the path closes into a circle.',
      tryThis: [
        'Press Play. It goes round in about twenty seconds and keeps going.',
        'Set the starting speed to 0 and watch instead. With nothing sideways '
        + 'it falls straight in - which is what an orbit is protection from.',
        'Try 0.6 m/s. Too slow to keep missing, so the path becomes an ellipse '
        + 'that dives close and swings out again.',
        'Try 1.4 m/s. Too fast: it climbs away and does not come back.',
        'Watch the big mass rather than the small one. It is moving too, in a '
        + 'little circle of its own - they both go round a point between them.',
      ],
      watch: [
        'The velocity arrow is always across the gap, never along it. It is '
        + 'never pointing at the mass it is going round.',
        'The acceleration arrow always points straight at the other mass, and '
        + 'it never lines up with the velocity. That is the whole difference '
        + 'between falling and falling towards.',
        'Speed and separation stay put on a circular orbit. Slow it down to '
        + '0.6 m/s and both start breathing in and out together - fastest '
        + 'where it is closest.',
        'The trail closes on itself. It is not being steered; it comes back to '
        + 'where it started because the same law applied the whole way round.',
      ],
      learn: 'An orbit is not a balance between gravity and some outward force '
        + '- there is no outward force. It is free fall that keeps missing. '
        + 'The astronauts on the ISS are not beyond gravity; at that height it '
        + 'is still 89% of what it is here. They are falling exactly as this '
        + 'ball is, and travelling sideways fast enough that the Earth curves '
        + 'away underneath them as fast as they drop. Stop them dead and they '
        + 'would fall, like anything else.',
    },
  },
  {
    id: 'four-dropped-together',
    title: 'Four dropped at once',
    blurb: 'Two share a mass, two share a shape. In air all four land at '
      + 'different times. Take the air away and they land together.',
    watch: 'Everyone knows heavier things fall faster and everyone knows that '
      + 'is wrong. Both are true here, and the switch between them is the '
      + 'fluid setting.',
    stage: 'fluid',
    /*
     * Galileo, with the answer visible from both sides.
     *
     * Four objects fall forty metres. Two of them weigh the same and differ
     * only in shape; three of them are the same shape and differ only in mass.
     * Every pair is a controlled comparison, so nothing has to be taken on
     * trust - whichever one lands first, the only thing that could have caused
     * it is the one thing that was changed.
     *
     * Measured: in air they arrive at 3.00, 3.65, 5.18 and 7.95 s, doing 24.2,
     * 15.5, 8.7 and 5.3 m/s. Switch the fluid to vacuum and every one of them
     * lands at 2.85 s doing 27.9 m/s - not close, the same. That is the whole
     * argument in one setting.
     *
     * Forty metres because the differences need time to accumulate: from four
     * metres the four land within a tenth of a second of each other and the
     * point is lost. The light sphere is 0.15 kg rather than lighter still,
     * because below that it takes half a minute to arrive and the reader has
     * stopped watching.
     */
    params: {
      shapeId: 'sphere',
      size: 0.4,
      mass: 1,
      materialId: 'pine',
      x0: -3,
      dropHeight: 40,
      v0: 0,
      pushForce: 0,
      pushSeconds: 0,
      slopeDeg: 0,
      fluidId: 'air',
      worldMode: 'planet',
      objects: [
        // Same mass as the sphere, blunter: the shape comparison.
        { id: 'o2', shapeId: 'plate', size: 0.4, materialId: 'pine', mass: 1, x: -1, y: 40, vx: 0, vy: 0 },
        // Same shape and size as the sphere, five times the mass.
        { id: 'o3', shapeId: 'sphere', size: 0.4, materialId: 'pine', mass: 5, x: 1, y: 40, vx: 0, vy: 0 },
        // And a seventh of it.
        { id: 'o4', shapeId: 'sphere', size: 0.4, materialId: 'pine', mass: 0.15, x: 3, y: 40, vx: 0, vy: 0 },
      ],
      cannons: [],
      walls: [],
    },
    arrows: ['velocity', 'weight', 'drag', 'net'],
    teach: {
      how: 'Gravity pulls on each of them in proportion to its mass, so a '
        + 'heavier object is pulled harder - and needs proportionally more '
        + 'force to accelerate, which is why the two cancel and mass drops out '
        + 'of free fall entirely. Air does not care about mass. It pushes back '
        + 'on frontal area and shape and the square of the speed, the same for '
        + 'a heavy object as a light one of the same size. So what decides the '
        + 'race is the ratio of that push to the weight carrying it down.',
      tryThis: [
        'Press Play and watch them separate. The 5 kg sphere lands at 3.00 s, '
        + 'the 1 kg at 3.65, the plate at 5.18 and the light sphere at 7.95.',
        'Compare only the sphere and the plate. Identical mass, identical size, '
        + 'and a second and a half between them - so that gap is shape, and '
        + 'nothing else.',
        'Now compare the three spheres. Identical shape and size, so that gap '
        + 'is mass, and nothing else.',
        'Change the fluid to vacuum and press Play again. All four land at 2.85 '
        + 'seconds doing 27.9 m/s - not nearly the same, the same.',
        'Put the air back and make the light sphere heavier a step at a time. '
        + 'Watch it catch the others up.',
      ],
      watch: [
        'The weight arrows are wildly different lengths - the 5 kg sphere has '
        + 'one thirty times the light one. The drag arrows start at nothing and '
        + 'are the same for every sphere at the same speed.',
        'The plate has a drag arrow half again as long as the sphere beside it, '
        + 'on identical weight. That is all shape is.',
        'The light sphere reaches a speed and stops gaining - its drag arrow '
        + 'has grown to match its weight and the net force has gone. The heavy '
        + 'one is still accelerating when it lands.',
        'In vacuum every drag arrow disappears and all four fall as one, arrows '
        + 'identical apart from weight.',
      ],
      learn: 'Drop two things and the heavier usually lands first - and the '
        + 'reason is not gravity, which pulls on mass exactly in proportion to '
        + 'the mass it has to move. It is the air, which pushes back on size '
        + 'and shape and does not know what anything weighs. A heavy object '
        + 'carries the same air resistance with more weight to overcome it, so '
        + 'it wins. Remove the air and the advantage goes with it, which is '
        + 'what the hammer and the feather showed on the Moon: not a different '
        + 'law, just nothing in the way.',
    },
  },
  {
    id: 'marble-run',
    title: 'A fifty-metre marble run',
    blurb: 'Chutes, jumps, a splitter and a dozen plates to bounce off. Three '
      + 'identical marbles, and they do not arrive together.',
    watch: 'Nothing on the track pushes. Every jump, every bounce and all of '
      + 'the speed came out of fifty metres of height, and when it is spent the '
      + 'marbles stop.',
    stage: 'collide',
    /*
     * Thirty-six pieces across fifty metres: steep chutes anchored to the side
     * walls, gaps to fly, curved catches, a splitter, and plates hung in open
     * air with nothing attached to them.
     *
     * The plates are what make it unpredictable. A marble arriving a hand's
     * width further left clips a different one and leaves on a different
     * heading, so three balls released a second apart do not follow each other:
     * they finish spread across thirteen metres of floor, having peaked at
     * 14.9, 16.2 and 20.6 m/s by three different routes.
     *
     * Four things had to be right, and each was found by running it:
     *
     * - Every ramp is anchored to a side wall at its high end. One that stops
     *   short leaves a V, and a marble landing in it sits there for ever -
     *   pinched between a vertical face and a shallow floor with nothing to
     *   roll down. Two of three marbles were lost that way.
     * - Exit headings have to stay downhill. Four features turned so far that
     *   the heading wrapped past 180 degrees and the last section climbed;
     *   every marble ran up and stopped.
     * - Bowls have to be shallow enough to pass a marble on. Deep ones caught
     *   them and rattled them instead.
     * - Nothing may end hard against a wall at a shallow angle. The final curl
     *   did, and wedged a marble at four metres up.
     */
    params: {
      shapeId: 'sphere',
      size: 0.34,
      // Glass at its own density: 2500 kg/m3 through 0.0206 m3.
      mass: 51.4,
      materialId: 'glass',
      x0: -12.2,
      dropHeight: 50.6,
      v0: 0,
      pushForce: 0,
      pushSeconds: 0,
      slopeDeg: 0,
      fluidId: 'air',
      worldMode: 'planet',
      collisions: true,
      objects: [
        // Stacked above the first, so they set off a moment apart - which is
        // all it takes for them to end up somewhere else.
        { id: 'o2', shapeId: 'sphere', size: 0.34, materialId: 'glass', mass: 51.4, x: -12.5, y: 51.8, vx: 0, vy: 0 },
        { id: 'o3', shapeId: 'sphere', size: 0.34, materialId: 'glass', mass: 51.4, x: -12.8, y: 53, vx: 0, vy: 0 },
      ],
      cannons: [],
      walls: [
        { x1: -13, y1: 49.5, x2: -10.391, y2: 46.7983, bulge: -0.4682, restitution: 0.4, mu: 0.05 },
        { x1: -10.391, y1: 46.7983, x2: -6.1113, y2: 45.4077, bulge: 0, restitution: 0.4, mu: 0.05 },
        { x1: 13, y1: 42.5, x2: 9.9634, y2: 40.041, bulge: 0.3975, restitution: 0.4, mu: 0.05 },
        { x1: 9.9634, y1: 40.041, x2: 6.599, y2: 39.0763, bulge: 0, restitution: 0.4, mu: 0.05 },
        { x1: 5.5, y1: 38, x2: -4.5, y2: 35.5, bulge: 0, restitution: 0.4, mu: 0.05 },
        { x1: -13, y1: 33, x2: -11.0863, y2: 31.3364, bulge: -0.2811, restitution: 0.4, mu: 0.05 },
        { x1: -11.0863, y1: 31.3364, x2: -7.7219, y2: 30.3717, bulge: 0, restitution: 0.4, mu: 0.05 },
        { x1: 13, y1: 27.5, x2: 9.8517, y2: 25.1276, bulge: 0.3653, restitution: 0.4, mu: 0.05 },
        { x1: 9.8517, y1: 25.1276, x2: 6.4873, y2: 24.1629, bulge: 0, restitution: 0.4, mu: 0.05 },
        { x1: -5, y1: 20.5, x2: 0, y2: 22.5, bulge: 0, restitution: 0.4, mu: 0.05 },
        { x1: 0, y1: 22.5, x2: 5, y2: 20.5, bulge: 0, restitution: 0.4, mu: 0.05 },
        { x1: -13, y1: 18, x2: -9.9634, y2: 15.541, bulge: -0.3975, restitution: 0.4, mu: 0.05 },
        { x1: -9.9634, y1: 15.541, x2: -6.599, y2: 14.5763, bulge: 0, restitution: 0.4, mu: 0.05 },
        { x1: 13, y1: 16.5, x2: 10.1303, y2: 14.0921, bulge: 0.3641, restitution: 0.4, mu: 0.05 },
        { x1: 10.1303, y1: 14.0921, x2: 6.8016, y2: 13.0105, bulge: 0, restitution: 0.4, mu: 0.05 },
        { x1: -9.5, y1: 11, x2: -6.5791, y2: 9.8788, bulge: -0.1231, restitution: 0.4, mu: 0.05 },
        { x1: -6.5791, y1: 9.8788, x2: -1.6884, y2: 8.8392, bulge: 0, restitution: 0.4, mu: 0.05 },
        { x1: 6.5, y1: 5.5, x2: 8.5095, y2: 4.2926, bulge: -0.2385, restitution: 0.4, mu: 0.05 },
        { x1: 8.5095, y1: 4.2926, x2: 10.9852, y2: 3.9446, bulge: 0, restitution: 0.4, mu: 0.05 },
        { x1: -2, y1: 30.5, x2: 0.9282, y2: 27.8635, bulge: -0.6784, restitution: 0.4, mu: 0.05 },
        { x1: -12.6, y1: 8, x2: -9.7852, y2: 6.6874, bulge: -0.2044, restitution: 0.4, mu: 0.05 },
        { x1: -9.7852, y1: 6.6874, x2: -7.8574, y2: 5.9086, bulge: 0.1093, restitution: 0.4, mu: 0.05 },
        { x1: -8.5, y1: 45.5, x2: -2.5, y2: 44, bulge: 0, restitution: 0.4, mu: 0.05 },
        { x1: 8, y1: 32.5, x2: 2.5, y2: 31, bulge: 0, restitution: 0.4, mu: 0.05 },
        { x1: -7, y1: 25.5, x2: -2, y2: 26.8, bulge: 0, restitution: 0.4, mu: 0.05 },
        { x1: 3, y1: 13.5, x2: 8.5, y2: 12.2, bulge: 0, restitution: 0.4, mu: 0.05 },
        { x1: -4.5, y1: 6.5, x2: 0.5, y2: 5.2, bulge: 0, restitution: 0.4, mu: 0.05 },
        { x1: -2, y1: 2.2, x2: 2, y2: 3.2, bulge: 0, restitution: 0.4, mu: 0.05 },
        { x1: -13, y1: 51, x2: -13, y2: 34, bulge: 0, restitution: 0.4, mu: 0.05 },
        { x1: -13, y1: 34, x2: -13, y2: 17, bulge: 0, restitution: 0.4, mu: 0.05 },
        { x1: -13, y1: 17, x2: -13, y2: 0, bulge: 0, restitution: 0.4, mu: 0.05 },
        { x1: 13, y1: 51, x2: 13, y2: 34, bulge: 0, restitution: 0.4, mu: 0.05 },
        { x1: 13, y1: 34, x2: 13, y2: 17, bulge: 0, restitution: 0.4, mu: 0.05 },
        { x1: 13, y1: 17, x2: 13, y2: 0, bulge: 0, restitution: 0.4, mu: 0.05 },
        { x1: -12.6, y1: 0, x2: -12.6, y2: 1.3, bulge: 0, restitution: 0.4, mu: 0.05 },
        { x1: 12.6, y1: 0, x2: 12.6, y2: 1.3, bulge: 0, restitution: 0.4, mu: 0.05 },
      ],
    },
    arrows: ['velocity', 'weight', 'normal', 'net'],
    teach: {
      how: 'A marble at the top has energy because of where it is, and that is '
        + 'the only supply the run has. Every metre it drops buys the same '
        + 'amount of speed whatever route it takes to get there - which is why '
        + 'a long shallow chute and a short steep one arrive at the same height '
        + 'doing the same speed. What the run does with that is take some back '
        + 'at every bounce, as heat and sound, and once it has all gone the '
        + 'marble stops wherever it happens to be.',
      tryThis: [
        'Press Play and follow one marble. It peaks somewhere near 17 m/s and '
        + 'takes a bit over a minute to come to rest.',
        'Watch all three. They start a second apart from almost the same place '
        + 'and finish metres apart, because a plate hit slightly differently '
        + 'sends a marble somewhere else entirely.',
        'Change the fluid to water. The marbles slow to a crawl and the whole '
        + 'run becomes gentle - drag rises with the square of the speed, so it '
        + 'bites hardest exactly where the run is fastest.',
        'Make the walls bouncier in the obstacles panel and run it again. More '
        + 'of the speed survives each hit and the marbles go further off track.',
        'Set the drop height lower and see how far down the run a marble gets. '
        + 'It can only ever spend the height it started with.',
      ],
      watch: [
        'On a chute the velocity arrow grows steadily and never points along '
        + 'the slope - gravity pulls straight down and the ramp only permits '
        + 'the part along itself.',
        'In the air between features there is no normal force at all. The net '
        + 'force arrow is exactly the weight, and the path is the same parabola '
        + 'a thrown ball makes.',
        'At every bounce the velocity arrow shortens. Nothing gives it back.',
        'The three marbles separate within the first few seconds and never '
        + 'come back together, on a track with nothing random in it at all.',
      ],
      learn: 'A marble run is a machine for spending height, and it can only '
        + 'spend it once. Every bit of speed anywhere on this track was bought '
        + 'with a metre of descent earlier, which is why the features must keep '
        + 'going down and why the run has an end. The three marbles also show '
        + 'something else: the same track, the same balls and a start a second '
        + 'apart is enough to finish metres away from each other. Nothing here '
        + 'is random - it is just that a bounce multiplies small differences, '
        + 'which is why predicting weather is hard and predicting an eclipse is '
        + 'not.',
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
