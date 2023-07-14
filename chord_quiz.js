//TODO add slash chords

let kind, notes, base = null;
let chord_found;
let chord_array;
let chord_held = []; // notes currently held by the user, treated as a set
let last_chord, last_base; 

function random_chord(){
    if ( (chord = chords.get_random()) == null) return;
    base = get_random_note();
    while (last_chord == chord && base == last_base){ 
        chord = chords.get_random();
        base = get_random_note();
    }
    last_chord = chord;
    last_base = base;
    chord_array = addConstantModulo12(chord.notes, base)
    cprint(get_note_name(base) + chord.name);
}

function chord_callback(event){
    [type, key, intensity] = event.data;
    
    chord_held = [... new Set(addConstantModulo12(notes_down, 0))]
    if (haveSameElements(addConstantModulo12(chord_held, 0), chord_array)){
        chord_held.forEach((note) => {
            green_key(note);
        });
        chord_found = true;
    }

    // a little sloppy but it feels more right than just the name changing
    // while the correct previous chord is still being held

    if (type == KEYUP && chord_found){ 
        chord_held.forEach((note) => {
            unlight_key(note);
        });
        chord_found = false;
        random_chord();
    }
}

function init_chord(){
    canvas.style.display = 'none';
    init_quiz(random_chord, chord_callback)
}

add_game_button('chords', init_chord);