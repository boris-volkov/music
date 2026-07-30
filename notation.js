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

function reset_display() { // called on every quiz-mode switch so a stale panel never lingers
    notation_panel.style.display = 'none';
    terminal.style.display = 'flex';
}

function show_prompt(text, vexKeys) {
    if (notation_enabled && vexflow_available && vexKeys && vexKeys.length) {
        terminal.style.display = 'none';
        notation_panel.style.display = 'flex';
        render_notation(vexKeys);
    } else {
        reset_display();
        cprint(text);
    }
}
