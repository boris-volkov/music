
const fullscreenBtn = document.getElementById('full_screen');

fullscreenBtn.addEventListener('pointerdown', toggleFullscreen);

function toggleFullscreen() {
  if (document.fullscreenElement) {
    // Exit fullscreen
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.mozCancelFullScreen) { // Firefox
      document.mozCancelFullScreen();
    } else if (document.webkitExitFullscreen) { // Chrome, Safari, Opera
      document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) { // Internet Explorer
      document.msExitFullscreen();
    }
  } else {
    // Enter fullscreen
    const element = document.documentElement;
    if (element.requestFullscreen) {
      element.requestFullscreen();
    } else if (element.mozRequestFullScreen) { // Firefox
      element.mozRequestFullScreen();
    } else if (element.webkitRequestFullscreen) { // Chrome, Safari, Opera
      element.webkitRequestFullscreen();
    } else if (element.msRequestFullscreen) { // Internet Explorer
      element.msRequestFullscreen();
    }
  }
}


// Options live in panels opened from the menu bar, one at a time. They sit above the
// practice area rather than replacing it, so the keyboard and prompt stay visible while
// settings are being changed.

// [data-panel] excludes the fullscreen button -- it isn't a panel toggle, just another
// pill in the same bar -- so its dataset.panel lookup doesn't fail every tab's open/close
// logic below (no matching panel element for it, which used to throw partway through the
// forEach and leave every other tab's handler dead).
const menu_tabs = [...document.querySelectorAll('.menu_tab[data-panel]')];

function open_options_panel(id) {
    menu_tabs.forEach((tab) => {
        const isTarget = tab.dataset.panel === id;
        tab.classList.toggle('active', isTarget);
        document.getElementById(tab.dataset.panel).style.display = isTarget ? 'flex' : 'none';
    });
}

function optionsOff() {
    open_options_panel(null); // no panel matches, so they all close
}

// Kept for theory.js, which pops the note pickers open when a game has nothing selected
function optionsOn() {
    open_options_panel('panel_practice');
}

menu_tabs.forEach((tab) => {
    tab.addEventListener('pointerdown', () => {
        if (tab.disabled) return; // the note-types tab is disabled mid-transition -- see init_quiz()
        const alreadyOpen = tab.classList.contains('active');
        open_options_panel(alreadyOpen ? null : tab.dataset.panel);
    });
});

// the label the Practice tab takes on when a topic gives it something to show -- keyed by
// whichever of its sections (besides the always-present 'notes') actually matched. Two
// topics can share a label (Scale degrees and Modes both land on "Scales") without
// sharing anything else about how they're set up.
const SECTION_LABELS = {
    note_reading: 'Notes & clef',
    intervals: 'Intervals',
    chords: 'Chords',
    scales: 'Scales',
    partimento: 'Patterns',
};

// Each activity only cares about some of the note pickers -- a chord quiz has no use for
// the interval list. Showing only what applies keeps the panel from becoming a wall. A
// topic with nothing to pick (Rhythm, Melody -- pure timing, no note pool of their own)
// hides the tab entirely rather than showing it empty or disabled.
function set_relevant_options(sections) {
    let anyShown = false;
    let label = '';
    document.querySelectorAll('#panel_practice .choice_holder').forEach((holder) => {
        const section = holder.dataset.section;
        const relevant = sections.includes(section);
        holder.style.display = relevant ? 'flex' : 'none';
        if (relevant) {
            anyShown = true;
            if (SECTION_LABELS[section]) label = SECTION_LABELS[section];
        }
    });

    const practiceTab = menu_tabs.find((t) => t.dataset.panel === 'panel_practice');
    practiceTab.style.display = anyShown ? '' : 'none';
    if (anyShown) practiceTab.textContent = label;
    if (!anyShown && practiceTab.classList.contains('active')) optionsOff();
}

