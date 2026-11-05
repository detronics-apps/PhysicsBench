import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LICENCE, IMPRINT, LICENCE_ID, COPYRIGHT } from '../js/legal.js';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

/**
 * The app must not claim a licence it does not ship.
 *
 * This is the one piece of wording in the app that is checkable rather than
 * merely reviewable, and it is also the one nobody would notice going wrong:
 * a licence swapped in the file and not in the panel, or a copyright year
 * that drifts, is invisible until it matters. So the panel, the file and
 * `package.json` all have to say the same thing.
 */
test('the licence the app names is the licence it ships', () => {
  const file = read('../LICENSE');

  assert.equal(LICENCE_ID, 'MIT');
  assert.match(file, /^MIT License/, 'the LICENSE file is not the MIT licence');

  // The exact copyright line, assembled from the same values the panel shows.
  assert.ok(file.includes(`Copyright (c) ${COPYRIGHT.year} ${COPYRIGHT.holder}`),
    `the LICENSE file has no "Copyright (c) ${COPYRIGHT.year} ${COPYRIGHT.holder}" line`);

  // And the panel the reader actually sees names it.
  const shown = LICENCE.body.map(([, text]) => text).join(' ');
  assert.ok(shown.includes(LICENCE_ID), 'the licence panel does not name the licence');
  assert.ok(shown.includes(String(COPYRIGHT.year)) && shown.includes(COPYRIGHT.holder),
    'the licence panel does not name the copyright holder and year');
});

test('the README says the same as the LICENSE file', () => {
  const readme = read('../README.md');
  const section = readme.slice(readme.indexOf('## Licence'));
  assert.ok(section.includes(LICENCE_ID), 'the README licence section does not name the licence');
  assert.ok(/LICENSE/.test(section), 'the README does not point at the LICENSE file');
});

test('package.json declares the licence too', () => {
  const pkg = JSON.parse(read('../package.json'));
  assert.equal(pkg.license, LICENCE_ID, 'package.json does not declare the licence');
});

/**
 * The warranty disclaimer is the point of the licence for a reader.
 *
 * A teaching bench that does not say "no warranty" in the place somebody looks
 * is the one sentence of the MIT licence that actually protects anybody here.
 */
test('the panel says what the licence does not promise', () => {
  const shown = LICENCE.body.map(([, text]) => text).join(' ').toLowerCase();
  assert.ok(shown.includes('no warranty'), 'the panel never says there is no warranty');
  assert.ok(/indicative|typical textbook/.test(shown),
    'the panel does not say which figures are indicative');
});

/**
 * The privacy claims are checkable against the shipped source, so check them.
 *
 * Every sentence in the imprint is a statement about the architecture. If one
 * of them stops being true — an analytics snippet, a web font, a fetch — the
 * panel becomes a false claim about somebody's data, which is the worst kind
 * of stale text in the app.
 */
test('nothing in the app contradicts what the privacy panel claims', () => {
  const sources = ['../js', '../css'];
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(new URL(dir + '/', import.meta.url), { withFileTypes: true })) {
      if (entry.isDirectory()) walk(`${dir}/${entry.name}`);
      else files.push(`${dir}/${entry.name}`);
    }
  };
  for (const dir of sources) walk(dir);
  /*
   * Comments stripped first. This module's own docblock explains that there is
   * no `document.cookie` anywhere, and the first run of this test duly failed
   * on its own documentation. What is being checked is what the app *does*.
   */
  const strip = (text) => text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').map((line) => line.replace(/^\s*\/\/.*$/, '')).join('\n');
  const code = strip(files.map(read).join('\n') + read('../index.html'));

  // No cookies, so the "why there is no cookie banner" panel stays true.
  assert.ok(!/document\.cookie/.test(code), 'something sets a cookie');

  // Nothing crosses the network after load.
  for (const api of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'sendBeacon']) {
    assert.ok(!code.includes(api), `${api} appears in the shipped source`);
  }

  // No third party is loaded: the only absolute URLs are the SVG namespace and
  // the two Detronics links the reader chooses to follow.
  const urls = [...code.matchAll(/https?:\/\/[^\s"'`)]+/g)].map((m) => m[0]);
  const allowed = /^(http:\/\/www\.w3\.org\/|https:\/\/www\.detronics\.co\.za\/|https:\/\/buymeacoffee\.com\/detronics)/;
  const foreign = [...new Set(urls.filter((u) => !allowed.test(u)))];
  assert.deepEqual(foreign, [], `the app references ${foreign.join(', ')}`);

  // And the panel is still making those claims, so the check means something.
  const privacy = IMPRINT.body.map(([, text]) => text).join(' ').toLowerCase();
  assert.ok(privacy.includes('no cookies'), 'the panel no longer claims there are no cookies');
  assert.ok(privacy.includes('nothing'), 'the panel no longer claims nothing leaves the browser');
});
