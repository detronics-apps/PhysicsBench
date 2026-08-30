/**
 * The honesty layer. Pure.
 *
 * The app's central promise is that a learner never has to unlearn anything.
 * That promise is only keepable if the app can *say*, at every moment, which
 * of four different things the learner is looking at:
 *
 *   REALITY        the physical phenomenon itself
 *   MODEL          the mathematical description being used to stand in for it
 *   ASSUMPTION     something deliberately excluded so the model stays workable
 *   APPROXIMATION  a number or a piece of maths deliberately simplified
 *
 * Those four are not decoration. "Gravity is 9.81 m/s²" collapses all four into
 * one sentence and is wrong in three different ways at once. Split apart it
 * becomes: gravity is an interaction between masses (reality); near the surface
 * we treat the field as uniform (model); we are ignoring the air (assumption);
 * and we are using 9.80665, which is a defined reference value rather than the
 * value here (a numeric choice the interface names).
 *
 * Every simulation in the app declares the ids it is running under and this
 * module turns that into something the interface can show. A scenario that
 * forgets to declare one gets caught by `disclosure` throwing, not by a learner
 * quietly absorbing a falsehood.
 */

export const KINDS = ['reality', 'model', 'assumption', 'approximation'];

export const KIND_LABEL = {
  reality: 'Physical reality',
  model: 'Model in use',
  assumption: 'Assumption',
  approximation: 'Approximation',
};

/**
 * What each of the four words means, in the interface's own voice. Shown once
 * where the learner first meets the distinction, and available thereafter.
 */
export const KIND_MEANING = {
  reality: 'What actually happens, as far as physics currently describes it.',
  model: 'The mathematical description standing in for reality here. Models are '
    + 'chosen, not discovered — a better model is always possible.',
  assumption: 'Something real that this simulation deliberately leaves out, so '
    + 'that what remains is simple enough to see clearly.',
  approximation: 'A number or a piece of maths deliberately simplified. The '
    + 'physics is unchanged; only the arithmetic is easier.',
};

/**
 * Every entry has the same five parts, and the app refuses to render one that
 * is missing any of them:
 *
 *   statement   what is being done, in one sentence
 *   why         why it is worth doing
 *   ifRemoved   what would change if it were not done — the promise that the
 *               next lesson widens this one rather than contradicting it
 *   reality     what the fuller picture actually is
 */
const entry = (id, kind, label, statement, why, ifRemoved, reality) =>
  ({ id, kind, label, statement, why, ifRemoved, reality });

/* ------------------------------------------------------------- models --- */

