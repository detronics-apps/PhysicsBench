/**
 * The how-to content, and the search that finds it.
 *
 * The target is an app nobody has to ask about. A reader who is stuck has one
 * place to look, and what they type there is what *they* would call the thing
 * — "make it fall", "slow motion", "how heavy" — not what the screen calls it.
 * That gap is what the alias map closes.
 *
 * Everything here is data. Adding a how-to or an FAQ is adding an object to an
 * array, not touching layout code, which is what lets the guide grow at the
 * same rate as the app.
 *
 * Pure, so the matching is tested without a browser. The rendering lives in
 * js/ui/guide.js.
 */

/**
 * App word → the everyday words that mean it.
 *
 * Keyed on the term as the app writes it, because the fold-in below looks for
 * the app's own word inside an entry's text. Keep it growing: every time a
 * reader has to be told what something is called, that is an entry.
 *
 * Two rules, both learned by getting them wrong:
 *
 * - **A key must be a word that only means the app thing.** `drag` was keyed
 *   to "air resistance", and "drag the timeline", "drag on the drawing" and
 *   "drag the slider" all carry the word — so searching "air resistance"
 *   returned seven unrelated entries. The force lives under `fluid` now.
 * - **A key must be a word some entry actually contains**, or it can never
 *   fire. `transport` was the app's internal name for the play bar and appears
 *   nowhere a reader can see, so "slow motion" found nothing at all. A test
 *   fails on any key with no home.
 */
export const SEARCH_ALIASES = {
  push: ['force', 'shove', 'throw', 'launch', 'kick', 'newtons', 'how hard', 'thrust'],
  mass: ['weight', 'heavy', 'how heavy', 'kilograms', 'kg', 'size of it'],
  friction: ['grip', 'slide', 'slippery', 'sticky', 'rough', 'skid', 'brakes', 'stopping'],
  fluid: ['air', 'water', 'honey', 'underwater', 'liquid', 'thick',
    'air resistance', 'wind resistance', 'terminal velocity'],
  'what the world is made of': ['lake', 'sea', 'ocean', 'pool', 'ground', 'floor',
    'surface', 'waterline', 'float on', 'sink into', 'splash'],
  buoyancy: ['float', 'sink', 'floats', 'why things float', 'displacement', 'archimedes'],
  gravity: ['falling', 'fall', 'drop', 'weight', 'planet', 'moon', 'orbit', 'space'],
  world: ['planet', 'moon', 'mars', 'earth', 'gravity', 'where it is'],
  // No `step` key: nearly every entry says "go to step 6", so aliasing it to
  // "page" or "lesson" made those words match half the guide.
  level: ['simple', 'advanced', 'expert', 'detail', 'too much', 'too busy', 'more detail'],
  timeline: ['rewind', 'scrub', 'replay', 'go back', 'history', 'earlier'],
  // Not `speed`: the object has one too, and every second entry mentions it.
  'playback speed': ['play', 'pause', 'slow motion', 'faster', 'slower', 'real time'],
  recording: ['how far back', 'memory', 'accuracy', 'sample rate', 'storage'],
  graph: ['chart', 'plot', 'trace', 'over time', 'curve'],
  walls: ['obstacles', 'ramp', 'platform', 'barrier', 'track', 'maze'],
  cannon: ['shoot', 'fire', 'projectile', 'launcher', 'aim'],
  bounce: ['crash', 'hit', 'impact', 'bouncy', 'restitution', 'collision'],
  examples: ['demo', 'preset', 'sample', 'ready made', 'show me', 'prepared'],
  share: ['link', 'send', 'url', 'give to someone'],
  save: ['keep', 'file', 'local save', 'store it', 'come back to it'],
  print: ['pdf', 'paper', 'hand out', 'worksheet'],
  csv: ['export', 'spreadsheet', 'image', 'download the data', 'get the numbers out'],
  reset: ['start over', 'clear', 'undo everything', 'back to the beginning'],
  keyboard: ['drive', 'arrow keys', 'wasd', 'steer', 'play it'],
  zoom: ['camera', 'follow', 'fit', 'too small', 'off screen', 'lost it'],
  theme: ['dark mode', 'light mode', 'night', 'colours'],
};

