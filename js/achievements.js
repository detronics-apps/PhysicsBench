/**
 * Things worth finding, and how the app knows you found them.
 *
 * The problem this solves is real: by the last step the bench has a dozen
 * panels, a hundred controls and a fair number of behaviours nobody would ever
 * stumble into — that an object can be *popped* by sustained force, that a
 * world can be made of water, that the recording rate follows the playback
 * speed. The guide lists them, and a list is something you read once. An
 * achievement is the same information delivered at the moment it means
 * something: you did the thing, and the app tells you what you just did.
 *
 * So these are not rewards for grinding. Each one marks a *discovery*, fires
 * once, and carries a sentence saying what the thing you found is for. That
 * sentence is the whole point; the badge is the excuse to read it.
 *
 * Rules that keep them honest:
 *
 * - **Every one is reachable by using the app**, never by waiting. Nothing is
 *   unlocked by time spent or by opening the app N days running.
 * - **Nothing is hidden behind one.** No feature is gated, no content is
 *   locked; the app is exactly as capable before as after.
 * - **The condition is checked, not claimed.** Each `earn` reads the live
 *   world or state, so it cannot fire for something that did not happen.
 * - **No streaks, no scores, no leaderboard.** There is nobody to compete
 *   with and nothing to lose by not playing.
 *
 * Pure: the detection is here and tested; the rendering is in js/ui/.
 */

/**
 * @typedef {object} Achievement
 * @property {string} id      stable, stored; never reuse one for a new meaning
 * @property {string} name    what you did, in the past tense
 * @property {string} what    the sentence it exists to deliver
 * @property {string} hint    shown while locked — enough to go looking, not a recipe
 * @property {string} group   which part of the app it belongs to
 */

/** How many of the object's own weights count as "a lot" for the g-force badge. */
const HARD_PUSH_G = 5;

