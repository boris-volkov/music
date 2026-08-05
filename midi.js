let midi = null; // global MIDIAccess object
// midi.inputs has a list (iterable object?) of midi input instruments
let last_note_time; // holds the time of the last note played
const KEYDOWN = 0x90;
const KEYUP = 0x80;

let current_quiz_callback = null; // set by init_quiz, rebound onto every input as it (dis)connects

const midi_status = document.getElementById('midi_status');

function set_midi_status(message, level) { // level: 'ok' | 'warn' | 'error'
  if (!midi_status) return;
  midi_status.title = message;
  midi_status.classList.remove('status-ok', 'status-warn', 'status-error');
  midi_status.classList.add('status-' + level);
}

if (navigator.requestMIDIAccess) {
  set_midi_status('Looking for a MIDI keyboard…', 'warn');
  navigator.requestMIDIAccess().then(init, onMIDIFailure);
} else {
  set_midi_status('This browser does not support Web MIDI — try Chrome, Edge, or Opera.', 'error');
}

function onMIDIFailure(msg) {
  console.error(`Failed to get MIDI access - ${msg}`);
  set_midi_status('MIDI access was denied — allow MIDI access and reload the page.', 'error');
}

function is_passthrough_port(name) { // ALSA's virtual "Midi Through" loopback shows up on ~every Linux system
  return /midi\s*through/i.test(name || ''); // even with no real keyboard plugged in - it never carries key presses
}

function refresh_midi_status() {
  if (!midi) return;
  const inputs = [...midi.inputs.values()];
  if (inputs.length === 0) {
    set_midi_status('No MIDI keyboard detected — plug one in to start practicing.', 'warn');
    return;
  }
  const real_inputs = inputs.filter((input) => !is_passthrough_port(input.name));
  if (real_inputs.length === 0) {
    set_midi_status(
      'Only a virtual "Midi Through" port was found — your keyboard isn\'t reaching the browser ' +
      '(check ALSA MIDI routing, e.g. aconnect, or the browser\'s MIDI device permissions).',
      'warn'
    );
    return;
  }
  const names = real_inputs.map((input) => input.name).join(', ');
  set_midi_status(`Connected: ${names}`, 'ok');
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
  console.log(str);
}

function init(midiAccess) {
    midi = midiAccess;
    listInputsAndOutputs(midiAccess);
    bindMidiInputs();
    refresh_midi_status();
    sync_playback_controls(); // an output may now be available to play through
    midi.onstatechange = () => { // fires when a keyboard is plugged in or unplugged
        bindMidiInputs();
        refresh_midi_status();
        sync_playback_controls();
    };
}


function onMIDIMessage(event) { // default function to run on each keypress
  const [type, key, intensity] = event.data;

  if (type == KEYDOWN && intensity > 0){
    notes_down.push(key);
    last_note_time = Date.now();
    light_key(key);

  } else if (type == KEYUP || (type == KEYDOWN && intensity === 0)) { // many keyboards send Note On/velocity 0 instead of a real Note Off
    remove_item(notes_down, key);
    unlight_key(key);
  }
  bass_note = Math.min(...notes_down); // I feel like this might create some race condition with the other listeners
}
  
function bindMidiInputs() { // (re)attaches the message handler to every currently connected input
    if (!midi) return;
    midi.inputs.forEach((entry) => {
        entry.onmidimessage = (e) => {
            logMidi(e); // always visible in devtools, so a silent keyboard vs. a silent game is easy to tell apart
            if (consume_control_note(e)) return; // a key being bound isn't also an answer
            if (is_own_echo(e.data[1])) return;  // our own playback looping back in
            onMIDIMessage(e);
            if (current_quiz_callback) current_quiz_callback(e);
        };
    });
}

// MidiMessage / sequentially() used to live here -- the original note playback. Replaced
// by play_notes_via_midi() in audio.js, which picks a port that can actually sound and
// schedules note-offs on the send timestamp rather than through setTimeout.




