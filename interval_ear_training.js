let EarInterval_kind, EarInterval_notes, EarInterval_base = null;
let EarInterval_array;

function random_EarInterval(){
    if ( (EarInterval_base = notes.get_random()) == null) return;
    if ( (EarInterval = intervals.get_random()) == null) return;
    EarInterval_kind = EarInterval.name;
    EarInterval_notes = EarInterval.notes;
    EarInterval_array = EarInterval_notes.map( (note) => (note + EarInterval_base.number + 12*4));
    play_notes_sequentially(EarInterval_array);
    cprint("first note: " + EarInterval_base.name);
    EarInterval_array = addConstantModulo12(EarInterval_array, 0);
}

const EarInterval_callback = make_chord_style_callback(() => EarInterval_array, random_EarInterval, 500);

function init_EarInterval(){
    canvas.style.display = 'none';
    init_quiz(random_EarInterval, EarInterval_callback);
}

add_game_button('Listen & Identify', init_EarInterval, 'menu_intervals', 'clay');
