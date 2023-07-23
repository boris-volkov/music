let midi = null; // global MIDIAccess object
// midi.inputs has a list (iterable object?) of midi input instruments
let last_note_time; // holds the time of the last note played
const KEYDOWN = 0x90;
const KEYUP = 0x80;

navigator.requestMIDIAccess().then(init, onMIDIFailure);


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

class MidiMessage {
  constructor(status = KEYDOWN, data1 = 36, data2 = 100) {
    this.status = status;
    this.data1 = data1;
    this.data2 = data2;
  }

  send() {
    const outputs = midi.outputs;
    const outputIterator = outputs.values();
    const firstOutput = outputIterator.next().value;
  
    if (!firstOutput) {
      console.error("No MIDI output available.");
      return;
    }
  
    const output = firstOutput;
    output.send([this.status, this.data1, this.data2]);
  
    // Assuming Note On message (status: 0x90), schedule a Note Off message after 1 second
    if (this.status === 0x90) {
      setTimeout(() => {
        output.send([this.status - 0x10, this.data1, 0]); // Send Note Off message with velocity 0
      }, 1000);
    }
  }
  
  
}

function sequentially(functions, delay) {
  for (let i = 0; i < functions.length; i++) {
      setTimeout(functions[i], i * delay);
  }
}




