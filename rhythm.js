// Rhythm trainer: generates a few measures of rhythm, renders them as notation, then
// scans a playhead across the score while the player taps the rhythm on any key. Each
// tap is stamped onto the score at the moment it landed, so early/late is visible at a
// glance, and hitting enough of the notes tightly enough passes the round.
//
// All timing runs off audio_context.currentTime rather than Date.now()/setTimeout --
// the audio clock doesn't drift or get shoved around by a busy main thread, and it's
// the same clock the metronome clicks are scheduled against, so the visual playhead and
// what you hear stay locked together.

const BEATS_PER_MEASURE = 4;
const MEASURES_PER_LINE = 4;

// score geometry, in px
const SCORE_MARGIN = 10;
const FIRST_LINE_TOP = 20;    // baseline clearance above the first system
const SYSTEM_GAP = 38;        // baseline clearance from one system's foot to the next one's head
const STRIP_BASE_OFFSET = 14; // gap between the strip's underside and the staff's top line
const STRIP_HEIGHT = 16;
const PLAYHEAD_OVERHANG = 3;  // how far the playhead pokes out of the strip, top and bottom
const GRAND_STAFF_GAP = 95;   // treble stave top to bass stave top, when both hands play
const STAVE_TOP_INSET = 40;   // a stave's own y down to its top line -- VexFlow's fixed default
const STAFF_HEIGHT = 40;      // a stave's own top line to bottom line -- VexFlow's fixed default
// VexFlow always draws the brace a fixed distance to the left of the stave's own x,
// whatever the gap between the staves -- reserve room for it or its curl gets clipped by
// the canvas edge when the margin is otherwise this tight
const BRACE_OVERHANG = 16;
// however far a note's own reach (ledger lines, stems, accidentals) actually measures,
// leave this much further clearance beyond it as breathing room
const NOTE_OVERFLOW_MARGIN = 8;

const rhythm_settings = {
    tempo: 80,
    measures: 4,
    source: 'generated', // 'generated' | 'bach' | 'partimento'
    melody: false,       // also require the written pitch, not just the timing
    hands: 'right',      // 'right' | 'left' | 'both' -- 'both' adds the lower voice
    // which duration codes generate_measure() is allowed to place -- see DURATION_TYPES for
    // what each code means. Starts minimal (quarters and halves only, the two values a
    // first-time player already knows) rather than the old "Eighths" tier's whole spread --
    // the note-types panel is exactly where a more advanced player turns the rest on.
    durations: { w: false, h: true, hd: false, q: true, qd: false, '8': false, '8d': false, '16': false },
    // which duration codes are allowed to come out silent -- same idea as durations above,
    // and the same starting set, so a rest never shows up in a value the player hasn't
    // even met as a sounding note yet
    restDurations: { w: false, h: true, hd: false, q: true, qd: false, '8': false, '8d': false, '16': false },
    ties: true,          // let an off-the-beat note tie across the beat instead of stopping at it
    metronome: true,
};

function partimento_mode() {
    return rhythm_settings.source === 'partimento';
}

function scales_mode() {
    return rhythm_settings.source === 'scales';
}

// melodies only exist in the borrowed corpus, so melody mode implies a real passage. A
// partimento pattern needs no such switch -- there is nothing in one to practise but the
// notes, so it is always pitched. Scale practice is the same story as partimento.
function melodic() {
    return partimento_mode() || scales_mode() || (rhythm_settings.melody && rhythm_settings.source === 'bach');
}

// the lower line is only worth showing when its pitches are being asked for. A partimento
// pattern is a shape made by two hands against each other -- one hand of it is half an
// exercise -- so it is two-handed by nature rather than by setting, and saying so here
// rather than by forcing the setting means no route into the mode can miss it.
function two_handed() {
    return partimento_mode() || (melodic() && rhythm_settings.hands === 'both');
}

// left hand alone: the lower voice becomes the one voice, read from a bass-clef staff
function left_only() {
    return !partimento_mode() && melodic() && rhythm_settings.hands === 'left';
}

function total_beats() {
    return rhythm_settings.measures * BEATS_PER_MEASURE;
}

// Timing tolerances, in seconds. Absolute rather than beat-relative on purpose: playing
// "tightly" means the same wall-clock precision whether the tempo is 60 or 140.
const PERFECT_WINDOW = 0.03;
const GOOD_WINDOW = 0.08; // the bar a note has to clear to be counted at all
const MATCH_WINDOW = 0.28; // past this a tap isn't credited to that note at all
const PASS_RATIO = 0.95;

// No window can be allowed to reach as far as the neighbouring note, though, or the
// grader stops being able to tell which note a tap was aiming at: at 160bpm a sixteenth
// lasts 94ms, so a flat 280ms match window spans three of them and a stray tap counts
// against whichever it happens to drift nearest. Half the shortest note the passage uses
// is the furthest a tap can sit from its own note and still be nearer to it than to the
// next one, so every window is capped there. At ordinary tempos that limit is far wider
// than the tolerances above and changes nothing -- it only bites where the notes are
// genuinely arriving faster than the tolerance itself.
function timing_window(seconds) {
    const shortest_note = beat_duration() / current_rhythm.perBeat;
    return Math.min(seconds, shortest_note / 2);
}

// dotted codes are the plain code plus 'd' -- VexFlow accepts that suffixed form directly
// (see build_stave_notes()), so there's no separate naming scheme to keep in sync
const DURATION_BEATS = {
    'w': 4, 'h': 2, 'q': 1, '8': 0.5, '16': 0.25,
    'hd': 3, 'qd': 1.5, '8d': 0.75,
};
// every duration the note-types panel offers a toggle for, longest first -- this is the
// one place their display order and label text live, so the panel is built from it rather
// than hand-written to match
const DURATION_TYPES = [
    { code: 'w', label: 'Whole' },
    { code: 'h', label: 'Half' },
    { code: 'hd', label: 'Dotted half' },
    { code: 'q', label: 'Quarter' },
    { code: 'qd', label: 'Dotted quarter' },
    { code: '8', label: 'Eighth' },
    { code: '8d', label: 'Dotted eighth' },
    { code: '16', label: 'Sixteenth' },
];

function enabled_durations() {
    return DURATION_TYPES.map((d) => d.code).filter((code) => rhythm_settings.durations[code]);
}

function enabled_rest_durations() {
    return DURATION_TYPES.map((d) => d.code).filter((code) => rhythm_settings.restDurations[code]);
}

// the note-types panel refuses to switch off the last of these three -- see fillable()
// below for why a beat can always be completed as long as one of them stays on
const ESSENTIAL_DURATIONS = ['q', '8', '16'];

let current_rhythm = null;
let rhythm_staves = [];
let rhythm_domains = []; // per measure: the {start, end} x-range one measure of time spans
let rhythm_hits = [];        // beat positions of the player's taps this run
let rhythm_run_start = null; // audio-clock time that beat 0 lands on
let rhythm_running = false;
let rhythm_raf = null;
let rhythm_end_timer = null; // backstop so a run always ends, even if rAF is suspended
let scheduled_clicks = [];   // this run's metronome, so stopping early can silence it

const rhythm_panel = document.getElementById('rhythm_panel');
const rhythm_score = document.getElementById('rhythm_score');
const rhythm_overlay = document.getElementById('rhythm_overlay');
const rhythm_playhead = document.getElementById('rhythm_playhead');
const rhythm_feedback = document.getElementById('rhythm_feedback');
const rhythm_source_label = document.getElementById('rhythm_source_label');
const rhythm_start_button = document.getElementById('rhythm_start');

function beat_duration() {
    return 60 / rhythm_settings.tempo;
}

// --- generation ---------------------------------------------------------------

