// Scale practice: a real scale, written out in musical notation with a randomly generated
// rhythm -- drawn from whichever note types, rests and ties are switched on in the Note
// Types panel, the same engine every other rhythm source uses -- rather than the old
// canvas-drawn circles that only ever showed abstract scale-degree positions with no
// sense of rhythm at all. Replaces the previous init_scale()/scale_quiz.js entirely.
//
// The scale and its root note are picked the same way chord/interval practice already
// works: a row of buttons in the practice panel, one active choice drawn at random each
// round (the shared Structure_Collection machinery -- see theory.js).

const SHARP_SPELLING = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
const FLAT_SPELLING = ['c', 'db', 'd', 'eb', 'e', 'f', 'gb', 'g', 'ab', 'a', 'bb', 'b'];

// Picks whichever spelling scheme actually fits this scale. Scales with exactly 7 notes
// per octave -- most of the list; see the scales array in theory.js -- get proper
// letter-by-degree spelling (spell_scale_degree(), shared with partimento.js): correct by
// construction, double sharps/flats included when the key genuinely needs one -- C minor's
// third degree comes out an E♭ because it's a letter-and-two-thirds up from C, not because
// a table happened to have a flat in slot 3. A scale with some other note count (pentatonic,
// blues, whole tone, diminished, bebop dominant, the Japanese five-note scales) doesn't map
// onto "one degree, one letter" -- a 5-note scale would have to skip letters inconsistently
// -- and several of them don't have one settled textbook spelling to defer to regardless,
// so those fall back to a simpler, still pitch-correct but not always textbook-exact
// spelling instead: sharps or flats consistently, whichever the chosen root itself favours.
// `octaveShift` is relative to the tonic's own octave, same convention spell_scale_degree()
// uses -- the caller works out what that needs to be to land on a specific absolute octave.
function spell_scale_pitch(tonic, root, steps, degree, octaveShift, preferFlats) {
    if (steps.length === 7) {
        return spell_scale_degree(tonic, degree, steps, octaveShift);
    }
    const semitoneOffset = steps[degree.mod(steps.length)] + 12 * Math.floor(degree / steps.length);
    const absolute = root.number + (tonic.octave + octaveShift) * 12 + semitoneOffset;
    const pitchClass = ((absolute % 12) + 12) % 12;
    const octave = Math.floor(absolute / 12);
    const letter = (preferFlats ? FLAT_SPELLING : SHARP_SPELLING)[pitchClass];
    return letter + octave;
}

// the up-then-down DEGREE sequence for `octaves` octaves of an n-note scale: 0, 1, ...,
// n-1, n, n+1, ..., up to the top tonic (n*octaves, where the scale turns around), then
// back down to -- but not repeating -- the starting tonic. Degrees, not semitone offsets
// -- spell_scale_pitch() is what turns one into an actual pitch.
function scale_degrees(noteCount, octaves) {
    const top = noteCount * octaves;
    const ascending = [];
    for (let d = 0; d <= top; d++) ascending.push(d);
    const descending = ascending.slice(0, -1).reverse();
    return [...ascending, ...descending];
}

const scale_practice_settings = { octaves: 1 };

