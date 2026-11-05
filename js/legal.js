/**
 * The legal surface, as data.
 *
 * Two panels reached from the footer, and the facts behind them. They live in
 * their own module rather than beside the guide content because they are the
 * one part of the app whose wording has to be *checkable* — a test reads
 * `LICENCE_ID` here and the `LICENSE` file in the repository and fails if they
 * ever disagree, which is the failure nobody would otherwise notice until it
 * mattered.
 *
 * What this architecture does and does not need, verified rather than assumed
 * (`grep` over the shipped source, and the non-negotiable that nothing crosses
 * the network after load):
 *
 * - **No cookie banner.** There is no `document.cookie` anywhere. `localStorage`
 *   holding the reader's own experiment is strictly-necessary first-party
 *   storage; only non-essential or tracking storage triggers consent, and there
 *   is none.
 * - **No third-party disclosure.** No external script, stylesheet, font, iframe
 *   or embed; no `fetch`, `XMLHttpRequest`, `WebSocket` or `sendBeacon`. The
 *   only outbound URLs in the whole app are the two Detronics links in the
 *   chrome, and those are navigations the reader chooses to make.
 * - **No privacy policy beyond the notice below.** The app collects nothing,
 *   because there is nowhere for it to go: no account, no form, no personal
 *   data of any kind.
 *
 * None of this is legal advice, and the file that is the licence is the
 * `LICENSE` file; this module only has to agree with it.
 */

/** The SPDX identifier, and the single place the app names its licence. */
export const LICENCE_ID = 'MIT';

/** Who holds the copyright, and from when. Must match the LICENSE file. */
export const COPYRIGHT = { holder: 'Detronics', year: 2026 };

export const LICENCE = {
  title: 'Licence & terms',
  body: [
    ['The code',
      `${LICENCE_ID}, © ${COPYRIGHT.year} ${COPYRIGHT.holder}. Use it, change it, ship it, `
      + 'teach with it, sell it. The full text is in the LICENSE file in the repository, '
      + 'and it is the whole of the legal position on the software — there is nothing '
      + 'else to agree to and nothing to accept.'],
    ['What it does not promise',
      'This is a teaching bench, not an engineering tool, and the licence says so in the '
      + 'usual words: no warranty, of any kind. The physics is real and the arithmetic is '
      + 'tested, but the app tells you plainly where it is approximating — every panel '
      + 'carries "What this simulation is doing", which separates the reality from the '
      + 'model, the assumptions and the approximations. Do not size a real part from it '
      + 'without checking the figure against a source you trust.'],
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
    ['Who made it',
      'Detronics — detronics.co.za. Built as a teaching tool and kept free.'],
    ['What leaves your browser',
      'Nothing. There is no server, no account, no analytics, no cookies, and no fonts, '
      + 'scripts or embeds from anywhere else. The page you are reading was the last thing '
      + 'that crossed the network.'],
    ['Why there is no cookie banner',
      'Because there are no cookies, and nothing here tracks you. What the app keeps is '
      + 'functional local storage holding your own experiment — the kind that needs no '
      + 'consent because it exists only to give you your work back. Nobody else can read '
      + 'it, including us.'],
    ['Where your work is kept',
      'In this browser, on this device. "Save project" downloads a file to your machine. '
      + 'A share link carries the whole experiment in the part of the URL after the "#", '
      + 'which browsers never transmit to a server — so even sharing one uploads nothing.'],
    ['Getting rid of it',
      'Clearing this site’s data in your browser removes everything the app has kept. '
      + 'There is nowhere else to ask, because there is nowhere else it went.'],
  ],
};