export const MODELS = Object.fromEntries([
  entry(
    'uniform-field', 'model', 'Uniform gravitational field',
    'Gravitational acceleration is treated as the same value and the same '
      + 'direction everywhere in the scene.',
    'Over a few metres near a planet\'s surface the real field changes by far '
      + 'less than anything you could measure here, and holding it constant '
      + 'makes the motion analysable by hand.',
    'Over hundreds of kilometres the field would visibly weaken with height and '
      + 'the "downward" direction would fan out towards the planet\'s centre. '
      + 'The trajectory would become an ellipse, not a parabola.',
    'Gravity is an interaction between masses whose strength falls off with the '
      + 'square of the distance between their centres.',
  ),
  entry(
    'inverse-square', 'model', 'Inverse-square gravitational field',
    'Field strength is computed as g = G·M/r² from the attracting body\'s mass '
      + 'and the distance from its centre.',
    'This is the model the uniform-field one is an approximation of. It is what '
      + 'makes orbits work, and it shows plainly that the falling object\'s own '
      + 'mass never enters the calculation.',
    'General relativity describes gravity as curvature of spacetime rather than '
      + 'a force; the Newtonian result is its weak-field, low-speed limit, and '
      + 'is accurate enough for everything in this app.',
    'Mass tells spacetime how to curve; curved spacetime tells mass how to move.',
  ),
  entry(
    'classical-mechanics', 'model', 'Classical (Newtonian) mechanics',
    'Motion is computed from F = dp/dt with mass held constant, giving F = ma.',
    'It is accurate to better than one part in a million for anything moving at '
      + 'everyday speeds, and it is the framework the equations on screen are '
      + 'written in.',
    'At speeds approaching that of light, momentum is γmv rather than mv and the '
      + 'acceleration produced by a given force falls away. At atomic scales the '
      + 'whole picture of a definite position and velocity stops applying.',
    'Force is the rate at which momentum changes. F = ma is the special case '
      + 'where the mass is not changing.',
  ),
  entry(
    'point-mass', 'model', 'Point mass',
    'Each object\'s entire mass is treated as concentrated at a single point, '
      + 'and it cannot spin.',
    'It removes rotation and shape from the problem so that force, acceleration '
      + 'and momentum can be seen on their own.',
    'A real object has a moment of inertia, can spin, and can have forces '
      + 'applied off its centre of mass, which produce torque. The Rotation lab '
      + 'is where that is put back.',
    'Real objects have extent, spin, and a distribution of mass.',
  ),
  entry(
    'rigid-body', 'model', 'Rigid body',
    'Objects keep their exact shape no matter what forces act on them.',
    'Deformation during a collision lasts milliseconds and would obscure the '
      + 'thing being taught, which is what happens to velocity and momentum.',
    'Real bodies compress, store elastic energy, and either return it (a bouncy '
      + 'ball) or turn it into heat, sound and permanent dents (a car). That is '
      + 'exactly what the coefficient of restitution is standing in for.',
    'Every real material deforms under load.',
  ),
  entry(
    'coulomb-friction', 'model', 'Coulomb (dry) friction',
    'Friction is modelled as μ times the normal force: static friction up to '
      + 'μs·N while at rest, kinetic friction of exactly μk·N while sliding.',
    'It is simple, it captures the two behaviours that matter — a threshold to '
      + 'get moving, and a constant resistance once moving — and it predicts '
      + 'real situations remarkably well.',
    'Real friction depends on sliding speed, temperature, contact pressure, how '
      + 'long the surfaces have been in contact and what is on them. The step '
      + 'from static to kinetic is not instantaneous either.',
    'Friction is countless microscopic contacts forming and breaking, plus '
      + 'material being deformed and heated.',
  ),
  entry(
    'quadratic-drag', 'model', 'Quadratic air resistance',
    'Drag is computed as ½·ρ·C_d·A·v², opposing the direction of motion.',
    'It is the correct form for the speeds and sizes in this app, where the flow '
      + 'behind the object is turbulent.',
    'At very low speeds or very small sizes drag is proportional to v, not v². '
      + 'C_d itself changes with the Reynolds number: a smooth sphere\'s drops '
      + 'by a factor of four as it crosses the critical value.',
    'A moving object has to push fluid out of the way and drags a wake behind it.',
  ),
  entry(
    'restitution', 'model', 'Coefficient of restitution',
    'A collision is summarised by one number e: the separation speed divided by '
      + 'the approach speed.',
    'It lets a collision be solved exactly without modelling what happens inside '
      + 'the material, and it spans the whole range from perfectly elastic (e=1) '
      + 'to perfectly inelastic (e=0) with one dial.',
    'e is not a constant of a material: it falls with impact speed and depends '
      + 'on both bodies, their shapes and their temperature. Where the "lost" '
      + 'kinetic energy goes — heat, sound, permanent deformation, vibration — is '
      + 'not modelled at all, only accounted for.',
    'During a real impact the bodies deform, store elastic energy, and return '
      + 'part of it.',
  ),
  entry(
    'ideal-rod', 'model', 'Massless rigid rod',
    'The pendulum arm has no mass, does not stretch, and does not bend.',
    'It makes the pendulum a one-variable problem — the angle — so the effect of '
      + 'length, mass and gravity can each be isolated.',
    'A real rod has its own moment of inertia, which changes the period; a real '
      + 'string can go slack, which a rod cannot; and a real pivot has friction.',
    'Any real arm has mass, flexes, and hangs from a pivot that resists turning.',
  ),
  entry(
    'ideal-spring', 'model', 'Ideal (Hookean) spring',
    'Restoring force is exactly −k·x for any extension, and the spring has no '
      + 'mass.',
    'Hooke\'s law is very accurate over a spring\'s working range and gives '
      + 'simple harmonic motion in closed form.',
    'Real springs go non-linear near their limits, take a permanent set if '
      + 'overstretched, have mass that affects the period, and lose energy to '
      + 'internal damping.',
    'Materials resist deformation roughly in proportion to it — until they do not.',
  ),
  entry(
    'flat-earth-ground', 'model', 'Flat, immovable ground',
    'The ground is a horizontal plane of infinite mass that never moves.',
    'Earth is about 10²⁴ times heavier than anything in the scene, so its recoil '
      + 'is unmeasurable, and over a few metres its curvature is irrelevant.',
    'Momentum is in fact conserved between the object and the Earth; the Earth\'s '
      + 'share of the velocity change is simply too small to detect. Over '
      + 'hundreds of kilometres, curvature matters and the Coriolis effect '
      + 'appears.',
    'The Earth is a rotating, roughly spherical body that also recoils, by an '
      + 'immeasurably small amount.',
  ),
  entry(
    'numeric-integration', 'model', 'Step-by-step numerical integration',
    'Motion is advanced in small time steps rather than solved as a formula, '
      + 'using a fourth-order Runge–Kutta scheme.',
    'Most interesting situations — drag, a large-angle pendulum, a double '
      + 'pendulum — have no closed-form solution at all. Stepping works for all '
      + 'of them.',
    'A closed-form solution, where one exists, is exact. Stepping accumulates a '
      + 'small error each step; halving the step size cuts that error by about '
      + 'sixteen for this scheme. Where an exact answer exists this app compares '
      + 'against it.',
    'The underlying equations of motion are continuous; the computer is not.',
  ),
]. map((e) => [e.id, e]));