// Standard rhythmic notation keeps the beat visible at a glance: a note shorter than a
// beat must not straddle a beat boundary (an eighth note starting on the "and" of beat 1
// has to end by beat 2, not run past it), and a note longer than a beat must start
// exactly on one. Picking any duration that merely fits the beats left in the bar --
// which is what this used to do -- happily violates both: it can just as easily open a
// quarter note on an off-beat eighth as on the beat itself, which is how you get a
// quarter that eats the boundary between beats 2 and 3 with nothing to mark where beat 3
// actually falls. Real syncopation crosses the beat too, but on purpose and visibly --
// via a tie, so the boundary is still marked even though nothing attacks there; see
// add_ties() below for that half of the picture. See Gould, "Behind Bars", or Read,
// "Music Notation", on beaming and rest values reflecting the beat -- this is standard
// engraving practice, not a house style.
//
// So generation is built beat-by-beat instead of across the whole bar: a note bigger than
// a beat is only ever opened while standing on a beat boundary, and everything else fills
// exactly one beat by recursively halving it (q -> 8+8 -> 16+16+16+16, or any mix the
// vocabulary allows). Every halving lands back on beat- or half-beat-aligned ground, so
// nothing produced this way can ever obscure a beat.
const CELL_DURATION = { 1: 'q', 0.5: '8', 0.25: '16' }; // duration code for one beat or less
const KEEP_WHOLE_CHANCE = 0.55; // vs. splitting a beat cell in two, when both are legal
const SPAN_BEATS_CHANCE = 0.35; // vs. filling one beat at a time, when a bigger note fits
const REST_CHANCE = 0.18;

function push_note(measure, duration) {
    // never open on a rest -- there'd be nothing to anchor the first beat against. beyond
    // that, a slot can only turn into a rest if this exact duration's rest is switched on --
    // the shape of the measure is still decided purely by which note durations are enabled
    // (see enabled_durations()); this just decides whether this particular slot stays silent
    const rest = measure.length > 0 && rhythm_settings.restDurations[duration] && Math.random() < REST_CHANCE;
    measure.push({ duration, rest });
}

// can a cell this size ever be filled at all with the enabled durations -- either it has
// a code of its own (a plain "keep it whole" cell), or it can be split and each half is
// itself fillable. Recursing on just one half is enough: both halves are the same size
// drawing from the same pool, so if one works the other does too. This is what makes
// fill_beat() safe to call with, say, only sixteenths enabled and no eighths -- a bare
// pool.includes(CELL_DURATION[half]) check would've missed that a beat is still fillable
// two levels down, and silently reached for a plain quarter instead, ignoring what was
// actually turned on.
function fillable(cellBeats, pool) {
    if (pool.includes(CELL_DURATION[cellBeats])) return true;
    const half = cellBeats / 2;
    return CELL_DURATION[half] !== undefined && fillable(half, pool);
}

// the one dotted shape short enough to fit inside a single beat: a dotted note plus the
// plain note that makes up the rest of the beat, 3 parts to 1. Longer dotted values
// (dotted quarter, dotted half) cross the beat the same way a plain half or whole note
// does -- see the spanning-note branch in generate_measure() -- so they never appear here.
const DOTTED_SPLIT = { 1: ['8d', '16'] }; // cellBeats -> [dotted code, plain code]
const DOT_SPLIT_CHANCE = 0.18; // vs. this cell's regular shape, when a dotted split is legal
const DOT_LONG_FIRST_CHANCE = 0.7; // dotted-note-then-plain vs. the reverse, once dotted is chosen

// fills exactly one beat-or-smaller cell: leaves it whole when a code for that exact size
// is enabled, or splits it into two equal halves and recurses -- so a beat only ever comes
// out as one of the standard subdivisions (q, or 8+8, or 8+16+16, or 16x4, ...) -- or,
// occasionally, splits unevenly into a dotted note and its complement (8d+16, or the
// reverse). Putting the short note first there starts the dotted note off the beat, which
// is exactly what add_ties() looks for -- a dotted-note-tied-into-the-next-beat is a real
// and idiomatic figure, and falls out of this for free rather than needing its own case.
function fill_beat(measure, pool, cellBeats) {
    const dotted = DOTTED_SPLIT[cellBeats];
    const canDotSplit = dotted && pool.includes(dotted[0]) && pool.includes(dotted[1]);
    if (canDotSplit && Math.random() < DOT_SPLIT_CHANCE) {
        const order = Math.random() < DOT_LONG_FIRST_CHANCE ? dotted : [dotted[1], dotted[0]];
        order.forEach((duration) => push_note(measure, duration));
        return;
    }

    const whole = CELL_DURATION[cellBeats];
    const half = cellBeats / 2;
    const canKeep = pool.includes(whole);
    const canSplit = CELL_DURATION[half] !== undefined && fillable(half, pool);

    if (canSplit && (!canKeep || Math.random() > KEEP_WHOLE_CHANCE)) {
        fill_beat(measure, pool, half);
        fill_beat(measure, pool, half);
    } else if (canKeep) {
        push_note(measure, whole);
    } else {
        // structurally impossible with what's enabled -- the note-types panel guarantees
        // at least one of quarter/eighth/sixteenth always stays on, which guarantees this
        // is always reachable, so getting here means that guarantee broke somewhere. Fail
        // loudly rather than silently placing a note outside what the player selected.
        throw new Error(`no enabled duration can fill a ${cellBeats}-beat cell`);
    }
}

const SYNCOPATION_CHANCE = 0.35; // vs. leaving the beat boundary as a fresh attack, when a tie is eligible

// A tie is the sanctioned way to cross a beat: fill_beat() and the spanning-note branch
// above never let a single note straddle a boundary, but a note that already starts off
// the beat can be tied forward into whatever begins the next one, so the sound still
// carries through without a new attack pretending the boundary isn't there. Eligibility
// mirrors that reasoning -- only a note that itself began off the beat may open a tie
// (tying a note that already started on the beat would just spell a plain note or a rest
// some other way, not notate syncopation), and only at a boundary it lands on exactly.
function add_ties(measure) {
    if (!rhythm_settings.ties) return;
    let beat = 0;
    for (let i = 0; i < measure.length - 1; i++) {
        const note = measure[i];
        const end = beat + DURATION_BEATS[note.duration];
        const startedOffBeat = Math.abs(beat - Math.round(beat)) > 1e-9;
        const endsOnBeat = Math.abs(end - Math.round(end)) < 1e-9;
        const next = measure[i + 1];
        if (startedOffBeat && endsOnBeat && !note.rest && !next.rest && Math.random() < SYNCOPATION_CHANCE) {
            note.tie = true;
        }
        beat = end;
    }
}

function generate_measure() {
    const pool = enabled_durations();
    // a spanning note whose length isn't a whole number of beats (only the dotted quarter,
    // at 1.5) leaves a fractional remainder behind for fill_beat() to pick up afterwards
    // (see below) -- so it's only actually usable if that leftover is itself fillable.
    // Enabling the dotted quarter without also enabling an eighth or sixteenth to close out
    // its remainder would otherwise be a selection this function could never honour.
    const spanning = Object.keys(DURATION_BEATS).filter((d) => {
        if (DURATION_BEATS[d] <= 1 || !pool.includes(d)) return false;
        const remainder = DURATION_BEATS[d] % 1;
        return remainder === 0 || fillable(remainder, pool);
    });
    const measure = [];
    let beat = 0;

    while (beat < BEATS_PER_MEASURE - 1e-9) {
        // a dotted quarter (1.5 beats) is the one spanning note whose length isn't a
        // whole number of beats, so placing one leaves `beat` sitting mid-beat -- close
        // out just that remainder before the next full-beat decision, the same way any
        // other off-beat fragment gets filled, rather than letting fill_beat(1) start
        // from an unaligned position and straddle the next boundary by accident
        const toNextBeat = Math.ceil(beat - 1e-9) - beat;
        if (toNextBeat > 1e-9) {
            fill_beat(measure, pool, toNextBeat);
            beat += toNextBeat;
            continue;
        }
        const remaining = BEATS_PER_MEASURE - beat;
        const fits = spanning.filter((d) => DURATION_BEATS[d] <= remaining + 1e-9);
        if (fits.length && Math.random() < SPAN_BEATS_CHANCE) {
            const duration = random_element(fits);
            push_note(measure, duration);
            beat += DURATION_BEATS[duration];
        } else {
            fill_beat(measure, pool, 1);
            beat += 1;
        }
    }
    add_ties(measure);
    return measure;
}

