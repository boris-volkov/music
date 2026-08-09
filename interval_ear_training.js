let EarInterval_kind, EarInterval_notes, EarInterval_base = null;
let EarInterval_array;
let EarInterval_sounding = null; // the notes as actually played, kept for replaying them

function random_EarInterval(){
    if ( (EarInterval_base = notes.get_random()) == null) return;
    if ( (EarInterval = intervals.get_random()) == null) return;
    EarInterval_kind = EarInterval.name;
    EarInterval_notes = EarInterval.notes;
    // EarInterval_array gets folded to pitch classes below for answer matching, so the
    // sounding octave is kept separately -- replaying the folded version would play the
    // interval in the wrong register
    EarInterval_sounding = EarInterval_notes.map( (note) => (note + EarInterval_base.number + 12*4));
    play_notes_sequentially(EarInterval_sounding);
    cprint("first note: " + EarInterval_base.name);
    EarInterval_array = addConstantModulo12(EarInterval_sounding, 0);
}

function replay_EarInterval(){
    if (EarInterval_sounding) play_notes_sequentially(EarInterval_sounding);
}

const EarInterval_note_callback = make_chord_style_callback(() => EarInterval_array, random_EarInterval, 500);

function EarInterval_callback(event){
    const [type, key, velocity] = event.data;
    // the bound replay key is a control, not an answer
    if (type === KEYDOWN && velocity > 0 && key === midi_bindings.replay) {
        replay_EarInterval();
        return;
    }
    EarInterval_note_callback(event);
}

function init_EarInterval(){
    set_topic_ui('interval_ear', ['notes', 'intervals']);
    canvas.style.display = 'none';
    init_quiz(random_EarInterval, EarInterval_callback);
    set_replay(replay_EarInterval);
}

add_game_button('Hear intervals', init_EarInterval, 'menu_ear', 'ear');