/**
 * Fold an entry's everyday phrases in, so a search matches the reader's words.
 *
 * The match runs against this expanded string and never against what is shown,
 * so the aliases are invisible in the interface and still findable.
 */
export function searchText(text) {
  const low = String(text || '').toLowerCase();
  let extra = '';
  for (const [term, words] of Object.entries(SEARCH_ALIASES)) {
    if (low.includes(term)) extra += ` ${words.join(' ')}`;
  }
  return `${text} ${extra}`;
}

/**
 * Every word must appear, not any of them.
 *
 * "fluid water" should narrow to the entries about water in a fluid, not widen
 * to everything mentioning either — which is what OR does, and it is why a
 * search box that gets worse the more you type feels broken.
 */
export function guideMatches(text, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  const hay = searchText(text).toLowerCase();
  return q.split(/\s+/).filter(Boolean).every((word) => hay.includes(word));
}

/** Everything an entry can be found by, as one string. */
export const howtoText = (h) => `${h.title} ${h.category} ${h.steps.join(' ')}`;
export const faqText = (f) => `${f.q} ${f.a}`;
export const featureText = (f) => `${f.name} ${f.where} ${f.what}`;

/* ------------------------------------------------------------- how-tos -- */

/**
 * One entry per thing a reader actually does.
 *
 * Steps are short, imperative, and name the control, so there is nothing to
 * work out. Where a step names a number the app must honour it — the same rule
 * as a prepared experiment's instructions.
 */