/* -------------------------------------------------------- assumptions --- */

export const ASSUMPTIONS = Object.fromEntries([
  entry(
    'no-drag', 'assumption', 'Air resistance ignored',
    'The simulation is running in a vacuum: no drag force acts at all.',
    'It isolates gravity. With the air removed, every object at the same place '
      + 'accelerates identically, which is the point being demonstrated.',
    'With air, the object would reach a terminal speed where drag balanced '
      + 'weight, and objects of different shape, size and mass would then fall at '
      + 'visibly different rates. Turn air resistance on to see it.',
    'Anything moving through a fluid is resisted by it.',
  ),
  entry(
    'no-buoyancy', 'assumption', 'Buoyancy ignored',
    'The upward force from displaced fluid is not modelled.',
    'In air it is tiny for anything denser than a balloon — about 0.1% of the '
      + 'weight of a wooden block.',
    'A helium balloon would rise; a wooden block in water would float. Buoyancy '
      + 'is why a feather and a hammer do not quite fall together even before '
      + 'drag is considered.',
    'A submerged object is pushed up by the weight of the fluid it displaces.',
  ),
  entry(
    'no-rotation', 'assumption', 'Objects do not spin',
    'Each object is treated as a point mass with no rotation.',
    'Spin is a whole subject of its own and would confuse the first look at '
      + 'force and acceleration.',
    'A spinning ball curves through the air (the Magnus effect), a rolling ball '
      + 'stores part of its energy as rotation and so accelerates more slowly '
      + 'down a ramp than a sliding one, and an off-centre push makes an object '
      + 'turn as well as move.',
    'Real objects rotate, and rotation carries its own energy and momentum.',
  ),
  entry(
    'no-pivot-friction', 'assumption', 'The pivot is frictionless',
    'No resisting torque acts at the pendulum\'s pivot.',
    'Without it the pendulum keeps a constant amplitude, so the period can be '
      + 'measured over many swings.',
    'A real pendulum\'s amplitude decays. Since the period depends slightly on '
      + 'amplitude, a real one\'s period drifts too, very slowly, as it dies away.',
    'Every bearing resists turning.',
  ),
  entry(
    'no-heat', 'assumption', 'Where lost energy goes is not tracked',
    'Energy removed by an inelastic collision or by friction is accounted for '
      + 'but not followed.',
    'Following it would mean modelling temperature, sound and material '
      + 'deformation, none of which changes the motion being taught.',
    'That energy is still there — as heat in both bodies, as sound, as permanent '
      + 'deformation. Total energy is always conserved; kinetic energy on its own '
      + 'is not.',
    'Energy is never destroyed, only moved into forms that are harder to see.',
  ),
  entry(
    'no-relativity', 'assumption', 'Relativistic effects ignored',
    'Momentum is mv and mass does not change with speed.',
    'At 100 m/s the relativistic correction is about one part in 10¹³ — far '
      + 'smaller than the rounding in the readout.',
    'At a tenth of the speed of light momentum is about 0.5% higher than mv; at '
      + '0.9c it is more than twice as high, and no finite force can reach c.',
    'Momentum is γmv, where γ grows without limit as speed approaches c.',
  ),
  entry(
    'no-air-density-change', 'assumption', 'Air density held constant',
    'The fluid has one density for the whole flight.',
    'Over the heights in these experiments the change is negligible.',
    'Real air thins with altitude — about a third of sea-level density at '
      + '10 km — so a high-altitude projectile meets far less drag near the top '
      + 'of its arc.',
    'Atmospheric density falls roughly exponentially with height.',
  ),
  entry(
    'constant-mass', 'assumption', 'Mass does not change',
    'Every object keeps the mass it started with.',
    'It is what allows F = ma to be used in place of F = dp/dt.',
    'A rocket loses mass as it burns fuel, and its acceleration for a given '
      + 'thrust rises accordingly. There F = ma is simply the wrong equation.',
    'Force is the rate of change of momentum, which mass changes affect.',
  ),
  entry(
    'no-wind', 'assumption', 'The air is still',
    'The fluid has no motion of its own.',
    'It keeps drag purely a function of the object\'s own velocity.',
    'A crosswind adds its velocity to the relative airflow, which changes both '
      + 'the size and the direction of the drag force.',
    'Drag depends on the velocity of the object relative to the air, not on its '
      + 'velocity relative to the ground — and real air is almost never still.',
  ),
]. map((e) => [e.id, e]));

