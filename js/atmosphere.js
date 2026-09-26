/**
 * Where you are, on the way up.
 *
 * A rocket climbing four hundred kilometres passes through five named regions
 * and a scattering of landmarks, and a readout that says "412,000 m" tells you
 * none of it. This turns a height into the thing a reader can picture: which
 * layer, how far it runs, and one fact that makes the number mean something.
 *
 * The boundaries are the conventional ones and they are *not* sharp — the
 * tropopause runs from about 8 km over the poles to 18 km over the equator,
 * and the figures here are the mid-latitude averages everybody quotes. The
 * Kármán line at 100 km is a definition rather than a measurement: nothing
 * changes as you cross it except which paperwork applies.
 *
 * Pure, so the boundaries and the landmarks can be checked without a browser.
 */

/**
 * The five layers, bottom to top, each `[from, to)` in metres.
 *
 * `to` on the last one is where the exosphere is usually said to fade into
 * space; there is no edge, which is the point the fact makes.
 */
export const LAYERS = [
  {
    id: 'troposphere',
    name: 'Troposphere',
    from: 0,
    to: 12000,
    fact: 'All the weather, and three quarters of the atmosphere by mass. It gets colder '
      + 'the higher you go — about 6.5 °C per kilometre — which is why mountain tops have '
      + 'snow on them in summer.',
  },
  {
    id: 'stratosphere',
    name: 'Stratosphere',
    from: 12000,
    to: 50000,
    fact: 'Where the ozone is, and it gets *warmer* with height because that ozone is '
      + 'absorbing ultraviolet. Airliners cruise at the very bottom of it, in the calm '
      + 'above the weather.',
  },
  {
    id: 'mesosphere',
    name: 'Mesosphere',
    from: 50000,
    to: 85000,
    fact: 'The coldest place on Earth, around −90 °C at the top, and where almost every '
      + 'meteor burns up. Too thin to fly in and too thick to orbit in — which is why '
      + 'almost nothing has ever been there.',
  },
  {
    id: 'thermosphere',
    name: 'Thermosphere',
    from: 85000,
    to: 600000,
    fact: 'Thousands of degrees, and it would feel freezing: the particles are ferociously '
      + 'fast but there are so few of them that they carry almost no heat. The aurora '
      + 'happens here, and so does the ISS.',
  },
  {
    id: 'exosphere',
    name: 'Exosphere',
    from: 600000,
    to: 10000000,
    fact: 'Atoms so far apart they can travel hundreds of kilometres without meeting one '
      + 'another, and many simply leave. There is no top edge — the atmosphere does not '
      + 'end, it thins out until nobody bothers counting.',
  },
];

/**
 * Things at a known height, to pass on the way.
 *
 * Every one is a real altitude rather than a round number chosen to look neat,
 * because the whole value of a landmark is that it is somewhere you have heard
 * of.
 */
export const LANDMARKS = [
  { at: 8849, name: 'The summit of Everest' },
  { at: 11000, name: 'An airliner at cruise' },
  { at: 18000, name: 'Armstrong limit — above this, water boils at body temperature' },
  { at: 25000, name: 'The highest clouds: nacreous, over the poles in winter' },
  { at: 34668, name: 'The highest a balloon has carried a person' },
  { at: 82300, name: 'Noctilucent clouds — the highest clouds there are' },
  { at: 100000, name: 'The Kármán line, the conventional edge of space' },
  { at: 408000, name: 'The International Space Station' },
  { at: 550000, name: 'Starlink' },
  { at: 35786000, name: 'Geostationary orbit' },
];

/** Where the ISS flies, in metres. The example draws it, so it lives here. */
export const ISS_ALTITUDE = 408000;

/** Which layer a height is in. Below sea level counts as the bottom one. */
export function layerAt(height) {
  const y = Number.isFinite(height) ? height : 0;
  for (const layer of LAYERS) if (y < layer.to) return layer;
  return LAYERS[LAYERS.length - 1];
}

/**
 * The most recent landmark at or below a height, if there is one.
 *
 * "Most recent" rather than "nearest", because the useful sentence on the way
 * up is what you have just passed rather than what you are closest to.
 */
export function passedLandmark(height) {
  const y = Number.isFinite(height) ? height : 0;
  let out = null;
  for (const mark of LANDMARKS) if (y >= mark.at) out = mark;
  return out;
}

/** How far through its layer a height is, 0 to 1 — for drawing a bar. */
export function throughLayer(height) {
  const layer = layerAt(height);
  const span = layer.to - layer.from;
  if (!(span > 0)) return 1;
  return Math.min(1, Math.max(0, ((height ?? 0) - layer.from) / span));
}
