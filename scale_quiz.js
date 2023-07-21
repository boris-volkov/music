// TODO print canvas with open circles for all the necessary notes
// so the player can see them getting gradually filled in, and knows when the end is 
// going up and down steadily with the notes of the scale. 

let scale, scale_type, scale_notes, scale_base, scale_array;
let id, x // id of the canvas clearing interval, and initial drawing coordinate
let scale_length; // default length of a 2 octave scale 

// fix these numbers, make it look good 
let x_step = Math.floor(canvas.width/(scale_length+1));
let y_step = Math.floor(canvas.height/((scale_length)/2)) - 2;

let dot_coordinates = [];
let dot_idx = 0;

function refresh_timer(){ 
    if ( Date.now() - last_note_time > 2000 ){
        refresh();
    }
}    

function refresh(){ // this seems like wasteful repetition
    clear_canvas();
    open_dots();
    dot_idx = 0;
    note_sequence = []; 
}

function open_dots(){ // this function is messy and it sucks, simplify it
    // also it doesn't work right for shorter scales.
    let x_ = 0;
    ctx.fillStyle = "#123";

    dot_coordinates = [];

    for (let y_ = 0; y_ < (scale_length-1)/2; y_ ++){
        x_ += x_step
        ctx.beginPath();
        h = canvas.height - 20 -  y_*y_step;
        dot_coordinates.push([x_, h]);
        ctx.arc(x_, h, 10, 0, 2*PI, false)
        ctx.fill();
    }
    for (y_ = (scale_length-1)/2 ; y_ >= 0; y_--){
        x_ += x_step
        ctx.beginPath();
        h = canvas.height - 20 - y_*y_step;
        dot_coordinates.push([x_,h]);
        ctx.arc(x_, h, 10, 0, 2*PI, false)
        ctx.fill();
    }
}

function draw_dot(color){
    ctx.fillStyle = color;
	ctx.beginPath();
    [x, h] = dot_coordinates[dot_idx++];
	ctx.arc(x, h, 10, 0, 2*PI, false);
	ctx.fill();
}

function generate_octaves(s){ // should be an option to change number of octaves
    rev = s.slice().reverse();
    up_down = [...s, ...s, 0, ...rev, ...rev];
    scale_length = up_down.length;
    x_step = Math.floor(canvas.width/(scale_length+1));
    y_step = Math.floor(canvas.height/((scale_length)/2)) - 2;
    refresh();
    return up_down;
}

function random_scale(){
    refresh();
    if ( (scale = scales.get_random()) == null) return;
    if ( (scale_base = notes.get_random()) == null) return;
    scale_type = scale.name;
    scale_notes = scale.notes;
    scale_array = generate_octaves(scale_notes);   
    scale_array = addConstantModulo12(scale_array, scale_base.number)
    cprint(scale_base.name + ' ' + scale_type);
}

function scale_listener(event){
    const [type, key, intensity] = event.data;
    if (type == KEYDOWN){
        if (key%12 != note_sequence[note_sequence.length -1]%12){ // allows scales to be played in octaves
            note_sequence.push(key);
            let i = note_sequence.length - 1;
            if (note_sequence[i]%12 == scale_array[i]%12){ // messy to check eq this way still 
                draw_dot("green");
            } else  {
                draw_dot("red");
            };
        }
    } else if (type == KEYUP && key%12 == scale_array[scale_array.length -1]%12 ){ // only finish on a keyup
        if (arraysEqualMod12(note_sequence, scale_array)) random_scale();
    } //  should also clear the sequence if it does not match the first part of the scale ?
}

function scale_cleanup(){ // is this ever used?
    clearInterval(id);
    refresh();
}

function init_scale(){
    canvas.style.display = 'block';
    id = setInterval(refresh_timer, 50);
    init_quiz(random_scale, scale_listener); 
}

add_game_button('scales', init_scale);
