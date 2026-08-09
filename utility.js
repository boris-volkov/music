
// maybe should prime with a false answer like my math game
// furthermore there should probably be a class for the quiz itself that calls this 
// function at init time. 
let current_quiz_cleanup = null; // lets a mode stop timers/audio when the user switches away

function init_quiz(starter, callback, cleanup = null){ // sending both funcs sucks becuase the callback calls the starter anyway
    if (current_quiz_cleanup) current_quiz_cleanup();
    current_quiz_cleanup = cleanup;
    reset_display(); // clears any stale notation panel left over from a previous mode
    // only modes that play something for you get a replay button; they re-show it after
    document.getElementById('replay_button').style.display = 'none';
    // the note-types tab only has anything to offer on the four topics built on the
    // shared rhythm engine (Rhythm, Melody, Partimento, Modes) -- default it closed and
    // disabled on every switch; init_rhythm_panel() (rhythm.js) turns it back on, and
    // set_topic_ui() (buttons.js) shows or hides it, when the switch is into one of those
    const noteTypesTab = document.getElementById('rhythm_note_types_tab');
    if (noteTypesTab) {
        if (noteTypesTab.classList.contains('active')) optionsOff();
        noteTypesTab.disabled = true;
    }
    starter();
    current_quiz_callback = callback;
    bindMidiInputs(); // safe even if midi isn't ready yet or no keyboard is plugged in
}

// One row in the left rail. `group` is one of the rail_group ids (reading/ear/theory/
// timing/patterns) -- it's what colours the row's leading dot (see the .topic_button.*
// rules in style.css), replacing the old cards' full-button fill now that a row has no
// border or background of its own to carry colour in.
function add_game_button(name, func, panelId, group){
  const button = document.createElement('button');
  button.classList.add('topic_button', group);
  const dot = document.createElement('span');
  dot.classList.add('topic_dot');
  const label = document.createElement('span');
  label.textContent = name;
  button.append(dot, label);
  button.addEventListener('pointerdown', function () {
      func();

      // deactivate every other topic row and activate this one
      const others = document.querySelectorAll('#rail .topic_button');
      others.forEach((b) => {
        b.classList.remove("active");
      });
      button.classList.add("active");
      document.getElementById('now_name').textContent = name;
      optionsOff();
});
  const container = document.getElementById(panelId);
  container.appendChild(button);
}

Number.prototype.mod = function(n) {
  return ((this%n)+n)%n;
};

function addConstantModulo12(array, constant) {
    return array.map(element => (element + constant).mod(12));
}

function reflectIntervals(array){ // TODO get rid of this somehow
    return array.map(element => (12-element) );
}

function rand_index(arr) {
    return Math.floor(Math.random() * arr.length);
}

// this is all array stuff below.. maybe it should be added to array prototype

function random_element(arr){
    const index =  Math.floor(Math.random() * arr.length);
    return arr[index];
}

function remove_item(arr, item){
    const index = arr.indexOf(item);
    if (index > -1) { // only splice array when item is found
      arr.splice(index, 1); // 2nd parameter means remove one item only
    }
}

function haveSameElements(array1, array2) {
    if (array1.length !== array2.length) {
      return false;
    }
  
    const sortedArray1 = array1.sort();
    const sortedArray2 = array2.sort();
  
    return sortedArray1.every((element, index) => element === sortedArray2[index]);
}

function arraysEqual(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (a.length !== b.length) return false;
  
    for (var i = 0; i < a.length; ++i) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  function arraysEqualMod12(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (a.length !== b.length) return false;
  
    for (var i = 0; i < a.length; ++i) {
      if (a[i]%12 !== b[i]%12) return false;
    }
    return true;
  }