// --- contextual bar: which controls a topic uses, and its live scope readout ------------
//
// Every topic calls set_topic_ui(id, sections) once, from its own init_*() function, in
// place of the set_relevant_options() call it used to make directly (this calls that for
// it). Bar tabs every topic wants regardless -- Audio, Hotkeys, Fullscreen, grouped
// together on the right (#bar_global in index.html) -- are left alone in the HTML rather
// than driven from here; only the ones that vary by topic (Notation, the Practice tab via
// set_relevant_options above, Note types) are switched.
//
// Note types is on for four topics here, not the two ("Rhythm · Melody") the original
// design handoff called for -- Partimento and Modes also generate their rhythm through
// the same engine and so are just as able to use it, a capability added after that
// handoff was written. Leaving it reachable there isn't a deviation from the point of the
// redesign (showing only what a topic can actually use); it would be one to hide a
// control that still does something.
const TOPIC_UI = {
    notes:        { showNotation: true,  showNoteTypes: false, scope: () => CLEF_SCOPE[clef_setting] || '' },
    interval_ear: { showNotation: false, showNoteTypes: false, scope: () => summarize_active(intervals, 'INTERVALS') },
    chords:       { showNotation: false, showNoteTypes: false, scope: () => summarize_active(chords, 'CHORDS') },
    chord_ear:    { showNotation: false, showNoteTypes: false, scope: () => summarize_active(chords, 'CHORDS') },
    intervals:    { showNotation: false, showNoteTypes: false, scope: () => summarize_active(intervals, 'INTERVALS') },
    degrees:      { showNotation: false, showNoteTypes: false, scope: () => summarize_active(scales, 'SCALES') },
    modes:        { showNotation: false, showNoteTypes: true,  scope: () => summarize_active(scales, 'MODES') },
    rhythm:       { showNotation: false, showNoteTypes: true,  scope: () => `${rhythm_settings.measures} BARS · ${rhythm_settings.tempo} BPM` },
    melody:       { showNotation: false, showNoteTypes: true,  scope: () => folk_mode() ? 'FOLK SONGS' : bach_mode() ? 'BACH CHORALES' : summarize_active(scales, 'SCALES') },
    partimento:   { showNotation: false, showNoteTypes: true,  scope: () => summarize_active(partimento_types, 'PATTERNS') },
    // no Note types: a species *is* its rhythm, so there is nothing here for that panel to
    // choose without contradicting the exercise
    counterpoint: { showNotation: false, showNoteTypes: false, scope: () => `SPECIES ${counterpoint_settings.species} · FUX` },
};

const CLEF_SCOPE = { treble: 'TREBLE', bass: 'BASS', both: 'TREBLE + BASS' };

// a Structure_Collection's own summary: the one active choice by name if there's only
// one, otherwise a count -- "MAJOR" reads better than "1 SCALES ON", but a count is the
// only useful thing to say once several are on at once
function summarize_active(collection, unitLabel) {
    const active = collection.list.filter((s) => s.active);
    if (active.length === 0) return 'NONE SELECTED';
    if (active.length === 1) return active[0].name.toUpperCase();
    return `${active.length} ${unitLabel} ON`;
}

let current_scope_fn = () => '';

function update_scope_readout() {
    document.getElementById('scope_readout').textContent = current_scope_fn();
}

function set_topic_ui(id, sections) {
    set_relevant_options(sections);

    const conf = TOPIC_UI[id] || {};
    const notationTab = document.getElementById('notation_toggle');
    notationTab.style.display = conf.showNotation ? '' : 'none';

    const noteTypesTab = document.getElementById('rhythm_note_types_tab');
    noteTypesTab.style.display = conf.showNoteTypes ? '' : 'none';
    if (!conf.showNoteTypes && noteTypesTab.classList.contains('active')) optionsOff();

    current_scope_fn = conf.scope || (() => '');
    update_scope_readout();
}

// Refreshes the readout after anything in the practice panel changes -- every note/chord/
// scale/interval/pattern toggle and the clef picker all live here, and all of them are
// plain buttons built elsewhere (theory.js's Structure_Collection, note_quiz.js's clef
// row), so one delegated listener covers every one of them rather than teaching each its
// own callback. Fires on the bubble, after the button's own pointerdown handler has
// already updated whatever it owns, so the readout is never one click behind.
document.getElementById('panel_practice').addEventListener('pointerdown', (e) => {
    if (e.target.tagName === 'BUTTON') update_scope_readout();
});