// the smallest number of equal slices a beat needs so this one note's duration comes out
// to a whole number of slices. Every duration this file produces is a multiple of a
// sixteenth note, so quartering the beat is always fine enough -- this just finds the
// coarsest grid that still works, rather than assuming the finest one is always needed.
// (A plain "shortest duration present" heuristic gets this wrong for a dotted note: a
// dotted eighth is 0.75 of a beat, longer than a bare sixteenth, but still lands on
// sixteenth-note ground and needs that same quarter-of-a-beat grid to be marked correctly.)
function beat_denominator(duration) {
    const beats = DURATION_BEATS[duration];
    for (const n of [1, 2, 4]) {
        if (Math.abs(beats * n - Math.round(beats * n)) < 1e-9) return n;
    }
    return 4;
}

// walks the measures assigning each note its absolute beat, and collects the onsets the
// player is expected to tap. also settles how finely the timing strip has to be divided:
// the grid needs a line at every possible onset, which is set by whichever note in the
// passage demands the finest one.
function finish_rhythm(measures, attribution = null, key = null, bass = null) {
    // walk a voice, stamping each note with its absolute beat and collecting what the
    // player has to hit. with two hands both voices contribute to the same target list.
    // a note carried in on a tie is the same attack as the one before it -- nothing to
    // tap a second time -- so it's stamped with its beat like any other note (the score
    // still needs it, and its own duration still advances the clock) but never targeted.
    const targets = [];
    const walk = (voice) => {
        let beat = 0;
        let tiedFromPrev = false;
        voice.forEach((measure) => {
            measure.forEach((note) => {
                note.startBeat = beat;
                if (!note.rest && !tiedFromPrev) {
                    targets.push({ beat, midi: note.pitch ? pitch_to_midi(note.pitch) : null });
                }
                tiedFromPrev = !!note.tie;
                beat += DURATION_BEATS[note.duration];
            });
        });
    };
    walk(measures);
    if (bass) walk(bass);

    // in beat order, so the greedy matcher in score_run works through them as played
    targets.sort((a, b) => a.beat - b.beat);

    const allNotes = measures.flat().concat(bass ? bass.flat() : []);
    const perBeat = Math.max(1, ...allNotes.map((n) => beat_denominator(n.duration)));

    return {
        measures,
        bass,
        onsets: targets.map((t) => t.beat),
        onsetPitches: targets.map((t) => t.midi), // parallel; null when there are no pitches
        perBeat,
        attribution,
        key,
    };
}

// A barline is still just a beat boundary underneath -- beat 0 of measure m+1 is the same
// instant as beat 4 of measure m -- so the same case for a tie applies there too: a note
// that already started off the beat can be tied across the barline into the next measure,
// same as it could across any other beat. The one place this can't be offered is where
// MEASURES_PER_LINE wraps to a new system: the two notes then sit on different lines of
// the score, and a tie is a single curve between two notes on the same line -- there's no
// sane way to draw one that arcs off the right edge of one system and back in on the left
// edge of the next, so that particular boundary is left alone.
function add_cross_measure_ties(measures) {
    if (!rhythm_settings.ties) return;
    for (let m = 0; m < measures.length - 1; m++) {
        if ((m + 1) % MEASURES_PER_LINE === 0) continue; // system break -- can't draw this one
        const measure = measures[m];
        const last = measure[measure.length - 1];
        const next = measures[m + 1][0];

        let lastStart = 0;
        for (let i = 0; i < measure.length - 1; i++) lastStart += DURATION_BEATS[measure[i].duration];
        const startedOffBeat = Math.abs(lastStart - Math.round(lastStart)) > 1e-9;

        if (startedOffBeat && !last.rest && !next.rest && Math.random() < SYNCOPATION_CHANCE) {
            last.tie = true;
        }
    }
}

// builds count measures of rhythm shape -- no pitches, just durations/rests/ties -- via
// generate_measure(), plus the cross-measure tie pass that only makes sense once every
// measure exists. Shared with partimento.js's partimento_passage(), so a partimento
// passage's rhythm comes from the exact same settings-respecting code path a Generated
// rhythm's does, rather than a second copy that could drift out of sync with it.
function generate_rhythm_shape(count) {
    const measures = [];
    for (let m = 0; m < count; m++) measures.push(generate_measure());
    add_cross_measure_ties(measures);
    return measures;
}

function generate_rhythm() {
    return finish_rhythm(generate_rhythm_shape(rhythm_settings.measures));
}

// --- borrowed passages --------------------------------------------------------

const PITCH_CLASS = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

// corpus notes are 'duration:pitch' ('q:f#4') or a bare rest ('8r'), either optionally
// carrying a trailing '~' -- a tie forward into whichever note follows it
function parse_note(token) {
    const tie = token.endsWith('~');
    if (tie) token = token.slice(0, -1);
    if (token.endsWith('r')) {
        return { duration: token.slice(0, -1), rest: true };
    }
    const [duration, pitch] = token.split(':');
    return { duration, rest: false, pitch, tie };
}

// 'f#4' -> 'f#/4', the key format VexFlow wants
function pitch_to_vexkey(pitch) {
    return `${pitch.slice(0, -1)}/${pitch.slice(-1)}`;
}

function pitch_to_midi(pitch) {
    const octave = parseInt(pitch.slice(-1), 10);
    const body = pitch.slice(0, -1);
    let semitones = PITCH_CLASS[body[0]];
    for (const ch of body.slice(1)) semitones += ch === '#' ? 1 : -1;
    return (octave + 1) * 12 + semitones;
}

// A tie the corpus kept is a fact about the real piece, not something under this
// excerpt's control the way a generated tie is -- generate_rhythm() simply never opens
// one at a spot it can't draw, but bach_excerpt() below slices a *random* window out of
// a longer run, so the same kept tie can land on the last measure of a rendered system
// in one round and land safely mid-system in the next, purely by luck of the offset. Strip
// it wherever this particular slice puts it somewhere layout_system() has no next note to
// reach for: the last measure of a system (a tie can't arc from one system to the next --
// see add_cross_measure_ties() in the generator for the same restriction), or the last
// measure of the slice itself (there's no next measure in this excerpt at all).
function guard_unsafe_ties(measures) {
    measures.forEach((measure, i) => {
        const last = measure[measure.length - 1];
        if (!last || !last.tie) return;
        const systemBreak = (i + 1) % MEASURES_PER_LINE === 0;
        const lastOfSlice = i === measures.length - 1;
        if (systemBreak || lastOfSlice) last.tie = false;
    });
}

// takes a contiguous window out of one real passage, rather than stitching together
// bars from unrelated pieces -- the point is to practise music that actually occurs
function bach_excerpt() {
    const wanted = rhythm_settings.measures;
    // vocab/ties describe an excerpt's *whole* run, which can be longer than the window
    // actually drawn from it (the random offset below) -- so this is a conservative
    // filter, not a precise one: a long excerpt is excluded if any bar in it anywhere
    // needs a duration that's off, even if the few bars offset happens to land on would
    // have been fine. That's the side to err on -- it can only under-offer real passages,
    // never serve one that doesn't fit -- and the caller already falls back to a
    // generated rhythm when nothing matches.
    //
    // a duration counts as allowed here if it's on either as a note or as a rest --
    // vocab doesn't distinguish which role a given occurrence played, so this can't be
    // fully precise about "no eighth rests, but eighth notes are fine": it just avoids
    // excluding a passage for a rest when the matching note duration is already allowed.
    const allowed = new Set([...enabled_durations(), ...enabled_rest_durations()]);
    const candidates = BACH_EXCERPTS.filter((e) =>
        e.s.length >= wanted
        && e.vocab.every((code) => allowed.has(code))
        && (rhythm_settings.ties || !e.ties)
    );
    if (candidates.length === 0) return null;

    const excerpt = random_element(candidates);
    const offset = Math.floor(Math.random() * (excerpt.s.length - wanted + 1));
    const read = (indices) => indices
        .slice(offset, offset + wanted)
        .map((mi) => BACH_MEASURES[mi].map((ni) => parse_note(BACH_NOTES[ni])));

    // left hand alone practises the bass on its own, so it becomes the primary voice
    const measures = left_only() ? read(excerpt.b) : read(excerpt.s);
    const bass = two_handed() ? read(excerpt.b) : null;
    guard_unsafe_ties(measures);
    if (bass) guard_unsafe_ties(bass);

    const [catalogue, title, key] = BACH_PIECES[excerpt.p];
    const first = offset + 1;
    const bars = wanted === 1 ? `m. ${first}` : `mm. ${first}–${first + wanted - 1}`;
    // a handful of the source files carry no BWV number; their filename stem is no use
    // to a reader, so just leave the catalogue segment out for those
    const parts = ['J.S. Bach'];
    if (/^BWV/.test(catalogue)) parts.push(catalogue);
    const voice = bass ? 'soprano & bass' : left_only() ? 'bass' : 'soprano';
    parts.push(`${bars}, ${voice}`);
    return finish_rhythm(measures, { title, detail: parts.join(' · ') }, key, bass);
}

