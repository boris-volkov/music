let note, prev;

function random_note(){
    if ( (note  = notes.get_random()) == null) return;
    while (note == prev){
        note = notes.get_random();
    }
    prev = note;
    show_prompt(note.name, [note_to_vexkey(note)]);
}

const note_callback = make_single_note_callback(() => note.number % 12, random_note);

function init_note(){
    canvas.style.display = 'none';
    init_quiz(random_note, note_callback);
}

add_game_button('Notes', init_note, 'menu_base_notes', 'teal');