export const HOWTOS = [
  {
    id: 'first-run',
    title: 'Make something happen, from a standing start',
    category: 'Getting going',
    steps: [
      'You are on step 1, "Push it", with an object already on the bench.',
      'Open "The push" in the panel on the right and drag "How hard".',
      'Press Play on the bar under the drawing.',
      'Watch the velocity climb while the push lasts, then hold steady.',
    ],
  },
  {
    id: 'load-example',
    title: 'Load an example',
    category: 'Getting going',
    steps: [
      'Click "Examples" at the right-hand end of the step bar.',
      'Each card shows the scene as it will look, with a line on what it shows.',
      'Press "Load this".',
      'Read the note at the bottom of the page: what to try, what to watch, and the point of it.',
      'Nothing is locked — every control still works once it is loaded.',
    ],
  },
  {
    id: 'change-level',
    title: 'Show more, or show less',
    category: 'Getting going',
    steps: [
      'Use the Simple · Advanced · Expert chips at the right of the step bar.',
      'Simple keeps what the object is doing and the formula that says so.',
      'Advanced adds momentum, the energy figures, and the conditions each equation holds under.',
      'Expert adds the recording settings and, in every panel, what each equation '
        + 'is a special case of and what people commonly get wrong about it.',
      'The physics never changes — the level only sets how much is on screen.',
    ],
  },
  {
    id: 'make-it-heavier',
    title: 'Change the mass, or what the object is made of',
    category: 'The object',
    steps: [
      'Open "The object" in the panel on the right.',
      'Pick a shape, then a material — the mass follows from the material and the size.',
      'Or type a mass straight in. "1.5k" and "1500" both mean 1500 kg.',
      'Push it with the same force and watch the acceleration halve as the mass doubles.',
    ],
  },
  {
    id: 'push-harder',
    title: 'Push harder, or for longer',
    category: 'The push',
    steps: [
      'You are on step 1, "Push it".',
      'Open "The push". "How hard" is the force in newtons; "For how long" is the time it lasts.',
      'The slider range follows the object, so the same drag feels the same on a gram and on a tonne.',
      'Press Play. The push stops when its time is up and the object carries on at whatever speed it reached.',
    ],
  },
  {
    id: 'make-it-fall',
    title: 'Make something fall',
    category: 'Gravity',
    steps: [
      'Go to step 3, "Grow it into a planet".',
      'Open "The world it is on" and choose a world — Earth, the Moon, Mars.',
      'Set how high it starts with the placement slider.',
      'Press Play and watch the height fall and the speed climb.',
      'Change the world and drop it again: the same object, a different acceleration.',
    ],
  },
  {
    id: 'friction',
    title: 'Make it slide, or make it grip',
    category: 'Friction',
    steps: [
      'Go to step 4, "Friction". There is a floor now.',
      'Open "The surface" and pick one — ice, wood, rubber.',
      'Push the object along and watch how far it travels before it stops.',
      'The energy it loses does not vanish: at Advanced, "Gone to heat" counts it.',
    ],
  },
  {
    id: 'slow-it-down',
    title: 'Slow something down that is moving too fast to see',
    category: 'Watching it',
    steps: [
      'Use the playback speed control on the bar under the drawing — 0.1× is a tenth of real time.',
      'Slowing down also records finer, so scrubbing back through that stretch shows more.',
      'Or change the fluid to water in "The fluid it moves through", which slows the whole scene down physically.',
    ],
  },
  {
    id: 'water-world',
    title: 'Drop something into water instead of onto the ground',
    category: 'Fluids',
    steps: [
      'Go to step 5, "Fluids and objects".',
      'Open "The fluid it moves through". Leave the fluid as air.',
      'Change "What the world is made of" from solid ground to water.',
      'The floor moves down: three and a half metres of water, with a bed under it.',
      'Set a drop height and press Play. The object falls through the air, hits '
        + 'the water, and settles where its own density puts it.',
      'A ball half as dense as the liquid floats half submerged — try balsa, '
        + 'pine and steel and compare.',
    ],
  },
  {
    id: 'fluids',
    title: 'Move it through air, water or honey',
    category: 'Fluids',
    steps: [
      'Go to step 5, "Fluids and objects".',
      'Open "The fluid it moves through" and choose one.',
      'Watch the drag arrow grow with speed, and the object settle at a terminal speed.',
      'A light object in honey barely moves; the same object in vacuum never slows at all.',
    ],
  },
  {
    id: 'go-back',
    title: 'Go back and look at what already happened',
    category: 'Watching it',
    steps: [
      'Drag the timeline on the bar under the drawing.',
      'The drawing, the readouts and the graphs all move together — they read the same recording.',
      'Press Play to carry on from where the simulation actually is, not from where you scrubbed to.',
    ],
  },
  {
    id: 'camera',
    title: 'Find the object when it has gone off the edge',
    category: 'Watching it',
    steps: [
      'Press Home above the drawing: it centres on the object and keeps your zoom.',
      'Press "Fit everything" in "The drawing" to frame the whole bench and keep re-framing as it moves.',
      'Zoom in and Zoom out change how close you are; Pan drags the view.',
    ],
  },
  {
    id: 'drive',
    title: 'Drive the object yourself',
    category: 'Playground',
    steps: [
      'Go to step 6, "Playground".',
      'Open "Take the controls" and choose how the keys should push it.',
      'Click the drawing once to hand the arrow keys to the object rather than the page.',
      'Hold an arrow key, or W A S D.',
    ],
  },
  {
    id: 'build-track',
    title: 'Draw walls, ramps and obstacles',
    category: 'Playground',
    steps: [
      'Go to step 6, "Playground".',
      'Open "Walls and obstacles" and arm the wall tool.',
      'Drag on the drawing to lay a wall down; the curved tool lays an arc.',
      'Drop an object above it and press Play.',
    ],
  },
  {
    id: 'cannon',
    title: 'Fire something at a target',
    category: 'Playground',
    steps: [
      'Go to step 6, "Playground".',
      'Open "Cannons" and add one.',
      'Set the angle and the speed it leaves at.',
      'Build a wall to aim at, then press Play.',
      'At Advanced, open the cannon\'s own advanced fold to change what it fires.',
    ],
  },
  {
    id: 'bounce',
    title: 'Make things bounce off each other, or not',
    category: 'Playground',
    steps: [
      'Go to step 5 or 6, where there is more than one object.',
      'Open "Collisions" — it is there from Advanced.',
      'Bounciness of 1 keeps all the energy; 0 means they stop dead together.',
      'Either way the total momentum is unchanged through the impact. Watch the '
        + '"Total momentum" tile as they hit.',
    ],
  },
  {
    id: 'achievements',
    title: 'See what there is left to find',
    category: 'Getting going',
    steps: [
      'Open "How to use" at the right-hand end of the step bar.',
      'Scroll to "Things to find" at the bottom.',
      'Anything already found shows what it was; anything not shows a hint.',
      'Nothing is locked behind them and nothing is scored \u2014 they are a way of being '
        + 'told what a thing is for at the moment you do it.',
    ],
  },
  {
    id: 'share',
    title: 'Send someone exactly what is on your screen',
    category: 'Keeping it',
    steps: [
      'Press "Share link" at the bottom of the page.',
      'The whole experiment is packed into the part of the link after the "#", '
        + 'which browsers never send to a server.',
      'Paste it anywhere. Opening it rebuilds this screen.',
    ],
  },
  {
    id: 'save',
    title: 'Keep an experiment and come back to it',
    category: 'Keeping it',
    steps: [
      'Press "Save project" in the header to download it as a file on your own machine.',
      'Press "Load project" to read one back.',
      'Nothing is uploaded anywhere, so the file is the only copy — keep it somewhere you will find it.',
    ],
  },
  {
    id: 'export',
    title: 'Get the numbers or the picture out',
    category: 'Keeping it',
    steps: [
      'CSV at the bottom of the page downloads the measurements as a spreadsheet.',
      'SVG and PNG download the drawing.',
      'Print / PDF makes a sheet — choose "Save as PDF" as the destination in the dialog.',
      'At Advanced, "The drawing" lets you pick what goes on that sheet.',
    ],
  },
];

