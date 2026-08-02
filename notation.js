// Toggles the display panel between plain text and rendered musical notation (VexFlow).
// Only note_quiz.js calls show_prompt() with notation keys today — other quiz modes still
// call cprint()/print() directly and are unaffected by the toggle until they're upgraded too.

let notation_enabled = false;
let vf_context = null;

const notation_toggle = document.getElementById('notation_toggle');
const notation_panel = document.getElementById('notation');
const vexflow_available = typeof Vex !== 'undefined' && !!Vex.Flow;

if (!vexflow_available) {
    console.error('VexFlow failed to load — notation toggle disabled.');
    notation_toggle.disabled = true;
    notation_toggle.title = 'Musical notation unavailable (VexFlow failed to load)';
}

notation_toggle.addEventListener('pointerdown', () => {
    notation_enabled = !notation_enabled;
    notation_toggle.classList.toggle('active', notation_enabled);
    // if we're mid-way through the Notes quiz, refresh the current prompt immediately
    if (current_quiz_callback === note_callback && note) {
        show_prompt(note.name, [note_to_vexkey(note)]);
    }
});

function note_to_vexkey(note, octave = 4) {
    const letter = note.name[0].toLowerCase();
    const accidental = note.name.includes('♯') ? '#' : note.name.includes('♭') ? 'b' : '';
    return `${letter}${accidental}/${octave}`;
}

function get_vf_context() {
    if (vf_context) return vf_context;
    const renderer = new Vex.Flow.Renderer(notation_panel, Vex.Flow.Renderer.Backends.SVG);
    renderer.resize(260, 130);
    vf_context = renderer.getContext();
    return vf_context;
}

function render_notation(vexKeys) {
    const VF = Vex.Flow;
    const context = get_vf_context();
    context.clear();

    const stave = new VF.Stave(10, 10, 230);
    stave.addClef('treble');
    stave.setContext(context).draw();

    const staveNote = new VF.StaveNote({ keys: vexKeys, duration: 'q' });
    vexKeys.forEach((key, i) => {
        // accidental is whatever sits between the note letter and the "/octave" --
        // can't just check key.includes('b'), since "b" is also a real note letter (natural B)
        const accidental = key.slice(1, key.indexOf('/'));
        if (accidental === '#') staveNote.addModifier(new VF.Accidental('#'), i);
        else if (accidental === 'b') staveNote.addModifier(new VF.Accidental('b'), i);
    });

    VF.Formatter.FormatAndDraw(context, stave, [staveNote]);
}

// Exactly one display surface is visible at a time. Tracking which one is active means
// closing the options panel can restore whatever the current mode was showing, instead
// of always snapping back to the terminal.
const display_surfaces = {
    terminal: terminal,
    notation: notation_panel,
    rhythm: document.getElementById('rhythm_panel'),
};
let active_display = 'terminal';

function show_display(which) {
    active_display = which;
    Object.entries(display_surfaces).forEach(([name, el]) => {
        if (el) el.style.display = name === which ? 'flex' : 'none';
    });
}

function hide_all_displays() { // while the options panel has the floor
    Object.values(display_surfaces).forEach((el) => {
        if (el) el.style.display = 'none';
    });
}

function restore_display() {
    show_display(active_display);
}

function reset_display() { // called on every quiz-mode switch so a stale panel never lingers
    show_display('terminal');
}

function show_prompt(text, vexKeys) {
    if (notation_enabled && vexflow_available && vexKeys && vexKeys.length) {
        show_display('notation');
        render_notation(vexKeys);
    } else {
        show_display('terminal');
        cprint(text);
    }
}
