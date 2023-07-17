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
    scale_base = get_random_note();
    if ( (scale = scales.get_random()) == null) return;
    index = rand_index(scale.notes);
    scale_array = addConstantModulo12(scale.notes, scale_base);
    note_to_guess = scale_array[index]%12;
    cprint ( ordinal[index] + ' note of ' + get_note_name(scale_base) + ' ' + scale.name);
}

function scale_degree_callback(event){
    [type, key, intensity] = event.data;

    if (key % 12 == note_to_guess){
        green_key(key);    
    }

    if (type == KEYUP && key % 12 == note_to_guess){
        unlight_key(key);
        random_scale_degree();
    }
}

function init_scale_degree(){
    canvas.style.display = 'none';
    init_quiz(random_scale_degree, scale_degree_callback)
}

add_game_button('scale degrees', init_scale_degree);