/* ----------------------------------------------------------------- FAQ -- */

export const FAQS = [
  {
    q: 'Does changing the level change the answer?',
    a: 'No. Every step of the simulation runs at every level, and a control hidden at Simple '
      + 'keeps whatever it was set to. The level decides how much is shown and nothing else.',
  },
  {
    q: 'Why did the panel I was using fold up when I opened another one?',
    a: 'The panels are an accordion — one open at a time — because a dozen open at once buries '
      + 'the one you are in below the fold. A folded panel is still in force; nothing it '
      + 'holds is reset or ignored.',
  },
  {
    q: 'Why does the object sometimes disappear from the drawing?',
    a: 'The view follows the scene, and one thing arcing away pulls it out until everything '
      + 'is a speck. Press Home to centre on the object at the zoom you are already at.',
  },
  {
    q: 'Something went so fast I could not see it. What do I do?',
    a: 'Two ways. Turn the playback speed down on the bar under the drawing, which also '
      + 'records finer so you can scrub back through it. Or change the fluid to water, '
      + 'which slows the scene down physically rather than just visually.',
  },
  {
    q: 'What does the object popping mean?',
    a: 'It has been held under more than a thousand times Earth gravity by a sustained force '
      + '— a contact it cannot get out of, not an impact. Real matter does not survive that, '
      + 'and neither does the model, so it stops rather than showing a number that means nothing.',
  },
  {
    q: 'Is the physics real, or is it approximated?',
    a: 'Both, and the app says which is which. Every panel has "What this simulation is doing", '
      + 'which separates the reality from the model, the assumptions and the approximations — '
      + 'and an approximation that is switched on is flagged rather than buried.',
  },
  {
    q: 'Why does a heavy object fall at the same rate as a light one?',
    a: 'Because the object\'s own mass cancels: the pull is G·m₁·m₂/r², and dividing by m₁ to '
      + 'get the acceleration removes it. The equation panel at step 3 shows that line by line.',
  },
  {
    q: 'How far back can I scrub, and does the recording lose anything?',
    a: 'Five minutes at normal speed by default. What degrades at coarser rates is only '
      + 'fast-reversing quantities like a velocity through a bounce; height, position and the '
      + 'energy totals stay within 0.6% at every rate. At Expert, "What gets recorded" prints '
      + 'the measured error beside each rate and lets you change it.',
  },
  {
    q: 'Does anything I do here leave my browser?',
    a: 'No. There is no account, no analytics and no server. Saving downloads a file to your '
      + 'machine; a share link carries the experiment in the part of the URL after the "#", '
      + 'which browsers never transmit.',
  },
  {
    q: 'I have changed too much. How do I start again?',
    a: 'Reset at the bottom of the page puts everything back to the defaults. It does not touch '
      + 'any project file you have saved.',
  },
  {
    q: 'Why has my floor moved?',
    a: 'Because the world has been set to a liquid rather than to solid ground, in '
      + '"The fluid it moves through". That turns the floor into a *surface*, with three '
      + 'and a half metres of water below it and a bed under that. Things fall into it '
      + 'rather than onto it, and come to rest either at the surface or on the bottom, '
      + 'depending on their density. Set it back to solid ground to put the floor back '
      + 'at the top.',
  },
  {
    q: 'How far under the surface should something float?',
    a: 'Its own density divided by the liquid’s, as a fraction of its volume. Pine '
      + 'at 500 kg/m³ in water at 997 floats half submerged; balsa at 160 floats with '
      + 'a sixth of itself under. That is also why a ship’s waterline moves when it is '
      + 'loaded — nothing about the ship changed except how heavy it is.',
  },
  {
    q: 'Can I use it in dark mode?',
    a: 'Yes. The disc at the right of the header cycles the theme through auto, light and dark. '
      + 'Auto follows whatever your machine is set to. Set it explicitly before screen-recording, '
      + 'so the capture does not depend on the machine it was made on.',
  },
];

