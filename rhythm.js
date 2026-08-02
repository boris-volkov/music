// Rhythm trainer: generates a few measures of rhythm, renders them as notation, then
// scans a playhead across the score while the player taps the rhythm on any key. Each
// tap is stamped onto the score at the moment it landed, so early/late is visible at a
// glance, and hitting enough of the notes tightly enough passes the round.
//
// All timing runs off audio_context.currentTime rather than Date.now()/setTimeout --
// the audio clock doesn't drift or get shoved around by a busy main thread, and it's
// the same clock the metronome clicks are scheduled against, so the visual playhead and
// what you hear stay locked together.

const RHYTHM_MEASURES = 4;
const BEATS_PER_MEASURE = 4;
const TOTAL_BEATS = RHYTHM_MEASURES * BEATS_PER_MEASURE;

const rhythm_settings = {
    tempo: 80,
    vocabulary: 'eighths',
    rests: true,
    metronome: true,
};

// Timing tolerances, in seconds. Absolute rather than beat-relative on purpose: playing
// "tightly" means the same wall-clock precision whether the tempo is 60 or 140.
const PERFECT_WINDOW = 0.05;
const GOOD_WINDOW = 0.12;
const MATCH_WINDOW = 0.28; // past this a tap isn't credited to that note at all
const PASS_RATIO = 0.75;

const DURATION_BEATS = { 'w': 4, 'h': 2, 'q': 1, '8': 0.5, '16': 0.25 };
const VOCABULARY = {
    quarters:   ['h', 'q'],
    eighths:    ['h', 'q', '8'],
    sixteenths: ['q', '8', '16'],
};

let current_rhythm = null;
let rhythm_staves = [];
let rhythm_hits = [];        // beat positions of the player's taps this run
let rhythm_run_start = null; // audio-clock time that beat 0 lands on
let rhythm_running = false;
let rhythm_raf = null;

const rhythm_panel = document.getElementById('rhythm_panel');
const rhythm_score = document.getElementById('rhythm_score');
const rhythm_overlay = document.getElementById('rhythm_overlay');
const rhythm_playhead = document.getElementById('rhythm_playhead');
const rhythm_feedback = document.getElementById('rhythm_feedback');
const rhythm_start_button = document.getElementById('rhythm_start');

function beat_duration() {
    return 60 / rhythm_settings.tempo;
}

// --- generation ---------------------------------------------------------------

function generate_measure() {
    const pool = VOCABULARY[rhythm_settings.vocabulary];
    const measure = [];
    let remaining = BEATS_PER_MEASURE;

    while (remaining > 1e-9) {
        const fits = pool.filter((d) => DURATION_BEATS[d] <= remaining + 1e-9);
        const duration = random_element(fits);
        // never open on a rest -- there'd be nothing to anchor the first beat against
        const rest = rhythm_settings.rests && measure.length > 0 && Math.random() < 0.18;
        measure.push({ duration, rest });
        remaining -= DURATION_BEATS[duration];
    }
    return measure;
}

function generate_rhythm() {
    const measures = [];
    for (let m = 0; m < RHYTHM_MEASURES; m++) measures.push(generate_measure());

    const onsets = [];
    let beat = 0;
    measures.forEach((measure) => {
        measure.forEach((note) => {
            note.startBeat = beat;
            if (!note.rest) onsets.push(beat);
            beat += DURATION_BEATS[note.duration];
        });
    });
    return { measures, onsets };
}

// --- rendering ----------------------------------------------------------------

function render_rhythm_score() {
    const VF = Vex.Flow;
    rhythm_score.innerHTML = '';

    const width = rhythm_score.clientWidth || 880;
    const renderer = new VF.Renderer(rhythm_score, VF.Renderer.Backends.SVG);
    renderer.resize(width, 150);
    const context = renderer.getContext();

    const margin = 10;
    const staveWidth = (width - margin * 2) / RHYTHM_MEASURES;
    rhythm_staves = [];

    current_rhythm.measures.forEach((measure, mi) => {
        const stave = new VF.Stave(margin + mi * staveWidth, 45, staveWidth);
        if (mi === 0) stave.addClef('percussion').addTimeSignature('4/4');
        stave.setContext(context).draw();
        rhythm_staves.push(stave);

        const staveNotes = measure.map((note) => new VF.StaveNote({
            keys: ['b/4'], // rhythm-only notation: every note sits on the middle line
            duration: note.rest ? note.duration + 'r' : note.duration,
            stem_direction: 1,
        }));

        const beams = VF.Beam.generateBeams(staveNotes);
        VF.Formatter.FormatAndDraw(context, stave, staveNotes);
        beams.forEach((beam) => beam.setContext(context).draw());
    });
}

