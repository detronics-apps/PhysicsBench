import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/**
 * The severity of a warning is not decoration.
 *
 * `banner('danger', …)` fell through an unrecognised-level check to `info` in
 * silence, so the two warnings that say the model has run out — the object has
 * passed a tenth of the speed of light, the Newtonian answer is badly wrong —
 * were rendered as neutral grey notes for as long as they have existed.
 *
 * This is checked by reading the source rather than the DOM because the widget
 * module needs a document and the point being defended is a pairing between two
 * files: every level a caller uses must be a level the renderer honours.
 */

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

const levelsHonoured = () => {
  const source = read('../js/ui/widgets.js');
  const block = source.match(/const BANNER_CLASS = \{([\s\S]*?)\};/)[1];
  return new Set([...block.matchAll(/(\w+)\s*:/g)].map((m) => m[1]));
};

const levelsUsed = (path) =>
  new Set([...read(path).matchAll(/banner\('([a-z]+)'/g)].map((m) => m[1]));

test('every banner level a caller asks for is one the renderer honours', () => {
  const honoured = levelsHonoured();
  for (const path of ['../js/ui/bench.js', '../js/ui/explain.js']) {
    for (const level of levelsUsed(path)) {
      assert.ok(honoured.has(level),
        `${path} asks for banner('${level}'), which falls back to info in silence`);
    }
  }
});

test('the marks and the classes cover the same set of levels', () => {
  const source = read('../js/ui/widgets.js');
  const marks = new Set([...source.match(/const BANNER_MARK = \{([\s\S]*?)\};/)[1]
    .matchAll(/(\w+)\s*:/g)].map((m) => m[1]));
  assert.deepEqual([...marks].sort(), [...levelsHonoured()].sort());
});

test('the severest warnings are actually asked for at the severest level', () => {
  const bench = read('../js/ui/bench.js');
  // The two places the app admits its model has stopped describing anything.
  assert.match(bench, /banner\('danger',\s*\n?\s*'The object has been accelerated past a tenth/);
  assert.match(bench, /banner\('danger', 'At this field strength/);
});

test('sorting puts the severest first, under either name', () => {
  const source = read('../js/ui/widgets.js');
  const order = source.match(/const order = \{([^}]*)\}/)[1];
  assert.match(order, /danger:\s*0/);
  assert.match(order, /error:\s*0/);
});
