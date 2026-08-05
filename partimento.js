// Two-hand partimento patterns: the stock keyboard figures a partimento student drills
// until they sit under the fingers -- scale runs in parallel thirds and sixths, and the
// sequences that alternate between the two. Plain quarter notes for now.
//
// Every pattern is written in scale-degree space rather than in notes, so the root the
// practice options pick transposes the whole thing and no pattern has to know anything
// about keys. A pattern is just (index) -> [lower degree, upper degree], continuing
// forever, which is what lets any number of measures be asked for without a phrase
// getting cut off mid-shape.
//
// These feed the rhythm trainer's engine: a pattern becomes the same passage shape a Bach
// excerpt does, so the grand staff, playhead, metronome and note-matching all come along
// for free -- and giving these notes something other than quarters later is a change to
// this file alone.

const LETTERS = ['c', 'd', 'e', 'f', 'g', 'a', 'b'];
const LETTER_SEMITONES = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const ACCIDENTAL_SEMITONES = { '#': 1, b: -1, '': 0 };

// --- the patterns -------------------------------------------------------------

// A pattern returns the two voices' scale degrees, and the lower one is then sounded an
// octave below what it says -- that octave is the left hand moving out of the right's
// way. So the gap written here is a seventh narrower than what is heard: two degrees
// apart sounds as a tenth, two the other way as a plain sixth. Both are what a partimento
// calls a third and a sixth, which is the interval the exercise is actually about.
const THIRD = 2;
const SIXTH = -2;

// a scale run that keeps going: up an octave, back down, and round again, without
// doubling the note it turns around on
function scale_run(i) {
    const span = 7;
    const p = i.mod(span * 2);
    return p <= span ? p : span * 2 - p;
}

const PARTIMENTO_PATTERNS = [
    {
        id: 'thirds',
        name: 'Parallel thirds',
        detail: 'the scale in both hands, a third apart — a tenth, with the hands where they fall',
        voices: (i) => { const d = scale_run(i); return [d, d + THIRD]; },
    },
    {
        id: 'sixths',
        name: 'Parallel sixths',
        detail: 'the same run with the hands a sixth apart',
        voices: (i) => { const d = scale_run(i); return [d, d + SIXTH]; },
    },
    {
        id: 'thirds_sixths',
        name: 'Thirds & sixths',
        // the upper voice alternates a third and a sixth over a stepwise bass, so the two
        // hands step into each other and back out all the way up the scale
        detail: 'a stepwise bass with the upper voice alternating a third and a sixth above it',
        voices: (i) => { const d = scale_run(i); return [d, d + (i % 2 === 0 ? THIRD : SIXTH)]; },
    },
    {
        id: 'exchange',
        name: 'Voice exchange',
        // the hands trade their two notes, which turns the third they were holding into a
        // sixth without either voice going anywhere new; the pair then steps up and repeats
        detail: 'the hands swap notes, turning each third into a sixth, a step higher each time',
        voices: (i) => {
            const d = scale_run(Math.floor(i / 2));
            return i % 2 === 0 ? [d, d + THIRD] : [d + THIRD, d];
        },
    },
];

// --- spelling -----------------------------------------------------------------

// The practice options offer every enharmonic spelling of a note, but three of them name
// major keys nobody writes -- D♯ major would need nine sharps. Respelled to the key that
// sounds identical and can actually be put on a stave.
const KEY_RESPELLING = { 'D♯': 'E♭', 'G♯': 'A♭', 'A♯': 'B♭' };

function tonic_from_note_name(name) {
    const spelled = KEY_RESPELLING[name] || name;
    const tonic = {
        letter: spelled[0].toLowerCase(),
        accidental: spelled.includes('♯') ? '#' : spelled.includes('♭') ? 'b' : '',
        display: spelled,
    };
    tonic.octave = tonic_octave(tonic);
    return tonic;
}

// Every key starts from whichever octave puts its tonic nearest middle C, rather than all
// of them counting up from the same written octave -- that would leave B major sitting
// almost an octave above C major, and only one of the two anywhere near comfortable.
function tonic_octave(tonic) {
    const semitones = LETTER_SEMITONES[tonic.letter] + ACCIDENTAL_SEMITONES[tonic.accidental];
    return semitones.mod(12) <= 6 ? 4 : 3; // C through F♯ reach up to middle C's octave
}