/* ---------------------------------------------- the ideas, and the finds -- */

/** The handful of ideas that make the rest of the app obvious. */
export const CONCEPTS = [
  {
    name: 'One bench, six steps',
    what: 'Not six topics. Each step adds something to the same object, and nothing resets — '
      + 'the mass you set in step 1 is still the mass in step 6.',
  },
  {
    name: 'Three levels of detail',
    what: 'Simple, Advanced, Expert change how much is on screen and never what is computed.',
  },
  {
    name: 'The sidebar changes it, the page reports it',
    what: 'Everything on the right is something you set. Everything on the left is the '
      + 'experiment answering back. Nothing in the middle is both.',
  },
  {
    name: 'Reality, model, assumption, approximation',
    what: 'The app keeps those four apart and says which is which, so you can always find out '
      + 'which parts of what you are watching are physics.',
  },
  {
    name: 'One recording, read twice',
    what: 'The drawing and the graphs read the same store, keyed on time — which is why they '
      + 'can never disagree about what happened.',
  },
];

/** The things you would never find from a label. */
export const FEATURES = [
  {
    name: 'The object can pop',
    where: 'Anywhere · the banner above the drawing',
    what: 'Held under more than 1,000 g by a sustained force and it stops, rather than '
      + 'reporting a number that has stopped meaning anything.',
  },
  {
    name: 'Slowing down records finer',
    where: 'The bar under the drawing',
    what: 'The playback speed is read as intent: 0.1× records every physics step, so a '
      + 'stretch you slowed down for is dense on the timeline when you scrub back through it.',
  },
  {
    name: 'The recording trade is yours to set',
    where: 'Expert · "What gets recorded"',
    what: 'A table of each sample rate against how far it understates the sharpest peak — '
      + 'measured, not asserted — and the controls to change it.',
  },
  {
    name: 'Typed numbers accept what you would write',
    where: 'Every number field',
    what: '1500, 1.5k and 1 500 all mean the same thing, and a value copied out of a readout '
      + 'can be pasted straight back in.',
  },
  {
    name: 'Sliders are sized by the subject',
    where: 'The push, the object',
    what: 'The force slider\'s range follows the object\'s mass, so the same drag feels the '
      + 'same on a gram and on a tonne.',
  },
  {
    name: 'Every equation carries its conditions',
    where: 'Advanced · the panels at the bottom',
    what: '"Holds when" sits under the formula, not in a footnote. At Expert each one also '
      + 'names the wider statement it is a special case of.',
  },
  {
    name: 'What this simulation is doing',
    where: 'The bottom of the page',
    what: 'The reality, the model, the assumptions and the approximations, kept apart, each '
      + 'with why it is there and what would happen without it.',
  },
  {
    name: 'Things to find',
    where: 'How to use \u00b7 the bottom of the page',
    what: 'Sixteen of them, each marking something the bench does that you would not find '
      + 'from a label. They fire once, when you do the thing, and carry a sentence saying '
      + 'what you just found.',
  },
  {
    name: 'The world can be made of water',
    where: 'Step 5 · "The fluid it moves through"',
    what: 'Set what the world is made of to a liquid and the floor goes away. Things '
      + 'fall into it rather than onto it, and you can watch buoyancy arrive at the '
      + 'surface instead of starting out already applied.',
  },
  {
    name: 'The drawing takes the keyboard',
    where: 'Step 6 · "Take the controls"',
    what: 'Click the drawing and the arrow keys drive the object instead of scrolling the page. '
      + 'Click away and they belong to the page again.',
  },
  {
    name: 'Draw your own track',
    where: 'Step 6 · "Walls and obstacles"',
    what: 'Arm the wall or arc tool and drag on the drawing. Up to a few dozen pieces, straight '
      + 'and curved.',
  },
  {
    name: 'The share link holds the whole experiment',
    where: 'The bottom of the page',
    what: 'Packed into the fragment after the "#", which browsers never send to a server. No '
      + 'account, no upload, no shortener.',
  },
  {
    name: 'Print what you choose',
    where: 'Advanced · "The drawing"',
    what: 'The sheet can carry the drawing, every input, the measurements, the graphs and the '
      + 'working — a result without its settings is not something anyone can repeat.',
  },
  {
    name: 'Examples explain themselves',
    where: 'The step bar · "Examples"',
    what: 'Eleven scenes already set up, each with what to try, what to watch and the point of '
      + 'it. Every number in those notes is pinned by a test.',
  },
];

