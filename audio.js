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

// Live-tunable via the sliders in the "more options" panel (see synth_controls.js) --
// values here are just the defaults the sliders start at.
const synth_settings = {
    waveform: 'sine',
    detune_cents: 6, // spread between the two voices that make up one note
    attack: 0.02,    // seconds
    release: 0.08,   // seconds
    peak: 0.16,      // per-voice gain; two voices sum, so keep this under ~0.5
    note_duration: 1.0, // seconds
    gap: 0.5,           // seconds between successive notes' start times
};

function play_tone(midiNumber, startTime, duration) {
    const ctx = get_audio_context();
    const gain = ctx.createGain();

    const attack = synth_settings.attack;
    const release = synth_settings.release;
    const peak = synth_settings.peak;

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(peak, startTime + attack);
    gain.gain.setValueAtTime(peak, Math.max(startTime + attack, startTime + duration - release));
    gain.gain.linearRampToValueAtTime(0, startTime + duration);
    gain.connect(ctx.destination);

    // two voices a few cents apart give the note some shimmer/grit -- like a chorus
    // effect -- without adding the extra harmonics a richer waveform would, which is
    // what made two overlapping notes clash before a plain sine. skip the second
    // voice entirely when detune is 0 so there's no pointless doubled oscillator.
    const baseFreq = midi_to_frequency(midiNumber);
    const detune_cents = synth_settings.detune_cents;
    const offsets = detune_cents > 0 ? [-detune_cents, detune_cents] : [0];
    offsets.forEach((cents) => {
        const osc = ctx.createOscillator();
        osc.type = synth_settings.waveform;
        osc.frequency.value = baseFreq * Math.pow(2, cents / 1200);
        osc.connect(gain);
        osc.start(startTime);
        osc.stop(startTime + duration);
    });
}

// plays each note in turn, overlapping slightly so consecutive notes still feel connected
function play_notes_sequentially(midiNumbers, noteDuration = synth_settings.note_duration, gap = synth_settings.gap) {
    const ctx = get_audio_context();
    const now = ctx.currentTime;
    midiNumbers.forEach((noteNumber, i) => {
        play_tone(noteNumber, now + i * gap, noteDuration);
    });
}