// --- rendering ----------------------------------------------------------------

// A stave reserves space at its left for the barline, and more if it carries a clef or
// time signature, so its note area starts inset from its own x. Measuring that inset up
// front lets each stave be widened by exactly its own overhead, which makes every
// measure's note area come out the same width and butt directly against the next one.
function stave_overhead(clef, withTimeSignature, keySignature) {
    const probe = new Vex.Flow.Stave(0, 0, 200);
    if (clef) probe.addClef(clef);
    if (keySignature) probe.addKeySignature(keySignature);
    if (withTimeSignature) probe.addTimeSignature('4/4');
    return probe.getNoteStartX() - probe.getX();
}

function upper_clef() {
    if (!melodic()) return 'percussion';
    return left_only() ? 'bass' : 'treble';
}

// the middle line of the staff, in VexFlow key form -- rests sit here for whichever
// clef they are being drawn on. Using a treble position ('b/4') unconditionally is what
// caused a bass-staff rest to float several ledger lines up into the staff above it.
const CLEF_MIDDLE_LINE = { treble: 'b/4', bass: 'd/3', percussion: 'b/4' };

function build_stave_notes(measure, clef) {
    const VF = Vex.Flow;
    const restKey = CLEF_MIDDLE_LINE[clef];
    return measure.map((note) => {
        const options = {
            // rhythm-only notation parks every note on the middle line; melody mode puts
            // it at its written pitch, and a rest at the clef's own middle line
            keys: [melodic() && note.pitch ? pitch_to_vexkey(note.pitch) : restKey],
            duration: note.rest ? note.duration + 'r' : note.duration,
            clef, // without this the bass staff would place notes as if it were treble
        };
        if (!melodic()) options.stem_direction = 1; // uniform stems read as a rhythm
        const staveNote = new VF.StaveNote(options);
        // the 'd' suffix alone (e.g. "qd") already gives the note its correct duration --
        // VexFlow just doesn't draw the augmentation dot glyph for that on its own, so it
        // has to be attached as its own step, and before formatting or nothing reserves
        // the space for it
        if (note.duration.endsWith('d')) VF.Dot.buildAndAttach([staveNote], { all: true });
        return staveNote;
    });
}

// the curved tie marks for whichever notes in this measure add_ties() tagged -- built
// from the same measure array build_stave_notes() just turned into VF.StaveNote objects,
// so the indices still line up one-to-one between the two. the measure's own last note
// is skipped here even when tagged -- that tie's other end is the next measure's first
// note, which add_cross_measure_ties() may have reached across the barline for, and
// layout_system() wires up once it has both measures' notes in hand.
function build_stave_ties(measure, notes) {
    const VF = Vex.Flow;
    const ties = [];
    measure.forEach((note, i) => {
        if (note.tie && i + 1 < notes.length) {
            ties.push(new VF.StaveTie({ first_note: notes[i], last_note: notes[i + 1] }));
        }
    });
    return ties;
}

// Lays out and draws one line (system) of the score into `context` at `topY`, and
// reports how far this line's own notes reach beyond their staff: above the top stave's
// top line, below the bottom stave's bottom line, and -- on a grand staff -- into the
// gap between the two staves. Ledger lines, stems and accidentals all vary with the
// notes actually in play, so those distances aren't something to guess at from the clef
// alone; they're read off the notes VexFlow just placed.
//
// None of the three depends on topY or grandGap -- shifting a stave down shifts its
// notes down by exactly as much, so the distance between a note and its own stave line
// never changes. That's what lets render_rhythm_score() measure every line once, at
// whatever y and gap are convenient, and reuse the numbers to place the real ones.
function layout_system(context, firstIndex, count, topY, leftMargin, usable, grand, keySignature, grandGap = GRAND_STAFF_GAP) {
    const VF = Vex.Flow;
    const staves = [];
    const domains = [];

    // a bass clef is wider than a treble one, so on a grand staff the roomier of the
    // two sets the lead overhead -- otherwise the staves' note areas would start at
    // different x and the two hands wouldn't line up vertically
    const leadOverhead = Math.max(
        stave_overhead(upper_clef(), firstIndex === 0, keySignature),
        grand ? stave_overhead('bass', firstIndex === 0, keySignature) : 0
    );
    const plainOverhead = stave_overhead(null, false, null);

    // every measure gets an identical note-area width, so the playhead keeps one
    // constant speed across the whole line and no gap opens up at the barlines
    const noteAreaWidth = (usable - leadOverhead) / count;

    let upperTop = Infinity, upperBottom = -Infinity;
    let lowerTop = Infinity, lowerBottom = -Infinity;
    let upperTopLineY = null, upperBottomLineY = null, lowerTopLineY = null, bottomLineY = null;

    // a note pending a tie into the next measure's first note, carried from one column to
    // the next within this same system. It never needs to survive past the last column --
    // add_cross_measure_ties() already refuses to tag a tie at a system break -- so there's
    // nothing to hand back to render_rhythm_score() between one layout_system() call and
    // the next; each system starts and ends this local to itself.
    let carryUpperTie = null;
    let carryLowerTie = null;

    let x = leftMargin;
    for (let column = 0; column < count; column++) {
        const mi = firstIndex + column;
        let staveWidth;
        if (count === 1) staveWidth = usable;
        else if (column === 0) staveWidth = noteAreaWidth + leadOverhead - plainOverhead;
        else if (column === count - 1) staveWidth = noteAreaWidth + plainOverhead;
        else staveWidth = noteAreaWidth;

        const stave = new VF.Stave(x, topY, staveWidth);
        const bassStave = grand ? new VF.Stave(x, topY + grandGap, staveWidth) : null;

        if (column === 0) { // clef and key signature repeat on each new line
            stave.addClef(upper_clef());
            if (keySignature) stave.addKeySignature(keySignature);
            if (bassStave) {
                bassStave.addClef('bass');
                if (keySignature) bassStave.addKeySignature(keySignature);
            }
        }
        if (mi === 0) {
            stave.addTimeSignature('4/4');
            if (bassStave) bassStave.addTimeSignature('4/4');
        }

        if (bassStave) { // force both note areas to begin together
            const startX = Math.max(stave.getNoteStartX(), bassStave.getNoteStartX());
            stave.setNoteStartX(startX);
            bassStave.setNoteStartX(startX);
        }

        stave.setContext(context).draw();
        if (bassStave) bassStave.setContext(context).draw();
        staves.push(stave);

        const start = stave.getNoteStartX();
        domains.push({ start, end: start + noteAreaWidth });

        const upperNotes = build_stave_notes(current_rhythm.measures[mi], upper_clef());
        const lowerNotes = bassStave
            ? build_stave_notes(current_rhythm.bass[mi], 'bass')
            : null;

        const voices = [];
        const makeVoice = (notes) => {
            const v = new VF.Voice({ num_beats: BEATS_PER_MEASURE, beat_value: 4 });
            v.addTickables(notes);
            voices.push(v);
            return v;
        };
        const upperVoice = makeVoice(upperNotes);
        const lowerVoice = lowerNotes ? makeVoice(lowerNotes) : null;

        if (melodic()) {
            // lets VexFlow work out which accidentals actually need printing given
            // the key signature and what has already appeared in the bar
            VF.Accidental.applyAccidentals(voices, keySignature);
        }

        const beams = VF.Beam.generateBeams(upperNotes)
            .concat(lowerNotes ? VF.Beam.generateBeams(lowerNotes) : []);
        const ties = build_stave_ties(current_rhythm.measures[mi], upperNotes)
            .concat(lowerNotes ? build_stave_ties(current_rhythm.bass[mi], lowerNotes) : []);
        // stitch in whatever the previous column left pending -- its last note is already
        // fully formatted (that happened on its own turn through this loop), and this
        // column's first note is about to be, so by draw time both ends are in place
        if (carryUpperTie) ties.push(new VF.StaveTie({ first_note: carryUpperTie, last_note: upperNotes[0] }));
        if (carryLowerTie) ties.push(new VF.StaveTie({ first_note: carryLowerTie, last_note: lowerNotes[0] }));

        // formatting both voices together is what keeps the hands aligned in time
        const formatter = new VF.Formatter();
        voices.forEach((v) => formatter.joinVoices([v]));
        formatter.formatToStave(voices, stave);

        upperVoice.setContext(context).setStave(stave).draw();
        if (lowerVoice) lowerVoice.setContext(context).setStave(bassStave).draw();
        beams.forEach((beam) => beam.setContext(context).draw());
        ties.forEach((tie) => tie.setContext(context).draw());

        const upperMeasure = current_rhythm.measures[mi];
        carryUpperTie = upperMeasure[upperMeasure.length - 1].tie ? upperNotes[upperNotes.length - 1] : null;
        carryLowerTie = null;
        if (lowerNotes) {
            const lowerMeasure = current_rhythm.bass[mi];
            carryLowerTie = lowerMeasure[lowerMeasure.length - 1].tie ? lowerNotes[lowerNotes.length - 1] : null;
        }

        if (bassStave) { // brace the system, and join the barlines between staves
            const connector = column === 0 ? VF.StaveConnector.type.BRACE : null;
            if (connector !== null) {
                new VF.StaveConnector(stave, bassStave)
                    .setType(connector).setContext(context).draw();
            }
            new VF.StaveConnector(stave, bassStave)
                .setType(VF.StaveConnector.type.SINGLE_RIGHT).setContext(context).draw();
            if (column === 0) {
                new VF.StaveConnector(stave, bassStave)
                    .setType(VF.StaveConnector.type.SINGLE_LEFT).setContext(context).draw();
            }
        }

        upperTopLineY = stave.getYForLine(0);
        upperBottomLineY = stave.getYForLine(4);
        if (bassStave) {
            lowerTopLineY = bassStave.getYForLine(0);
            bottomLineY = bassStave.getYForLine(4);
        }
        upperNotes.forEach((n) => {
            const bb = n.getBoundingBox();
            upperTop = Math.min(upperTop, bb.y);
            upperBottom = Math.max(upperBottom, bb.y + bb.h);
        });
        if (lowerNotes) {
            lowerNotes.forEach((n) => {
                const bb = n.getBoundingBox();
                lowerTop = Math.min(lowerTop, bb.y);
                lowerBottom = Math.max(lowerBottom, bb.y + bb.h);
            });
        }

        x += staveWidth;
    }

    const overflowAbove = Math.max(0, upperTopLineY - upperTop);
    const overflowBelow = Math.max(0, (grand ? lowerBottom : upperBottom) - (grand ? bottomLineY : upperBottomLineY));
    // how far the two hands' notes would reach into the gap between the staves --
    // 0 whenever there's only one staff to begin with
    const innerOverflow = grand
        ? Math.max(0, (upperBottom - upperBottomLineY) + (lowerTopLineY - lowerTop))
        : 0;

    return { staves, domains, extent: { overflowAbove, overflowBelow, innerOverflow } };
}

