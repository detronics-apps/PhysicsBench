# PhysicsBench: the whole app in one document

Written to be pasted straight into a video or content prompt. It stands alone — no file paths, no
cross-references.

*Draft, 2026-11-05, at v1.9.0. The angle below is drawn from the owner's own words during the
build; sharpen it in his voice before filming.*

## The one-liner

A physics laboratory that runs in a browser tab: change something, watch what happens, measure it,
and then see the equation that describes what you just watched — with your own numbers in it.

## The angle — the different direction it came from

**Everyone else's physics simulator answers: "what does this look like?"**

**This one answers: "what is the equation behind what I just watched, and where is that equation
lying to me?"**

Which is why every screen carries the formula with the current values substituted into it, why
there is a panel that names what the model approximates and what it ignores, and why the energy
books are on screen while the thing is still moving.

The goal behind the goal: *the reader should come out understanding something, not holding a
number.* That one decision explains most of what is unusual here. It is why the hints point without
answering — "increase the mass until they start moving", never "try 5 × 10⁹ kg" — because a hint
that gives the answer has done the experiment for you. It is why there are sixteen things to find
rather than a feature list: the hints get you started, and the achievements keep you exploring. And
it is why the app volunteers what it is bad at.

Most teaching software is built to deliver content. This was built on the opposite bet: that if you
give somebody a real thing to poke at, an honest account of what it is doing, and a reason to keep
poking, they will teach themselves — and what they learn that way stays.

## Who it is for — and who it is not for

**For:**

- Somebody meeting mechanics for the first time who has been told *F = ma* and does not yet believe
  it. They can make the mass bigger and watch the same push do less.
- A teacher who wants a demonstration that survives a question. Every number on screen can be
  pushed on, and the app will show its working rather than defend itself.
- A curious adult who liked physics at school, did not keep it, and would enjoy an afternoon
  dropping things into honey and finding out where the energy went.
- Anybody who wants to see a 1 kg ball and a 100 kg ball reach the ground together, and then see
  the line in the equation that says why.

**Not for:** an engineer who needs a validated answer for a real design. This models the physics
honestly and says so, but it is a teaching bench — not FEA, not a CFD solver, not a certification
tool. Somebody sizing a real beam or a real pump should use the tool their profession already
trusts. The app says this itself, in the panel that names its own approximations.

## How it works, in plain words

You land on a bench with one object on it. There are six steps, and each one adds a single idea:
push it · put a second mass beside it · grow that mass into a planet until the pull becomes weight ·
add a floor and friction · fill the space with a fluid · and then a playground with everything at
once, where you can draw walls, fire cannons and drive things around.

On the left is the drawing; on the right are the controls. Change the mass, the shape, the material,
the push, the planet, the fluid. Press play and the simulation advances — you can pause it, step one
frame at a time, slow it to a tenth speed without changing the physics, or scrub backwards through
what already happened. Underneath are graphs of velocity, momentum, energy and position against
time, all read from the same recording as the picture, so nothing can disagree with anything else.

Three unusual facts, all of them deliberate: **it runs entirely in your browser** — the physics, the
graphs, the drawing, all of it on your own machine. **Nothing is uploaded anywhere** — no analytics,
no cookies, no third-party anything, and that claim is checked by an automated test that reads the
shipped code and fails if a network call ever appears in it. **There is no account.** Your work is
saved on your own machine, a share link carries the whole experiment inside the link itself, and
closing the tab loses nothing.

## What it can do

**Getting started and finding your way**

- **Six steps, each adding one idea** — because a bench that offers everything on the first screen
  teaches nobody anything.
- **Three levels of detail — Simple, Advanced, Expert** — because the same screen has to serve
  somebody meeting the subject and somebody tuning the model. A level only ever hides; it never
  changes a value and never restarts a run.
- **One hint per step, which clears itself once you have done the thing** — because the hardest
  moment is the first one, and the hint should disappear rather than nag.
- **Eleven prepared experiments** — a crate on a slope, a fifty-metre marble run, a Falcon 9 going
  straight up to the ISS, a rover round a flooded track, two masses orbiting each other — because a
  blank bench is intimidating and a set piece is an invitation.
- **Twenty-five multiple-choice questions across those experiments**, answered by *using* the app
  rather than by remembering — because a question you answer by running the experiment is the
  experiment.
- **Sixteen things to find**, earned by doing rather than by clicking — because a feature list
  nobody reads is worse than a reason to go looking.
- **A searchable how-to in your own words** — twenty walk-throughs, thirteen questions and answers,
  and an alias map so searching "air resistance" finds drag.

**Doing the physics**

- **Thirteen worlds** from Ceres to a neutron star — because surface gravity stops being an
  abstraction the moment you can switch it.
- **Seven fluids** from vacuum to honey, with real densities and viscosities.
- **Eleven shapes and fourteen materials**, so density is something you choose rather than type.
- **Buoyancy computed from how much of the shape is actually under the surface** — an exact
  spherical cap for a sphere, not an approximation — because the interesting moment is the one where
  it is half in.
