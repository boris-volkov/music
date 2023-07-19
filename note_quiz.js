let note, prev;

function random_note(){
    if ( (note  = notes.get_random()) == null) return;
    while (note == prev){
        note = notes.get_random();
    }
    prev = note;
    clear();
    print(note.name);
}

function note_callback(e){
    [type, key, intensity] = e.data;

    // should be only if event is a notedown
    // and if the notes_down container has that note exclusively ?
    if (note.number % 12 == key % 12){
        green_key(key);
    }

    if (type == KEYUP && key % 12 == note.number % 12){
        unlight_key(key);
        random_note();
    }
}

function init_note(){
    canvas.style.display = 'none';
    init_quiz(random_note, note_callback);
}

add_game_button('notes', init_note);