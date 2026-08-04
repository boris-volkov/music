// Lets keys on the player's own MIDI keyboard drive the app's transport, so a practice
// run can be started and stopped without reaching for the mouse.
//
// Bindings are learned rather than fixed: press "Set", then play whichever key you want.
// Keyboards vary from 25 to 88 keys, so there is no note that is "the bottom one" for
// everybody -- the default is A0, the lowest key of a standard 88-key board, and anyone
// on a smaller keyboard just rebinds it to something they actually have.

const DEFAULT_BINDINGS = { start_stop: 21 }; // A0
const BINDINGS_STORAGE_KEY = 'music_theory_midi_bindings';

let midi_bindings = load_bindings();
let learning_control = null; // name of the control waiting for a key press

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

function note_name(midi) {
    return NOTE_NAMES[midi.mod(12)] + (Math.floor(midi / 12) - 1);
}

function load_bindings() {
    try {
        const stored = JSON.parse(localStorage.getItem(BINDINGS_STORAGE_KEY));
        if (stored && typeof stored === 'object') return { ...DEFAULT_BINDINGS, ...stored };
    } catch (e) { /* nothing saved, or unreadable */ }
    return { ...DEFAULT_BINDINGS };
}

function save_bindings() {
    try {
        localStorage.setItem(BINDINGS_STORAGE_KEY, JSON.stringify(midi_bindings));
    } catch (e) { /* private mode or storage full -- the binding still works this session */ }
}

// Called from the MIDI dispatch ahead of everything else. While a binding is being
// learned the note is swallowed, so the key being assigned doesn't also register as an
// answer in whatever quiz happens to be open.
function consume_control_note(event) {
    const [type, key, velocity] = event.data;
    if (type !== KEYDOWN || velocity === 0) return false;
    if (!learning_control) return false;

    midi_bindings[learning_control] = key;
    save_bindings();
    learning_control = null;
    refresh_bindings_ui();
    return true;
}

function start_learning(control) {
    learning_control = learning_control === control ? null : control; // click again to cancel
    refresh_bindings_ui();
}

function refresh_bindings_ui() {
    document.querySelectorAll('.binding_row').forEach((row) => {
        const control = row.dataset.control;
        const learning = learning_control === control;
        row.querySelector('.binding_key').textContent =
            learning ? 'press a key…' : note_name(midi_bindings[control]);
        row.classList.toggle('learning', learning);
        row.querySelector('button').textContent = learning ? 'Cancel' : 'Set';
    });
}

document.querySelectorAll('.binding_row button').forEach((button) => {
    button.addEventListener('pointerdown', () => {
        start_learning(button.closest('.binding_row').dataset.control);
    });
});

refresh_bindings_ui();