function render_rhythm_score() {
    const VF = Vex.Flow;
    rhythm_score.innerHTML = '';

    const measureCount = current_rhythm.measures.length;
    const lineCount = Math.ceil(measureCount / MEASURES_PER_LINE);
    const grand = two_handed();
    const keySignature = melodic() ? current_rhythm.key : null;

    const width = rhythm_score.clientWidth || 880;
    const leftMargin = SCORE_MARGIN + (grand ? BRACE_OVERHANG : 0);
    const usable = width - leftMargin - SCORE_MARGIN;

    // Pass 1 (measurement): lay out every line into a throwaway, never-attached context.
    // Where a line ends up drawn is just a vertical shift of where it's measured here, so
    // the clearance it actually needs above and below itself can be read off this pass and
    // reused untouched for the real one -- see layout_system() for why that holds.
    const scratch = new VF.Renderer(document.createElement('div'), VF.Renderer.Backends.SVG);
    scratch.resize(Math.max(width, 1), 1);
    const scratchContext = scratch.getContext();
    const extents = [];
    for (let line = 0; line < lineCount; line++) {
        const firstIndex = line * MEASURES_PER_LINE;
        const count = Math.min(MEASURES_PER_LINE, measureCount - firstIndex);
        extents.push(
            layout_system(scratchContext, firstIndex, count, 0, leftMargin, usable, grand, keySignature).extent
        );
    }

    // Pass 2: turn those measurements into a clearance above the first system, a gap
    // before every later one, and a margin below the last one, then draw for real at the
    // y's that come out of that -- nothing is left to guess, so nothing gets clipped.
    //
    // the grand-staff gap only grows past its default when the two hands would otherwise
    // crowd each other in the middle of a system -- most systems keep the default
    const grandGaps = extents.map((e) => grand
        ? Math.max(GRAND_STAFF_GAP, STAFF_HEIGHT + e.innerOverflow + NOTE_OVERFLOW_MARGIN)
        : GRAND_STAFF_GAP);
    const topYs = [];
    let cursor = 0;
    for (let line = 0; line < lineCount; line++) {
        const clearance = line === 0
            ? Math.max(FIRST_LINE_TOP, extents[0].overflowAbove + NOTE_OVERFLOW_MARGIN)
            : Math.max(SYSTEM_GAP, extents[line - 1].overflowBelow + extents[line].overflowAbove + NOTE_OVERFLOW_MARGIN);
        cursor += clearance;
        topYs[line] = cursor;
        // how far this line's own bottom line sits below its staveY -- the bass stave's
        // when grand, since that's the lower of the two
        cursor += (grand ? grandGaps[line] : 0) + STAVE_TOP_INSET + STAFF_HEIGHT;
    }
    const lastExtent = extents[lineCount - 1];
    const totalHeight = cursor + lastExtent.overflowBelow + NOTE_OVERFLOW_MARGIN;

    const renderer = new VF.Renderer(rhythm_score, VF.Renderer.Backends.SVG);
    renderer.resize(width, totalHeight);
    const context = renderer.getContext();

    rhythm_staves = [];
    rhythm_domains = [];
    for (let line = 0; line < lineCount; line++) {
        const firstIndex = line * MEASURES_PER_LINE;
        const count = Math.min(MEASURES_PER_LINE, measureCount - firstIndex);
        const { staves, domains } = layout_system(
            context, firstIndex, count, topYs[line], leftMargin, usable, grand, keySignature, grandGaps[line]
        );
        rhythm_staves.push(...staves);
        rhythm_domains.push(...domains);
    }

    draw_timing_strips();
}

// The strip above each staff is where timing is actually read. Engraved notation spaces
// notes by convention rather than by elapsed time, so the playhead can't both move at a
// constant speed and sit on the note stems. The strip resolves that: it divides the
// measure into even fractions of time, so the playhead sweeps smoothly across it and a
// tap's mark can be compared against the grid line it was aiming for.

function svg_element(tag, attributes) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attributes).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
}

