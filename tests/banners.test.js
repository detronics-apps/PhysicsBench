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

/**
 * A panel's `open` option is where it starts, not where it is held.
 *
 * It used to win over the remembered state on every render, so a panel a caller
 * wanted closed by default could never be kept open: the first click on
 * anything inside it re-rendered the sidebar and folded it away again, with the
 * reader's own choice sitting in the store being ignored. "The drawing" holds
 * the zoom, pan and print controls, which are exactly the things you click
 * several times in a row.
 *
 * Checked by reading the source, because the widget module needs a document and
 * what is being defended is a pairing between two files: `section` must be able
 * to tell "not recorded" from "recorded as closed", which it only can if the
 * store's getter does not fill in a default of its own.
 */
test('a remembered panel state wins over the caller default', () => {
  const widgets = read('../js/ui/widgets.js');
  const block = widgets.match(/export function section\([\s\S]*?\n\}/)[0];

  // The recorded value is consulted, and only stands aside when it is absent.
  assert.match(block, /const remembered = sectionStore\.get\(id\)/);
  assert.match(block, /remembered === undefined/);
  // And `open` is only reached through that absent branch.
  assert.ok(!/open === null \? sectionStore\.get\(id\) : open/.test(block),
    'the caller default still overrides the remembered state');
});

test('the section store reports "not set" rather than guessing', () => {
  const main = read('../js/main.js');
  const getter = main.match(/get: \(id\) => state\.ui\.sections\[[^\]]*\][^,\n]*/)[0];
  assert.ok(!getter.includes('??'),
    'the getter fills in a default, so `section` cannot tell unset from closed');
});

/**
 * The printed sheet starts at the drawing.
 *
 * Everything above it — the stepper, the question that opens the step, the
 * arrow picker — is a way of getting to a result rather than part of one, and a
 * printed page is somewhere you already are. Checked in the stylesheet because
 * there is no print rendering to inspect from a test runner.
 */
