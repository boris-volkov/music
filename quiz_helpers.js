// Shared callback patterns for the *_quiz games. Every quiz mode is one of two shapes:
//   - find one specific note, in any octave (notes, scale degrees)
//   - hold down a whole set of notes at once (intervals, chords, interval ear training)
// These factories build the MIDI message callback for each shape so each quiz file only
// has to supply what makes it different: how to generate the next target and print it.

// getTargetNote: () => number (0-11). onSolved: called once the player releases the note.
function make_single_note_callback(getTargetNote, onSolved){
    return function(event){
        const [type, key] = event.data;
        const target = getTargetNote();

        if (key % 12 == target){
            green_key(key);
        }
        if (type == KEYUP && key % 12 == target){
            unlight_key(key);
            onSolved();
        }
    };
}

// getTargetArray: () => number[] (mod-12 note set). onSolved: called after the player
// releases the notes, once the full set has been held down together at some point.
// delay: optional ms to wait before calling onSolved (interval ear training pauses briefly).
function make_chord_style_callback(getTargetArray, onSolved, delay = 0){
    let found = false;
    return function(event){
        const [type] = event.data;
        const held = [...new Set(addConstantModulo12(notes_down, 0))];

        if (haveSameElements(addConstantModulo12(held, 0), getTargetArray())){
            held.forEach((note) => green_key(note));
            found = true;
        }
        if (type == KEYUP && found){
            held.forEach((note) => unlight_key(note));
            found = false;
            if (delay > 0) setTimeout(onSolved, delay);
            else onSolved();
        }
    };
}
