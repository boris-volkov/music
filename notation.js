// Toggles the display panel between plain text and rendered musical notation (VexFlow).
// Only note_quiz.js calls show_prompt() with notation keys today — other quiz modes still
// call cprint()/print() directly and are unaffected by the toggle until they're upgraded too.

let notation_enabled = false;

const notation_toggle = document.getElementById('notation_toggle');
const notation_panel = document.getElementById('notation');       // the whole display surface
const notation_score = document.getElementById('notation_score'); // just the VexFlow target --
// kept as its own child of notation_panel so a redraw only ever clears the staff itself
const vexflow_available = typeof Vex !== 'undefined' && !!Vex.Flow;

if (!vexflow_available) {
    console.error('VexFlow failed to load — notation toggle disabled.');
    notation_toggle.disabled = true;
    notation_toggle.title = 'Musical notation unavailable (VexFlow failed to load)';
}

notation_toggle.addEventListener('pointerdown', () => {
    notation_enabled = !notation_enabled;
    notation_toggle.classList.toggle('active', notation_enabled);
    // if we're mid-way through the Notes quiz, refresh the current prompt immediately --
    // show_note_prompt() (note_quiz.js) redraws the same note in whatever clef it was
    // already showing, rather than picking a new one just because the toggle moved
    if (current_quiz_callback === note_callback && note) show_note_prompt();
});

function note_to_vexkey(note, octave = 4) {
    const letter = note.name[0].toLowerCase();
    const accidental = note.name.includes('♯') ? '#' : note.name.includes('♭') ? 'b' : '';
    return `${letter}${accidental}/${octave}`;
}

// Complete beginners are reading this cold, so the staff prints large -- roughly 2.5x the
// size a normal engraving would use -- rather than the compact size that's fine once
// reading is automatic. VexFlow doesn't expose "bigger" as a single option; the reliable
// way to scale everything (staff lines, clef, notehead, stroke widths) together is
// context.scale(), applied to a renderer sized to match, so nothing gets clipped.
const BIG_STAFF_SCALE = 2.5;
const STAVE_WIDTH = 220;   // unscaled -- room for a clef and one note
const LEGEND_GAP = 34;     // unscaled -- clearance between the stave's right edge and the legend
const STAVE_MARGIN = 10;   // unscaled -- clearance on every other side

// the letter each staff line names, top line (index 0) to bottom line (index 4) -- matches
// Vex.Flow.Stave's own getYForLine() numbering, which is what draw_stave_legend() uses to
// place them. Only the lines are labelled (EGBDF / GBDFA), not the spaces, since that's the
// classic mnemonic ("Every Good Boy Does Fine" / "Good Boys Do Fine Always") a beginner is
// most likely to already be halfway to knowing.
const STAVE_LINE_LETTERS = {
    treble: ['F', 'D', 'B', 'G', 'E'],
    bass: ['A', 'F', 'D', 'B', 'G'],
};

function draw_stave_legend(context, stave, clef) {
    const letters = STAVE_LINE_LETTERS[clef];
    if (!letters) return;
    const x = stave.getX() + stave.getWidth() + 10;
    context.save();
    context.setFont('Arial', 14, 'bold');
    letters.forEach((letter, i) => {
        context.fillText(letter, x, stave.getYForLine(i) + 5); // +5: nudge onto the line itself
    });
    context.restore();
}

// options: { clef = 'treble', big = false, showLegend = false }. A fresh Renderer is built
// every call rather than reusing one -- context.scale() isn't safe to call twice on the
// same context (VexFlow accumulates the transform rather than replacing it), and a plain
// single note redrawn on user action is far too infrequent for that to cost anything.
function render_notation(vexKeys, options = {}) {
    const { clef = 'treble', big = false, showLegend = false } = options;
    const VF = Vex.Flow;

    const scale = big ? BIG_STAFF_SCALE : 1;
    const legendGap = showLegend ? LEGEND_GAP : 0;
    const width = STAVE_MARGIN + STAVE_WIDTH + legendGap + STAVE_MARGIN;
    const height = 140;

    notation_score.innerHTML = '';
    const renderer = new VF.Renderer(notation_score, VF.Renderer.Backends.SVG);
    renderer.resize(width * scale, height * scale);
    const context = renderer.getContext();
    context.scale(scale, scale);

    const stave = new VF.Stave(STAVE_MARGIN, STAVE_MARGIN, STAVE_WIDTH);
    stave.addClef(clef);
    stave.setContext(context).draw();

    // clef matters here, not just for addClef() above -- the same "keys" entry sits on a
    // different line depending which staff it's read against, so leaving this out (as the
    // treble-only version of this function used to) would draw every bass note as though
    // it were still on a treble staff
    const staveNote = new VF.StaveNote({ keys: vexKeys, duration: 'q', clef });
    vexKeys.forEach((key, i) => {
        // accidental is whatever sits between the note letter and the "/octave" --
        // can't just check key.includes('b'), since "b" is also a real note letter (natural B)
        const accidental = key.slice(1, key.indexOf('/'));
        if (accidental === '#') staveNote.addModifier(new VF.Accidental('#'), i);
        else if (accidental === 'b') staveNote.addModifier(new VF.Accidental('b'), i);
    });

    VF.Formatter.FormatAndDraw(context, stave, [staveNote]);
    if (showLegend) draw_stave_legend(context, stave, clef);
}

// Exactly one display surface is visible at a time -- whichever the active mode draws
// into. Option panels open above this rather than replacing it, so nothing here needs
// to be hidden while settings are being changed.
const display_surfaces = {
    terminal: terminal,
    notation: notation_panel,
    rhythm: document.getElementById('rhythm_panel'),
};

function show_display(which) {
    Object.entries(display_surfaces).forEach(([name, el]) => {
        if (el) el.style.display = name === which ? 'flex' : 'none';
    });
}

function reset_display() { // called on every quiz-mode switch so a stale panel never lingers
    show_display('terminal');
}

function show_prompt(text, vexKeys, options) {
    if (notation_enabled && vexflow_available && vexKeys && vexKeys.length) {
        show_display('notation');
        render_notation(vexKeys, options);
    } else {
        show_display('terminal');
        cprint(text);
    }
}