function accidental_string(semitones) {
    if (semitones > 0) return '#'.repeat(semitones);
    if (semitones < 0) return 'b'.repeat(-semitones);
    return '';
}

// A degree is spelled by letter first -- degree 2 of any key is always the third letter up
// from the tonic -- and then whatever is left between where that letter naturally sits and
// where the scale wants the note becomes its accidental. Going by letter is what keeps
// E♭ major's fourth degree an A♭ rather than a G♯, so the key signature covers it and
// VexFlow prints no accidental at all.
function degree_to_pitch(tonic, degree, octaveShift) {
    const letterIndex = LETTERS.indexOf(tonic.letter) + degree;
    const letter = LETTERS[letterIndex.mod(7)];
    const octave = tonic.octave + octaveShift + Math.floor(letterIndex / 7);

    const natural = LETTER_SEMITONES[letter] + 12 * (octave + 1);
    const tonicPitch = LETTER_SEMITONES[tonic.letter] + ACCIDENTAL_SEMITONES[tonic.accidental]
        + 12 * (tonic.octave + octaveShift + 1);
    const wanted = tonicPitch + MAJOR_STEPS[degree.mod(7)] + 12 * Math.floor(degree / 7);

    return letter + accidental_string(wanted - natural) + octave;
}

// --- building a passage -------------------------------------------------------

function current_pattern() {
    return PARTIMENTO_PATTERNS.find((p) => p.id === rhythm_settings.pattern)
        || PARTIMENTO_PATTERNS[0];
}

function into_measures(notes_) {
    const measures = [];
    for (let i = 0; i < notes_.length; i += BEATS_PER_MEASURE) {
        measures.push(notes_.slice(i, i + BEATS_PER_MEASURE));
    }
    return measures;
}

function partimento_passage() {
    const pattern = current_pattern();
    // the same picker every other game roots itself off. It returns null only when the
    // player has switched every note off -- it says so and opens the panel itself, and C
    // keeps the score on screen in the meantime rather than blanking it.
    const root = notes.get_random() || { name: 'C', number: 0 };
    const tonic = tonic_from_note_name(root.name);

    const upper = [];
    const lower = [];
    for (let i = 0; i < rhythm_settings.measures * BEATS_PER_MEASURE; i++) {
        const [low, high] = pattern.voices(i);
        upper.push({ duration: 'q', rest: false, pitch: degree_to_pitch(tonic, high, 0) });
        lower.push({ duration: 'q', rest: false, pitch: degree_to_pitch(tonic, low, -1) });
    }

    // one hand alone practises that hand's voice on its own, so it becomes the only voice
    const primary = into_measures(left_only() ? lower : upper);
    const bass = two_handed() ? into_measures(lower) : null;

    const hands = two_handed() ? 'both hands' : left_only() ? 'left hand' : 'right hand';
    const attribution = {
        title: pattern.name,
        detail: `${tonic.display} major · ${hands}`,
    };
    const key = tonic.letter.toUpperCase() + tonic.accidental;
    return finish_rhythm(primary, attribution, key, bass);
}

// --- wiring -------------------------------------------------------------------

const pattern_select = document.getElementById('rhythm_pattern');
PARTIMENTO_PATTERNS.forEach((pattern) => {
    const option = document.createElement('option');
    option.value = pattern.id;
    option.textContent = pattern.name;
    option.title = pattern.detail;
    pattern_select.appendChild(option);
});
pattern_select.value = rhythm_settings.pattern;

pattern_select.addEventListener('change', (e) => {
    rhythm_settings.pattern = e.target.value;
    abort_run();
    next_rhythm();
});

function init_partimento() {
    rhythm_settings.melody = false; // partimento is pitched whatever the melody switch says
    rhythm_settings.source = 'partimento';
    rhythm_settings.hands = 'both'; // the whole point of the exercise
    document.getElementById('rhythm_source').value = 'partimento';
    document.getElementById('rhythm_hands').value = 'both';
    sync_generator_controls();
    init_rhythm_panel(['notes']); // the root of each pattern comes from the note pickers
}

add_game_button('Patterns', init_partimento, 'menu_partimento', 'amber');
