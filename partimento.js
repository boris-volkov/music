// Two-hand partimento patterns: the stock keyboard figures a partimento student drills
// until they sit under the fingers -- scale runs in parallel thirds and sixths, and the
// sequences that alternate between the two.
//
// Every pattern is written in scale-degree space rather than in notes, so the root the
// practice options pick transposes the whole thing and no pattern has to know anything
// about keys. A pattern is just (index) -> [lower degree, upper degree], continuing
// forever, which is what lets any number of measures be asked for without a phrase
// getting cut off mid-shape. The index used to just be the beat number -- one degree pair
// per quarter note -- but partimento_passage() now generates a real rhythm first (the same
// engine, and so the same Note Types settings, a Generated rhythm uses) and advances the
// index once per onset in it instead, so the index is a step count, not a beat count.
//
// These feed the rhythm trainer's engine: a pattern becomes the same passage shape a Bach
// excerpt does, so the grand staff, playhead, metronome and note-matching all come along
// for free.

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

// The patterns are chosen the same way the scales and chords are: a row of buttons in the
// practice panel saying which are in the pool, and each new passage draws one of them.
// Leaving one switched on is how you drill a single figure.
//
// Structure_Collection carries all of that already -- the buttons, the All button,
// remembering what is active, and the nudge when everything has been switched off -- so
// these ride on it with an empty note list. Nothing here maps onto keys of the keyboard,
// which is all the note list is for, so hovering a pattern lights nothing.
const partimento_types = new Structure_Collection('partimento_types',
    PARTIMENTO_PATTERNS.map((pattern) => [pattern.name, []]));

// the figure itself rides along on the button's structure, so a random pick comes back
// ready to use instead of having to be looked back up by its label
partimento_types.list.forEach((structure, i) => {
    structure.pattern = PARTIMENTO_PATTERNS[i];
    structure.button.title = PARTIMENTO_PATTERNS[i].detail;
});

function partimento_passage() {
    // A pattern and a root, each drawn from its own row in the practice panel, and either
    // row can be emptied. get_random opens the panel and says so in the terminal, but the
    // terminal isn't the surface on show in this mode -- so the reason is repeated where
    // the player is actually looking, and no passage is built. Quietly falling back to
    // some default would drill a figure or a key that had been deliberately switched off.
    const chosen = partimento_types.get_random();
    const root = notes.get_random();
    if (!chosen || !root) {
        rhythm_feedback.textContent =
            `no ${!chosen ? 'patterns' : 'root notes'} selected — pick at least one in the practice panel`;
        rhythm_feedback.className = 'failed';
        return null;
    }

    const pattern = chosen.pattern;
    const tonic = tonic_from_note_name(root.name);

    // One shared rhythm for both hands -- they move together (parallel thirds, sixths, or
    // the exchange between them), so a single onset pattern is what keeps them reading as
    // one musical idea rather than two independently-rhythmed lines. Built the same way a
    // Generated rhythm is, which is what makes a partimento passage automatically respect
    // whichever note types, rests and ties are switched on in the Note Types panel, with
    // nothing partimento-specific needed to keep that in sync.
    const rhythmMeasures = generate_rhythm_shape(rhythm_settings.measures);

    // Walks that shared rhythm and hangs the pattern's next degree pair off every genuine
    // new attack. A rest stays silent; a note tied in from the one before it repeats that
    // note's pitch rather than advancing the pattern -- it's the same sustained attack,
    // not a new step, exactly like a tie means anywhere else in this trainer.
    let degree = 0;
    let tiedFromPrev = false;
    let upperPitch = null, lowerPitch = null;
    const upper = [], lower = [];
    rhythmMeasures.forEach((measure) => {
        const upperMeasure = [], lowerMeasure = [];
        measure.forEach((note) => {
            if (note.rest) {
                upperMeasure.push({ duration: note.duration, rest: true });
                lowerMeasure.push({ duration: note.duration, rest: true });
            } else {
                if (!tiedFromPrev) {
                    const [low, high] = pattern.voices(degree);
                    upperPitch = degree_to_pitch(tonic, high, 0);
                    lowerPitch = degree_to_pitch(tonic, low, -1);
                    degree++;
                }
                upperMeasure.push({ duration: note.duration, rest: false, pitch: upperPitch, tie: note.tie });
                lowerMeasure.push({ duration: note.duration, rest: false, pitch: lowerPitch, tie: note.tie });
            }
            tiedFromPrev = !!note.tie;
        });
        upper.push(upperMeasure);
        lower.push(lowerMeasure);
    });

    // one hand alone practises that hand's voice on its own, so it becomes the only voice
    const primary = left_only() ? lower : upper;
    const bass = two_handed() ? lower : null;

    const hands = two_handed() ? 'both hands' : left_only() ? 'left hand' : 'right hand';
    const attribution = {
        title: pattern.name,
        detail: `${tonic.display} major · ${hands}`,
    };
    const key = tonic.letter.toUpperCase() + tonic.accidental;
    return finish_rhythm(primary, attribution, key, bass);
}

// --- wiring -------------------------------------------------------------------

// Changing the pool takes effect at once, the way the controls above the score do --
// waiting for the next pass would leave you looking at a figure you have just switched
// off. The buttons' own handlers sit on the buttons themselves, so by the time this
// fires on the way up the new active set has already been settled.
document.getElementById('partimento_types').addEventListener('pointerdown', (e) => {
    if (e.target.tagName !== 'BUTTON' || !partimento_mode()) return;
    abort_run();
    next_rhythm();
});

function init_partimento() {
    rhythm_settings.melody = false; // partimento is pitched whatever the melody switch says
    rhythm_settings.source = 'partimento';
    document.getElementById('rhythm_source').value = 'partimento';
    // the hands aren't set here: two_handed() knows partimento is two-handed on its own,
    // and sync_generator_controls pins and greys the control to match
    sync_generator_controls();
    // the roots come from the note pickers, the figures from their own row beneath them
    init_rhythm_panel(['notes', 'partimento']);
}

add_game_button('Patterns', init_partimento, 'menu_partimento', 'amber');
