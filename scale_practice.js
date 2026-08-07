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

// Not a full context-aware respelling -- a 5-note pentatonic scale, say, doesn't map onto
// "one degree, one letter" the way a 7-note diatonic scale does, and several of the
// scales on offer (whole tone, diminished, blues) don't have one settled textbook
// spelling to defer to in the first place. This just spells every degree consistently,
// sharps or flats depending on which the chosen root itself uses -- readable and
// pitch-correct, if not always the exact spelling a publisher would choose.
function spell_scale_pitch(tonicPitchClass, baseOctave, semitoneOffset, preferFlats) {
    const absolute = tonicPitchClass + baseOctave * 12 + semitoneOffset;
    const pitchClass = ((absolute % 12) + 12) % 12;
    const octave = Math.floor(absolute / 12);
    const letter = (preferFlats ? FLAT_SPELLING : SHARP_SPELLING)[pitchClass];
    return letter + octave;
}

// the up-then-down semitone-offset sequence for `octaves` octaves of a scale whose
// degrees sit `steps` semitones above the tonic (major's steps are [0,2,4,5,7,9,11]).
// Ascends through each octave, touches the tonic one octave above the start, then
// mirrors back down to -- but not repeating -- the starting tonic.
function scale_offsets(steps, octaves) {
    const ascending = [];
    for (let o = 0; o < octaves; o++) steps.forEach((s) => ascending.push(o * 12 + s));
    ascending.push(octaves * 12); // the top tonic, where the scale turns around
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

    const preferFlats = root.name.includes('♭');
    const offsets = scale_offsets(chosenScale.notes, scale_practice_settings.octaves);

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
    } while (attacks < offsets.length);

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
                    const offset = offsets[Math.min(step, offsets.length - 1)];
                    upperPitch = spell_scale_pitch(root.number, 4, offset, preferFlats);
                    lowerPitch = spell_scale_pitch(root.number, 3, offset, preferFlats);
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
        title: `${root.name} ${chosenScale.name}`,
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
    init_rhythm_panel(['notes', 'scales']);
}

document.getElementById('scale_octaves').addEventListener('change', (e) => {
    scale_practice_settings.octaves = parseInt(e.target.value, 10);
    next_rhythm();
});

add_game_button('Modes', init_scale_practice, 'menu_chords_scales', 'clay');
