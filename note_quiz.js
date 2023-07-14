let n, prev;

function random_note(){
    while (n == prev){
        n = get_random_note();
    }
    prev = n;
    clear();
    print(get_note_name(n));
}

function note_callback(e){
    // should be only if event is a notedown
    // and if the notes_down container has that note exclusively ?
    if (n%12 == e.data[1]%12){
        random_note();
    }
}

function init_note(){
    canvas.style.display = 'none';
    init_quiz(random_note, note_callback);
}

add_game_button('notes', init_note);