/* ----------------------------------------------------- approximations --- */

export const APPROXIMATIONS = Object.fromEntries([
  entry(
    'g-rounded', 'approximation', 'Using 10 m/s² instead of 9.80665',
    'Gravitational acceleration is set to exactly 10 m/s² for this experiment.',
    'It makes the arithmetic doable in your head, so the relationship stays '
      + 'visible instead of being buried in long division.',
    'Every result is about 2% high. This is a deliberate choice of number for '
      + 'easier arithmetic — it is not the standard value, and it is not the '
      + 'value anywhere on Earth.',
    'Standard gravity is defined as 9.80665 m/s²; the real local value varies '
      + 'with latitude and altitude between roughly 9.76 and 9.83.',
  ),
  entry(
    'small-angle', 'approximation', 'Small-angle formula for the period',
    'The period is computed as T = 2π√(L/g), which assumes sin θ ≈ θ.',
    'For swings under about 10° it is accurate to better than 0.2%, and it makes '
      + 'the dependence on length and gravity obvious.',
    'The true period grows with amplitude: about 0.7% longer at 20°, 1.7% at 30°, '
      + 'and 18% longer at 90°. The app computes the exact period alongside it so '
      + 'you can watch the error appear.',
    'A pendulum\'s restoring force goes as sin θ, not θ, so its period genuinely '
      + 'depends on how far it swings.',
  ),
  entry(
    'fixed-cd', 'approximation', 'Drag coefficient held constant',
    'C_d keeps one value regardless of speed.',
    'Over the speed range of a thrown ball it barely moves, and a constant makes '
      + 'the v² relationship clean.',
    'C_d depends on the Reynolds number. A smooth sphere\'s falls from about 0.47 '
      + 'to about 0.1 as it crosses the critical value — the effect a golf ball\'s '
      + 'dimples exist to trigger.',
    'Drag coefficient is a function of flow conditions, not a property of a shape.',
  ),
  entry(
    'indicative-mu', 'approximation', 'Friction coefficients are indicative',
    'The μ values offered are typical textbook figures for the named pair of '
      + 'materials.',
    'They are the right order of magnitude and show the right behaviour.',
    'Published values for the same pair can differ by more than a factor of two '
      + 'depending on surface finish, cleanliness and contact pressure. A real '
      + 'design uses measured data for the actual surfaces.',
    'μ is not a material constant in the way density is.',
  ),
  entry(
    'discrete-time', 'approximation', 'Time advances in finite steps',
    'The simulation advances in steps of a few milliseconds rather than '
      + 'continuously.',
    'It is the only way a computer can do this, and the error is far below the '
      + 'precision shown on screen.',
    'Exact solutions exist for the simplest cases and this app compares against '
      + 'them: for constant acceleration the scheme used is exact, so free fall '
      + 'and projectile motion carry no step error at all.',
    'Motion is continuous.',
  ),
]. map((e) => [e.id, e]));

