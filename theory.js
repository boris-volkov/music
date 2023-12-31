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
    button.addEventListener('pointerdown', () => {
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
    allButton.addEventListener('pointerdown', () => {
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
  constructor(name, number, active = true) {
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
  // constructor(name, notes, active = localStorage.getItem('active') === 'true' || true)
  // migrate to this when switching to local storage  
  constructor(name, notes, active = true) {
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
    button.addEventListener('pointerdown', () => {
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
    allButton.addEventListener('pointerdown', () => {
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

const intervals = new Structure_Collection('interval_types', [
  ['min 2nd above', [0, 1]],
  ['min 2nd below', [0, -1]],
  ['Maj 2nd above', [0, 2]],
  ['Maj 2nd below', [0, -2]],
  ['min 3rd above', [0, 3]],
  ['min 3rd below', [0, -3]],
  ['Maj 3rd above', [0, 4]],
  ['Maj 3rd below', [0, -4]],
  ['4th above', [0, 5]],
  ['4th below', [0, -5]],
  ['tritone above', [0, 6]],
  ['tritone below', [0, -6]],
  ['5th above', [0, 7]],
  ['5th below', [0, -7]],
  ['min 6th above', [0, 8]],
  ['min 6th below', [0, -8]],
  ['Maj 6th above', [0, 9]],
  ['Maj 6th below', [0, -9]],
  ['min 7th above', [0, 10]],
  ['min 7th below', [0, -10]],
  ['Maj 7th above', [0, 11]],
  ['Maj 7th below', [0, -11]]
]);


  const scales = new Structure_Collection('scale_types', [
    // Standard scales
    ['major', [0, 2, 4, 5, 7, 9, 11]],
    ['natural minor', [0, 2, 3, 5, 7, 8, 10]],
    ['harmonic minor', [0, 2, 3, 5, 7, 8, 11]],
    ['persian', [0, 1, 4, 5, 7, 8, 11]],
    ['ionian', [0, 2, 4, 5, 7, 9, 11]],
    ['dorian', [0, 2, 3, 5, 7, 9, 10]],
    ['phrygian', [0, 1, 3, 5, 7, 8, 10]],
    ['lydian', [0, 2, 4, 6, 7, 9, 11]],
    ['mixolydian', [0, 2, 4, 5, 7, 9, 10]],
    ['aeolian', [0, 2, 3, 5, 7, 8, 10]],
    ['locrian', [0, 1, 3, 5, 6, 8, 10]],
    ['blues', [0, 3, 5, 6, 7, 10]],
    ['melodic minor', [0, 2, 3, 5, 7, 9, 11]],
    ['diminished', [0, 2, 3, 5, 6, 8, 9, 11]],
    ['whole tone', [0, 2, 4, 6, 8, 10]],
    ['pentatonic major', [0, 2, 4, 7, 9]],
    ['pentatonic minor', [0, 3, 5, 7, 10]],
    
    // Japanese Scales
    ['in', [0, 1, 5, 7, 10]], // Japanese "In Scale"
    ['hirajoshi', [0, 2, 3, 7, 8]], // Japanese "Hirajoshi Scale"
    ['kumoi', [0, 2, 3, 7, 9]], // Japanese "Kumoi Scale"
    ['iwato', [0, 1, 5, 6, 10]], // Japanese "Iwato Scale"
    ['yo', [0, 3, 5, 7, 10]], // Japanese "Yo Scale"
  
    // Other Exotic Scales
    ['hungarian minor', [0, 2, 3, 6, 7, 8, 11]], // Hungarian Minor Scale
    ['enigmatic', [0, 1, 4, 6, 8, 10, 11]], // Enigmatic Scale
    ['altered', [0, 1, 3, 4, 6, 8, 10]], // Altered Scale
    ['bebop dominant', [0, 2, 4, 5, 7, 9, 10, 11]], // Bebop Dominant Scale
    ['persian dominant', [0, 1, 4, 5, 6, 8, 11]], // Persian Dominant Scale
    ['neapolitan major', [0, 1, 3, 5, 7, 9, 11]], // Neapolitan Major Scale
    ['neapolitan minor', [0, 1, 3, 5, 7, 8, 11]], // Neapolitan Minor Scale
  ]);
  

  const chords = new Structure_Collection('chord_types', [
    ['5', [0, 7]],
    ['m', [0, 3, 7]],
    ['Maj', [0, 4, 7]],
    ['dim', [0, 3, 6]],
    ['+', [0, 4, 8]],
    ['sus2', [0, 2, 7]],
    ['sus4', [0, 5, 7]],
    ['maj7', [0, 4, 7, 11]],
    ['m7', [0, 3, 7, 10]],
    ['7', [0, 4, 7, 10]],
    ['m7♭5', [0, 3, 6, 10]],
    ['6', [0, 4, 7, 9]],
    ['m6', [0, 3, 7, 9]],
    ['dim7', [0, 3, 6, 9]],
    ['9', [0, 4, 7, 10, 14]],
    ['add9', [0, 4, 7, 14]], // Major triad with added 9th
    ['m(add9)', [0, 3, 7, 14]], // Minor triad with added 9th
    ['Maj9', [0, 4, 7, 11, 14]], // Major 7th chord with added 9th
    ['m9', [0, 3, 7, 10, 14]], // Minor 7th chord with added 9th
    ['11', [0, 4, 7, 10, 14, 17]], // Dominant 7th chord with added 9th and 11th
    ['13', [0, 4, 7, 10, 14, 17, 21]], // Dominant 7th chord with added 9th, 11th, and 13th
    ['dim9', [0, 3, 6, 10, 14]], // Diminished 7th chord with added 9th
    ['aug9', [0, 4, 8, 14]], // Augmented triad with added 9th
    ['Maj11', [0, 4, 7, 11, 14, 17]], // Major 7th chord with added 9th and 11th
    ['m11', [0, 3, 7, 10, 14, 17]], // Minor 7th chord with added 9th and 11th
    ['Maj13', [0, 4, 7, 11, 14, 17, 21]], // Major 7th chord with added 9th, 11th, and 13th
    ['m13', [0, 3, 7, 10, 14, 17, 21]], // Minor 7th chord with added 9th, 11th, and 13th
    ['aug7', [0, 4, 8, 10]], // Augmented 7th chord
  ]);