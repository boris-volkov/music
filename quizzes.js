class Quiz { // super should be the single note variant
    constructor(name, source) {
        this.name = name;
        this.source = source;
        this.base; // base note of the structure
        this.notes; 
        this.type; // classification of the structure ie Maj scale or Maj Chord
        this.array; // normalized array of the notes
        this.found; // flag to check of the current question has been answered
        this.prev; // storing the previous struct so we don thave immediate repeats
        this.prev_base; // base note of the previous structure
        this.scale; // scale that this structure is related to, if any
        this.block; // block of notes to match, if any
        this.held;  // set of notes currently held
        this.target; // target we are looking for the user to match 

        this.add_game_button();
    }

    generate() {
        while (this.target == this.prev) {
            this.target = get_random_note();
        }
        this.prev = this.target;
        cprint(get_note_name(this.target));
    }

    callback(e) {
        let [type, key, intensity] = e.data;

        if (this.target % 12 == key % 12) {
            green_key(key);
            this.found = true;
        }

        if (type == KEYUP && this.found) {
            unlight_key(key);
            this.generate();
            this.found = false;
        }
    }

    init() {
        canvas.style.display = 'none';
        this.generate();
        midi.inputs.forEach((entry) => {
            entry.onmidimessage = (e) => { // add listener to all midi inputs
                onMIDIMessage(e);
                this.callback(e);
            }
        });
    }

    add_game_button() {
        const button = document.createElement('button');
        button.textContent = this.name;
        button.addEventListener('click', () => {
            this.init();

            // deactivate all other buttons and activate this one
            const others = document.querySelectorAll("#game_choices button");
            others.forEach((b) => {
                b.classList.remove("active");
            });
            button.classList.add("active");
        });
        const container = document.getElementById('game_choices');
        container.appendChild(button);
    }
}

const note_quiz = new Quiz('notes');




class ScaleDegreeQuiz extends Quiz {
    ordinal = {
        0: '1st',
        1: '2nd',
        2: '3rd',
        3: '4th',
        4: '5th',
        5: '6th',
        6: '7th',
    }

    generate() {
        this.base = get_random_note();
        if ( (this.scale = scales.get_random()) == null) return;
        const index = rand_index(this.scale.notes);
        this.array = addConstantModulo12(this.scale.notes, this.base);
        this.target = this.array[index]%12;
        cprint ( this.ordinal[index] + ' note of ' + get_note_name(this.base) + ' ' + this.scale.name);
    }
}

const degree_quiz = new ScaleDegreeQuiz('scale degrees');






class BlockQuiz extends Quiz {
    // chords, intervals, clusters 
    // assumes that each structure has a base note and a name
    // but how will it handle structures like the ii of C Major, for example?

    generate() {
        if ((this.block = this.source.get_random()) == null) return;
        this.base = get_random_note();
        while (this.prev == this.block && this.prev_base == this.base) {
            this.block = source.get_random();
            this.base = get_random_note();
        }
        this.prev = this.block;
        this.prev_base = this.base;
        this.array = addConstantModulo12(this.block.notes, this.base);
        cprint(this.block.name.replace('%NOTE%', get_note_name(this.base)));
    }

    callback(event) {
        let [type, key, intensity] = event.data;

        this.held = [...new Set(addConstantModulo12(notes_down, 0))];
        if (haveSameElements(addConstantModulo12(this.held, 0), this.array)) {
            this.held.forEach((note) => {
                green_key(note);
            });
            this.found = true;
        }

        if (type == KEYUP && this.found) {
            this.held.forEach((note) => {
                unlight_key(note);
            });
            this.found = false;
            this.generate();
        }
    }

}

const interval_quiz = new BlockQuiz("intervals", intervals);
const chord_quiz = new BlockQuiz("chords", chords);




class SequenceQuiz extends Quiz {
    constructor(name, structure) {
        super(name, structure);
        this.sequence;
        this.interval_id;
        this.len = 29;
        this.note_sequence;
        this.dot_coordinates = [];
        this.draw_index;
    }

    refresh() {
        clear_canvas();
        this.draw_template();
        this.draw_index = 0;
        this.sequence = []; 
    }

    refresh_timer = () => {
        if (Date.now() - last_note_time > 2000) this.refresh();
    };

    draw_template() {
        let x_step = Math.floor(canvas.width/(this.len+1));
        let y_step = Math.floor(canvas.height/((this.len)/2)) - 2;
        let x_, y_;
        let h;
        ctx.fillStyle = "#123";
    
        for (let y_ = 0; y_ < (this.len-1)/2; y_ ++){
            x_ += x_step
            ctx.beginPath();
            h = canvas.height - 20 -  y_*y_step;
            this.dot_coordinates.push([x_, h]);
            ctx.arc(x_, h, 10, 0, 2*PI, false)
            ctx.fill();
        }
        for (y_ = (this.len-1)/2 ; y_ >= 0; y_--){
            x_ += x_step
            ctx.beginPath();
            h = canvas.height - 20 - y_*y_step;
            this.dot_coordinates.push([x_,h]);
            ctx.arc(x_, h, 10, 0, 2*PI, false)
            ctx.fill();
        }
    }

    draw_dot(color) {
        ctx.fillStyle = color;
        ctx.beginPath();
        let [x, h] = this.dot_coordinates[this.draw_index++];
        ctx.arc(x, h, 10, 0, 2*PI, false);
        ctx.fill();
    }

    generate_octaves() {
        let s = this.notes;
        let rev = s.slice().reverse();
        let up_down = [...s, ...s, 0, ...rev, ...rev];
        this.len = up_down.len;
        this.notes = up_down;
    }

    generate() {
        this.refresh();
        this.base = get_random_note();
        if ( (this.scale = scales.get_random()) == null) return;
        this.type = this.scale.name;
        this.notes = this.scale.notes;
        this.generate_octaves();
        this.notes = addConstantModulo12(this.notes, this.base);
        cprint(get_note_name(this.base) + ' ' + this.type);
    }


    callback(e) {
        const [type, key, intensity] = e.data;
        if (type == KEYDOWN){
            if (key%12 != this.sequence[this.sequence.length -1]%12){ // allows scales to be played in octaves
                this.sequence.push(key);
                let i = note_sequence.length - 1;
                if (this.sequence[i]%12 == this.notes[i]%12){ // messy to check eq this way still 
                    this.draw_dot("green");
                } else  {
                    this.draw_dot("red");
                };
            }
        } else if (type == KEYUP && key%12 == this.notes[this.notes.length -1]%12 ){ // only finish on a keyup
            if (arraysEqualMod12(note_sequence, this.notes)) random_scale();
        } //  should also clear the sequence if it does not match the first part of the scale ?
    }

    init(){
        canvas.style.display = 'block';
        this.interval_id = setInterval(this.refresh_timer, 50); 
    }
}

const scale_quiz = new SequenceQuiz('scales', scales);