/* -------------------------------------------------------- the first run -- */

/**
 * The app's story, in the fewest starting actions that reach a real result.
 *
 * Each one is something to *do* and deep-links to where it happens, because
 * "start here" that is not one click away is a paragraph, not a starting point.
 */
export const WELCOME = [
  {
    title: 'Watch something happen',
    what: 'There is already an object on the bench. Push it and see what that does to its speed.',
    go: { page: 'bench', stage: 'push' },
    label: 'Take me to the push',
  },
  {
    title: 'Try one that is already set up',
    what: 'Eleven examples — a marble run, a rocket to orbit, a ball dropped into a lake — '
      + 'each with a note on what to look for.',
    go: { page: 'examples' },
    label: 'Show me the shelf',
  },
  {
    title: 'Choose how much you want to see',
    what: 'Simple keeps it to what is moving. Expert shows the model itself. You can change it '
      + 'at any moment, and it never changes the answer.',
    go: { page: 'bench' },
    label: 'Back to the bench',
  },
  {
    title: 'Everything stays on your machine',
    what: 'No account and no upload. Save an experiment as a file, or send it as a link that '
      + 'carries the whole thing in the URL.',
    go: { page: 'guide' },
    label: 'Open the guide',
  },
];

/** The categories the how-tos fall into, in the order they are written. */
export const categories = () => [...new Set(HOWTOS.map((h) => h.category))];

