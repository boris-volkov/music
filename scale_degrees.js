// ex: 6th note of F# major
// easy to implement

let index, note_to_guess;

const ordinal = {
    0: '1st',
    1: '2nd',
    2: '3rd',
    3: '4th',
    4: '5th',
    5: '6th',
    6: '7th',
}

function random_scale_degree(){
    if ( (scale_base = notes.get_random() ) == null) return;
    if ( (scale = scales.get_random() ) == null) return;
    index = rand_index(scale.notes);
    scale_array = addConstantModulo12(scale.notes, scale_base.number);
    note_to_guess = scale_array[index]%12;
    cprint ( ordinal[index] + ' note of ' + scale_base.name + ' ' + scale.name);
}

const scale_degree_callback = make_single_note_callback(() => note_to_guess, random_scale_degree);

function init_scale_degree(){
    set_topic_ui('degrees', ['notes', 'scales']);
    canvas.style.display = 'none';
    init_quiz(random_scale_degree, scale_degree_callback)
}

add_game_button('Scale degrees', init_scale_degree, 'menu_theory', 'theory');