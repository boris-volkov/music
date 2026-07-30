//TODO add slash chords

let kind, base = null;
let chord_array;


function random_chord(){
    if ( (chord = chords.get_random()) == null) return;
    if ( (base  = notes.get_random()) == null) return;
    last_chord = chord;
    last_base = base;
    chord_array = addConstantModulo12(chord.notes, base.number)
    cprint(base.name + chord.name);
}

const chord_callback = make_chord_style_callback(() => chord_array, random_chord);

function init_chord(){
    canvas.style.display = 'none';
    init_quiz(random_chord, chord_callback)
}

add_game_button('Chord Recognition', init_chord, 'menu_chords_scales', 'clay');