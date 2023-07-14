// there needs to be a class for the notes held down by the player, 
// as sequence, as set, as list, and have the comparison methods. 

let notes_down = [];
let note_sequence = [];
let bass_note; // important to know it for chord inversions and such (probably intervals too)

// figure out of the notes themselves should be a in structure. 
// methods could handle the distinction between sharp and flat names

function get_note_name(key){
    return random_element(key_map[key%12]);
}

function get_random_note(){
    return Math.floor(Math.random()*12);
}

const key_map = {
    0  : ['C'       ],
    1  : ['C♯', 'D♭'],
    2  : ['D'       ],
    3  : ['D♯', 'E♭'],
    4  : ['E'       ],
    5  : ['F'       ],
    6  : ['F♯', 'G♭'],
    7  : ['G'       ],
    8  : ['G♯', 'A♭'],
    9  : ['A'       ],
    10 : ['A♯', 'B♭'],
    11 : ['B'       ],
}

class Structure { // should these be responsible for setting their own button in the DOM?
    // add the methods for comparison and addition mod 12 stuff, take it out of utils
    // add logic to handle inversions, want to be able to handle slash chords 
    // ( maybe need a separate chord classs then )
    constructor(name, notes, active = true) {
      this.name = name;
      this.notes = notes;
      this.active = active;
    }
  
    share_at_least(n, other) {
        // want  to use this for more natural-sounding chord progressions
        // making sure that consecutive chords at least share a few notes. 
        const set1 = new Set(this.notes);
        let count = 0;
      
        for (let i = 0; i < other.notes.length; i++) {
          if (set1.has(other.notes[i])) {
            count++;
            if (count >= n) {
              return true;
            }
          }
        }
        return false;
    }

    invert(n){ // really should only apply to a chord class
        // this works but it really messes up the naming conventions 
        // to the point that pretty much every inversion name needs to be hard-coded
        if ( n == 0 ) return;
        for (let i = 0; i < n ; i++){
            let lastElement = this.notes.pop();
            this.notes.unshift(lastElement);
        }
    }

    toggle() {
      (this.active == true) ? this.active = false : this.active = true;
    }

    light_keys() {
        this.notes.forEach((note) => {
            light_key(note);
        });
    }

    unlight_keys() {
        this.notes.forEach((note) => {
            unlight_key(note);
        });
    }
}

class Structure_Collection { // one of these will hold all of the chords, for example. 
    constructor(name, list){
        this.name = name; 
        this.list = [];
        list.forEach( (struct) => {
            const [name, notes] = struct;
            this.list.push(new Structure(name, notes));
        })
        this.create_buttons();
    }

    get_random() {
        if (this.list.every((item) => item.active == false)) {
            cprint("make at least one active choice for this game in the options");
            return null;
        }
        // might be cleaner way to do this
        let retval = random_element(this.list);
        while (retval.active == false){
            retval = random_element(this.list);
        }
        return retval;
    }

    create_buttons() { // make this function only work on one button at a time, and run it in init
        this.list.forEach((chord) => {
            const button = document.createElement('button');
            button.classList.toggle('active');
            button.textContent = chord.name;
            button.addEventListener('click', () => {
                chord.toggle();
                button.classList.toggle('active');
            });
            button.addEventListener('mouseover', () => {
                chord.light_keys();
            }); 
            button.addEventListener('mouseout', () => {
                chord.unlight_keys();
            }); 
            const container = document.getElementById(this.name);
            container.appendChild(button);
        })
    }

}

const intervals = new Structure_Collection('interval_types',
[
    ['octave'       ,   [0,12]      ],
    ['min 2nd'      ,   [0, 1]      ],
    ['Maj 2nd'      ,   [0, 2]      ],
    ['min 3rd'      ,   [0, 3]      ],
    ['Maj 3rd'      ,   [0, 4]      ],
    ['4th'          ,   [0, 5]      ],
    ['tritone'      ,   [0, 6]      ],
    ['5th'          ,   [0, 7]      ],
    ['min 6th'      ,   [0, 8]      ],
    ['Maj 6th'      ,   [0, 9]      ],
    ['min 7th'      ,   [0, 10]     ],
    ['Maj 7th'      ,   [0, 11]     ],
]);

const scales = new Structure_Collection('scale_types',
[
    ['major'            , [0, 2, 4, 5, 7, 9, 11]],
    ['natural minor'    , [0, 2, 3, 5, 7, 8, 10]],
    ['harmonic minor'   , [0, 2, 3, 5, 7, 8, 11]],
    ['persian'          , [0, 1, 4, 5, 7, 8, 11]], 
]);


const chords = new Structure_Collection('chord_types',
[
    ['5'            ,   [0,7]           ],
    ['m'            ,   [0,3,7]         ],
    ['M'            ,   [0,4,7]         ],
    ['dim'          ,   [0,3,6]         ],
    ['+'            ,   [0,4,8]         ],
    ['sus2'         ,   [0,2,7]         ],
    ['sus4'         ,   [0,5,7]         ],
    ['M7'           ,   [0,4,7,11]      ],
    ['m7'           ,   [0,3,7,10]      ],
    ['7'            ,   [0,4,7,10]      ],
    ['m7♭5'         ,   [0,3,6,10]      ],   
    ['6'            ,   [0,4,7,9]       ],
    ['m6'           ,   [0,3,7,9]       ],
    ['dim7'         ,   [0,3,6,9]       ],
    ['9'            ,   [0,4,7,10,14]   ],
]);