- **Collisions with restitution, friction with a real coefficient, drag that vanishes with the air.**
- **Walls and arcs you draw with the pointer, and cannons you aim**, in the playground.
- **An energy ledger** — kinetic, potential, heat and the total — so "where did the energy go?" has
  an answer on screen rather than a promise.

**Watching and measuring**

- **Play, pause, step one frame, scrub backwards, and slow motion down to a tenth** — step and scrub
  are the two a video player would not bother with, and they are the two that matter for learning.
- **Twenty recorded channels**, with the picture and every graph reading the same recording, so the
  graph and the drawing can never tell different stories.
- **You choose the recording trade** — finer sampling catches sharper peaks and costs you seconds of
  history — with the measured error printed beside each setting rather than left for you to guess.
- **Arrows for every force and every motion**, switched on and off individually, and never offered
  for a force that does not exist on that step.
- **Live commentary** — the app says when something is about to leave the bench, or has started
  floating, or has lost most of its energy to heat.

**Taking it with you**

- **A share link that holds the entire experiment inside the link** and never touches a server.
- **SVG, PNG and CSV export, and a printable sheet** that prints the settings as well as the result,
  because a sheet showing an answer without its inputs is one nobody can check.
- **Save and reload a project file** on your own machine.

**On a phone**

- **Interactive mode** — the whole screen becomes the drawing, with the controls reached by tapping
  the thing they belong to. A phone opens in it. Measured: the drawing goes from a quarter of the
  screen to the whole of it, and the scrolling goes away.

## What it takes into account

- **A level hides; it never changes a value.** → Otherwise switching to Simple to take a screenshot
  would quietly give you a different answer.
- **Switching anything mid-run never restarts the clock.** → Two minutes into a run, changing the
  detail level used to throw the run away. A control that resets your work is a control you stop
  touching.
- **Nothing moves under you while you type.** → Scroll position, keyboard focus and the text cursor
  all survive an edit, and a control that hides keeps its space. Without it, typing a mass near the
  bottom of the panel threw the page back to the top.
- **A hint never contains a number.** → Enforced by an automated test that rejects any hint
  containing a figure with a unit. A hint with the answer in it has done the experiment for you.
- **The app says what it is approximating.** → Reality, the model, the assumptions and the
  approximations are four separate things, kept separate, and shown from Advanced upward.
- **Removing the floor does not remove gravity.** → These were one flag, so a ball dropped into a
  lake hung motionless in mid-air. A "world with a downward pull" and a "thing to land on" are two
  facts.
- **A floating body is in two fluids at once.** → Its centre is above the waterline, so it was taking
  buoyancy from the water and drag from the air, and a bobbing float gained speed every cycle.
- **The integrator refines itself only where it matters** — while a body is crossing a surface.
  → The truncation error was measured falling 7.73 J → 1.94 → 0.49 as the step halved, which is what
  justified spending the time there and nowhere else.
- **Accuracy costs memory, and you choose.** → With the measured error printed beside each option
  instead of the app deciding silently and calling it a default.
- **The privacy claim is tested, not asserted.** → A test reads the shipped code and fails on a
  cookie, a fetch, a websocket or any foreign URL. The notice and the code cannot drift apart.
- **The licence claim is tested too.** → The panel, the LICENSE file and the package manifest are
  held in step by a test, so the app cannot claim a licence it does not carry.
- **A phone's default is never allowed to harden into your decision.** → The app guesses the layout
  from the screen until you choose one; the guess is never written down, so a bad guess corrects
  itself and leaving the mode is permanent.

## How it compares

**Against PhET and the university applets** — PhET is excellent, free, and far broader. Each of its
simulations is a sealed demonstration: one phenomenon, carefully staged, and you cannot take the
pendulum out and drop it into honey. PhysicsBench is one bench where the pieces combine, and it
shows the equation and its assumptions rather than only the phenomenon. If you want a polished
single-topic demonstration, use PhET.

**Against Algodoo and the physics sandboxes** — Algodoo is more fun to play with and has far better
drawing tools. It is a toy box: it will not tell you what the energy is doing or which equation
describes it. PhysicsBench is the same idea pointed at understanding rather than play.

**Against a spreadsheet** — a spreadsheet gives you the numbers and none of the motion. This gives
you both, keyed to the same recording, and you can scrub back to the moment of impact.

**Against MATLAB, Simulink or a real solver** — those are right for engineering work and this is
not. It is a bench for learning, and it says so.

**What is genuinely different:** it shows its working with your numbers in it, it tells you what it
is approximating, the recording feeds both the picture and the graphs so they cannot disagree, and
it is a single HTML page with no build step, no dependencies and no server — open the file and it
works, forever, offline.

## What you take away, even if you never use it again

**A hint that gives the answer has done the experiment for you**
The first version of the hints said "type about 5 × 10⁹ kg". That is not help, it is the answer with
extra steps, and the reader learns nothing but obedience. Rewritten, they name the control and the
direction: "increase the mass until they start moving towards each other".
*Where else it applies:* documentation, teaching, onboarding, and managing anybody. Pointing is
teaching; telling is doing it for them.

