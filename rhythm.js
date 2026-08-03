// Rhythm trainer: generates a few measures of rhythm, renders them as notation, then
// scans a playhead across the score while the player taps the rhythm on any key. Each
// tap is stamped onto the score at the moment it landed, so early/late is visible at a
// glance, and hitting enough of the notes tightly enough passes the round.
//
// All timing runs off audio_context.currentTime rather than Date.now()/setTimeout --
// the audio clock doesn't drift or get shoved around by a busy main thread, and it's
// the same clock the metronome clicks are scheduled against, so the visual playhead and
// what you hear stay locked together.

const BEATS_PER_MEASURE = 4;
const MEASURES_PER_LINE = 4;

// score geometry, in px
const SCORE_MARGIN = 10;
const LINE_HEIGHT = 118;      // vertical distance from one system to the next
const FIRST_LINE_TOP = 20;
const STRIP_BASE_OFFSET = 14; // gap between the strip's underside and the staff's top line
const STRIP_HEIGHT = 16;

const rhythm_settings = {
    tempo: 80,
    measures: 4,
    source: 'generated', // 'generated' | 'bach'
    vocabulary: 'eighths',
    rests: true,
    metronome: true,
};

function total_beats() {
    return rhythm_settings.measures * BEATS_PER_MEASURE;
}

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
let rhythm_domains = []; // per measure: the {start, end} x-range one measure of time spans
let rhythm_hits = [];        // beat positions of the player's taps this run
let rhythm_run_start = null; // audio-clock time that beat 0 lands on
let rhythm_running = false;
let rhythm_raf = null;
let rhythm_end_timer = null; // backstop so a run always ends, even if rAF is suspended

const rhythm_panel = document.getElementById('rhythm_panel');
const rhythm_score = document.getElementById('rhythm_score');
const rhythm_overlay = document.getElementById('rhythm_overlay');
const rhythm_playhead = document.getElementById('rhythm_playhead');
const rhythm_feedback = document.getElementById('rhythm_feedback');
const rhythm_source_label = document.getElementById('rhythm_source_label');
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

// walks the measures assigning each note its absolute beat, and collects the onsets the
// player is expected to tap. also settles how finely the timing strip has to be divided:
// the grid needs a line at every possible onset, which is the shortest value in use.
function finish_rhythm(measures, attribution = null) {
    const onsets = [];
    let beat = 0;
    measures.forEach((measure) => {
        measure.forEach((note) => {
            note.startBeat = beat;
            if (!note.rest) onsets.push(beat);
            beat += DURATION_BEATS[note.duration];
        });
    });

    const shortest = Math.min(...measures.flat().map((n) => DURATION_BEATS[n.duration]));
    const perBeat = Math.max(1, Math.round(1 / Math.min(shortest, 1)));

    return { measures, onsets, perBeat, attribution };
}

function generate_rhythm() {
    const measures = [];
    for (let m = 0; m < rhythm_settings.measures; m++) measures.push(generate_measure());
    return finish_rhythm(measures);
}

// --- borrowed rhythms ---------------------------------------------------------

function parse_pattern(pattern) {
    return pattern.split(' ').map((token) => ({
        duration: token.endsWith('r') ? token.slice(0, -1) : token,
        rest: token.endsWith('r'),
    }));
}

// takes a contiguous window out of one real passage, rather than stitching together
// bars from unrelated pieces -- the point is to practise rhythms that actually occur
function bach_rhythm() {
    const wanted = rhythm_settings.measures;
    const candidates = BACH_EXCERPTS.filter((e) => e.m.length >= wanted);
    if (candidates.length === 0) return null;

    const excerpt = random_element(candidates);
    const offset = Math.floor(Math.random() * (excerpt.m.length - wanted + 1));
    const measures = excerpt.m
        .slice(offset, offset + wanted)
        .map((i) => parse_pattern(BACH_PATTERNS[i]));

    const first = offset + 1;
    const bars = wanted === 1 ? `m. ${first}` : `mm. ${first}–${first + wanted - 1}`;
    return finish_rhythm(measures, `${excerpt.s}, ${bars} (soprano)`);
}