export const ALL = { ...MODELS, ...ASSUMPTIONS, ...APPROXIMATIONS };

export const lookup = (id) => ALL[id] || null;

/**
 * Turn a scenario's declaration into something the interface can render.
 *
 * Throws on an unknown id rather than skipping it. A missing disclosure is the
 * exact failure this module exists to prevent, so it must be loud.
 *
 * @param {object} spec
 * @param {string} spec.reality   what is actually going on, in one sentence
 * @param {string[]} [spec.models]
 * @param {string[]} [spec.assumptions]
 * @param {string[]} [spec.approximations]
 * @param {Array<{label:string,value:string,note?:string}>} [spec.numbers]
 *        the values actually in use, and where each came from
 */
export function disclosure({
  reality, models = [], assumptions = [], approximations = [], numbers = [],
} = {}) {
  if (!reality || typeof reality !== 'string') {
    throw new Error('disclosure: every scenario must state the physical reality it is standing in for');
  }
  if (!models.length) {
    throw new Error('disclosure: every scenario must name at least one model');
  }

  const resolve = (ids, expectedKind) => ids.map((id) => {
    const found = lookup(id);
    if (!found) throw new Error(`disclosure: unknown ${expectedKind} "${id}"`);
    if (found.kind !== expectedKind) {
      throw new Error(`disclosure: "${id}" is a ${found.kind}, listed as a ${expectedKind}`);
    }
    return found;
  });

  return {
    reality,
    models: resolve(models, 'model'),
    assumptions: resolve(assumptions, 'assumption'),
    approximations: resolve(approximations, 'approximation'),
    numbers,
    // The one line that must be visible without opening anything.
    summary: summarise(models.length, assumptions.length, approximations.length),
    hasApproximations: approximations.length > 0,
  };
}