**Measure before you redesign**
"The phone version is hard to use" is a complaint. "There are 774 pixels of chrome above a drawing
that gets 200, and the first control is 511 pixels below it" is a specification. The number said
what to fix and it told you afterwards whether you had.
*Where else it applies:* any complaint about something feeling slow, awkward or cluttered. Measure
the thing being complained about before touching it, or you are redesigning a feeling.

**A claim you make is a claim you should test**
The app says it uses no cookies and sends nothing anywhere. That sentence is checked on every test
run by a program that reads the shipped code. Before that, it was a promise maintained by memory.
*Where else it applies:* every README, every privacy notice, every status page. If a claim can be
checked automatically, the claim will eventually be false if it is not.

**Distinguish a default from a decision**
The app guesses a phone should open full-screen. It never writes that guess down. Only your own
press is recorded — so a bad guess corrects itself, and once you leave, you stay left.
*Where else it applies:* every settings screen. Storing what you assumed about somebody, in the same
place you store what they told you, is how software ends up confidently wrong about people.

**One fact, one home**
The order of the three detail levels lives in one place. Every part of the app that asks "is this
reader at least at Advanced?" asks that one place rather than listing the levels that qualify — the
list that is always one short when a fourth thing appears.
*Where else it applies:* every convention in any project. Sign conventions, status codes, tax
bands, role hierarchies. The cost is never the first copy; it is the fourth one, found in
production.

**Show the working, not just the answer**
A number on its own cannot be checked, argued with, or learned from. The same number with the
formula and the inputs beside it can be all three.
*Where else it applies:* reports, quotes, estimates, and any recommendation you give anybody. "It
will take six weeks" invites a negotiation; "it will take six weeks, and here is what that is made
of" invites a conversation.

## What to take into account going forward

- **Interactive is one commit of seven.** The mode exists and the phone opens in it; tapping an
  object to edit it, the add-and-remove menu, the action controls and the graph strip are still to
  come.
- **The framing in portrait leaves a lot of empty space.** The camera fits the bench by width, so a
  tall phone screen gets headroom that is useful for throwing things and wasteful on the first step.
  An open question, not a bug.
- **It is two dimensional, and rigid.** No rotation under torque, nothing bends, nothing breaks.
- **The fluid model is drag and buoyancy**, not flow. It will tell you a ball slows in water; it
  will not show you the wake.
- **Bodies are convex and collisions are pairwise.** A hundred objects in a heap is not what it is
  for.
- **Deliberately left out:** no accounts, no cloud save, no sharing to anywhere, no analytics, and
  no leaderboard on the sixteen things to find. Every one of those would be easy and every one would
  change what the app is.

## How it was made

**The constraints, and what they bought.** No build step, no dependencies, no framework, no network
calls. One consequence is that it will still open in ten years. Another is that every line in it is
a line somebody chose.

**How it is checked.** Thirty-two modules, thirty-one of them pure — no browser, no DOM, just
arithmetic — with a test file each: 580 tests, run by the test runner built into Node, installing
nothing. The tests assert measured values rather than shapes: that the energy books balance, that
the truncation error falls when the step halves, that no hint contains a number, that the quiz
answers are not all in the same slot, and that the shipped code makes no network calls.

**What was found by driving it rather than by reading it.** Nearly everything interesting. That a
ball dropped into a lake hung motionless, because removing the floor removed gravity. That a float
gained energy every bounce, because it was taking buoyancy from water and drag from air at the same
time. That nineteen of twenty-five quiz answers were in slot B, so the quiz was passable by pressing
B every time. That three of five panels showed derived values at Simple, found by driving all
twenty-one combinations of step and level and tabulating the counts. That the phone mode did
nothing at all until the drawing canvas was taught to take the shape of the screen.

**Built with** Claude Code, in sessions with the owner, over about ten weeks.

## Show it

1. **The same push, twice the mass.** Step one. Set a push, play, note the speed. Double the mass,
   play again. Then open the panel below and watch *a = F/m* with those numbers in it.
2. **Grow a boulder into a planet.** Step three. Press "Make it a planet" and watch the curvature
   flatten under an object that never changes size — the moment a pull becomes a weight.
3. **The feather and the hammer.** The two-shapes example. Ask which lands first, switch the fluid
   to vacuum, and run it.
4. **Where the energy went.** Drop something into honey and watch the kinetic line fall as the heat
   line rises, with the total flat across the top.
5. **A Falcon 9 to the ISS.** Fire it straight up on real numbers, watch the atmosphere layers go by
   with their fun facts, and watch it sail past the station marker at 408 km.
6. **Scrub the impact.** In the playground, collide two objects, then pause and step one frame at a
   time through the moment of contact. Total momentum is flat straight through it; kinetic energy is
   not, and the difference is on the heat line.
7. **The hint that disappears.** Land on step two, read the hint, do the thing, watch it go.
8. **Turn the phone sideways.** Interactive mode, landscape: the whole screen is the bench.