// One unbroken rectangle per line, since the measures' note areas now butt together --
// the playhead crosses a barline without a gap to jump.
function draw_timing_strips() {
    const svg = rhythm_score.querySelector('svg');
    const perBeat = current_rhythm.perBeat; // fine enough to put a line under every onset
    const steps = BEATS_PER_MEASURE * perBeat;
    const lineCount = Math.ceil(rhythm_staves.length / MEASURES_PER_LINE);

    for (let line = 0; line < lineCount; line++) {
        const firstIndex = line * MEASURES_PER_LINE;
        const lastIndex = Math.min(firstIndex + MEASURES_PER_LINE, rhythm_staves.length) - 1;
        const bottomY = rhythm_staves[firstIndex].getYForLine(0) - STRIP_BASE_OFFSET;
        const topY = bottomY - STRIP_HEIGHT;
        const left = rhythm_domains[firstIndex].start;
        const right = rhythm_domains[lastIndex].end;

        const group = svg_element('g', { class: 'rhythm_grid' });

        // shade alternate beats so the beat you're on is readable at a glance without
        // having to count divisions. resets every measure, so beat 1 is always pale.
        for (let mi = firstIndex; mi <= lastIndex; mi++) {
            const { start, end } = rhythm_domains[mi];
            for (let b = 1; b < BEATS_PER_MEASURE; b += 2) {
                const x0 = start + (b / BEATS_PER_MEASURE) * (end - start);
                const x1 = start + ((b + 1) / BEATS_PER_MEASURE) * (end - start);
                group.appendChild(svg_element('rect', {
                    x: x0, y: topY, width: x1 - x0, height: STRIP_HEIGHT,
                    fill: '#ece4d3', stroke: 'none',
                }));
            }
        }

        // divisions within each measure; measure starts are drawn separately below
        for (let mi = firstIndex; mi <= lastIndex; mi++) {
            const { start, end } = rhythm_domains[mi];
            for (let s = 1; s < steps; s++) {
                const onBeat = s % perBeat === 0;
                const x = start + (s / steps) * (end - start);
                group.appendChild(svg_element('line', {
                    x1: x, y1: topY, x2: x, y2: bottomY,
                    stroke: onBeat ? '#7a6f5d' : '#d4c5aa',
                    'stroke-width': onBeat ? 1.5 : 1,
                }));
            }
        }

        group.appendChild(svg_element('rect', {
            x: left, y: topY, width: right - left, height: STRIP_HEIGHT,
            fill: 'none', stroke: '#d4c5aa', 'stroke-width': 1,
        }));

        // heavy rule at every barline, drawn last so it sits over the shading and
        // divisions -- makes the measure you're in obvious while the playhead moves
        const barlines = [];
        for (let mi = firstIndex; mi <= lastIndex; mi++) barlines.push(rhythm_domains[mi].start);
        barlines.push(right); // close the far end of the line
        barlines.forEach((x) => {
            group.appendChild(svg_element('line', {
                x1: x, y1: topY, x2: x, y2: bottomY,
                stroke: '#2a2520', 'stroke-width': 3,
            }));
        });

        svg.appendChild(group);
    }
}

// maps a position in beats to a point on the score. x is linear in time so the playhead
// sweeps at a constant speed -- it tracks the timing strip above the staff, not the
// engraved note spacing. y matters once the score wraps: the playhead has to drop to the
// next system rather than run off the right edge.
function beat_to_position(beat) {
    const clamped = Math.max(0, Math.min(beat, total_beats()));
    const mi = Math.min(rhythm_staves.length - 1, Math.floor(clamped / BEATS_PER_MEASURE));
    const stave = rhythm_staves[mi];
    const { start, end } = rhythm_domains[mi];
    const withinMeasure = (clamped - mi * BEATS_PER_MEASURE) / BEATS_PER_MEASURE;
    const top = stave.getYForLine(0);
    return {
        x: start + withinMeasure * (end - start),
        top,
        bottom: stave.getYForLine(4),
        stripTop: top - STRIP_BASE_OFFSET - STRIP_HEIGHT,
    };
}

function clear_stamps() {
    [...rhythm_overlay.querySelectorAll('.rhythm_stamp')].forEach((el) => el.remove());
}

function stamp_hit(beat, accuracy) {
    const { x, stripTop } = beat_to_position(beat);
    const stamp = document.createElement('div');
    stamp.className = `rhythm_stamp ${accuracy}`;
    stamp.style.left = `${x}px`;
    // exactly fills its own system's strip, so it reads as a bar within the grid
    stamp.style.top = `${stripTop}px`;
    stamp.style.height = `${STRIP_HEIGHT}px`;
    rhythm_overlay.appendChild(stamp);
}

// how close this tap was to whichever note it's nearest -- drives the live stamp colour.
// in melody mode only notes of the right pitch are candidates, so a wrong note reads as
// off however well timed it was. the strict one-tap-per-note scoring happens at the end
// of the run in score_run().
function accuracy_for(beat, midi) {
    const { onsets, onsetPitches } = current_rhythm;
    let nearest = Infinity;
    onsets.forEach((onset, i) => {
        if (melodic() && !same_pitch_class(midi, onsetPitches[i])) return;
        nearest = Math.min(nearest, Math.abs(onset - beat) * beat_duration());
    });
    if (nearest <= timing_window(PERFECT_WINDOW)) return 'perfect';
    if (nearest <= timing_window(GOOD_WINDOW)) return 'good';
    return 'off';
}

// octave-agnostic, matching how every other quiz here compares notes -- and the on-screen
// keyboard only spans one octave, so exact-octave matching would rule it out entirely
function same_pitch_class(a, b) {
    if (a === null || a === undefined || b === null || b === undefined) return true;
    return a.mod(12) === b.mod(12);
}

// --- run loop -----------------------------------------------------------------

function prompt_text() {
    // the tolerance is the whole exercise, and it moves with the tempo and the note
    // values -- saying what it is stops a near miss from looking arbitrary
    const tolerance = ` · ±${Math.round(timing_window(GOOD_WINDOW) * 1000)}ms`;
    if (partimento_mode()) return 'press start, then play the pattern as written' + tolerance;
    return (melodic()
        ? 'press start, then play the notes as written'
        : 'press start, then play the rhythm on any key') + tolerance;
}

function update_start_button() {
    rhythm_start_button.textContent = rhythm_running ? '■ STOP' : '▶ START';
    rhythm_start_button.classList.toggle('running', rhythm_running);
}

function cancel_scheduled_clicks() {
    const now = get_audio_context().currentTime;
    scheduled_clicks.forEach((osc) => {
        // stopping at a time before the note's scheduled start means it never sounds
        try { osc.stop(now); } catch (e) { /* already finished */ }
    });
    scheduled_clicks = [];
}

// bail out of a run without scoring it, leaving the same passage up to try again --
// no reason to sit through the rest of a take you already fluffed
function abort_run() {
    if (!rhythm_running) return;
    rhythm_running = false;
    cancelAnimationFrame(rhythm_raf);
    clearTimeout(rhythm_end_timer);
    cancel_scheduled_clicks();
    rhythm_playhead.style.display = 'none';
    clear_stamps();
    rhythm_hits = [];
    update_start_button();
    rhythm_feedback.textContent = prompt_text();
    rhythm_feedback.className = '';
}

function start_rhythm_run() {
    if (rhythm_running || !current_rhythm) return; // nothing to play along to
    const ctx = get_audio_context();
    const beatDur = beat_duration();
    const leadIn = 0.3; // brief pause so the very first click isn't clipped

    rhythm_hits = [];
    clear_stamps();
    rhythm_feedback.textContent = 'counting in…';
    rhythm_feedback.className = '';

    // every click for the whole run is scheduled up front on the audio clock, so stopping
    // early has to reach back and cancel them or the metronome plays on by itself
    scheduled_clicks = [];

    // one full measure of count-in, always audible even with the metronome switched off
    for (let b = 0; b < BEATS_PER_MEASURE; b++) {
        scheduled_clicks.push(play_click(ctx.currentTime + leadIn + b * beatDur, b === 0));
    }
    rhythm_run_start = ctx.currentTime + leadIn + BEATS_PER_MEASURE * beatDur;

    if (rhythm_settings.metronome) {
        for (let b = 0; b < total_beats(); b++) {
            scheduled_clicks.push(
                play_click(rhythm_run_start + b * beatDur, b % BEATS_PER_MEASURE === 0)
            );
        }
    }

    rhythm_running = true;
    update_start_button();

    // the browser suspends requestAnimationFrame in a background tab, so if the player
    // switches away mid-run the playhead loop -- and with it score_run() -- would never
    // fire again, leaving the round stuck open forever. this timer ends the run
    // regardless. background setTimeout gets clamped to ~1s, which is late but still
    // unsticks it; whichever path fires first wins, since score_run clears the other.
    const runSeconds = (rhythm_run_start - ctx.currentTime) + total_beats() * beatDur
        + timing_window(MATCH_WINDOW);
    rhythm_end_timer = setTimeout(() => {
        if (rhythm_running) score_run();
    }, (runSeconds + 0.15) * 1000);

    animate_playhead();
}

