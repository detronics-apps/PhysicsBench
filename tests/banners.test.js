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
  // To the closing brace in the first column — `section`'s options are
  // destructured over several lines, so the first `\n}` is the signature's.
  const block = widgets.match(/export function section\([\s\S]*?\n\}\r?\n/)[0];

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

test('the gallery and the guide are pages, not extra steps', () => {
  const state = read('../js/state.js');
  // `page` is its own field, and the stepper is left alone.
  assert.match(state, /page: oneOf\(incoming\.page, \['bench', 'examples', 'guide'\], 'bench'\)/);
  const stages = read('../js/stages.js');
  for (const id of ['examples', 'guide']) {
    assert.ok(!new RegExp(`id: '${id}'`).test(stages), `${id} must not be a stage`);
  }
});

/**
 * The welcome runs once, and never over somebody else's link.
 *
 * A share link means the reader has been sent one specific thing by a person
 * who knew what they were sending. Putting a card over it is the app talking
 * across them. A saved timestamp — not a session flag — is what makes "once"
 * mean once rather than once per tab.
 */
test('the welcome is shown once, and not to someone arriving with a link', () => {
  const main = read('../js/main.js');
  assert.match(main, /if \(!state\.ui\.onboardedAt && !location\.hash\.length\) openWelcome\(\);/);
  assert.match(main, /state\.ui\.onboardedAt = new Date\(\)\.toISOString\(\);/);

  // Persisted, and coerced on the way in — a share link carries this field.
  const stateSrc = read('../js/state.js');
  assert.match(stateSrc, /onboardedAt: null,/);
  assert.match(stateSrc, /typeof incoming\.ui\?\.onboardedAt === 'string'/);
});

test('the guide is reachable from the bar and the welcome from the guide', () => {
  const main = read('../js/main.js');
  assert.match(main, /'data-field': 'page:guide'/);
  assert.match(main, /showWelcome: \(\) => openWelcome\(\)/);
});

/**
 * The sidebar is an accordion, and the invariant has two halves.
 *
 * `widgets.js` keeps one panel open once a reader is clicking. It cannot
 * *establish* that: a `<details>` built with its `open` attribute already set
 * fires no `toggle`, so a fresh load, a share link or a restored session would
 * every one of them arrive with a dozen panels open at once. `main.js` folds
 * the extras after each render.
 *
 * Read from the source for the same reason as the tests above — the widget
 * module needs a document, and what is being defended is a pairing across two
 * files. Whether it actually holds is checked by driving the page.
 */
test('opening one grouped panel folds its siblings', () => {
  const widgets = read('../js/ui/widgets.js');

  // The group travels on the node, so a caller can group a list in one pass.
  assert.match(widgets, /function collapseSiblings/);
  assert.match(widgets, /export function grouped/);
  assert.match(widgets, /node\.dataset\.group = group/);

  // And the toggle handler reaches for it there, not in its closure.
  const toggle = widgets.match(/toggle: \(event\) => \{[\s\S]*?\n {6}\},/)[0];
  assert.match(toggle, /event\.target\.dataset\.group/);
  assert.match(toggle, /if \(event\.target\.open && g\) collapseSiblings/);
});

test('a render never leaves two panels open', () => {
  const main = read('../js/main.js');

  assert.match(main, /function soloOpenSection/);
  // Called where the sidebar is filled, not only where a step changes.
  assert.match(main, /for \(const node of bench\.controls\(ctx\)\) dom\.controls\.appendChild\(node\);\r?\n\s*soloOpenSection\(\);/);

  // It keeps the first open panel and closes the rest — it must not close
  // every one of them, which would open the app on a sidebar of headings.
  const block = main.match(/function soloOpenSection\(\)[\s\S]*?\n\}\r?\n/)[0];
  assert.match(block, /if \(!kept\) \{ kept = true; continue; \}/);
  assert.match(block, /node\.open = false/);
});