export const ACHIEVEMENTS = [
  /* ---------------------------------------------------------- the basics -- */
  {
    id: 'first-push',
    name: 'Made it move',
    what: 'A force on a mass gives an acceleration, and the acceleration lasts exactly '
      + 'as long as the force does. Everything else on this bench is that, repeated.',
    hint: 'Push something, and watch it go.',
    group: 'Getting going',
    earn: ({ main }) => !!main && main.speed > 0.5,
  },
  {
    id: 'heavy-hand',
    name: 'Five g',
    what: `Five times the object's own weight, all at once. Acceleration is what a force `
      + 'does to a mass, so the same push on half the mass is twice the g.',
    hint: 'Push something very hard for its size.',
    group: 'Getting going',
    earn: ({ main, g }) => !!main && g > 0 && main.accelerationMagnitude / g > HARD_PUSH_G,
  },
  {
    id: 'every-level',
    name: 'Read the fine print',
    what: 'Expert adds what each equation is a special case of and what people commonly get '
      + 'wrong about it. The physics is identical at every level — only the amount on '
      + 'screen changes.',
    hint: 'There are three levels above the steps. Try the far one.',
    group: 'Getting going',
    earn: ({ state }) => state.ui.level === 'expert',
  },

  /* --------------------------------------------------------- the physics -- */
  {
    id: 'made-it-float',
    name: 'Floated something',
    what: 'Buoyancy is the weight of the fluid pushed aside. Float or sink is that against '
      + 'the object’s own weight, which is a comparison of two densities and nothing else.',
    hint: 'Make something rise in a fluid instead of falling.',
    group: 'Physics',
    earn: ({ main, forces }) => {
      const b = forces?.find((x) => x.id === 'buoyancy');
      return !!b && !!main && b.magnitude > main.weight && main.weight > 0;
    },
  },
  {
    id: 'terminal-velocity',
    name: 'Fell at a steady speed',
    what: 'Drag grows with speed until it balances the weight, and then nothing changes. '
      + 'That balance is terminal velocity, and it is why a raindrop does not arrive '
      + 'like a bullet.',
    hint: 'Drop something through a fluid and let it stop speeding up.',
    group: 'Physics',
    earn: ({ main, forces }) => {
      const d = forces?.find((x) => x.id === 'drag');
      return !!d && !!main && main.speed > 1
        && main.net.magnitude < 0.02 * Math.max(1e-9, main.weight);
    },
  },
  {
    id: 'into-orbit',
    name: 'Reached orbit',
    what: 'An orbit is falling and missing. Sideways fast enough and the ground curves away '
      + 'as quickly as you drop — no engine required, which is why satellites coast.',
    hint: 'Get something round a world without it coming down.',
    group: 'Physics',
    earn: ({ world, main }) => {
      if (!main || !world?.ground) return false;
      return main.heightAboveGround > 1000 && main.speed > 100;
    },
  },
  {
    id: 'popped-it',
    name: 'Popped one',
    what: 'Held under a thousand times Earth gravity by a contact it cannot escape. Real '
      + 'matter does not survive that and neither does the model, so the bench stops '
      + 'rather than print a number that has stopped meaning anything.',
    hint: 'Put something under a force it cannot possibly survive.',
    group: 'Physics',
    earn: ({ events }) => events.includes('burst'),
  },
  {
    id: 'lost-to-heat',
    name: 'Followed the energy',
    what: 'Friction and drag do not destroy energy — they move it somewhere the bench '
      + 'cannot give back. "Gone to heat" is that account, and the books still balance '
      + 'with it in.',
    hint: 'Let something rub or splash until a tenth of its energy has gone.',
    group: 'Physics',
    earn: ({ totals }) => {
      const gone = (totals?.elsewhere?.heat ?? 0) + (totals?.elsewhere?.impact ?? 0);
      return gone > 10;
    },
  },

  /* ---------------------------------------------------- the hidden depth -- */
  {
    id: 'water-world',
    name: 'Made a lake',
    what: 'A world does not have to be solid. Set it to a liquid and the floor becomes a '
      + 'surface: things fall *into* it, and settle at the fraction of themselves their '
      + 'density says — half under for something half as dense.',
    hint: 'The world you are standing on is made of something. Change it.',
    group: 'Worth finding',
    earn: ({ params }) => !!params.surfaceFluidId && params.surfaceFluidId !== 'solid',
  },
  {
    id: 'built-a-track',
    name: 'Built something',
    what: 'Walls and arcs are drawn straight onto the bench, and everything else obeys them. '
      + 'A track, a funnel, a maze — the physics does not know the difference.',
    hint: 'The playground lets you draw. Put a few pieces down.',
    group: 'Worth finding',
    earn: ({ params }) => (params.walls?.length ?? 0) >= 3,
  },
  {
    id: 'took-the-wheel',
    name: 'Took the controls',
    what: 'Driving here is not a puppet show: the keys apply a force, and that force goes '
      + 'into the same sum as gravity and friction. That is why it feels like steering '
      + 'something with mass.',
    hint: 'Something on the last step can be driven.',
    group: 'Worth finding',
    earn: ({ forces }) => !!forces?.find((x) => x.id === 'control' && x.magnitude > 0),
  },
  {
    id: 'slowed-time',
    name: 'Slowed it down',
    what: 'The playback speed is read as intent: at a tenth speed the bench records every '
      + 'physics step, so the stretch you slowed down for is dense when you scrub back '
      + 'through it.',
    hint: 'Something moved too fast to see. There is a control for that.',
    group: 'Worth finding',
    earn: ({ state }) => state.transport.speed <= 0.25,
  },
  {
    id: 'scrubbed-back',
    name: 'Went back for another look',
    what: 'The drawing, the readouts and the graphs all read one recording, keyed on time — '
      + 'which is why they can never disagree about what happened.',
    hint: 'What happened thirty seconds ago is still there.',
    group: 'Worth finding',
    earn: ({ state }) => state.transport.scrubT !== null,
  },
  {
    id: 'pinned-a-panel',
    name: 'Pinned a panel',
    what: 'One panel open at a time keeps a long sidebar readable. The padlock is the way '
      + 'out of that when you are comparing two things.',
    hint: 'There is a small padlock beside a panel heading.',
    group: 'Worth finding',
    earn: ({ state }) => Object.values(state.ui.locks || {}).some(Boolean),
  },
  {
    id: 'read-the-model',
    name: 'Checked the working',
    what: 'Every scene can tell you which parts of it are real physics and which are a model, '
      + 'an assumption or a simplification. Nothing on this bench asks to be taken on '
      + 'trust.',
    hint: 'Somewhere below the graphs the app admits what it is approximating.',
    group: 'Worth finding',
    earn: ({ opened }) => opened.includes('disclosure'),
  },
  {
    id: 'shared-it',
    name: 'Sent one on',
    what: 'The whole experiment travels in the part of the link after the "#", which browsers '
      + 'never send to a server. No account, no upload, no shortener — the link *is* the '
      + 'experiment.',
    hint: 'An experiment can leave this machine without anything being uploaded.',
    group: 'Worth finding',
    earn: ({ opened }) => opened.includes('share'),
  },
];

export const byId = (id) => ACHIEVEMENTS.find((a) => a.id === id) || null;

/** The groups, in the order they are written. */
export const groups = () => [...new Set(ACHIEVEMENTS.map((a) => a.group))];

/**
 * Which achievements a snapshot has just satisfied that were not already held.
 *
 * Pure, and takes everything it needs rather than reaching for globals — which
 * is what lets the whole set be driven from a test without a browser.
 *
 * @param {object} snap   the live view: `main`, `forces`, `totals`, `world`,
 *                        `params`, `state`, `g`, plus `events` and `opened`,
 *                        which are lists of things that have happened
 * @param {object} held   `{ [id]: isoDate }` of what is already earned
 * @returns {string[]}    ids newly earned, in declaration order
 */
export function newlyEarned(snap, held = {}) {
  const out = [];
  for (const a of ACHIEVEMENTS) {
    if (held[a.id]) continue;
    let got = false;
    try {
      got = !!a.earn({ events: [], opened: [], ...snap });
    } catch {
      // A badge that throws must never take the frame with it. It simply is
      // not earned this time.
      got = false;
    }
    if (got) out.push(a.id);
  }
  return out;
}

/** How far through the set somebody is. */
export const progress = (held = {}) => ({
  earned: ACHIEVEMENTS.filter((a) => held[a.id]).length,
  total: ACHIEVEMENTS.length,
});