function scale_practice_passage() {
    // A scale and a root, each drawn from its own row in the practice panel, and either
    // row can be emptied -- same reasoning as partimento_passage(): get_random() would
    // open the panel and say so in the terminal, but the terminal isn't the surface on
    // show here, so the reason is repeated where the player is actually looking.
    const chosenScale = scales.get_random();
    const root = notes.get_random();
    if (!chosenScale || !root) {
        rhythm_feedback.textContent =
            `no ${!chosenScale ? 'scales' : 'root notes'} selected — pick at least one in the practice panel`;
        rhythm_feedback.className = 'failed';
        return null;
    }

    const tonic = tonic_from_note_name(root.name);
    const preferFlats = root.name.includes('♭');
    const steps = chosenScale.notes;
    // The name printed above the staff has to come from whichever spelling
    // spell_scale_pitch() below is actually about to draw, not from the raw button name --
    // for 7-note scales that's the (possibly key-respelled) tonic, e.g. G♯ minor is written
    // in A♭ because nobody notates nine sharps, and used to say "G♯ minor" up top while the
    // staff below it read A♭. Scales with some other note count never go through that
    // respelling (see spell_scale_pitch's comment), so root.name is still the right name
    // for those -- same condition spell_scale_pitch branches on, so the two can't drift.
    const displayRoot = steps.length === 7 ? tonic.display : root.name;
    const degrees = scale_degrees(steps.length, scale_practice_settings.octaves);
    // absolute octaves (right hand around 4, left around 3, a real octave apart) when
    // there's only one octave to climb -- dropped a further octave once there's more than
    // one, since a scale only ever climbs from its starting note, never dips below it, so
    // the starting octave is also the passage's floor, and two or three octaves stacked on
    // top of the usual middle-of-the-staff start sent most scales well past the staff at
    // the top. spell_scale_degree()'s own convention is a shift relative to the tonic's
    // octave, which tonic_from_note_name() picks per root rather than always landing on a
    // fixed one, so this works out whatever shift actually gets there for whichever root
    // got chosen.
    //
    // Only dropped for two-or-more octaves, not unconditionally: a single octave already
    // starts as low as the treble staff comfortably allows -- some roots (C through F#)
    // would dip below its own ledger-line floor and pick up a needless 8vb on what's
    // meant to be the simplest, most beginner-friendly case if this applied there too.
    const octaveDrop = scale_practice_settings.octaves > 1 ? 1 : 0;
    const upperShift = (4 - octaveDrop) - tonic.octave;
    const lowerShift = (3 - octaveDrop) - tonic.octave;

    // enough rhythm to cover every degree at least once. Regenerated fresh at each
    // candidate length rather than grown incrementally -- a handful of extra
    // generate_measure() calls costs nothing, and this keeps the cross-measure tie pass
    // (which needs every measure to exist before it can run) correct without having to
    // special-case extending a passage that already has ties in it.
    let rhythmMeasures = [];
    let count = 0;
    let attacks = 0;
    do {
        count++;
        rhythmMeasures = generate_rhythm_shape(count);
        attacks = 0;
        let tiedFromPrev = false;
        rhythmMeasures.flat().forEach((note) => {
            if (!note.rest && !tiedFromPrev) attacks++;
            tiedFromPrev = !!note.tie;
        });
    } while (attacks < degrees.length);

    // Walks that rhythm and hangs the scale's next degree off every genuine new attack --
    // a rest stays silent, and a note tied in from the one before it repeats that note's
    // pitch instead of advancing, same as partimento_passage() does. The generated rhythm
    // will usually overshoot the scale by a few attacks (see the loop above), since it
    // grows a whole measure at a time -- past the end, the pitch just holds by repeating
    // rather than needing a second pass up and down.
    let step = 0;
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
                    const degree = degrees[Math.min(step, degrees.length - 1)];
                    upperPitch = spell_scale_pitch(tonic, root, steps, degree, upperShift, preferFlats);
                    lowerPitch = spell_scale_pitch(tonic, root, steps, degree, lowerShift, preferFlats);
                    step++;
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
    const octaveLabel = scale_practice_settings.octaves === 1 ? '1 octave' : `${scale_practice_settings.octaves} octaves`;
    const attribution = {
        title: `${displayRoot} ${chosenScale.name}`,
        detail: `${octaveLabel} · ${hands}`,
    };
    // no key signature -- partimento can assume every root is major and derive one, but
    // scale practice can't: a scale here might be minor, a mode, or something with no
    // standard key signature at all (whole tone, diminished, blues). Leaving it off means
    // every accidental prints inline instead of risking a wrong or invented signature.
    return finish_rhythm(primary, attribution, null, bass);
}

function init_scale_practice() {
    rhythm_settings.melody = false; // this topic is its own pitched source, whatever melody says
    rhythm_settings.source = 'scales';
    document.getElementById('rhythm_source').value = 'scales';
    sync_generator_controls();
    init_rhythm_panel('modes', ['notes', 'scales']);
}

document.getElementById('scale_octaves').addEventListener('change', (e) => {
    scale_practice_settings.octaves = parseInt(e.target.value, 10);
    next_rhythm();
});

add_game_button('Modes', init_scale_practice, 'menu_theory', 'theory');
