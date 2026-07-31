// Plays audible tones straight from the browser via the Web Audio API, instead of sending
// real MIDI Note On/Off messages out to whatever output device happens to be registered.
// That MIDI-out approach only made sound if something (a real synth) was listening on the
// receiving end, and on systems with a virtual loopback port (e.g. ALSA's "Midi Through")
// the outgoing notes could loop straight back in as if the user had played them, silently
// solving the quiz. Synthesizing in-browser sidesteps both problems.

let audio_context = null;

function get_audio_context() {
    if (!audio_context) {
        audio_context = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audio_context.state === 'suspended') {
        audio_context.resume();
    }
    return audio_context;
}

function midi_to_frequency(midiNumber) {
    return 440 * Math.pow(2, (midiNumber - 69) / 12);
}

function play_tone(midiNumber, startTime, duration) {
    const ctx = get_audio_context();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = midi_to_frequency(midiNumber);

    const attack = 0.02;
    const release = 0.08;
    const peak = 0.25;

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(peak, startTime + attack);
    gain.gain.setValueAtTime(peak, startTime + duration - release);
    gain.gain.linearRampToValueAtTime(0, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration);
}

// plays each note in turn, overlapping slightly so consecutive notes still feel connected
function play_notes_sequentially(midiNumbers, noteDuration = 1.0, gap = 0.5) {
    const ctx = get_audio_context();
    const now = ctx.currentTime;
    midiNumbers.forEach((noteNumber, i) => {
        play_tone(noteNumber, now + i * gap, noteDuration);
    });
}
