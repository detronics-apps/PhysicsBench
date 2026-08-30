/**
 * The learning progression. Pure data plus a topological sort.
 *
 * The order matters more than any single lesson. Each concept is built out of
 * the ones before it — velocity needs position and time, momentum needs mass
 * and velocity, collisions need momentum — so the whole thing is a dependency
 * graph, and `order()` walks it. Adding a concept whose prerequisite does not
 * exist is caught by a test rather than by a confused learner.
 *
 * Every concept carries three things beyond its name:
 *
 *   ask          the "what happens if I change this?" question to lead with
 *   discover     what the learner should notice before any equation appears
 *   misconception  the thing they probably already believe, and why it is
 *                  reasonable — because "you are wrong" teaches nothing and
 *                  "here is why that seems right, and here is what actually
 *                  happens" teaches a great deal
 */

export const CONCEPTS = [
  {
    id: 'mass',
    label: 'Mass and inertia',
    tool: 'mass',
    needs: [],
    ask: 'What happens if I push a heavy thing and a light thing exactly as hard?',
    discover: 'The same push produces less acceleration on more mass. Mass is a '
      + 'measure of how strongly something resists having its motion changed.',
    misconception: {
      belief: 'Heavy things are harder to push because gravity holds them down.',
      why: 'It is a reasonable guess, and on a real floor it is partly true — a '
        + 'heavier object does press down harder and so meets more friction.',
      actually: 'Take the friction away — in space, on an air track — and a heavy '
        + 'object is still harder to get moving. That resistance is inertia, and '
        + 'it has nothing to do with gravity at all.',
    },
    equations: ['newton-2'],
  },
  {
    id: 'position',
    label: 'Position and time',
    tool: 'motion',
    needs: [],
    ask: 'Where is it, and where will it be a second from now?',
    discover: 'Position needs an origin and a direction before it means anything. '
      + 'How position changes over time is what everything else is built on.',
    misconception: {
      belief: 'Position is just "where something is".',
      why: 'In everyday life the reference point is obvious and never mentioned.',
      actually: 'Position is always measured from somewhere. Change the origin '
        + 'and every number changes; the physics does not. That freedom is used '
        + 'constantly — it is why you may put h = 0 wherever is convenient.',
    },
    equations: ['suvat-s'],
  },
  {
    id: 'velocity',
    label: 'Speed and velocity',
    tool: 'motion',
    needs: ['position'],
    ask: 'Two objects are both doing 5 m/s. Are they doing the same thing?',
    discover: 'Speed says how fast. Velocity says how fast and which way. Two '
      + 'objects at 5 m/s in opposite directions have the same speed and '
      + 'opposite velocities — and they will end up a long way apart.',
    misconception: {
      belief: 'Speed and velocity are two words for the same thing.',
      why: 'In conversation they are, and for anything moving in a straight line '
        + 'in one direction they give the same number.',
      actually: 'The direction is what lets you predict where something will be. '
        + 'It is also what makes velocity add and subtract the way it does — two '
        + 'cars closing at 30 m/s each approach at 60 m/s.',
    },
    equations: ['suvat-s'],
  },
  {
    id: 'acceleration',
    label: 'Acceleration',
    tool: 'accel',
    needs: ['velocity'],
    ask: 'Can something be accelerating while it slows down?',
    discover: 'Acceleration is the rate at which velocity changes. If it points '
      + 'against the motion the object slows; if it points across the motion the '
      + 'object turns. All three are acceleration.',
    misconception: {
      belief: 'Accelerating means going faster.',
      why: 'That is what the word means in a car, where the accelerator does '
        + 'exactly one thing.',
      actually: 'Physics uses it for any change of velocity. A car braking is '
        + 'accelerating; so is one going round a roundabout at a steady speed. '
        + 'Watch the sign of a next to the sign of v.',
    },
    equations: ['suvat-v', 'suvat-s', 'suvat-v2'],
  },
  {
    id: 'force',
    label: 'Force and Newton\'s laws',
    tool: 'force',
    needs: ['mass', 'acceleration'],
    ask: 'What happens if I push exactly as hard as friction pushes back?',
    discover: 'It is the *net* force that produces acceleration. Five forces on '
      + 'an object that add to nothing produce no acceleration at all — the '
      + 'object carries on exactly as it was.',
    misconception: {
      belief: 'Something moving must have a force pushing it along.',
      why: 'Everything on Earth does slow down when you stop pushing it, so the '
        + 'inference is entirely reasonable from experience.',
      actually: 'What slows it is friction — another force. Remove that and it '
        + 'keeps going for ever with nothing pushing at all. That is Newton\'s '
        + 'first law, and it took two thousand years to notice.',
    },
    equations: ['newton-2', 'friction'],
  },
  {
    id: 'gravity',
    label: 'Gravity, mass and weight',
    tool: 'weight',
    needs: ['force'],
    ask: 'Drop a heavy ball and a light one at the same moment. Which lands first?',
    discover: 'In a vacuum, neither — they land together. A heavier object is '
      + 'pulled harder and resists acceleration more, by exactly the same factor, '
      + 'and the two cancel.',
    misconception: {
      belief: 'Heavier things fall faster.',
      why: 'They usually do, and everyone has seen it. A stone really does beat a '
        + 'sheet of paper to the floor.',
      actually: 'What separates them is the air, not the gravity. Crumple the '
        + 'paper and it very nearly keeps up. Take the air away and they land '
        + 'together — which is what the Apollo 15 hammer and feather showed on '
        + 'the Moon. Switch air resistance on here and watch the everyday result '
        + 'come back, for the right reason.',
    },
    equations: ['weight', 'gravity-field'],
  },
  {
    id: 'projectile',
    label: 'Projectile motion',
    tool: 'projectile',
    needs: ['gravity', 'velocity'],
    ask: 'Fire one ball horizontally and drop another at the same instant. Which '
      + 'hits the ground first?',
    discover: 'They land together. Gravity acts only downward, so it does nothing '
      + 'to the horizontal motion — the two are independent, and a curved path is '
      + 'just constant horizontal motion and free fall happening at once.',
    misconception: {
      belief: 'A thrown ball keeps going forward because of the force of the throw.',
      why: 'The throw is what set it going, so it feels as if some of it must '
        + 'still be in there.',
      actually: 'The throw is over the instant the ball leaves your hand. After '
        + 'that the only force is gravity, straight down. The forward motion needs '
        + 'no force to continue — that is Newton\'s first law again.',
    },
    equations: ['suvat-v', 'suvat-s', 'weight'],
  },
  {
    id: 'momentum',
    label: 'Momentum',
    tool: 'momentum',
    needs: ['mass', 'velocity'],
    ask: 'Can a slow lorry and a fast bicycle carry the same momentum?',
    discover: 'Momentum is mass and velocity together, and it has a direction. '
      + 'Ten different combinations can give the same value.',
    misconception: {
      belief: 'Momentum is basically the same as force.',
      why: 'Both describe "how hard something hits", loosely.',
      actually: 'Force is what changes momentum. How hard something hits depends '
        + 'on its momentum *and* on how quickly it stops — which is exactly why '
        + 'crumple zones and airbags work.',
    },
    equations: ['momentum', 'impulse'],
  },
  {
    id: 'collision',
    label: 'Collisions',
    tool: 'collision',
    needs: ['momentum'],
    ask: 'What survives a crash, and what does not?',
    discover: 'Total momentum is the same before and after, every time. Kinetic '
      + 'energy is only conserved in a perfectly elastic collision, and almost '
      + 'nothing is.',
    misconception: {
      belief: 'Energy is lost in a crash.',
      why: 'Kinetic energy visibly is: the wreckage is not moving.',
      actually: 'The energy is still there — as heat in the bent metal, as sound, '
        + 'as permanent deformation. *Kinetic* energy fell; total energy did not '
        + 'move at all. This app keeps both numbers on screen so the difference '
        + 'is visible.',
    },
    equations: ['momentum-conservation', 'kinetic-energy', 'restitution'],
  },
  {
    id: 'energy',
    label: 'Energy',
    tool: 'energy',
    needs: ['force', 'gravity'],
    ask: 'What happens to the height as the speed grows?',
    discover: 'Height and speed trade against each other at a fixed exchange '
      + 'rate. Add friction and the total falls — and exactly that much heat '
      + 'appears.',
    misconception: {
      belief: 'Energy gets used up.',
      why: 'It certainly seems to: fuel runs out, batteries go flat, things stop '
        + 'moving.',
      actually: 'It gets spread out into forms that are harder to use — mostly '
        + 'low-grade heat. The total never changes. What runs out is not energy '
        + 'but its usefulness.',
    },
    equations: ['kinetic-energy', 'potential-energy', 'energy-conservation'],
  },
  {
    id: 'pendulum',
    label: 'Pendulums and oscillation',
    tool: 'pendulum',
    needs: ['energy', 'gravity'],
    ask: 'Does a heavier bob swing more slowly?',
    discover: 'No — the mass makes no difference at all, for the same reason it '
      + 'makes none in free fall. Length does, and so does gravity, and so (a '
      + 'little) does how far it swings.',
    misconception: {
      belief: 'A pendulum\'s period depends on how far you pull it back.',
      why: 'It genuinely does — just far less than you would expect. At 90° the '
        + 'period is 18% longer than at a tiny angle.',
      actually: 'The usual formula says the amplitude does not matter, and it is '
        + 'an approximation that assumes small swings. The exact answer does '
        + 'depend on amplitude. Both are shown here so you can watch the '
        + 'approximation break down as you widen the swing.',
    },
    equations: ['pendulum-period', 'energy-conservation'],
  },
  {
    id: 'rotation',
    label: 'Rotation and torque',
    tool: 'rotation',
    needs: ['force', 'energy'],
    ask: 'A hoop and a solid disc roll down the same ramp. Which wins?',
    discover: 'The disc, every time — and neither the mass nor the size matters. '
      + 'What decides it is where the mass sits relative to the axis.',
    misconception: {
      belief: 'The heavier one rolls down faster.',
      why: 'Heavier things feel like they should have more push behind them.',
      actually: 'Mass cancels out here just as it does in free fall. Two hoops of '
        + 'wildly different mass tie exactly. A hoop loses to a disc because it '
        + 'has to put half its energy into spinning instead of travelling.',
    },
    equations: ['torque', 'newton-2-rotational'],
  },
  {
    id: 'machines',
    label: 'Machines and mechanical advantage',
    tool: 'engineer',
    needs: ['rotation', 'energy'],
    ask: 'Can a gearbox give you something for nothing?',
    discover: 'No. Every machine that multiplies force divides distance by the '
      + 'same factor, and gives back a little less than it took because of '
      + 'friction.',
    misconception: {
      belief: 'Gearing down makes a motor more powerful.',
      why: 'It certainly makes a vehicle pull harder, which feels like more power.',
      actually: 'It makes it pull harder and go slower — power is force times '
        + 'speed, and their product is what the motor can make, minus losses. A '
        + 'gearbox moves power around; it never creates any.',
    },
    equations: ['gear-ratio', 'torque'],
  },
];

