let note, prev;

function random_note(){
    while (note == prev){
        note = get_random_note();
    }
    prev = note;
    clear();
    print(get_note_name(note));
}

function note_callback(e){
    [type, key, intensity] = e.data;

    // should be only if event is a notedown
    // and if the notes_down container has that note exclusively ?
    if (note % 12 == key % 12){
        green_key(key);
    }

    if (type == KEYUP && key % 12 == note % 12){
        unlight_key(note);
        random_note();
    }
}

function init_note(){
    canvas.style.display = 'none';
    init_quiz(random_note, note_callback);
}

add_game_button('notes', init_note);