// --- rendering ----------------------------------------------------------------

// A stave reserves space at its left for the barline, and more if it carries a clef or
// time signature, so its note area starts inset from its own x. Measuring that inset up
// front lets each stave be widened by exactly its own overhead, which makes every
// measure's note area come out the same width and butt directly against the next one.
function stave_overhead(withClef, withTimeSignature) {
    const probe = new Vex.Flow.Stave(0, 0, 200);
    if (withClef) probe.addClef('percussion');
    if (withTimeSignature) probe.addTimeSignature('4/4');
    return probe.getNoteStartX() - probe.getX();
}

function render_rhythm_score() {
    const VF = Vex.Flow;
    rhythm_score.innerHTML = '';

    const measureCount = current_rhythm.measures.length;
    const lineCount = Math.ceil(measureCount / MEASURES_PER_LINE);

    const width = rhythm_score.clientWidth || 880;
    const renderer = new VF.Renderer(rhythm_score, VF.Renderer.Backends.SVG);
    renderer.resize(width, FIRST_LINE_TOP + lineCount * LINE_HEIGHT);
    const context = renderer.getContext();

    const usable = width - SCORE_MARGIN * 2;
    rhythm_staves = [];
    rhythm_domains = [];

    for (let line = 0; line < lineCount; line++) {
        const firstIndex = line * MEASURES_PER_LINE;
        const count = Math.min(MEASURES_PER_LINE, measureCount - firstIndex);
        const leadOverhead = stave_overhead(true, line === 0);
        const plainOverhead = stave_overhead(false, false);

        // every measure gets an identical note-area width, so the playhead keeps one
        // constant speed across the whole line and no gap opens up at the barlines
        const noteAreaWidth = (usable - leadOverhead) / count;

        let x = SCORE_MARGIN;
        for (let column = 0; column < count; column++) {
            const mi = firstIndex + column;
            let staveWidth;
            if (count === 1) staveWidth = usable;
            else if (column === 0) staveWidth = noteAreaWidth + leadOverhead - plainOverhead;
            else if (column === count - 1) staveWidth = noteAreaWidth + plainOverhead;
            else staveWidth = noteAreaWidth;

            const stave = new VF.Stave(x, FIRST_LINE_TOP + line * LINE_HEIGHT, staveWidth);
            if (column === 0) stave.addClef('percussion'); // clef repeats on each new line
            if (mi === 0) stave.addTimeSignature('4/4');
            stave.setContext(context).draw();
            rhythm_staves.push(stave);

            const start = stave.getNoteStartX();
            rhythm_domains.push({ start, end: start + noteAreaWidth });

            const staveNotes = current_rhythm.measures[mi].map((note) => new VF.StaveNote({
                keys: ['b/4'], // rhythm-only notation: every note sits on the middle line
                duration: note.rest ? note.duration + 'r' : note.duration,
                stem_direction: 1,
            }));

            const beams = VF.Beam.generateBeams(staveNotes);
            VF.Formatter.FormatAndDraw(context, stave, staveNotes);
            beams.forEach((beam) => beam.setContext(context).draw());

            x += staveWidth;
        }
    }

    draw_timing_strips();
}

// The strip above each staff is where timing is actually read. Engraved notation spaces
// notes by convention rather than by elapsed time, so the playhead can't both move at a
// constant speed and sit on the note stems. The strip resolves that: it divides the
// measure into even fractions of time, so the playhead sweeps smoothly across it and a
// tap's mark can be compared against the grid line it was aiming for.

function svg_element(tag, attributes) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attributes).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
}