function summarise(models, assumptions, approximations) {
  const parts = [`${models} model${models === 1 ? '' : 's'}`];
  if (assumptions) parts.push(`${assumptions} assumption${assumptions === 1 ? '' : 's'}`);
  if (approximations) parts.push(`${approximations} approximation${approximations === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

/* ---------------------------------------------------------- equations --- */

/**
 * Equations, each with the conditions under which it holds and the wider
 * statement it is a special case of.
 *
 * An equation presented without its domain of validity is a magic rule, and a
 * magic rule is the thing a learner has to unlearn later. `becomes` is the
 * promise that the next lesson widens this one.
 */
export const EQUATIONS = {
  'newton-2': {
    id: 'newton-2',
    name: "Newton's second law",
    formula: 'F_net = m · a',
    plain: 'The net force on an object equals its mass times its acceleration. '
      + 'Rearranged: the acceleration is the net force divided by the mass.',
    validWhen: 'The mass is constant and speeds are far below the speed of light.',
    general: 'F_net = dp/dt',
    becomes: 'Force is more fundamentally the rate at which momentum changes. '
      + 'F = ma follows from that whenever the mass is not changing — which is '
      + 'why a rocket, which is throwing away mass, needs the fuller form.',
    misreads: 'It does not say that a force causes motion. It says a *net* force '
      + 'causes a *change* in motion. An object moving at a steady speed in a '
      + 'straight line has no net force on it.',
  },
  'momentum': {
    id: 'momentum',
    name: 'Momentum',
    formula: 'p = m · v',
    plain: 'Momentum is mass times velocity. It points the way the object is '
      + 'moving, and doubling either the mass or the speed doubles it.',
    validWhen: 'Speeds far below the speed of light (the classical case).',
    general: 'p = γ · m · v,  where γ = 1/√(1 − v²/c²)',
    becomes: 'At everyday speeds γ is 1.000000000000 and the two are '
      + 'indistinguishable. At 0.9c the true momentum is more than twice mv.',
    misreads: 'Momentum is not "how hard something hits" on its own — that also '
      + 'depends on how quickly it stops.',
  },
  'impulse': {
    id: 'impulse',
    name: 'Impulse',
    formula: 'J = F · Δt = Δp',
    plain: 'A force acting for a time changes momentum by exactly that amount.',
    validWhen: 'The force is constant over the interval; otherwise integrate it.',
    general: 'J = ∫ F dt',
    becomes: 'For a varying force the impulse is the area under the force–time '
      + 'graph. This is why a longer, gentler stop is safer: the same change in '
      + 'momentum spread over more time needs less force.',
    misreads: '',
  },
  'suvat-v': {
    id: 'suvat-v',
    name: 'Velocity under constant acceleration',
    formula: 'v = u + a · t',
    plain: 'Starting velocity, plus acceleration multiplied by how long it acted.',
    validWhen: 'The acceleration is constant for the whole interval.',
    general: 'v(t) = u + ∫ a dt',
    becomes: 'When acceleration varies — as it does the moment air resistance is '
      + 'switched on — this equation stops applying and the velocity has to be '
      + 'accumulated step by step, which is what the simulation does.',
    misreads: 'Acceleration is not "getting faster". If a is negative while v is '
      + 'positive, the object is slowing down — still accelerating.',
  },
  'suvat-s': {
    id: 'suvat-s',
    name: 'Displacement under constant acceleration',
    formula: 's = u · t + ½ · a · t²',
    plain: 'How far it goes: the distance it would have covered at its starting '
      + 'velocity, plus the extra from speeding up.',
    validWhen: 'The acceleration is constant for the whole interval.',
    general: 's = ∫ v dt',
    becomes: 'Displacement is the area under the velocity–time graph, whatever '
      + 'shape that graph has.',
    misreads: '',
  },
  'suvat-v2': {
    id: 'suvat-v2',
    name: 'Velocity from distance',
    formula: 'v² = u² + 2 · a · s',
    plain: 'Connects speeds and distance without needing the time.',
    validWhen: 'The acceleration is constant over the displacement s.',
    general: 'From the work–energy theorem: ½mv² − ½mu² = F·s',
    becomes: 'It is the work–energy theorem in disguise — multiply through by '
      + 'm/2 and it says the change in kinetic energy equals the work done.',
    misreads: '',
  },
  'weight': {
    id: 'weight',
    name: 'Weight',
    formula: 'W = m · g',
    plain: 'Weight is the force gravity exerts on a mass. It is a force, '
      + 'measured in newtons — not the same thing as mass, which is measured in '
      + 'kilograms and does not change when you move.',
    validWhen: 'g is the local gravitational field strength, treated as uniform.',
    general: 'F = G · M · m / r²',
    becomes: 'g itself is G·M/r² for the body you are standing on. The same 2 kg '
      + 'is 2 kg everywhere; its weight is 19.6 N on Earth and 3.2 N on the Moon.',
    misreads: 'Bathroom scales are marked in kilograms but measure a force. On '
      + 'the Moon the same scales would read about a sixth as much, while your '
      + 'mass would be unchanged.',
  },
  'gravity-field': {
    id: 'gravity-field',
    name: 'Gravitational field strength',
    formula: 'g = G · M / r²',
    plain: 'The acceleration due to gravity at a distance r from the centre of a '
      + 'body of mass M. The falling object\'s own mass is nowhere in it.',
    validWhen: 'The attracting body is spherically symmetric and nothing else is '
      + 'nearby.',
    general: 'Einstein\'s field equations',
    becomes: 'General relativity replaces the force with curvature of spacetime. '
      + 'Newton\'s version is its weak-field limit and is accurate to better than '
      + 'a part in a million everywhere in this app.',
    misreads: 'This is the single most important line in the app. A heavier '
      + 'object is pulled harder — but it also resists acceleration more, by '
      + 'exactly the same factor. The two cancel, so everything falls together.',
  },
  'friction': {
    id: 'friction',
    name: 'Dry friction',
    formula: 'f_static ≤ μs · N     f_kinetic = μk · N',
    plain: 'While at rest, friction takes whatever value is needed to prevent '
      + 'sliding, up to a limit. Once sliding, it has a fixed value.',
    validWhen: 'Dry, unlubricated surfaces, modest speeds and pressures.',
    general: 'Contact mechanics of real asperities',
    becomes: 'Real friction varies with speed, temperature, dwell time and '
      + 'contact pressure. The two-value model captures the behaviour that '
      + 'matters and misses everything else.',
    misreads: 'Static friction is not "μs·N". It is *at most* μs·N. Push a heavy '
      + 'box gently and friction pushes back exactly as hard as you push, no more.',
  },
  'drag': {
    id: 'drag',
    name: 'Air resistance',
    formula: 'F_drag = ½ · ρ · C_d · A · v²',
    plain: 'Drag grows with the square of speed: go twice as fast and the air '
      + 'pushes back four times as hard.',
    validWhen: 'Turbulent flow — the usual case for everyday objects at everyday '
      + 'speeds.',
    general: 'The Navier–Stokes equations',
    becomes: 'Very small or very slow objects are in the linear regime where drag '
      + 'goes as v instead. C_d is itself a function of the flow, not a constant.',
    misreads: '',
  },
  'terminal-velocity': {
    id: 'terminal-velocity',
    name: 'Terminal velocity',
    formula: 'v_t = √( 2·m·g / (ρ · C_d · A) )',
    plain: 'The speed at which drag has grown to exactly balance weight. Net '
      + 'force becomes zero and the object stops accelerating.',
    validWhen: 'Quadratic drag, constant fluid density, falling straight down.',
    general: '',
    becomes: 'Note what it depends on: mass over area. This is why a heavy object '
      + 'really does fall faster than a light one *in air* — not because gravity '
      + 'pulls it harder, but because it takes more drag to balance it.',
    misreads: '',
  },
  'kinetic-energy': {
    id: 'kinetic-energy',
    name: 'Kinetic energy',
    formula: 'KE = ½ · m · v²',
    plain: 'The energy an object has because it is moving. Doubling the speed '
      + 'gives four times the energy.',
    validWhen: 'Classical speeds; translation only (spin is counted separately).',
    general: 'KE = (γ − 1) · m · c²',
    becomes: 'The classical form is the first term of the relativistic one '
      + 'expanded for small v/c.',
    misreads: 'Kinetic energy has no direction. Two objects moving in opposite '
      + 'directions have momenta that cancel and kinetic energies that add.',
  },
  'potential-energy': {
    id: 'potential-energy',
    name: 'Gravitational potential energy',
    formula: 'PE = m · g · h',
    plain: 'The energy stored by lifting a mass through a height.',
    validWhen: 'A uniform field — heights small compared with the planet\'s radius.',
    general: 'PE = − G · M · m / r',
    becomes: 'mgh is the difference between two values of −GMm/r for two nearby '
      + 'r. Only differences in potential energy ever matter, which is why you '
      + 'may put h = 0 wherever is convenient.',
    misreads: '',
  },
  'energy-conservation': {
    id: 'energy-conservation',
    name: 'Conservation of energy',
    formula: 'KE + PE = constant',
    plain: 'With nothing to remove energy, what is lost in height is gained in '
      + 'speed and vice versa.',
    validWhen: 'No friction, no drag, no inelastic collisions — a closed system '
      + 'with only conservative forces.',
    general: 'Total energy of an isolated system is always conserved.',
    becomes: 'Energy is never actually lost. Switch friction on and KE + PE falls '
      + '— that energy has become heat, which this simulation counts but does not '
      + 'follow.',
    misreads: '',
  },
  'momentum-conservation': {
    id: 'momentum-conservation',
    name: 'Conservation of momentum',
    formula: 'Σ p before = Σ p after',
    plain: 'In a collision with no outside forces, the total momentum of the '
      + 'system is the same afterwards as before — whatever else changes.',
    validWhen: 'No net external force acts during the collision.',
    general: 'It follows from the symmetry of physics under translation in space.',
    becomes: 'This holds in every collision, elastic or not. Kinetic energy does '
      + 'not: that is the difference the Collision lab is built to show.',
    misreads: 'Momentum is a vector. Two equal masses approaching each other at '
      + 'the same speed have zero total momentum, and zero is a perfectly good '
      + 'value to conserve.',
  },
  'restitution': {
    id: 'restitution',
    name: 'Coefficient of restitution',
    formula: 'e = (v₂′ − v₁′) / (v₁ − v₂)',
    plain: 'How fast the objects separate compared with how fast they '
      + 'approached. e = 1 is perfectly elastic; e = 0 means they move off '
      + 'together.',
    validWhen: 'A direct (head-on) impact between two bodies.',
    general: '',
    becomes: 'e falls as impact speed rises, and depends on both bodies, not one. '
      + 'A "0.8 ball" is a ball that was 0.8 in one particular test.',
    misreads: '',
  },
  'pendulum-period': {
    id: 'pendulum-period',
    name: 'Period of a simple pendulum',
    formula: 'T ≈ 2π · √(L / g)',
    plain: 'How long one full swing takes. The bob\'s mass is not in it at all — '
      + 'and neither is the amplitude, in this form.',
    validWhen: 'Small swings, where sin θ ≈ θ. Under about 10° the error is below '
      + '0.2%.',
    general: 'T = 4·√(L/g)·K(sin(θ₀/2)), where K is the complete elliptic integral '
      + 'of the first kind',
    becomes: 'The true period does grow with amplitude — 1.7% longer at 30°, 18% '
      + 'longer at 90°. The app computes both so the approximation can be watched '
      + 'breaking down.',
    misreads: 'Mass really is absent, for the same reason it is absent from free '
      + 'fall: a heavier bob is pulled harder and resists more, equally.',
  },
  'torque': {
    id: 'torque',
    name: 'Torque',
    formula: 'τ = r × F = r · F · sin θ',
    plain: 'The turning effect of a force: how hard, multiplied by how far from '
      + 'the pivot, multiplied by how squarely it is applied.',
    validWhen: 'Rigid body, rotation about a fixed axis.',
    general: 'τ = dL/dt',
    becomes: 'Torque is the rate of change of angular momentum, exactly as force '
      + 'is the rate of change of momentum. Every rotational law has a linear twin.',
    misreads: '',
  },
  'newton-2-rotational': {
    id: 'newton-2-rotational',
    name: "Newton's second law for rotation",
    formula: 'τ_net = I · α',
    plain: 'Net torque equals moment of inertia times angular acceleration — the '
      + 'rotational twin of F = ma.',
    validWhen: 'Rigid body, fixed axis, constant moment of inertia.',
    general: 'τ = dL/dt',
    becomes: 'A skater pulling their arms in changes I while spinning, so this '
      + 'form no longer applies and the fuller one is needed.',
    misreads: 'Moment of inertia is not mass. The same mass placed further from '
      + 'the axis resists turning far more — it goes as r².',
  },
  'gear-ratio': {
    id: 'gear-ratio',
    name: 'Gear ratio',
    formula: 'τ_out = τ_in · GR · η      ω_out = ω_in / GR',
    plain: 'A reduction multiplies torque and divides speed by the same factor.',
    validWhen: 'Rigid, ideal gears; η accounts for real losses.',
    general: 'Power out = power in × efficiency',
    becomes: 'Gears cannot create power. Whatever torque you gain, you lose in '
      + 'speed — and a little more besides, to friction.',
    misreads: '',
  },
};

export const equation = (id) => EQUATIONS[id] || null;

/** Every equation in a list, in the order given. Throws on an unknown id. */
export function equations(ids) {
  return ids.map((id) => {
    const found = EQUATIONS[id];
    if (!found) throw new Error(`Unknown equation "${id}"`);
    return found;
  });
}