test('nothing above the drawing reaches the printed page', () => {
  const css = read('../css/print.css');
  const hidden = css.match(/@media print \{([\s\S]*?)display: none !important;/)[1];
  for (const selector of ['.stepper', '#ask', '#vectors', '.app-header', '.sidebar', '#transport']) {
    assert.ok(hidden.includes(selector), `${selector} still prints`);
  }
});

test('each printed section starts on its own page', () => {
  const css = read('../css/print.css');
  const block = css.match(/#graphs,[\s\S]*?\}/)[0];
  for (const selector of ['#graphs', '.measurements', '.print-summary', '.explain-host']) {
    assert.ok(block.includes(selector), `${selector} does not start a page`);
  }
  assert.match(block, /break-before: page/);
  // Older engines need the superseded property as well.
  assert.match(block, /page-break-before: always/);
});

test('the sheet says which experiment it is, without anything above the drawing', () => {
  // The step name moved into the printed summary when the header stopped
  // printing, so a sheet on its own still identifies itself.
  const main = read('../js/main.js');
  assert.match(main, /What was set — step \$\{stageIndex\(state\.stage\) \+ 1\}, \$\{stageById\(state\.stage\)\.label\}/);
});

/**
 * Nothing in the animation loop may replace a control.
 *
 * The transport bar used to be rebuilt a few frames into every run, the moment
 * the recorder had enough to scrub through. On a desktop that window is too
 * short to notice. On a phone a tap lasts about a tenth of a second, and a tap
 * that begins on Pause and ends on a Pause that has been replaced never becomes
 * a click — which is exactly what "the button did nothing" looks like.
 */
test('the timeline is always rendered, so the bar is never rebuilt mid-run', () => {
  const transport = read('../js/ui/transport.js');
  // No conditional around the slider: it is rendered always and disabled until
  // there is something to scrub.
  assert.ok(!/if \(total > 0\.05\) \{\s*bar\.appendChild/.test(transport),
    'the slider is still added conditionally, which rebuilds the bar mid-run');
  assert.match(transport, /class: 'transport__scrub'/);
  assert.match(transport, /disabled: ready \? null : ''/);
});

test('updateTransport nudges the bar and never recreates it', () => {
  const main = read('../js/main.js');
  const fn = main.match(/function updateTransport\(\)[\s\S]*?\n\}/)[0];
  assert.ok(!fn.includes('renderTransportBar'),
    'updateTransport still rebuilds the bar, and it runs on every frame');
});

/**
 * Only the drawing is worth sixty frames a second.
 *
 * A frame that rebuilds the scene, the legend, the readouts and the banners —
 * and the graphs and inspector on top — measured over thirty milliseconds on a
 * desktop, twice the budget. On a phone that saturates the main thread and
 * takes input with it.
 */
test('words and numbers are redrawn on a cadence, and a coarser one on a phone', () => {
  const main = read('../js/main.js');
  const paint = main.match(/function paint\(force = false\)[\s\S]*?\n\}/)[0];
  assert.match(paint, /window\.innerWidth <= 640 \? 6 : 3/);
  // The legend, readouts and banners sit behind the same gate as the graphs.
  assert.match(paint, /if \(refreshNumbers\) \{[\s\S]*?dom\.legend[\s\S]*?dom\.readout[\s\S]*?dom\.banners/);
  // And the drawing itself is not behind it.
  const sceneAt = paint.indexOf('renderScene');
  const gateAt = paint.indexOf('const refreshNumbers');
  assert.ok(sceneAt < gateAt, 'the drawing is being throttled too');
});

/**
 * Zooming keeps the framing you were already looking at.
 *
 * `takeManualView` asked `autoView`, which ignores the current view entirely
 * and answers with the fit-everything box. From `auto` those are the same
 * thing, so it looked right. From `follow` — where Home leaves you — they are
 * not: zooming in threw the reader's magnification away and jumped back out to
 * the whole scene first, so pressing Home and then zooming walked the grid back
 * through 20 m and 5 m to reach the 3 m it was already showing.
 */
test('taking a manual view starts from what is on screen, in any mode', () => {
  const main = read('../js/main.js');
  const fn = main.match(/function takeManualView\(draft\)[\s\S]*?\n\}/)[0];
  assert.ok(!/autoView\(/.test(fn),
    'takeManualView is back on autoView, which discards a follow zoom');
  // sceneCamera is the one that honours all three modes, because it is the same
  // call the renderer makes to decide what to draw.
  assert.match(fn, /sceneCamera\(shownWorld\(\), 'main', state\.view\)/);
});

test('Home holds the zoom rather than handing the framing back', () => {
  const main = read('../js/main.js');
  const home = main.match(/goHome: \(\) => update[\s\S]*?\}, \{ sim: 'none' \}\),/)[0];
  assert.match(home, /mode: 'follow'/);
  assert.ok(!/mode: 'auto'/.test(home), 'Home is throwing the zoom away again');
  // And there is still a way back to framing everything.
  assert.match(main, /fitAll: \(\) => update\(\(draft\) => \{ draft\.view\.camera\.mode = 'auto'; \}/);
});

/**
 * The animation loop stands down when the bench is not showing.
 *
 * `render` empties the bench regions on the way to the gallery, and that was
 * not enough on its own: `paint` runs from the clock and for scrubbing, and it
 * filled the graphs and readouts straight back in on the next frame — so the
 * shelf appeared above a stack of charts belonging to an experiment nobody was
 * looking at. Stopping the clock does not cover it either.
 */
test('paint does nothing while the shelf is showing', () => {
  const main = read('../js/main.js');
  const fn = main.match(/function paint\(force = false\)[\s\S]*?\n\}/)[0];
  assert.match(fn, /if \(state\.page !== 'bench'\) return;/);
  // And the guard is the first thing it does, before any work.
  const guardAt = fn.indexOf("state.page !== 'bench'");
  const workAt = fn.indexOf('renderScene');
  assert.ok(guardAt > 0 && guardAt < workAt, 'the guard must come before the drawing');
});

test('the gallery is a page, not an eighth step', () => {
  const state = read('../js/state.js');
  // `page` is its own field, and the stepper is left alone.
  assert.match(state, /page: oneOf\(incoming\.page, \['bench', 'examples'\], 'bench'\)/);
  const stages = read('../js/stages.js');
  assert.ok(!/id: 'examples'/.test(stages), 'the shelf must not be a stage');
});