test('arriving at a step opens exactly the panel that step adds', () => {
  const block = read('../js/main.js').match(/function focusNewSections\([\s\S]*?\n\}\r?\n/)[0];

  // The last new one, so a jump from step one to step seven lands on step
  // seven's panel rather than step two's.
  assert.match(block, /\.pop\(\)/);
  assert.match(block, /const wanted = node === newest/);
});

/**
 * A level only hides. It must never restart the experiment.
 *
 * The chip handler called `rebuild()` first, which builds the world again from
 * the parameters and puts the clock back to zero — so switching from Advanced
 * to Expert two minutes into a run threw the run away. Measured before the fix
 * at 12.2231 m/s on Simple and 0.0061 m/s on Advanced; after it, 12.2231 on
 * all three with the clock held at t = 2 s.
 */
test('changing the detail level re-renders and never rebuilds', () => {
  const main = read('../js/main.js');
  const handler = main.match(/state\.ui\.level = level\.id;[\s\S]*?\n {8}\},/)[0]
    // The comment explaining why it must not rebuild says the word, so the
    // check has to read the code rather than the prose around it.
    .replace(/\/\*[\s\S]*?\*\//g, '');

  assert.ok(!handler.includes('rebuild()'),
    'the level handler rebuilds the world, which resets the clock mid-run');
  assert.match(handler, /render\(\);/);
});

/**
 * The teaching text exists once, and the level decides how much of it renders.
 *
 * Three hand-written versions of the same explanation is three things to keep
 * in step, and the one nobody is looking at is the one that goes stale.
 */
test('one explanation, rendered to the reader’s level', () => {
  const explain = read('../js/ui/explain.js');
  assert.match(explain, /if \(!at\('advanced'\)\) validWhen = null;/);
  assert.match(explain, /if \(!at\('expert'\)\) \{ becomes = null; notes = null; \}/);

  // Bound once where the panels are built, not repeated at twenty call sites.
  const bench = read('../js/ui/bench.js');
  assert.match(bench, /const explain = \(\{ need = 'simple', \.\.\.spec \}\) =>\s*\n?\s*\(ctx\.at\(need\) \? explainSpec\(\{ level: ctx\.level, \.\.\.spec \}\) : null\);/);
});

/**
 * Thirteen closed grey summaries under the measurements is not an invitation.
 *
 * Which panels appear is a separate question from how much of a panel that
 * does appear is rendered. Simple keeps the two that say where you are — the
 * prepared experiment, if one is loaded, and what this step is about.
 */