/* ----------------------------------------------- what the footer holds -- */

/**
 * The three panels every Detronics app carries in its footer.
 *
 * Plain data, like everything else here, and deliberately short: each one
 * answers the question a reader actually has rather than reciting a policy.
 * Nothing in them is invented — the privacy text is the architecture stated
 * plainly, and the licence is the licence.
 */
export const WHATS_NEW = {
  title: "What's new",
  version: '1.7.0',
  body: [
    ['Things to find',
      'Sixteen of them, each marking something the bench does that you would never find from '
      + 'a label — that a world can be made of water, that slowing the playback records '
      + 'finer, that an object can be crushed. They fire once, when you do the thing, and say '
      + 'what you just found. Nothing is locked behind them and nothing is scored. The full '
      + 'list is at the bottom of this page.'],
    ['Six steps, not seven',
      '"A mass" has gone. It was a screen with one object on it and nothing you could do to '
      + 'it, and the only honest thing it taught was that nothing happens until something '
      + 'pushes — which is what the push step opens by saying. The bench starts where you '
      + 'can act on it.'],
    ['Two weights, two shapes',
      'The densities example is now four objects: a sphere and a flat plate at each of two '
      + 'weights, all four displacing exactly the same volume. Within a pair only the shape '
      + 'differs, across pairs only the density — so the pairs rise or sink together, and '
      + 'all the shape decides is how long it takes.'],
    ['A lake has a bed',
      'A world made of liquid is three and a half metres of water with ground under it, '
      + 'rather than an ocean. A stone used to sink out of the scene still speeding up; now '
      + 'it reaches a steady speed and lands, all of it on one screen.'],
    ['Examples',
      '"Prepared experiments" is now just Examples.'],
  ],
};

export const LICENCE = {
  title: 'Licence & terms',
  body: [
    ['The code', 'MIT. Use it, change it, ship it, teach with it. The licence text is in the '
      + 'repository, and it is the whole of the legal position on the software.'],
    ['What it does not promise',
      'This is a teaching bench, not an engineering tool. The physics is real and the '
      + 'arithmetic is tested, but the app tells you plainly where it is approximating — '
      + 'every panel carries "What this simulation is doing", which separates the reality '
      + 'from the model, the assumptions and the approximations. Do not size a real part '
      + 'from it without checking the figure against a source you trust.'],
    ['Which numbers are indicative',
      'Friction coefficients and high-Reynolds drag coefficients are typical textbook '
      + 'values and are labelled as such: published figures for the same pair of materials '
      + 'differ by more than a factor of two with finish, cleanliness and contact pressure. '
      + 'Constants, planetary masses and radii are the CODATA and IAU/NASA figures.'],
  ],
};

export const IMPRINT = {
  title: 'Imprint & privacy',
  body: [
    ['Who made it', 'Detronics — detronics.co.za. Built as a teaching tool and kept free.'],
    ['What leaves your browser',
      'Nothing. There is no server, no account, no analytics, no cookies, and no fonts or '
      + 'scripts from anywhere else. The page you are reading was the last thing that '
      + 'crossed the network.'],
    ['Where your work is kept',
      'In this browser, on this device, in local storage — which is functional storage for '
      + 'your own work rather than anything that tracks you. "Save project" downloads a file '
      + 'to your machine. A share link carries the whole experiment in the part of the URL '
      + 'after the "#", which browsers never transmit to a server.'],
    ['Getting rid of it',
      'Clearing this site’s data in your browser removes everything the app has kept. '
      + 'There is nowhere else to ask, because there is nowhere else it went.'],
  ],
};
