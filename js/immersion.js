/**
 * How much of a body is under a surface, and what that is worth.
 *
 * Until now every fluid on this bench filled the whole scene, so a body was
 * either in it or the scene had none. A world made of water has a *surface*,
 * and the interesting part of floating happens exactly at it: a ball settles
 * with some fraction of itself under the line, and which fraction depends on
 * its density. A model that switches the whole body from air to water when its
 * centre crosses is not a small simplification of that — it has no equilibrium
 * at all, so a floating ball oscillates about the waterline for ever.
 *
 * Two functions, and the second exists only so it cannot disagree with the
 * first. The buoyant force reads `submergedFraction`; the potential energy
 * reads `displacedColumn`, which integrates the same function. If they were
 * written separately the energy books would drift the moment anything floated
 * — in an app whose central claim is that the books balance.
 */

/**
 * The fraction of a body below `surfaceY`, from 0 to 1.
 *
 * Exact for a sphere, where the submerged part is a spherical cap and the
 * closed form is short. Everything else is taken as its bounding prism, which
 * makes the fraction linear in depth. That is exact for a box, close for a
 * capsule or a car, and wrong by a few per cent at half-submerged for a cone —
 * declared as an approximation rather than left to be discovered.
 *
 * @param {object} body   needs `shapeId`, `support` (centre to underside) and
 *                        `height`; `radius` is used for a sphere
 * @param {number} centreY where the body's centre is
 * @param {number} surfaceY where the fluid's surface is
 */
export function submergedFraction(body, centreY, surfaceY) {
  const bottom = centreY - (body.support ?? 0);
  const height = body.height ?? (body.support ?? 0) * 2;

  // Clear of it either way, and no division to worry about.
  if (surfaceY <= bottom) return 0;
  if (height <= 0) return 1;
  if (surfaceY >= bottom + height) return 1;

  const depth = surfaceY - bottom;

  if (body.shapeId === 'sphere') {
    /*
     * A spherical cap of depth d on a sphere of radius r has volume
     * π·d²·(3r − d)/3, and the whole sphere is 4πr³/3 — so the ratio is
     * d²(3r − d) / 4r³ with the π and the thirds cancelling.
     */
    const r = body.radius ?? height / 2;
    if (!(r > 0)) return 1;
    return Math.min(1, Math.max(0, (depth * depth * (3 * r - depth)) / (4 * r * r * r)));
  }

  return Math.min(1, Math.max(0, depth / height));
}

/** Slices across the band where a body is partly in and partly out. */
const SLICES = 64;

/**
 * ∫ ρ(y)·f(y) dy from `fromY` to `toY`, where f is the submerged fraction.
 *
 * This is the density a body's *displacement* has averaged over a rise — the
 * quantity `potentialEnergy` needs, and the reason it needs it is that the
 * buoyant force on something crossing a waterline is not constant, so the
 * energy it takes to lift it is not force × distance.
 *
 * Analytic where the body is wholly in one fluid, which is almost everywhere.
 * Across the band it is Simpson's rule over the same `submergedFraction` the
 * force uses — numerical, but numerical against the identical function, which
 * is what keeps the two from ever telling different stories.
 *
 * Returns the integral, so a caller multiplies by g and the volume.
 */
export function displacedColumn(body, fromY, toY, surfaceY, below, above) {
  if (toY === fromY) return 0;
  // Integrating downward is the negative of integrating upward, and doing it
  // this way means the caller never has to know which way the body moved.
  if (toY < fromY) return -displacedColumn(body, toY, fromY, surfaceY, below, above);

  const height = body.height ?? (body.support ?? 0) * 2;
  const support = body.support ?? 0;
  // The centre heights between which the body is neither wholly in nor wholly
  // out: it starts entering when its top reaches the surface from below.
  const bandLow = surfaceY - height + support;
  const bandHigh = surfaceY + support;

  const wholly = (a, b, density) => density * (b - a);

  let total = 0;
  let y = fromY;

  if (y < Math.min(bandLow, toY)) {
    const end = Math.min(bandLow, toY);
    total += wholly(y, end, below);
    y = end;
  }

  if (y < Math.min(bandHigh, toY)) {
    const end = Math.min(bandHigh, toY);
    /*
     * Simpson's rule needs an even number of intervals. The integrand is a
     * cubic in y for a sphere and linear for everything else, and Simpson is
     * exact for both — so this is not an approximation of the fraction, only
     * of nothing at all.
     */
    const n = SLICES;
    const h = (end - y) / n;
    const at = (yy) => {
      const f = submergedFraction(body, yy, surfaceY);
      return below * f + above * (1 - f);
    };
    let sum = at(y) + at(end);
    for (let i = 1; i < n; i += 1) sum += at(y + i * h) * (i % 2 ? 4 : 2);
    total += (h / 3) * sum;
    y = end;
  }

  if (y < toY) total += wholly(y, toY, above);

  return total;
}
