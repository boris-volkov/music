let EarInterval_kind, EarInterval_notes, EarInterval_base = null;
let EarInterval_array, EarInterval_found;
let funcs;

function random_EarInterval(){
    if ( (EarInterval_base = notes.get_random()) == null) return;
    if ( (EarInterval = intervals.get_random()) == null) return;
    EarInterval_kind = EarInterval.name;
    EarInterval_notes = EarInterval.notes;
    EarInterval_array = EarInterval_notes.map( (note) => (note + EarInterval_base.number + 12*4));
    console.log(EarInterval_array);
    funcs = [];
    EarInterval_array.forEach( (note) => {
        const msg = new MidiMessage(KEYDOWN, note, 70);
        funcs.push(msg.send.bind(msg));
    });
    sequentially(funcs, 500);
    cprint("first note: " + EarInterval_base.name);
    EarInterval_array = addConstantModulo12(EarInterval_array, 0);
}

function EarInterval_callback(event){
    [type, key, intensity] = event.data;
    
    EarInterval_held = [... new Set(addConstantModulo12(notes_down, 0))]
    if (haveSameElements(addConstantModulo12(EarInterval_held, 0), EarInterval_array)){
        EarInterval_held.forEach((note) => {
            green_key(note);
        });
        EarInterval_found = true;
    }

    if (type == KEYUP && EarInterval_found){ 
        EarInterval_held.forEach((note) => {
            unlight_key(note);
        });
        EarInterval_found = false;
        setTimeout(random_EarInterval, 500);
    }
}

function init_EarInterval(){
    canvas.style.display = 'none';
    init_quiz(random_EarInterval, EarInterval_callback);
}

add_game_button('interval ear training', init_EarInterval);
