let interval_kind, interval_notes, interval_base = null;
let interval_array;

function random_interval(){
    interval_base = get_random_note();
    if ( (interval = intervals.get_random()) == null) return;
    interval_kind = interval.name;
    interval_notes = interval.notes;
    if (Math.random() < 0.5){
        interval_notes = reflectIntervals(interval_notes);
        interval_array = addConstantModulo12(interval_notes, interval_base);
        terminal.innerHTML = interval_kind + " below " + get_note_name(interval_base);
    } else {
        interval_array = addConstantModulo12(interval_notes, interval_base);
        terminal.innerHTML = interval_kind + " above " + get_note_name(interval_base);
    }
}

function interval_quiz(e){
    if (haveSameElements(addConstantModulo12(notes_down, 0), interval_array)){
        random_interval();
    }
}

function init_interval(){
    canvas.style.display = 'none';
    init_quiz(random_interval, interval_quiz);
}

add_game_button('intervals', init_interval);