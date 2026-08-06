// Reading practice: press the key that matches the printed note. Complete beginners are
// the target audience here (see notation.js's BIG_STAFF_SCALE), so both clefs are on offer
// -- treble for the right hand, bass for the left, or alternating between them so a player
// practises both -- and the staff carries an EGBDF/GBDFA line legend beside it.

const NOTE_QUIZ_CLEF_OCTAVE = { treble: 4, bass: 3 }; // where each clef's notes are drawn

let note, prev;
let current_clef = 'treble';  // the clef THIS prompt is drawn in -- stays fixed across
                               // re-renders (toggling notation on/off, say), and only
                               // changes when a new note is picked
let next_alt_clef = 'treble'; // which clef "Both" hands out to the *next* new question

const note_clef_select = document.getElementById('note_clef');

function pick_clef() {
    const setting = note_clef_select.value;
    if (setting !== 'both') return setting;
    const clef = next_alt_clef;
    next_alt_clef = next_alt_clef === 'treble' ? 'bass' : 'treble'; // strict alternation
    return clef;
}

function show_note_prompt() {
    show_prompt(note.name, [note_to_vexkey(note, NOTE_QUIZ_CLEF_OCTAVE[current_clef])], {
        clef: current_clef, big: true, showLegend: true,
    });
}

function random_note(){
    if ( (note  = notes.get_random()) == null) return;
    while (note == prev){
        note = notes.get_random();
    }
    prev = note;
    current_clef = pick_clef();
    show_note_prompt();
}

const note_callback = make_single_note_callback(() => note.number % 12, random_note);

function init_note(){
    set_relevant_options(['notes']);
    canvas.style.display = 'none';
    init_quiz(random_note, note_callback);
}

// changing the clef mid-question redraws the same note rather than skipping to a new one --
// the player hasn't answered yet, so there's nothing to advance past
note_clef_select.addEventListener('change', () => {
    if (current_quiz_callback === note_callback && note) {
        current_clef = pick_clef();
        show_note_prompt();
    }
});

add_game_button('Notes', init_note, 'menu_base_notes', 'teal');
