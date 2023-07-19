// there needs to be a class for the notes held down by the player, 
// as sequence, as set, as list, and have the comparison methods. 

let notes_down = [];
let note_sequence = [];
let bass_note; // important to know it for chord inversions and such (probably intervals too)

const key_map = {
    0: ['C'],
    1: ['C♯', 'D♭'],
    2: ['D'],
    3: ['D♯', 'E♭'],
    4: ['E'],
    5: ['F'],
    6: ['F♯', 'G♭'],
    7: ['G'],
    8: ['G♯', 'A♭'],
    9: ['A'],
    10: ['A♯', 'B♭'],
    11: ['B'],
}

class Notes {
    constructor(name, list) {
        this.name = name;
        this.list = list.map((struct) => {
            const [name, number] = struct;
            const note = new Note(name, number);
            note.addButton(this.createButton(note));
            return note;
        });
        this.createAllButton();
    }

    get_name(num) {
        return random_element(key_map[key % 12]);
    }

    random_number() {
        return Math.floor(Math.random() * 12);
    }

    get_random() {
        if (this.list.every((item) => item.active == false)) {
            cprint("make at least one active choice for this game in the options");
            contentDiv.style.display = 'flex';
            return null;
        }
        // might be cleaner way to do this
        let retval = random_element(this.list);
        while (retval.active == false) {
            retval = random_element(this.list);
        }
        return retval;
    }

    createButton(note) {
        const button = document.createElement('button');
        button.textContent = note.name;
        button.addEventListener('click', () => {
            note.toggle();
            button.classList.toggle('active', note.active);
        });
        button.addEventListener('mouseover', () => {
            note.light_key();
        });
        button.addEventListener('mouseout', () => {
            note.unlight_key();
        });
        const container = document.getElementById(this.name);
        container.appendChild(button);
        return button;
    }

    createAllButton() {
        const allButton = document.createElement('button');
        allButton.textContent = 'All';
        allButton.addEventListener('click', () => {
          const allActive = !this.list.every((structure) => structure.active);
          this.list.forEach((structure) => {
            structure.active = allActive;
            structure.button.classList.toggle('active', allActive);
          });
        });
      
        const container = document.getElementById(this.name);
        const firstChild = container.firstChild;
        container.insertBefore(allButton, firstChild);
      }
}

class Note {
    constructor(name, number, active = false) {
        this.name = name;
        this.number = number;
        this.active = active;
        this.button = null;
    }

    addButton(button) {
        this.button = button;
        this.button.classList.toggle('active', this.active);
    }

    toggle() {
        this.active = !this.active;
    }

    setActive(active) {
        this.active = active;
    }

    light_key() {
        light_key(this.number);
    }

    unlight_key() {
        unlight_key(this.number);
    }
}

const notes = new Notes('note_types',
    [
        ['C', 0],
        ['C♯', 1],
        ['D♭', 1],
        ['D', 2],
        ['D♯', 3],
        ['E♭', 3],
        ['E', 4],
        ['F', 5],
        ['F♯', 6],
        ['G♭', 6],
        ['G', 7],
        ['G♯', 8],
        ['A♭', 8],
        ['A', 9],
        ['A♯', 10],
        ['B♭', 10],
        ['B', 11]
    ]);



function get_note_name(key) {
    return random_element(key_map[key % 12]);
}

function get_random_note() {
    return Math.floor(Math.random() * 12);
}

class Structure {
    constructor(name, notes, active = false) {
      this.name = name;
      this.notes = notes;
      this.active = active;
      this.button = null;
    }
  
    invert(n) {
      if (n == 0) return;
      for (let i = 0; i < n; i++) {
        let lastElement = this.notes.pop();
        this.notes.unshift(lastElement);
      }
    }
  
    toggle() {
      this.active = !this.active;
      this.button.classList.toggle('active', this.active);
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
  
    setButton(button) {
      this.button = button;
      this.button.classList.toggle('active', this.active);
    }
  }
  
  class Structure_Collection {
    constructor(name, list) {
      this.name = name;
      this.list = list.map((struct) => {
        const [name, notes] = struct;
        const structure = new Structure(name, notes);
        structure.setButton(this.createButton(structure));
        return structure;
      });
      this.createAllButton();
    }
  
    get_random() {
        if (this.list.every((item) => item.active == false)) {
            cprint("make at least one active choice for this game in the options");
            contentDiv.style.display = 'flex';
            return null;
        }
        // might be cleaner way to do this
        let retval = random_element(this.list);
        while (retval.active == false) {
            retval = random_element(this.list);
        }
        return retval;
    }

    createButton(structure) {
      const button = document.createElement('button');
      button.textContent = structure.name;
      button.addEventListener('click', () => {
        structure.toggle();
      });
      button.addEventListener('mouseover', () => {
        structure.light_keys();
      });
      button.addEventListener('mouseout', () => {
        structure.unlight_keys();
      });
      const container = document.getElementById(this.name);
      container.appendChild(button);
      return button;
    }
    createAllButton() {
        const allButton = document.createElement('button');
        allButton.textContent = 'All';
        allButton.addEventListener('click', () => {
          const allActive = !this.list.every((structure) => structure.active);
          this.list.forEach((structure) => {
            structure.active = allActive;
            structure.button.classList.toggle('active', allActive);
          });
        });
      
        const container = document.getElementById(this.name);
        const firstChild = container.firstChild;
        container.insertBefore(allButton, firstChild);
      }
  }

const intervals = new Structure_Collection('interval_types',
    [
        ['min 2nd', [0, 1]],
        ['Maj 2nd', [0, 2]],
        ['min 3rd', [0, 3]],
        ['Maj 3rd', [0, 4]],
        ['4th', [0, 5]],
        ['tritone', [0, 6]],
        ['5th', [0, 7]],
        ['min 6th', [0, 8]],
        ['Maj 6th', [0, 9]],
        ['min 7th', [0, 10]],
        ['Maj 7th', [0, 11]],
    ]);

const scales = new Structure_Collection('scale_types',
    [
        ['major', [0, 2, 4, 5, 7, 9, 11]],
        ['natural minor', [0, 2, 3, 5, 7, 8, 10]],
        ['harmonic minor', [0, 2, 3, 5, 7, 8, 11]],
        ['persian', [0, 1, 4, 5, 7, 8, 11]],
    ]);


const chords = new Structure_Collection('chord_types',
    [
        ['5', [0, 7]],
        ['m', [0, 3, 7]],
        ['M', [0, 4, 7]],
        ['dim', [0, 3, 6]],
        ['+', [0, 4, 8]],
        ['sus2', [0, 2, 7]],
        ['sus4', [0, 5, 7]],
        ['M7', [0, 4, 7, 11]],
        ['m7', [0, 3, 7, 10]],
        ['7', [0, 4, 7, 10]],
        ['m7♭5', [0, 3, 6, 10]],
        ['6', [0, 4, 7, 9]],
        ['m6', [0, 3, 7, 9]],
        ['dim7', [0, 3, 6, 9]],
        ['9', [0, 4, 7, 10, 14]],
    ]);