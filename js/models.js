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
    'buoyancy', 'model', 'Archimedes\' principle',
    'A body immersed in a fluid is pushed up with a force equal to the weight '
      + 'of the fluid it displaces: F = ρ_fluid · V · g.',
    'It is the whole of floating and sinking in one line, and it explains why '
      + 'the answer depends on the volume of the object and not at all on what '
      + 'the object is made of.',
    'A partly submerged body displaces only the volume actually under the '
      + 'surface, which is what makes a boat settle at a particular waterline '
      + 'instead of either sinking or leaping out. A compressible body — a '
      + 'balloon rising through air — expands as the pressure falls, so its '
      + 'displaced volume grows with height.',
    'The pressure in a fluid increases with depth, so the fluid pushes harder on '
      + 'the bottom of a submerged object than on its top, and the difference is '
      + 'an upward force.',
  ),
  entry(
    'segment-surfaces', 'model', 'Walls as straight segments',
    'Every drawn obstacle is a straight line with two ends, and a body meeting '
      + 'one gets the same normal force, friction and settling as it would from '
      + 'the ground.',
    'One contact routine for every surface means a ball dropped on the floor and '
      + 'the same ball dropped on a wall drawn along the floor bounce to the same '
      + 'height. Two routines would eventually disagree.',
    'A real surface is curved, has thickness, and deflects under load. A thin '
      + 'segment can also be passed through entirely by anything moving fast '
      + 'enough to cross it within one time step.',
    'Contact between solids is a distributed pressure over a small deformed '
      + 'area, not a point touching a line.',
  ),
  entry(
    'pointer-thrust', 'model', 'A thruster aimed with the pointer',
    'Holding the button applies a steady force along the line from the object to '
      + 'the pointer, of a size set by the strength control and the object\'s '
      + 'mass — and nothing at all when the button is not held.',
    'It keeps the object under the same F = ma as everything else, and it makes '
      + 'the force something you aim rather than something that depends on where '
      + 'you left the cursor. Setting the position directly would give the object '
      + 'infinite acceleration and no momentum history, and every arrow around it '
      + 'would then be describing a motion that force had no part in.',
    'A real thruster carries fuel, so its mass falls as it fires and F = ma stops '
      + 'being the whole story — F = dp/dt is. It also produces torque unless it '
      + 'is aimed exactly through the centre of mass, which this model cannot '
      + 'represent because it does not model rotation.',
    'You cannot move an object without applying a force to it, and the force '
      + 'decides the acceleration, not the position.',
  ),
  entry(
    'rolling-resistance', 'model', 'Rolling resistance',
    'A body that rolls meets F = C_rr·N instead of μ·N, with C_rr one to three '
      + 'orders of magnitude smaller than the sliding coefficient.',
    'It is a different mechanism, not a smaller version of the same one. Sliding '
      + 'friction is asperities being sheared off; rolling resistance is the '
      + 'ball and the surface flexing under the contact and not giving all of '
      + 'the energy back. Treating a wheel as a low-friction slider would get '
      + 'the number roughly right and the reason entirely wrong.',
    'C_rr depends far more on how soft and how large the rolling body is than on '
      + 'which two materials are named — a bicycle tyre at 100 psi and the same '
      + 'tyre at 30 psi differ by more than any two entries in this app\'s list. '
      + 'Here it is quoted as a property of the surface pair, which is a '
      + 'simplification. A real rolling body also stores part of its kinetic '
      + 'energy as rotation, which this app does not model at all: a ball and a '
      + 'block released together on a ramp would not in fact arrive together.',
    'Rolling contact loses energy to hysteresis in the deforming materials, not '
      + 'to surfaces sliding across each other.',
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
    'fully-immersed', 'assumption', 'The object is completely surrounded by fluid',
    'Buoyancy is computed from the object\'s whole volume, whether it is deep '
      + 'in the fluid or not, and there is no free surface for it to float at.',
    'It keeps buoyancy to one clean statement — up by the weight of the volume '
      + 'displaced — instead of a partial-immersion calculation that depends on '
      + 'the shape of the object at the waterline.',
    'A floating object would rise until part of it broke the surface, then '
      + 'settle where the submerged part displaced exactly its own weight. Here '
      + 'it simply keeps rising, which is right for a balloon in air and wrong '
      + 'for a boat.',
    'A partly submerged body displaces only the fluid actually beneath the '
      + 'surface.',
  ),
  entry(
    'deep-space', 'assumption', 'Nothing else is out here',
    'In space the simulation has no gravitational field and no ground: the only '
      + 'forces are the ones you add.',
    'It is the cleanest way to see what a force does on its own, with nothing '
      + 'competing. Every effect you then see is something you put there.',
    'Real space has gravity everywhere — an object near the Earth is in free '
      + 'fall, not free of gravity, which is exactly why astronauts float. There '
      + 'is also a thin gas, sunlight pressure and the pull of everything else in '
      + 'the universe.',
    'Weightlessness is what falling freely feels like, not the absence of '
      + 'gravity.',
  ),
  entry(
    'drawn-orientation', 'assumption', 'The angle you see is a drawing, not a state',
    'Objects are drawn lying along the surface they rest on and pointing the way '
      + 'they are going, but that angle is decided by the renderer and has no '
      + 'dynamics behind it.',
    'A car drawn level on a twenty-degree ramp is a picture of a car embedded in '
      + 'a hillside, and a spaceship drawn nose-right while travelling left is a '
      + 'picture of one flying backwards. Neither is a simplification worth '
      + 'defending, and correcting the drawing costs nothing.',
    'A real object has a moment of inertia and can be spun up by an off-centre '
      + 'force. It can tumble, it can land on a corner and topple, and part of '
      + 'its kinetic energy can be stored in that spin. None of that is here — '
      + 'nothing on this bench has angular momentum, and the angle shown is a '
      + 'consequence rather than a cause.',
    'Orientation is a degree of freedom with its own energy, momentum and '
      + 'equations of motion.',
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
    'mean-restitution', 'approximation', 'Bounciness from the geometric mean',
    'Each material carries how bouncy it is against something hard, and a '
      + 'collision between two of them uses √(e₁·e₂).',
    'The coefficient of restitution belongs to the pair, not to either object, '
      + 'and there is no table of every pairing. The mean gets the important '
      + 'behaviour right: anything paired with modelling clay is dead, because a '
      + 'near-zero factor dominates the product however lively the other side '
      + 'is — which is how a superball dropped into putty actually behaves.',
    'A measured value for a specific pair can differ from the mean by a good '
      + 'deal. Restitution also falls as the impact gets faster, so the same '
      + 'ball is measurably less bouncy thrown hard than dropped, and it varies '
      + 'with shape and temperature. These are low-speed, room-temperature '
      + 'figures for a single value that is really a whole curve.',
    'How much of an impact is returned depends on how the two bodies deform and '
      + 'how much of that deformation is elastic.',
  ),
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
    misreads: 'It does not say that a force causes motion. It says that a net force '
      + 'causes a change in motion, and neither word is decoration. An object moving at a steady speed in a '
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
    misreads: 'Static friction is not "μs·N". It is at most μs·N, and usually less. Push a heavy '
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
      + 'really does fall faster than a light one in air — not because gravity '
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
  'density': {
    id: 'density',
    name: 'Density',
    formula: 'ρ = m / V',
    plain: 'Density is mass divided by volume — how much stuff is packed into '
      + 'how much room. It is the first quantity here that is a ratio rather '
      + 'than a reading, and almost everything later turns on it.',
    validWhen: 'The object is uniform, or you are happy with its average.',
    general: 'ρ(x) = dm/dV',
    becomes: 'Real objects are not uniform. A ship is steel and air, and its '
      + 'average density is what decides whether it floats — which is why the '
      + 'question is never "what is it made of" but "how much room does all of '
      + 'it take up".',
    misreads: 'Dense does not mean heavy. A tonne of feathers and a tonne of '
      + 'lead weigh the same; the feathers just need a much bigger room.',
  },
  'pressure': {
    id: 'pressure',
    name: 'Pressure',
    formula: 'P = F / A',
    plain: 'Pressure is the force pressing on a surface divided by the area it '
      + 'is spread over. The same force through a smaller area is a larger '
      + 'pressure — which is the whole of why a drawing pin works.',
    validWhen: 'The force is perpendicular to the surface and spread evenly '
      + 'over it.',
    general: 'P = dF⊥/dA',
    becomes: 'Where the load is not even — a wheel on soft ground, a foot on '
      + 'sand — the pressure varies across the contact and the average hides '
      + 'the part that matters.',
    misreads: 'Pressure is not what decides sliding friction. Spreading the same '
      + 'weight over twice the area halves the pressure and leaves the friction '
      + 'exactly where it was, which is the surprising result step five is about.',
  },
  'buoyancy': {
    id: 'buoyancy',
    name: "Archimedes' principle",
    formula: 'F_b = ρ_fluid · V · g',
    plain: 'The upward push on something in a fluid equals the weight of the '
      + 'fluid it has shoved out of the way. Not some of it — exactly it.',
    validWhen: 'The fluid is at rest and its density is the same all through.',
    general: 'F_b = ∮ P dA, the pressure on the surface added up',
    becomes: 'It comes from pressure rising with depth: the bottom of an object '
      + 'is pushed up harder than the top is pushed down, and the difference is '
      + 'the weight of the fluid displaced. In an atmosphere that thins with '
      + 'height the density is not constant and the sum has to be done properly.',
    misreads: 'It has nothing to do with what the object is made of, only with '
      + 'how much room it takes up and what the fluid weighs.',
  },
  'rolling-resistance': {
    id: 'rolling-resistance',
    name: 'Rolling resistance',
    formula: 'f_rolling = C_rr · N',
    plain: 'What resists something that rolls rather than slides. Same shape as '
      + 'dry friction and a different mechanism — and one to three orders of '
      + 'magnitude weaker, which is why wheels were worth inventing.',
    validWhen: 'The wheel is rolling without slipping and is not sinking in.',
    general: 'Set by how much the wheel and surface deform under the load.',
    becomes: 'It comes from the contact flexing and springing back imperfectly, '
      + 'not from surfaces being torn across each other — which is why a harder '
      + 'tyre rolls further and a softer one grips better.',
    misreads: 'A rolling object is not held back by μ. Sliding friction and '
      + 'rolling resistance are different things that happen to share a form.',
  },
  'reynolds': {
    id: 'reynolds',
    name: 'Reynolds number',
    formula: 'Re = ρ · v · D / μ',
    plain: 'How much a flow is dominated by inertia rather than by stickiness. '
      + 'It is a pure number, and it is what decides which drag law applies.',
    validWhen: 'Always — it is a ratio, not a model. What it predicts about drag '
      + 'is the approximation.',
    general: 'Re = inertial forces / viscous forces',
    becomes: 'Below about one, drag goes as the speed; above a few thousand it '
      + 'goes as the speed squared. Nothing about the object changes between '
      + 'those — the fluid does.',
    misreads: 'A high Reynolds number does not mean fast. A bacterium in water '
      + 'and a person in honey are both at low Re for entirely different reasons.',
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
/**
 * The equations that fit in a triangle, and what the triangle is telling you.
 *
 * A triangle only works for a relationship of the form A = B × C — cover the
 * one you want and the other two show you how to get it. That is most of the
 * equations a reader meets early and none of the ones with a square in them, so
 * this is a map rather than a field on every entry: an equation that has no
 * triangle is not missing anything, it simply is not that shape.
 *
 * `top` is A; `left` and `right` are B and C, which multiply. `means` is the
 * part worth more than the picture — what the relationship actually does when
 * you change one of them, which is the question the triangle exists to answer
 * and the one it cannot answer by itself.
 */
export const TRIANGLES = {
  'density': {
    top: { symbol: 'm', name: 'Mass', unit: 'kg' },
    left: { symbol: 'ρ', name: 'Density', unit: 'kg/m³' },
    right: { symbol: 'V', name: 'Volume', unit: 'm³' },
    means: [
      'Cover the one you want. Cover ρ and you are left with m over V.',
      'For the same volume, twice the density is twice the mass.',
      'For the same mass, twice the volume is half the density — which is what '
      + 'makes a thing float that would otherwise sink.',
    ],
  },
  'newton-2': {
    top: { symbol: 'F', name: 'Net force', unit: 'N' },
    left: { symbol: 'm', name: 'Mass', unit: 'kg' },
    right: { symbol: 'a', name: 'Acceleration', unit: 'm/s²' },
    means: [
      'For the same force, twice the mass gets half the acceleration.',
      'To accelerate twice the mass the same way, you need twice the force.',
      'No net force means no acceleration — not no motion. Something already '
      + 'moving keeps going.',
    ],
  },
  'momentum': {
    top: { symbol: 'p', name: 'Momentum', unit: 'kg·m/s' },
    left: { symbol: 'm', name: 'Mass', unit: 'kg' },
    right: { symbol: 'v', name: 'Velocity', unit: 'm/s' },
    means: [
      'Doubling either the mass or the speed doubles the momentum.',
      'A heavy thing moving slowly can carry the same momentum as a light thing '
      + 'moving fast — which is why both are hard to stop.',
    ],
  },
  'impulse': {
    top: { symbol: 'J', name: 'Impulse', unit: 'N·s' },
    left: { symbol: 'F', name: 'Force', unit: 'N' },
    right: { symbol: 't', name: 'Time', unit: 's' },
    means: [
      'The same change in momentum can come from a big force briefly or a small '
      + 'force for longer.',
      'Stopping over a longer time needs less force — which is what a crumple '
      + 'zone, an airbag and bending your knees all do.',
    ],
  },
  'weight': {
    top: { symbol: 'W', name: 'Weight', unit: 'N' },
    left: { symbol: 'm', name: 'Mass', unit: 'kg' },
    right: { symbol: 'g', name: 'Field strength', unit: 'N/kg' },
    means: [
      'Mass does not change when you move; weight does, because g does.',
      'On the Moon g is about a sixth of Earth\'s, so the same mass weighs a '
      + 'sixth as much — and is exactly as hard to accelerate sideways.',
    ],
  },
  'friction': {
    top: { symbol: 'f', name: 'Friction', unit: 'N' },
    left: { symbol: 'μ', name: 'Coefficient', unit: 'none' },
    right: { symbol: 'N', name: 'Normal force', unit: 'N' },
    means: [
      'Press twice as hard and you get twice the grip.',
      'The area of contact is not in this equation at all. A wider block does '
      + 'not grip better, which is the result nobody believes until they see it.',
      'For static friction this is a ceiling rather than a value: friction '
      + 'supplies whatever is needed up to μs·N and then gives way.',
    ],
  },
  'rolling-resistance': {
    top: { symbol: 'f', name: 'Rolling drag', unit: 'N' },
    left: { symbol: 'C', name: 'Coefficient', unit: 'none' },
    right: { symbol: 'N', name: 'Normal force', unit: 'N' },
    means: [
      'Same shape as dry friction, and a hundred times smaller a coefficient.',
      'This is why a ball crosses the bench and a box stops dead — not because '
      + 'the ball is slippier, but because rolling is a different mechanism.',
    ],
  },
  'pressure': {
    top: { symbol: 'F', name: 'Force', unit: 'N' },
    left: { symbol: 'P', name: 'Pressure', unit: 'Pa' },
    right: { symbol: 'A', name: 'Area', unit: 'm²' },
    means: [
      'Cover P and you are left with F over A.',
      'For a constant force, as the area increases the pressure falls — a '
      + 'snowshoe and a drawing pin are the same force and opposite areas.',
      'And note what it does not do: halving the pressure under a block '
      + 'leaves its friction exactly where it was.',
    ],
  },
};

/** The triangle for an equation, or `null` if it is not that shape. */
export const triangleFor = (id) => TRIANGLES[id] || null;

export function equations(ids) {
  return ids.map((id) => {
    const found = EQUATIONS[id];
    if (!found) throw new Error(`Unknown equation "${id}"`);
    return found;
  });
}
