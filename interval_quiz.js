let interval_kind, interval_notes, interval_base = null;
let interval_array;

function random_interval(){
    if ( (interval_base = notes.get_random()) == null) return;
    if ( (interval = intervals.get_random()) == null) return;
    interval_kind = interval.name;
    interval_notes = interval.notes;
    interval_array = addConstantModulo12(interval_notes, interval_base.number);
    cprint(interval.name + ' ' + interval_base.name);
}

const interval_callback = make_chord_style_callback(() => interval_array, random_interval);

function init_interval(){
    set_relevant_options(['notes', 'intervals']);
    canvas.style.display = 'none';
    init_quiz(random_interval, interval_callback);
}

add_game_button('Play from Description', init_interval, 'menu_intervals', 'clay');