function animate_playhead() {
    if (!rhythm_running) return;
    const beat = (get_audio_context().currentTime - rhythm_run_start) / beat_duration();

    // keep listening a moment past the final beat so a slightly late last tap still counts
    if (beat >= total_beats() + timing_window(MATCH_WINDOW) / beat_duration()) {
        score_run();
        return;
    }

    // confined to the timing strip. it used to run down through the staff as well, but
    // the strip is proportional in time while the notation is spaced by engraving
    // convention, so down there the line sat away from the note it was sounding.
    const { x, stripTop } = beat_to_position(beat);
    rhythm_playhead.style.display = 'block';
    rhythm_playhead.style.left = `${x}px`;
    rhythm_playhead.style.top = `${stripTop - PLAYHEAD_OVERHANG}px`;
    rhythm_playhead.style.height = `${STRIP_HEIGHT + PLAYHEAD_OVERHANG * 2}px`;
    if (beat < 0) rhythm_feedback.textContent = 'counting in…';
    else if (rhythm_feedback.textContent === 'counting in…') rhythm_feedback.textContent = 'go!';

    rhythm_raf = requestAnimationFrame(animate_playhead);
}

function rhythm_callback(event) {
    const [type, key, velocity] = event.data;
    if (type !== KEYDOWN || velocity === 0) return; // taps only, ignore note-offs

    // the bound transport key works whether or not a run is going, and never counts as
    // a tap -- see controls.js for how it's assigned
    if (key === midi_bindings.start_stop) {
        if (rhythm_running) abort_run();
        else start_rhythm_run();
        return;
    }

    if (!rhythm_running) return;

    const beat = (get_audio_context().currentTime - rhythm_run_start) / beat_duration();
    if (beat < -0.5 || beat > total_beats() + 1) return; // ignore stray taps outside the run

    rhythm_hits.push({ beat, midi: key });
    stamp_hit(beat, accuracy_for(beat, key));
}

function score_run() {
    rhythm_running = false;
    cancelAnimationFrame(rhythm_raf);
    clearTimeout(rhythm_end_timer);
    cancel_scheduled_clicks();
    rhythm_playhead.style.display = 'none';
    update_start_button();

    const beatDur = beat_duration();
    const matchWindow = timing_window(MATCH_WINDOW);
    const goodWindow = timing_window(GOOD_WINDOW);
    const perfectWindow = timing_window(PERFECT_WINDOW);
    const { onsets, onsetPitches } = current_rhythm;
    const claimed = new Set();
    let good = 0;
    let perfect = 0;
    let wrongNote = 0; // played in time, but not the note that was written

    // greedily credit each written note to its nearest not-yet-used tap, so one tap can't
    // satisfy two notes and a burst of taps can't inflate the score. in melody mode only
    // taps of the right pitch are eligible at all.
    onsets.forEach((onset, oi) => {
        let bestIndex = -1;
        let bestDiff = Infinity;
        let bestWrongDiff = Infinity;
        rhythm_hits.forEach((hit, i) => {
            if (claimed.has(i)) return;
            const diff = Math.abs(hit.beat - onset) * beatDur;
            if (melodic() && !same_pitch_class(hit.midi, onsetPitches[oi])) {
                bestWrongDiff = Math.min(bestWrongDiff, diff);
                return;
            }
            if (diff < bestDiff) { bestDiff = diff; bestIndex = i; }
        });
        if (bestIndex >= 0 && bestDiff <= matchWindow) {
            claimed.add(bestIndex);
            if (bestDiff <= goodWindow) good++;
            if (bestDiff <= perfectWindow) perfect++;
        } else if (bestWrongDiff <= goodWindow) {
            wrongNote++;
        }
    });

    const extra = rhythm_hits.length - claimed.size;
    const allowedExtra = Math.max(1, Math.floor(onsets.length * 0.15));
    const ratio = onsets.length ? good / onsets.length : 0;
    const passed = ratio >= PASS_RATIO && extra <= allowedExtra;

    // floored, not rounded: 27/29 rounds up to "95%" while still failing a 95% bar,
    // which reads as a contradiction
    const pct = Math.floor(ratio * 100);
    const scored = melodic() ? 'right' : 'in time';
    const extraNote = extra > 0 ? ` · ${extra} extra tap${extra === 1 ? '' : 's'}` : '';
    // worth separating out: hitting the beat but the wrong note is a different mistake
    // from being out of time, and the count alone wouldn't tell them apart
    const wrongNote_note = wrongNote > 0 ? ` · ${wrongNote} in time but wrong note` : '';
    // taps that found their note but missed the window. Worth its own count now the
    // window is tight: without it a take of all the right notes played a shade late
    // reads as "0/32 right", which looks like the notes themselves were wrong.
    const late = claimed.size - good;
    const lateNote = late > 0 ? ` · ${late} near miss${late === 1 ? '' : 'es'}` : '';
    let message;
    if (passed) {
        message = `pass — ${good}/${onsets.length} ${scored} (${perfect} dead on)${extraNote}`;
    } else if (ratio >= PASS_RATIO) {
        // the notes themselves were fine; it was the stray taps that sank it
        message = `${good}/${onsets.length} ${scored}, but ${extra} extra tap${extra === 1 ? '' : 's'} — at most ${allowedExtra} allowed`;
    } else {
        message = `${pct}% — ${good}/${onsets.length} ${scored}${lateNote}${wrongNote_note}${extraNote}, need ${Math.round(PASS_RATIO * 100)}%`;
    }
    rhythm_feedback.textContent = message;
    rhythm_feedback.className = passed ? 'passed' : 'failed';

    // a pass earns a fresh rhythm; a miss leaves this one up so it can be retried
    if (passed) setTimeout(next_rhythm, 1600);
}

// --- wiring -------------------------------------------------------------------

function next_rhythm() {
    let passage = null;
    if (partimento_mode()) {
        // Say so rather than quietly generating a rhythm. If partimento.js is missing --
        // a browser holding a stale copy of one script alongside a fresh copy of another
        // is the way this happens -- the source would otherwise fall through to the
        // generator, and picking the mode would look like it simply did nothing.
        if (typeof partimento_passage !== 'function') {
            rhythm_feedback.textContent = 'partimento patterns failed to load — reload the page';
            rhythm_feedback.className = 'failed';
            return;
        }
        passage = partimento_passage();
        if (!passage) return; // it has already said which pool was left empty
    }
    else if (scales_mode()) {
        // same defensive story as partimento above -- a stale/missing scale_practice.js
        // would otherwise fall through to the generator and look like scales did nothing
        if (typeof scale_practice_passage !== 'function') {
            rhythm_feedback.textContent = 'scale practice failed to load — reload the page';
            rhythm_feedback.className = 'failed';
            return;
        }
        passage = scale_practice_passage();
        if (!passage) return; // it has already said which pool was left empty
    }
    else if (rhythm_settings.source === 'bach') passage = bach_excerpt();

    let note = '';
    if (rhythm_settings.source === 'bach' && !passage) {
        // either no real passage runs that long, or none of the ones that do fit the
        // enabled note types -- say so rather than silently generating one
        note = ' (no matching chorale passage — generated instead)';
    }
    current_rhythm = passage || generate_rhythm();

    render_rhythm_score();
    clear_stamps();
    rhythm_playhead.style.display = 'none';
    show_attribution(current_rhythm.attribution);
    rhythm_feedback.textContent = prompt_text() + note;
    rhythm_feedback.className = '';
    update_start_button();
}

function show_attribution(attribution) {
    rhythm_source_label.innerHTML = '';
    if (!attribution) return;
    const title = document.createElement('span');
    title.className = 'piece_title';
    title.textContent = attribution.title;
    const detail = document.createElement('span');
    detail.className = 'piece_detail';
    detail.textContent = attribution.detail;
    rhythm_source_label.append(title, detail);
}

