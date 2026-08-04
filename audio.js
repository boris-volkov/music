// Sounds the app's example notes, either on the player's own MIDI instrument or on a
// built-in oscillator synth.
//
// MIDI-out is preferred where it works, since a real instrument sounds far better than
// oscillators -- but it only makes noise if something is actually listening on the other
// end, so anyone without a sounding device falls back to the synth. Sending MIDI also has
// to dodge two traps that bit this app before:
//   - never send to a virtual loopback ("Midi Through") port. It makes no sound, and its
//     output arrives straight back at our own input as if the player had played it, which
//     silently solves ear-training questions and skips them.
//   - even on a real port, ignore input echoing the notes we just sent, for as long as
//     they are sounding.

const playback_settings = {
    output: 'midi', // 'midi' | 'synth'; midi falls back to synth when nothing can sound it
};

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

// short percussive blip for the rhythm trainer's metronome. deliberately not routed
// through synth_settings -- the click should stay crisp and audible no matter how the
// note tone is currently tuned, so it can't be lost against the notes being played.
function play_click(startTime, accent = false) {
    const ctx = get_audio_context();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const duration = 0.035;

    osc.type = 'square';
    osc.frequency.value = accent ? 1600 : 1050; // downbeat sits higher so it's countable

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.22 : 0.13, startTime + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration);
    return osc; // handed back so a whole run's clicks can be cancelled if it's stopped early
}

// --- MIDI instrument playback -------------------------------------------------

// The first output that isn't a virtual loopback. Sending to a loopback would make no
// sound and would arrive back at our own input, so those are never usable.
function sounding_midi_output() {
    if (!midi) return null;
    const real = [...midi.outputs.values()].filter((out) => !is_passthrough_port(out.name));
    return real[0] || null;
}

function using_midi_output() {
    return playback_settings.output === 'midi' && sounding_midi_output() !== null;
}

// Notes we have just sent, and the moment they stop sounding. Anything matching that
// arrives back at our input before then is our own signal returning, not the player.
let echoed_notes = new Set();
let echo_guard_until = 0;

function is_own_echo(key) {
    return performance.now() < echo_guard_until && echoed_notes.has(key);
}

function play_notes_via_midi(midiNumbers, noteDuration, gap) {
    const output = sounding_midi_output();
    const startedAt = performance.now();
    const lastNoteEnds = (midiNumbers.length - 1) * gap * 1000 + noteDuration * 1000;

    echoed_notes = new Set(midiNumbers);
    echo_guard_until = startedAt + lastNoteEnds + 50; // small margin for transport lag

    midiNumbers.forEach((noteNumber, i) => {
        const at = startedAt + i * gap * 1000;
        output.send([KEYDOWN, noteNumber, 90], at);
        output.send([KEYUP, noteNumber, 0], at + noteDuration * 1000);
    });
}

// plays each note in turn, overlapping slightly so consecutive notes still feel connected
function play_notes_sequentially(midiNumbers, noteDuration = synth_settings.note_duration, gap = synth_settings.gap) {
    if (using_midi_output()) {
        play_notes_via_midi(midiNumbers, noteDuration, gap);
        return;
    }
    const ctx = get_audio_context();
    const now = ctx.currentTime;
    midiNumbers.forEach((noteNumber, i) => {
        play_tone(noteNumber, now + i * gap, noteDuration);
    });
}