export const conceptById = (id) => CONCEPTS.find((c) => c.id === id) || null;

/**
 * The concepts in an order where nothing appears before what it needs.
 *
 * Kahn's algorithm, with the declared order preserved among concepts that are
 * equally ready. Throws on a cycle, which would be a genuine mistake in the
 * data rather than something to route around.
 */
export function order(concepts = CONCEPTS) {
  const remaining = [...concepts];
  const done = new Set();
  const out = [];

  while (remaining.length) {
    const index = remaining.findIndex((c) => c.needs.every((n) => done.has(n)));
    if (index === -1) {
      throw new Error(`Cycle or missing prerequisite among: ${remaining.map((c) => c.id).join(', ')}`);
    }
    const [next] = remaining.splice(index, 1);
    done.add(next.id);
    out.push(next);
  }
  return out;
}

/** Everything a concept depends on, all the way down. */
export function prerequisites(id, seen = new Set()) {
  const concept = conceptById(id);
  if (!concept) return [];
  for (const need of concept.needs) {
    if (seen.has(need)) continue;
    seen.add(need);
    prerequisites(need, seen);
  }
  return [...seen];
}

/** What becomes available once a concept is understood. */
export const unlocks = (id) => CONCEPTS.filter((c) => c.needs.includes(id)).map((c) => c.id);

/** The concept a tool teaches, for the "you are here" line in the interface. */
export const conceptForTool = (toolId) => CONCEPTS.find((c) => c.tool === toolId) || null;

/** Where in the progression a tool sits: "5 of 13". */
export function progress(toolId) {
  const sorted = order();
  const index = sorted.findIndex((c) => c.tool === toolId);
  return index === -1 ? null : { index: index + 1, total: sorted.length, concept: sorted[index] };
}

/** The next concept to try, given what has been seen. */
export function suggestNext(seenIds = []) {
  const seen = new Set(seenIds);
  return order().find((c) => !seen.has(c.id) && c.needs.every((n) => seen.has(n)))
    || order().find((c) => !seen.has(c.id))
    || null;
}
