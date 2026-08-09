// Chord identification by ear -- the same loop as interval_ear_training.js: something is
// sounded, you find it on the keyboard, the next one comes. What a chord adds over an
// interval is that it has to be *voiced* before it can be played, and how it's voiced is
// most of what makes it easy or hard to name. Those two choices (blocked vs arpeggiated,
// root position vs any inversion) are this mode's difficulty axes and live in its own
// control row; chord vocabulary and base note come from the shared pickers, as everywhere.

let EarChord_base = null;
let EarChord_array;         // pitch classes, for matching what the player holds down
let EarChord_sounding = null; // the voicing as actually played, kept for replaying it

const chord_ear_settings = {
    voicing: 'blocked',  // 'blocked' | 'up' | 'down'
    inversions: false,   // false = always root position
};

const chord_ear_controls = document.getElementById('chord_ear_controls');

// A chord's inversion is which of its notes sits in the bass. The pitch classes don't
// change, so the answer doesn't either -- but a first-inversion triad is a genuinely
// different sound to name, which is the point. Rotating means lifting the lowest n notes
// an octave, done on a copy: Structure's own invert() rewrites the shared chord definition
// that every other mode reads from.
function invert_offsets(offsets, n){
    return offsets.map((semitones, i) => (i < n ? semitones + 12 : semitones))
                  .sort((a, b) => a - b);
}

function random_EarChord(){
    if ( (EarChord_base = notes.get_random()) == null) return;
    const chord = chords.get_random();
    if (chord == null) return;

    const inversion = chord_ear_settings.inversions
        ? Math.floor(Math.random() * chord.notes.length) : 0;
    const voiced = invert_offsets(chord.notes, inversion);

    // sounded from the same register as the interval game, so switching between the two
    // doesn't also move the pitch you're listening in
    EarChord_sounding = voiced.map((semitones) => semitones + EarChord_base.number + 12*4);
    play_EarChord();

    // the ear needs one anchor to place the chord on the keyboard at all -- the lowest
    // note is the one you actually hear at the bottom, which in an inversion is not the
    // root, and working out that it isn't is the exercise
    const bass = EarChord_sounding[0];
    cprint("lowest note: " + (bass.mod(12) === EarChord_base.number
        ? EarChord_base.name : get_note_name(bass)));

    EarChord_array = addConstantModulo12(EarChord_sounding, 0);
}

function play_EarChord(){
    if (!EarChord_sounding) return;
    const style = chord_ear_settings.voicing;
    const order = style === 'down' ? [...EarChord_sounding].reverse() : EarChord_sounding;
    // blocked is just a gap of zero through the same player, so MIDI-out and the synth
    // both stay on the one code path the rest of the app already uses
    const gap = style === 'blocked' ? 0 : synth_settings.gap;
    play_notes_sequentially(order, synth_settings.note_duration, gap);
}

const EarChord_note_callback = make_chord_style_callback(() => EarChord_array, random_EarChord, 500);

function EarChord_callback(event){
    const [type, key, velocity] = event.data;
    // the bound replay key is a control, not an answer
    if (type === KEYDOWN && velocity > 0 && key === midi_bindings.replay) {
        play_EarChord();
        return;
    }
    EarChord_note_callback(event);
}

document.getElementById('chord_ear_voicing').addEventListener('change', (e) => {
    chord_ear_settings.voicing = e.target.value;
});

document.getElementById('chord_ear_inversion').addEventListener('change', (e) => {
    chord_ear_settings.inversions = e.target.value === 'any';
});

function init_EarChord(){
    set_topic_ui('chord_ear', ['notes', 'chords']);
    canvas.style.display = 'none';
    init_quiz(random_EarChord, EarChord_callback, () => {
        chord_ear_controls.style.display = 'none'; // this mode's row leaves with it
    });
    set_replay(play_EarChord);
    chord_ear_controls.style.display = 'flex';
}

add_game_button('Hear chords', init_EarChord, 'menu_ear', 'ear');