test('the teaching stack is short at Simple and complete at Expert', () => {
  const bench = read('../js/ui/bench.js');
  const fn = bench.match(/export function explains\(ctx\)[\s\S]*?\n\}\r?\n/)[0];

  // The two that survive Simple carry no `need`, and nothing else is ungated.
  const titles = [...fn.matchAll(/title: (`[^`]*`|'[^']*'),\r?\n(\s*need: '(\w+)',)?/g)]
    .map((m) => ({ title: m[1], need: m[3] || 'simple' }));
  const atSimple = titles.filter((t) => t.need === 'simple').map((t) => t.title);

  assert.deepEqual(atSimple, [
    '`This experiment: ${example.title.toLowerCase()}`',
    '`What this step adds: ${stage.label.toLowerCase()}`',
  ], 'Simple shows more than the two panels that say where the reader is');

  // The equation round-up and its triangles arrive at Advanced.
  assert.ok(titles.some((t) => t.title.includes('The equations on this step') && t.need === 'advanced'));

  // A gated panel returns null, so the stack has to drop them.
  assert.match(fn, /return out\.filter\(Boolean\);/);
});

/**
 * Clicking something must never move the page under the reader.
 *
 * A render replaces a container's children, and a container whose children are
 * replaced loses its scroll offset. This was remembered for two containers by
 * name — the sidebar and the workspace — and on one axis, so scrolling the
 * step bar right to reach "How to use" and clicking it threw the bar back to
 * step one.
 *
 * Naming the containers is the bug. A list has to be added to every time a
 * scroller appears, and the one nobody adds is the one that jumps.
 */
test('every scrolled container is found, not listed, and restored on both axes', () => {
  const main = read('../js/main.js');
  const capture = main.match(/function captureScroll\(\)[\s\S]*?\n\}\r?\n/)[0];

  // Found by walking the document, so a scroller added later is covered.
  assert.match(capture, /document\.querySelectorAll\('\*'\)/);
  assert.match(capture, /node\.scrollTop \|\| node\.scrollLeft/);

  // Both axes go back, and only onto nodes that survived the render.
  const restore = main.match(/const restoreScroll = \(scrolled\)[\s\S]*?\n\};\r?\n/)[0];
  assert.match(restore, /if \(!node\.isConnected\) continue;/);
  assert.match(restore, /node\.scrollTop = top/);
  assert.match(restore, /node\.scrollLeft = left/);

  // Nothing is remembered by name any more.
  assert.ok(!/snap\.sidebar|snap\.viewport/.test(main),
    'a container is still being restored by name, so the next one added will jump');
});

test('a scroll offset is re-applied after layout, not only before it', () => {
  const main = read('../js/main.js');
  const fn = main.match(/function restoreFocus\(snap\)[\s\S]*?\n\}\r?\n/)[0];
  // A container whose new contents are briefly shorter clamps what it is
  // handed, and the clamped value is what sticks.
  assert.match(fn, /requestAnimationFrame\(\(\) => restoreScroll\(snap\.scrolled\)\)/);
  assert.match(fn, /focus\(\{ preventScroll: true \}\)/);
});

/**
 * A control that disappears must not move anything.
 *
 * Hiding the level chips with `display: none` handed the step bar their width,
 * which changed how far it could scroll: a reader who had scrolled right to
 * reach the guide had their offset clamped on the way in — measured at 534 px
 * clamped to 337 — and did not get it back on the way out.
 */
test('hiding the level chips keeps their box', () => {
  const css = read('../css/components.css');
  const rule = css.match(/html:not\(\[data-page='bench'\]\) \.modebar-host \{[^}]*\}/)[0];
  assert.match(rule, /visibility: hidden/);
  assert.ok(!rule.includes('display: none'),
    'the chips still collapse their box, which reflows the step bar');
});

/* ------------------------------------------------- the shared furniture -- */

/**
 * The level switch sits on its own row, above the bar it governs.
 *
 * Sharing a row with the steps made it read as a filter on them. Directly
 * under the wordmark and directly above the steps, it reads as what it is —
 * and it matches where every other Detronics app puts it.
 */
test('the mode bar is its own row, above the steps', () => {
  const main = read('../js/main.js');
  assert.match(main, /class: 'modebar-host'/);
  assert.match(main, /class: 'modebar', role: 'group'/);
  assert.match(main, /class: 'chip modebar__chip'/);

  // Order in the viewport: the mode bar, then the steps.
  const order = main.match(/dom\.viewport = el\('section', \{ class: 'viewport' \}, \[([\s\S]*?)\]\);/)[1];
  assert.ok(order.indexOf('dom.workspaceBar') < order.indexOf('dom.stages'),
    'the steps come before the mode bar');
});

test('the sentence beside the chips is the current level\u2019s own', () => {
  // Not a description of the control: a reader wants to know what they are
  // looking at, not what the three words mean in the abstract.
  const main = read('../js/main.js');
  assert.match(main, /dom\.levelHint\.textContent = levelById\(state\.ui\.level\)\.note;/);
});

/**
 * The lock is the escape hatch from the accordion.
 *
 * One panel at a time is right almost always and wrong exactly when somebody
 * is comparing two things. Rather than weaken the default, let them pin one.
 */
test('a locked panel is exempt from every path that folds a panel', () => {
  const widgets = read('../js/ui/widgets.js');
  const main = read('../js/main.js');

  // Opening a sibling.
  assert.match(widgets, /other\.dataset\.locked !== 'true'/);
  // The invariant applied after each render.
  const solo = main.match(/function soloOpenSection\(\)[\s\S]*?\n\}\r?\n/)[0];
  assert.match(solo, /node\.dataset\.locked === 'true'\) continue;/);
  // And arriving at a step.
  const focus = main.match(/function focusNewSections\([\s\S]*?\n\}\r?\n/)[0];
  assert.match(focus, /n\.dataset\.locked !== 'true'/);
});

test('the lock renders whether or not the group was passed to section()', () => {
  // The group is stamped on the node afterwards by `grouped()`, so gating the
  // lock on the `group` argument rendered no locks at all.
  const widgets = read('../js/ui/widgets.js');
  assert.match(widgets, /const lock = lockable \? el\('button'/);
  assert.match(widgets, /'data-locked': lockable \? String\(locked\) : null,/);
});

test('the lock survives a render, and is not filed per step', () => {
  const main = read('../js/main.js');
  // Pinning "The object" open means you want it in view; walking to the next
  // step does not change that, so the key carries no stage.
  assert.match(main, /get: \(id\) => !!state\.ui\.locks\[id\],/);
  assert.match(main, /set: \(id, on\) => \{ state\.ui\.locks\[id\] = on; saveSoon\(\); \},/);
  assert.match(read('../js/state.js'), /locks: sectionFlags\(incoming\.ui\?\.locks\),/);
});

/**
 * The footer is about the app; the sidebar is about the experiment.
 *
 * Sharing, printing and the downloads are things you do to an experiment, so
 * they belong in the column where everything else you do to one already is.
 */
test('the exports moved to the sidebar and the footer took their place', () => {
  const bench = read('../js/ui/bench.js');
  const main = read('../js/main.js');

  // Last in the sidebar, and never lockable — an export you cannot find is an
  // export nobody uses.
  assert.match(bench, /exportSection\(ctx\),\r?\n\s*\]\.filter\(Boolean\), 'controls'\);/);
  assert.match(bench, /\{ key: 'export', open: false, lockable: false \}/);

  const footer = main.match(/function buildFooter\(\)[\s\S]*?\n\}\r?\n/)[0];
  for (const label of ["What's new", 'Licence & terms', 'Imprint & privacy', 'I am new here']) {
    assert.ok(footer.includes(label), `the footer has lost "${label}"`);
  }
  for (const gone of ['SVG', 'PNG', 'CSV', 'Share link']) {
    assert.ok(!footer.includes(`button('${gone}'`), `${gone} is still in the footer`);
  }
});

test('each footer panel says something, and none of it is invented', () => {
  const guide = read('../js/guide.js');
  for (const name of ['WHATS_NEW', 'LICENCE', 'IMPRINT']) {
    assert.ok(new RegExp(`export const ${name} = \{`).test(guide), `${name} is missing`);
  }
  // The licence is the licence, and the privacy text is the architecture.
  assert.match(guide, /MIT\. Use it, change it, ship it, teach with it\./);
  assert.match(guide, /There is no server, no account, no analytics, no cookies/);
});

/**
 * Simple is the controls and the result, and nothing else at all.
 *
 * Three things were still showing there, and each is prose rather than a
 * number a reader is looking for: the explanatory line under every control,
 * the exhaustive per-body readout under the headline tiles, and the panel
 * that says which parts of the model are approximated.
 */
test('the explanatory lines are gone at Simple and back on paper', () => {
  const css = read('../css/components.css');
  assert.match(css, /html\[data-level='simple'\] \.field__hint \{ display: none; \}/);

  // A printed sheet is read away from the app, so it keeps the prose whatever
  // the level was on screen.
  const printBlock = css.match(/@media print \{[\s\S]*?\n\}/)[0];
  assert.match(printBlock, /html\[data-level='simple'\] \.field__hint \{ display: block; \}/);

  // And the level has to reach the stylesheet for either rule to fire.
  const main = read('../js/main.js');
  assert.match(main, /document\.documentElement\.dataset\.level = state\.ui\.level;/);
  assert.match(main, /applyTheme\(\);\r?\n\s*applyLevel\(\);/);
});

test('one rule covers every hint, including ones written later', () => {
  // Thirty call sites is thirty chances to miss one, so the gate is central:
  // `field()` builds its hint through the same helper.
  const dom = read('../js/ui/dom.js');
  assert.match(dom, /export const showHints = \(on\) =>/);
  assert.match(dom, /export const hint = \(text\) => \(hintsShown && text/);
  assert.match(dom, /hint\(hintText\),/);
});

test('the exhaustive readout and the model disclosure wait for Advanced', () => {
  const main = read('../js/main.js');

  // The tiles above it already say what the step is about; this is the same
  // thing exhaustively, and on step one it is a column of velocities under an
  // object that is not moving.
  assert.match(main, /clear\(dom\.inspector\);\r?\n\s*if \(ctx\.at\('advanced'\)\) \{/);
  assert.match(main, /if \(sim\.scenario\?\.disclosure && ctx\.at\('advanced'\)\) \{/);

  // The heading's own note travels with the rest of the prose.
  assert.match(main, /class: 'measurements__note field__hint',/);
});

/**
 * A message you cannot close or shorten is furniture.
 *
 * Step three shows two at once, and written out in full they were 220 px on a
 * phone — 27% of the screen, above the drawing the app is for. Collapsed to
 * their first line they are 83 px, and closing one removes it.
 */
test('every banner can be closed, and stays closed', () => {
  const widgets = read('../js/ui/widgets.js');

  assert.match(widgets, /class: 'banner__close', type: 'button',/);
  assert.match(widgets, /'aria-label': 'Dismiss this message',/);
  // Closed once, gone for the session: it returns null rather than a node.
  assert.match(widgets, /if \(dismissible && dismissed\.has\(id\)\) return null;/);
  // So the callers have to filter rather than track state themselves.
  assert.match(read('../js/main.js'), /for \(const node of bench\.banners\(ctx\)\) if \(node\) dom\.banners\.appendChild\(node\);/);
  assert.match(widgets, /\.filter\(Boolean\);/);
});

test('a live figure in a banner does not resurrect it', () => {
  // "These two masses attract with 5.46e-9 N" changes whenever a slider
  // moves; keying the dismissal on the whole string would bring it back.
  const widgets = read('../js/ui/widgets.js');
  const keyLine = widgets.match(/const bannerKey = [^\n]*/)[0];
  assert.match(keyLine, /replace\(/);
  // The digits are flattened out, so the key names the message not its value.
  assert.ok(keyLine.includes('#'), 'the key does not normalise numbers away');

  // Dismissals are in memory, not in storage: closing one means "I have read
  // this", not "never tell me again", and a reload is a fresh look.
  assert.match(widgets, /const dismissed = new Set\(\);/);
  assert.ok(!/localStorage[^\n]*dismiss/i.test(widgets), 'dismissals are being persisted');
  // Reset is a fresh start in every sense.
  assert.match(read('../js/main.js'), /reset\(\);\r?\n\s*clearDismissed\(\);/);
});

test('a banner is one line until it is asked for', () => {
  const css = read('../css/components.css');
  const rule = css.match(/\.banner__text \{[^}]*\}/)[0];
  assert.match(rule, /-webkit-line-clamp: 1;/);
  assert.match(css, /\.banner__text\[aria-expanded='true'\] \{ -webkit-line-clamp: unset;/);

  // Keyboard-reachable, because it is a real button rather than a click handler.
  const widgets = read('../js/ui/widgets.js');
  assert.match(widgets, /class: 'banner__text', type: 'button',/);
  assert.match(widgets, /'aria-expanded': 'false',/);
});

test('paper gets the whole message and no buttons', () => {
  const css = read('../css/components.css');
  assert.match(css, /@media print \{ \.banner__close \{ display: none; \} \}/);
  const printBlock = css.match(/@media print \{\r?\n\s*\.banner__text \{ -webkit-line-clamp: unset;[\s\S]*?\n\}/)[0];
  assert.match(printBlock, /line-clamp: unset/);
});