// maps a position in beats to an x pixel coordinate, interpolating linearly across each
// measure's note area. used for both the playhead and where taps get stamped.
function beat_to_x(beat) {
    const clamped = Math.max(0, Math.min(beat, TOTAL_BEATS));
    const mi = Math.min(RHYTHM_MEASURES - 1, Math.floor(clamped / BEATS_PER_MEASURE));
    const stave = rhythm_staves[mi];
    const startX = stave.getNoteStartX();
    const endX = stave.getX() + stave.getWidth();
    const withinMeasure = (clamped - mi * BEATS_PER_MEASURE) / BEATS_PER_MEASURE;
    return startX + withinMeasure * (endX - startX);
}

function clear_stamps() {
    [...rhythm_overlay.querySelectorAll('.rhythm_stamp')].forEach((el) => el.remove());
}

function stamp_hit(beat, accuracy) {
    const stamp = document.createElement('div');
    stamp.className = `rhythm_stamp ${accuracy}`;
    stamp.style.left = `${beat_to_x(beat)}px`;
    rhythm_overlay.appendChild(stamp);
}

// how close this tap was to whichever note it's nearest -- drives the live stamp colour.
// the strict, one-tap-per-note scoring happens at the end of the run in score_run().
function accuracy_for(beat) {
    const seconds = (b) => Math.abs(b - beat) * beat_duration();
    const nearest = Math.min(...current_rhythm.onsets.map(seconds));
    if (nearest <= PERFECT_WINDOW) return 'perfect';
    if (nearest <= GOOD_WINDOW) return 'good';
    return 'off';
}

// --- run loop -----------------------------------------------------------------

function start_rhythm_run() {
    if (rhythm_running) return;
    const ctx = get_audio_context();
    const beatDur = beat_duration();
    const leadIn = 0.3; // brief pause so the very first click isn't clipped

    rhythm_hits = [];
    clear_stamps();
    rhythm_feedback.textContent = 'counting in…';
    rhythm_feedback.className = '';
    rhythm_start_button.disabled = true;

    // one full measure of count-in, always audible even with the metronome switched off
    for (let b = 0; b < BEATS_PER_MEASURE; b++) {
        play_click(ctx.currentTime + leadIn + b * beatDur, b === 0);
    }
    rhythm_run_start = ctx.currentTime + leadIn + BEATS_PER_MEASURE * beatDur;

    if (rhythm_settings.metronome) {
        for (let b = 0; b < TOTAL_BEATS; b++) {
            play_click(rhythm_run_start + b * beatDur, b % BEATS_PER_MEASURE === 0);
        }
    }

    rhythm_running = true;
    animate_playhead();
}

function animate_playhead() {
    if (!rhythm_running) return;
    const beat = (get_audio_context().currentTime - rhythm_run_start) / beat_duration();

    // keep listening a moment past the final beat so a slightly late last tap still counts
    if (beat >= TOTAL_BEATS + MATCH_WINDOW / beat_duration()) {
        score_run();
        return;
    }

    rhythm_playhead.style.display = 'block';
    rhythm_playhead.style.left = `${beat_to_x(beat)}px`;
    if (beat < 0) rhythm_feedback.textContent = 'counting in…';
    else if (rhythm_feedback.textContent === 'counting in…') rhythm_feedback.textContent = 'go!';

    rhythm_raf = requestAnimationFrame(animate_playhead);
}

function rhythm_callback(event) {
    const [type, key, velocity] = event.data;
    if (type !== KEYDOWN || velocity === 0) return; // taps only, ignore note-offs
    if (!rhythm_running) return;

    const beat = (get_audio_context().currentTime - rhythm_run_start) / beat_duration();
    if (beat < -0.5 || beat > TOTAL_BEATS + 1) return; // ignore stray taps outside the run

    rhythm_hits.push(beat);
    stamp_hit(beat, accuracy_for(beat));
}

