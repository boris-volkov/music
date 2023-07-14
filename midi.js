let midi = null; // global MIDIAccess object
// midi.inputs has a list (iterable object?) of midi input instruments
let last_note_time; // holds the time of the last note played
const KEYDOWN = 0x90;
const KEYUP = 0x80;

function onMIDIFailure(msg) {
  console.error(`Failed to get MIDI access - ${msg}`);
}

function listInputsAndOutputs(midiAccess) {
    for (const entry of midiAccess.inputs) {
      const input = entry[1];
      console.log(
        `Input port [type:'${input.type}']` +
          ` id:'${input.id}'` +
          ` manufacturer:'${input.manufacturer}'` +
          ` name:'${input.name}'` +
          ` version:'${input.version}'`
      );
    }
  
    for (const entry of midiAccess.outputs) {
      const output = entry[1];
      console.log(
        `Output port [type:'${output.type}'] id:'${output.id}' manufacturer:'${output.manufacturer}' name:'${output.name}' version:'${output.version}'`
      );
    }
}

function logMidi(event){
  let str = `MIDI message received at timestamp ${event.timeStamp}[${event.data.length} bytes]: `;
  for (const character of event.data) {
    str += `0x${character.toString(16)} `;
  }
}

function init(midiAccess) {
    midi = midiAccess;
    listInputsAndOutputs(midiAccess);
    startLoggingMIDIInput(midiAccess);
}

navigator.requestMIDIAccess().then(init, onMIDIFailure);

function onMIDIMessage(event) { // default function to run on each keypress
  const [type, key, intensity] = event.data;

  if (type == KEYDOWN){ 
    notes_down.push(key); 
    last_note_time = Date.now();
    light_key(key);

  } else if (type == KEYUP) {
    remove_item(notes_down, key);
    unlight_key(key);
  }
  bass_note = Math.min(...notes_down); // I feel like this might create some race condition with the other listeners
}
  
function startLoggingMIDIInput(midiAccess, indexOfPort) { //sets onmidimessage listener for each input 
    midiAccess.inputs.forEach((entry) => {
        entry.onmidimessage = onMIDIMessage;
    });
}