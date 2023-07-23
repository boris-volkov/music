let interval_kind, interval_notes, interval_base = null;
let interval_array, interval_found;

function random_interval(){
    if ( (interval_base = notes.get_random()) == null) return;
    if ( (interval = intervals.get_random()) == null) return;
    interval_kind = interval.name;
    interval_notes = interval.notes;
    interval_array = addConstantModulo12(interval_notes, interval_base.number);
    cprint(interval.name + ' ' + interval_base.name);
}

function interval_callback(event){
    [type, key, intensity] = event.data;
    
    interval_held = [... new Set(addConstantModulo12(notes_down, 0))]
    if (haveSameElements(addConstantModulo12(interval_held, 0), interval_array)){
        interval_held.forEach((note) => {
            green_key(note);
        });
        interval_found = true;
    }

    if (type == KEYUP && interval_found){ 
        interval_held.forEach((note) => {
            unlight_key(note);
        });
        interval_found = false;
        random_interval();
    }
}

function init_interval(){
    canvas.style.display = 'none';
    init_quiz(random_interval, interval_callback);
}

add_game_button('intervals', init_interval);