function stop_rhythm() { // handed to init_quiz so switching modes kills the run
    rhythm_running = false;
    cancelAnimationFrame(rhythm_raf);
    clearTimeout(rhythm_end_timer);
    cancel_scheduled_clicks();
    update_start_button();
}

// shared by every topic button that draws into this panel. Most of them have nothing to
// choose in the practice panel -- their settings live inline above the score -- but
// partimento roots its patterns off the note pickers, so the sections are passed in.
function init_rhythm_panel(sections = []) {
    set_relevant_options(sections);
    canvas.style.display = 'none';
    init_quiz(next_rhythm, rhythm_callback, stop_rhythm); // disables the note-types tab too; undone below
    rhythm_note_types_tab.disabled = false; // only Rhythm/Melody have any use for it
    show_display('rhythm');
    render_rhythm_score(); // re-render now the panel is visible and has a real width
}

function init_rhythm() {
    rhythm_settings.melody = false; // this topic is timing only, whatever the source
    // a partimento pattern or a scale is nothing but pitches, so neither can be left as
    // the source of a timing-only round -- fall back to the generator
    if (partimento_mode() || scales_mode()) rhythm_settings.source = 'generated';
    document.getElementById('rhythm_source').value = rhythm_settings.source;
    sync_generator_controls();
    init_rhythm_panel();
}

rhythm_start_button.addEventListener('pointerdown', () => {
    if (rhythm_running) abort_run();
    else start_rhythm_run();
});

document.getElementById('rhythm_new').addEventListener('pointerdown', () => {
    abort_run();
    next_rhythm();
});

document.getElementById('rhythm_tempo').addEventListener('input', (e) => {
    rhythm_settings.tempo = parseInt(e.target.value, 10);
    document.getElementById('rhythm_tempo_value').textContent = `${rhythm_settings.tempo} bpm`;
});

document.getElementById('rhythm_measures').addEventListener('change', (e) => {
    rhythm_settings.measures = parseInt(e.target.value, 10);
    next_rhythm();
});

document.getElementById('rhythm_source').addEventListener('change', (e) => {
    rhythm_settings.source = e.target.value;
    sync_generator_controls();
    next_rhythm();
});

document.getElementById('rhythm_hands').addEventListener('change', (e) => {
    rhythm_settings.hands = e.target.value;
    next_rhythm();
});

// --- note types panel -----------------------------------------------------------------
// Replaces the old three-tier Quarters/Eighths/Sixteenths preset, plus the separate Rests
// and Ties checkboxes, with direct control over every duration individually -- so a future
// round can, say, drill dotted quarters without also pulling in sixteenths, or allow
// quarter rests without eighth ones. Built from DURATION_TYPES rather than hand-written so
// the panel can't drift out of sync with what generate_measure() actually knows how to place.

const rhythm_note_types_tab = document.getElementById('rhythm_note_types_tab');
const rhythm_duration_selection = document.getElementById('rhythm_duration_selection');
const rhythm_rest_selection = document.getElementById('rhythm_rest_selection');
const rhythm_tie_selection = document.getElementById('rhythm_tie_selection');

// builds one row of pill buttons over DURATION_TYPES, backed by a settings object keyed
// by duration code (rhythm_settings.durations or .restDurations) -- notes and rests are
// two independent rows of the same shape, so this is shared between them
function build_duration_row(container, settingsKey) {
    return DURATION_TYPES.map(({ code, label }) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.addEventListener('pointerdown', () => toggle_duration(settingsKey, code));
        container.appendChild(button);
        return { code, button };
    });
}

const duration_buttons = build_duration_row(rhythm_duration_selection, 'durations');
const rest_buttons = build_duration_row(rhythm_rest_selection, 'restDurations');

const tie_button = document.createElement('button');
tie_button.type = 'button';
tie_button.textContent = 'Ties';
tie_button.addEventListener('pointerdown', () => {
    rhythm_settings.ties = !rhythm_settings.ties;
    tie_button.classList.toggle('active', rhythm_settings.ties);
    next_rhythm();
});
rhythm_tie_selection.appendChild(tie_button);

function toggle_duration(settingsKey, code) {
    const buttons = settingsKey === 'durations' ? duration_buttons : rest_buttons;
    const entry = buttons.find((d) => d.code === code);
    if (entry.button.disabled) return; // notes: the last of quarter/eighth/sixteenth -- see below
    rhythm_settings[settingsKey][code] = !rhythm_settings[settingsKey][code];
    sync_duration_buttons();
    next_rhythm();
}

// keeps every button's pressed look in sync with its setting, and -- for note types only --
// locks whichever of quarter/eighth/sixteenth is the last one left on. fill_beat() always
// has one of those three as its unsplittable base case (see fillable()), so letting all
// three go dark would leave a full beat with no legal way to fill it at all. Rests have no
// such floor: turning every rest off just means every generated slot sounds, which is fine.
function sync_duration_buttons() {
    const essentialOn = ESSENTIAL_DURATIONS.filter((code) => rhythm_settings.durations[code]);
    duration_buttons.forEach(({ code, button }) => {
        const active = rhythm_settings.durations[code];
        button.classList.toggle('active', active);
        const isLastEssential = ESSENTIAL_DURATIONS.includes(code) && active && essentialOn.length === 1;
        button.disabled = isLastEssential;
        button.title = isLastEssential
            ? 'at least one of quarter, eighth or sixteenth has to stay on, or a beat could never be filled'
            : '';
    });
    rest_buttons.forEach(({ code, button }) => {
        button.classList.toggle('active', rhythm_settings.restDurations[code]);
    });
    tie_button.classList.toggle('active', rhythm_settings.ties);
}
sync_duration_buttons();

// note types, rests and ties now shape every source -- generate_measure() directly for
// Generated and (through generate_rhythm_shape()) Partimento, and as a candidate filter
// for Bach excerpts (see bach_excerpt()) -- so the panel itself no longer needs to hide or
// grey out depending on which one is active
function sync_generator_controls() {
    const set_enabled = (id, enabled) => {
        const input = document.getElementById(id);
        input.disabled = !enabled;
        input.closest('label').classList.toggle('disabled', !enabled);
    };
    // melody is always Bach, partimento is always partimento, scales is always scales --
    // all three topics pin this rather than leave it a live choice, the same way Hands
    // gets pinned below. Without this, picking a different source out from under one of
    // them (or vice versa, since the dropdown's own "Partimento patterns"/"Scale
    // practice" options are otherwise still reachable) would silently morph the game into
    // a different one mid-round instead of switching topics properly through the buttons
    // that actually set one up.
    set_enabled('rhythm_source', !rhythm_settings.melody && !partimento_mode() && !scales_mode());
    set_enabled('rhythm_hands', melodic() && !partimento_mode()); // see two_handed()

    // ...and while partimento is up the control is pinned to Both, not merely greyed:
    // a disabled select still reading "Left" would be describing an exercise that is
    // being played with two hands. The stored preference is left alone underneath, so
    // melody and scale practice get their own choice back on the way out.
    const hands = document.getElementById('rhythm_hands');
    hands.value = partimento_mode() ? 'both' : rhythm_settings.hands;

    // Measures doesn't mean anything for scale practice -- the octave count drives how
    // long the passage is instead -- so the two controls swap places rather than sit
    // side by side with one of them inert.
    document.getElementById('rhythm_measures_label').style.display = scales_mode() ? 'none' : 'flex';
    document.getElementById('scale_octaves_label').style.display = scales_mode() ? 'flex' : 'none';
}
sync_generator_controls();

document.getElementById('rhythm_metronome').addEventListener('change', (e) => {
    rhythm_settings.metronome = e.target.checked;
});

// Melody is the same trainer with pitches switched on. It gets its own topic button so
// it's discoverable alongside the other practice modes, but the panel and its controls
// are shared -- either button leaves you free to flip Pitches on or off from there.
function init_melody() {
    rhythm_settings.source = 'bach'; // the only corpus carrying pitches
    rhythm_settings.melody = true;
    document.getElementById('rhythm_source').value = 'bach';
    sync_generator_controls();
    init_rhythm_panel();
}

add_game_button('Rhythm', init_rhythm, 'menu_rhythm', 'teal');
add_game_button('Melody', init_melody, 'menu_rhythm', 'teal');