// One unbroken rectangle per line, since the measures' note areas now butt together --
// the playhead crosses a barline without a gap to jump.
function draw_timing_strips() {
    const svg = rhythm_score.querySelector('svg');
    const perBeat = current_rhythm.perBeat; // fine enough to put a line under every onset
    const steps = BEATS_PER_MEASURE * perBeat;
    const lineCount = Math.ceil(rhythm_staves.length / MEASURES_PER_LINE);

    for (let line = 0; line < lineCount; line++) {
        const firstIndex = line * MEASURES_PER_LINE;
        const lastIndex = Math.min(firstIndex + MEASURES_PER_LINE, rhythm_staves.length) - 1;
        const bottomY = rhythm_staves[firstIndex].getYForLine(0) - STRIP_BASE_OFFSET;
        const topY = bottomY - STRIP_HEIGHT;
        const left = rhythm_domains[firstIndex].start;
        const right = rhythm_domains[lastIndex].end;

        const group = svg_element('g', { class: 'rhythm_grid' });
        group.appendChild(svg_element('rect', {
            x: left, y: topY, width: right - left, height: STRIP_HEIGHT,
            fill: 'none', stroke: '#d4c5aa', 'stroke-width': 1,
        }));

        for (let mi = firstIndex; mi <= lastIndex; mi++) {
            const { start, end } = rhythm_domains[mi];
            // skip step 0 of the opening measure -- it is the rectangle's own left edge
            for (let s = (mi === firstIndex ? 1 : 0); s < steps; s++) {
                const onBeat = s % perBeat === 0; // barlines land here too, same weight
                group.appendChild(svg_element('line', {
                    x1: start + (s / steps) * (end - start), y1: topY,
                    x2: start + (s / steps) * (end - start), y2: bottomY,
                    stroke: onBeat ? '#7a6f5d' : '#d4c5aa',
                    'stroke-width': onBeat ? 1.5 : 1,
                }));
            }
        }
        svg.appendChild(group);
    }
}

// maps a position in beats to a point on the score. x is linear in time so the playhead
// sweeps at a constant speed -- it tracks the timing strip above the staff, not the
// engraved note spacing. y matters once the score wraps: the playhead has to drop to the
// next system rather than run off the right edge.
function beat_to_position(beat) {
    const clamped = Math.max(0, Math.min(beat, total_beats()));
    const mi = Math.min(rhythm_staves.length - 1, Math.floor(clamped / BEATS_PER_MEASURE));
    const stave = rhythm_staves[mi];
    const { start, end } = rhythm_domains[mi];
    const withinMeasure = (clamped - mi * BEATS_PER_MEASURE) / BEATS_PER_MEASURE;
    const top = stave.getYForLine(0);
    return {
        x: start + withinMeasure * (end - start),
        top,
        bottom: stave.getYForLine(4),
        stripTop: top - STRIP_BASE_OFFSET - STRIP_HEIGHT,
    };
}

function clear_stamps() {
    [...rhythm_overlay.querySelectorAll('.rhythm_stamp')].forEach((el) => el.remove());
}

function stamp_hit(beat, accuracy) {
    const { x, stripTop } = beat_to_position(beat);
    const stamp = document.createElement('div');
    stamp.className = `rhythm_stamp ${accuracy}`;
    stamp.style.left = `${x}px`;
    // exactly fills its own system's strip, so it reads as a bar within the grid
    stamp.style.top = `${stripTop}px`;
    stamp.style.height = `${STRIP_HEIGHT}px`;
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
        for (let b = 0; b < total_beats(); b++) {
            play_click(rhythm_run_start + b * beatDur, b % BEATS_PER_MEASURE === 0);
        }
    }

    rhythm_running = true;

    // the browser suspends requestAnimationFrame in a background tab, so if the player
    // switches away mid-run the playhead loop -- and with it score_run() -- would never
    // fire again, leaving the round stuck open forever. this timer ends the run
    // regardless. background setTimeout gets clamped to ~1s, which is late but still
    // unsticks it; whichever path fires first wins, since score_run clears the other.
    const runSeconds = (rhythm_run_start - ctx.currentTime) + total_beats() * beatDur + MATCH_WINDOW;
    rhythm_end_timer = setTimeout(() => {
        if (rhythm_running) score_run();
    }, (runSeconds + 0.15) * 1000);

    animate_playhead();
}

