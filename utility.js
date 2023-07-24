
// maybe should prime with a false answer like my math game
// furthermore there should probably be a class for the quiz itself that calls this 
// function at init time. 
function init_quiz(starter, callback){ // sending both funcs sucks becuase the callback calls the starter anyway
    starter();
    midi.inputs.forEach((entry) => {
        entry.onmidimessage = (e) => { // add listener to all midi inputs
          onMIDIMessage(e);
          callback(e);
      }
  });
} // this function should also set up a cleanup function 

function add_game_button(name, func){
  const button = document.createElement('button');
  button.textContent = name;
  button.addEventListener('pointerdown', function () {
      func();

      // deactivate all other buttons and activate this one
      const others = document.querySelectorAll("#game_choices button");
      others.forEach((b) => {
        b.classList.remove("active");
      });
      this.classList.add("active");
      optionsOff();
});
  const container = document.getElementById('game_choices');
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