function score_run() {
    rhythm_running = false;
    cancelAnimationFrame(rhythm_raf);
    rhythm_playhead.style.display = 'none';
    rhythm_start_button.disabled = false;

    const beatDur = beat_duration();
    const onsets = current_rhythm.onsets;
    const claimed = new Set();
    let good = 0;
    let perfect = 0;

    // greedily credit each written note to its nearest not-yet-used tap, so one tap can't
    // satisfy two notes and a burst of taps can't inflate the score
    onsets.forEach((onset) => {
        let bestIndex = -1;
        let bestDiff = Infinity;
        rhythm_hits.forEach((hit, i) => {
            if (claimed.has(i)) return;
            const diff = Math.abs(hit - onset) * beatDur;
            if (diff < bestDiff) { bestDiff = diff; bestIndex = i; }
        });
        if (bestIndex >= 0 && bestDiff <= MATCH_WINDOW) {
            claimed.add(bestIndex);
            if (bestDiff <= GOOD_WINDOW) good++;
            if (bestDiff <= PERFECT_WINDOW) perfect++;
        }
    });

    const extra = rhythm_hits.length - claimed.size;
    const allowedExtra = Math.max(1, Math.floor(onsets.length * 0.15));
    const ratio = onsets.length ? good / onsets.length : 0;
    const passed = ratio >= PASS_RATIO && extra <= allowedExtra;

    const pct = Math.round(ratio * 100);
    const extraNote = extra > 0 ? ` · ${extra} extra tap${extra === 1 ? '' : 's'}` : '';
    let message;
    if (passed) {
        message = `pass — ${good}/${onsets.length} in time (${perfect} dead on)${extraNote}`;
    } else if (ratio >= PASS_RATIO) {
        // the notes themselves were in time; it was the stray taps that sank it
        message = `${good}/${onsets.length} in time, but ${extra} extra tap${extra === 1 ? '' : 's'} — at most ${allowedExtra} allowed`;
    } else {
        message = `${pct}% — ${good}/${onsets.length} in time${extraNote}, need ${Math.round(PASS_RATIO * 100)}%`;
    }
    rhythm_feedback.textContent = message;
    rhythm_feedback.className = passed ? 'passed' : 'failed';

    // a pass earns a fresh rhythm; a miss leaves this one up so it can be retried
    if (passed) setTimeout(next_rhythm, 1600);
}

// --- wiring -------------------------------------------------------------------

function next_rhythm() {
    current_rhythm = generate_rhythm();
    render_rhythm_score();
    clear_stamps();
    rhythm_playhead.style.display = 'none';
    rhythm_feedback.textContent = 'press start, then play the rhythm on any key';
    rhythm_feedback.className = '';
}

function stop_rhythm() { // handed to init_quiz so switching modes kills the run
    rhythm_running = false;
    cancelAnimationFrame(rhythm_raf);
    rhythm_start_button.disabled = false;
}

function init_rhythm() {
    canvas.style.display = 'none';
    init_quiz(next_rhythm, rhythm_callback, stop_rhythm);
    show_display('rhythm');
    render_rhythm_score(); // re-render now the panel is visible and has a real width
}

rhythm_start_button.addEventListener('pointerdown', start_rhythm_run);

document.getElementById('rhythm_tempo').addEventListener('input', (e) => {
    rhythm_settings.tempo = parseInt(e.target.value, 10);
    document.getElementById('rhythm_tempo_value').textContent = `${rhythm_settings.tempo} bpm`;
});

document.getElementById('rhythm_vocabulary').addEventListener('change', (e) => {
    rhythm_settings.vocabulary = e.target.value;
    next_rhythm();
});

document.getElementById('rhythm_rests').addEventListener('change', (e) => {
    rhythm_settings.rests = e.target.checked;
    next_rhythm();
});

document.getElementById('rhythm_metronome').addEventListener('change', (e) => {
    rhythm_settings.metronome = e.target.checked;
});

add_game_button('Rhythm', init_rhythm, 'menu_rhythm', 'teal');