function animate_playhead() {
    if (!rhythm_running) return;
    const beat = (get_audio_context().currentTime - rhythm_run_start) / beat_duration();

    // keep listening a moment past the final beat so a slightly late last tap still counts
    if (beat >= total_beats() + MATCH_WINDOW / beat_duration()) {
        score_run();
        return;
    }

    // spans the timing strip and the staff together, tying the two representations
    const { x, bottom, stripTop } = beat_to_position(beat);
    rhythm_playhead.style.display = 'block';
    rhythm_playhead.style.left = `${x}px`;
    rhythm_playhead.style.top = `${stripTop}px`;
    rhythm_playhead.style.height = `${bottom + 10 - stripTop}px`;
    if (beat < 0) rhythm_feedback.textContent = 'counting in…';
    else if (rhythm_feedback.textContent === 'counting in…') rhythm_feedback.textContent = 'go!';

    rhythm_raf = requestAnimationFrame(animate_playhead);
}

function rhythm_callback(event) {
    const [type, key, velocity] = event.data;
    if (type !== KEYDOWN || velocity === 0) return; // taps only, ignore note-offs
    if (!rhythm_running) return;

    const beat = (get_audio_context().currentTime - rhythm_run_start) / beat_duration();
    if (beat < -0.5 || beat > total_beats() + 1) return; // ignore stray taps outside the run

    rhythm_hits.push(beat);
    stamp_hit(beat, accuracy_for(beat));
}

function score_run() {
    rhythm_running = false;
    cancelAnimationFrame(rhythm_raf);
    clearTimeout(rhythm_end_timer);
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
    let rhythm = rhythm_settings.source === 'bach' ? bach_rhythm() : null;
    let note = '';
    if (rhythm_settings.source === 'bach' && !rhythm) {
        // no real passage runs that long -- say so rather than silently generating one
        note = ` (no chorale passage that long — generated instead)`;
    }
    current_rhythm = rhythm || generate_rhythm();

    render_rhythm_score();
    clear_stamps();
    rhythm_playhead.style.display = 'none';
    rhythm_source_label.textContent = current_rhythm.attribution || '';
    rhythm_feedback.textContent = 'press start, then play the rhythm on any key' + note;
    rhythm_feedback.className = '';
}

function stop_rhythm() { // handed to init_quiz so switching modes kills the run
    rhythm_running = false;
    cancelAnimationFrame(rhythm_raf);
    clearTimeout(rhythm_end_timer);
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

document.getElementById('rhythm_measures').addEventListener('change', (e) => {
    rhythm_settings.measures = parseInt(e.target.value, 10);
    next_rhythm();
});

document.getElementById('rhythm_source').addEventListener('change', (e) => {
    rhythm_settings.source = e.target.value;
    sync_generator_controls();
    next_rhythm();
});

document.getElementById('rhythm_vocabulary').addEventListener('change', (e) => {
    rhythm_settings.vocabulary = e.target.value;
    next_rhythm();
});

document.getElementById('rhythm_rests').addEventListener('change', (e) => {
    rhythm_settings.rests = e.target.checked;
    next_rhythm();
});

// note vocabulary and rests only shape generated rhythms; a real passage has whatever
// it has, so grey them out rather than letting them look effective
function sync_generator_controls() {
    const generated = rhythm_settings.source === 'generated';
    ['rhythm_vocabulary', 'rhythm_rests'].forEach((id) => {
        const input = document.getElementById(id);
        input.disabled = !generated;
        input.closest('label').classList.toggle('disabled', !generated);
    });
}
sync_generator_controls();

document.getElementById('rhythm_metronome').addEventListener('change', (e) => {
    rhythm_settings.metronome = e.target.checked;
});

add_game_button('Rhythm', init_rhythm, 'menu_rhythm', 'teal');
