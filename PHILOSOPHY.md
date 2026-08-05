# Project Philosophy

A draft, read off what the project already does rather than invented for it.

## What this is

A practice room, not a textbook. The program's job is to put a musical demand in
front of you and get out of the way while you answer it on an instrument. Every
mode is the same loop: something is asked, you play it, the program notices, it
asks the next thing. Reading *about* a diminished seventh is not the goal; finding
one under your hands without stopping to think is.

## The instrument is the input device

Answers are played, not clicked. The MIDI keyboard is the primary interface, the
on-screen keyboard is its stand-in, and the computer keyboard is a fallback for
tapping rhythms. This is the reason the quiz callbacks care about key-*up* as much
as key-down — a chord isn't right until you've held the whole thing at once and
let go of it deliberately. Recognition that only survives at mouse speed doesn't
count.

## No build step, ever

Plain HTML, plain CSS, plain script tags loaded in order. No bundler, no package
manager, no framework, no transpiler. Open `index.html` and it runs; edit a file
and reload. One CDN dependency (VexFlow) because engraving notation by hand is not
this project's problem to solve. The cost of this is globals and load-order
coupling, and that trade is made knowingly: the project stays legible to one
person picking it back up after a month away.

## One file per activity

Each mode is a small file that declares itself — generate a prompt, handle input,
register a button — and knows nothing about the others. Shared shapes are factored
out only after the second or third repetition proves they're real, which is how
`quiz_helpers.js` came to exist: two callback shapes, not an abstraction imagined
in advance. A mode that takes over the screen is expected to clean up after
itself when the user leaves it.

## Built from parts that combine

The program grows by accumulating pieces, not by accumulating modes. The
interesting exercises are combinations — read this rhythm *while* naming the scale
degrees, hear an interval *and* play it in a given inversion, tap a chorale's bass
line *against* a metronome in a different meter. Those should fall out of putting
existing parts together, not out of writing a fourth activity that reimplements
notation rendering and scoring for itself.

So the working unit is the capability, not the screen: a prompt source, a renderer,
an input matcher, a scorer, a scheduler, a difficulty axis. Each should do one
thing, take what it needs as arguments rather than reaching for module-level state,
and stay indifferent to which activity is driving it. If a piece can only be
described as "the thing the rhythm trainer does", it isn't a component yet.

Practically, that means: prefer functions that take a target and return a verdict
over functions that consult a global and paint the screen; keep rendering separate
from timing and both separate from judging; let a mode be a short script that wires
components together, the way `note_quiz.js` is a handful of lines over a shared
callback factory. Extraction still waits for the second real use — designing for
reuse means keeping seams where they'd naturally fall, not building a framework in
advance of anyone needing it.

The honest tension: no build step means globals and load order, which quietly
invites parts to reach for each other instead of being handed what they need.
Nothing about plain script tags forces that, though. Passing dependencies in
explicitly is a discipline, and it's the one that keeps the combinations cheap.

## Real music beats generated music

Rhythms come from Bach chorales, and the score says which chorale. Generated
material exists as the warm-up case, not the destination. When the program can
draw on the actual repertoire, it should, and it should tell you what you're
playing — practice attaches to real pieces better than to a random sequence with
the same difficulty profile.

## One program, every level

The same app should be worth opening on your first week and in your tenth year.
Not two products bolted together — one set of activities with enough range in them
that a beginner finds a rung they can stand on and an advanced player still finds
the ceiling out of reach.

That makes difficulty scaling a first-class design concern, not a setting added at
the end. Every activity should have a legible axis (or several) along which it gets
harder, and the axes should be independent so a player can be advanced in one
dimension and a beginner in another — reading fluently but tapping sixteenths
badly, say. The rhythm trainer already shows the shape: note vocabulary, tempo,
measure count, rests on or off, one hand or two, timing alone or timing plus pitch.
Each of those moves difficulty on its own.

The pitch modes want the same treatment. Note range, chord and scale vocabulary,
inversions, key signatures, how much is played for you versus asked cold, how long
you have to answer — the material for these axes is mostly already in the theory
layer; what's missing is exposing them as ways to turn the dial. A new activity
isn't finished until you can say how a beginner meets it and how it stays hard.

Difficulty should also be honest about direction: easier means fewer things at
once, not a lower bar for what counts as correct. The pass threshold and the
timing windows stay where they are — the exercise gets simpler, the standard
doesn't move.

## Honest feedback, honestly measured

Timing runs off the audio clock, not `Date.now()`, because the metronome you hear
and the playhead you see must be the same clock or the feedback is a lie. Taps are
stamped where they actually landed so early and late are visible at a glance.
Tolerances are absolute wall-clock windows, not beat-relative ones — "tight" means
the same thing at 60 bpm as at 140. The pass bar is 95%. The program should never
congratulate you for something you didn't do.

## Nothing is hidden that could be adjusted

Waveform, detune, attack, release, note length, gap, tempo, measure count, hands,
rests, metronome, key bindings — all exposed and live, because the right value for
any of them is found by ear, not guessed in source. Chrome collapses into panels
behind a menu bar so the activity gets the screen, but no setting is buried in a
constant where a player can't reach it.

## The user's machine stays clean

No cookies, no accounts, no analytics, no server. If settings need to persist,
they should ride in a URL the user can copy and keep, on their terms. Nothing
about this project should require trusting it with anything.

## Code reads like prose

`snake_case`, unceremonious names, and comments that explain *why* a decision was
made rather than restating the line beneath them. TODOs stay in the file as honest
notes to the next session instead of being tidied away. Commit messages describe
the musical effect — "let the ear-training interval be heard again", "close the
gap the playhead jumped at each barline" — because that's the level the change
actually happened at.

## The direction

Toward practice a musician would design for themselves: sessions you can shape
(loop all twelve major scales, twice each), material drawn from real pieces,
feedback precise enough to correct against, and an app that starts instantly and
asks nothing of you but that you play.
