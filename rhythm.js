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
const PLAYHEAD_OVERHANG = 3;  // how far the playhead pokes out of the strip, top and bottom

const rhythm_settings = {
    tempo: 80,
    measures: 4,
    source: 'generated', // 'generated' | 'bach'
    melody: false,       // also require the written pitch, not just the timing
    vocabulary: 'eighths',
    rests: true,
    metronome: true,
};

// melodies only exist in the borrowed corpus, so melody mode implies a real passage
function melodic() {
    return rhythm_settings.melody && rhythm_settings.source === 'bach';
}

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
function finish_rhythm(measures, attribution = null, key = null) {
    const onsets = [];
    const onsetPitches = []; // parallel to onsets; null when the passage has no pitches
    let beat = 0;
    measures.forEach((measure) => {
        measure.forEach((note) => {
            note.startBeat = beat;
            if (!note.rest) {
                onsets.push(beat);
                onsetPitches.push(note.pitch ? pitch_to_midi(note.pitch) : null);
            }
            beat += DURATION_BEATS[note.duration];
        });
    });

    const shortest = Math.min(...measures.flat().map((n) => DURATION_BEATS[n.duration]));
    const perBeat = Math.max(1, Math.round(1 / Math.min(shortest, 1)));

    return { measures, onsets, onsetPitches, perBeat, attribution, key };
}

function generate_rhythm() {
    const measures = [];
    for (let m = 0; m < rhythm_settings.measures; m++) measures.push(generate_measure());
    return finish_rhythm(measures);
}

// --- borrowed passages --------------------------------------------------------

const PITCH_CLASS = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

// corpus notes are 'duration:pitch' ('q:f#4') or a bare rest ('8r')
function parse_note(token) {
    if (token.endsWith('r')) {
        return { duration: token.slice(0, -1), rest: true };
    }
    const [duration, pitch] = token.split(':');
    return { duration, rest: false, pitch };
}

// 'f#4' -> 'f#/4', the key format VexFlow wants
function pitch_to_vexkey(pitch) {
    return `${pitch.slice(0, -1)}/${pitch.slice(-1)}`;
}

function pitch_to_midi(pitch) {
    const octave = parseInt(pitch.slice(-1), 10);
    const body = pitch.slice(0, -1);
    let semitones = PITCH_CLASS[body[0]];
    for (const ch of body.slice(1)) semitones += ch === '#' ? 1 : -1;
    return (octave + 1) * 12 + semitones;
}

// takes a contiguous window out of one real passage, rather than stitching together
// bars from unrelated pieces -- the point is to practise music that actually occurs
function bach_excerpt() {
    const wanted = rhythm_settings.measures;
    const candidates = BACH_EXCERPTS.filter((e) => e.m.length >= wanted);
    if (candidates.length === 0) return null;

    const excerpt = random_element(candidates);
    const offset = Math.floor(Math.random() * (excerpt.m.length - wanted + 1));
    const measures = excerpt.m
        .slice(offset, offset + wanted)
        .map((mi) => BACH_MEASURES[mi].map((ni) => parse_note(BACH_NOTES[ni])));

    const [catalogue, title, key] = BACH_PIECES[excerpt.p];
    const first = offset + 1;
    const bars = wanted === 1 ? `m. ${first}` : `mm. ${first}–${first + wanted - 1}`;
    // a handful of the source files carry no BWV number; their filename stem is no use
    // to a reader, so just leave the catalogue segment out for those
    const parts = ['J.S. Bach'];
    if (/^BWV/.test(catalogue)) parts.push(catalogue);
    parts.push(`${bars}, soprano`);
    return finish_rhythm(measures, { title, detail: parts.join(' · ') }, key);
}

// --- rendering ----------------------------------------------------------------

// A stave reserves space at its left for the barline, and more if it carries a clef or
// time signature, so its note area starts inset from its own x. Measuring that inset up
// front lets each stave be widened by exactly its own overhead, which makes every
// measure's note area come out the same width and butt directly against the next one.
function stave_overhead(withClef, withTimeSignature, keySignature) {
    const probe = new Vex.Flow.Stave(0, 0, 200);
    if (withClef) probe.addClef(melodic() ? 'treble' : 'percussion');
    if (keySignature) probe.addKeySignature(keySignature);
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
        const keySignature = melodic() ? current_rhythm.key : null;
        const leadOverhead = stave_overhead(true, line === 0, keySignature);
        const plainOverhead = stave_overhead(false, false, null);

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
            if (column === 0) { // clef and key signature repeat on each new line
                stave.addClef(melodic() ? 'treble' : 'percussion');
                if (keySignature) stave.addKeySignature(keySignature);
            }
            if (mi === 0) stave.addTimeSignature('4/4');
            stave.setContext(context).draw();
            rhythm_staves.push(stave);

            const start = stave.getNoteStartX();
            rhythm_domains.push({ start, end: start + noteAreaWidth });

            const staveNotes = current_rhythm.measures[mi].map((note) => {
                const options = {
                    // rhythm-only notation parks every note on the middle line; melody
                    // mode puts it at its written pitch
                    keys: [melodic() && note.pitch ? pitch_to_vexkey(note.pitch) : 'b/4'],
                    duration: note.rest ? note.duration + 'r' : note.duration,
                };
                if (!melodic()) options.stem_direction = 1; // uniform stems read as a rhythm
                return new VF.StaveNote(options);
            });

            if (melodic()) {
                // lets VexFlow work out which accidentals actually need printing given
                // the key signature and what has already appeared in the bar
                const voice = new VF.Voice({ num_beats: BEATS_PER_MEASURE, beat_value: 4 });
                voice.addTickables(staveNotes);
                VF.Accidental.applyAccidentals([voice], keySignature);
            }

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

        // shade alternate beats so the beat you're on is readable at a glance without
        // having to count divisions. resets every measure, so beat 1 is always pale.
        for (let mi = firstIndex; mi <= lastIndex; mi++) {
            const { start, end } = rhythm_domains[mi];
            for (let b = 1; b < BEATS_PER_MEASURE; b += 2) {
                const x0 = start + (b / BEATS_PER_MEASURE) * (end - start);
                const x1 = start + ((b + 1) / BEATS_PER_MEASURE) * (end - start);
                group.appendChild(svg_element('rect', {
                    x: x0, y: topY, width: x1 - x0, height: STRIP_HEIGHT,
                    fill: '#ece4d3', stroke: 'none',
                }));
            }
        }

        // divisions within each measure; measure starts are drawn separately below
        for (let mi = firstIndex; mi <= lastIndex; mi++) {
            const { start, end } = rhythm_domains[mi];
            for (let s = 1; s < steps; s++) {
                const onBeat = s % perBeat === 0;
                const x = start + (s / steps) * (end - start);
                group.appendChild(svg_element('line', {
                    x1: x, y1: topY, x2: x, y2: bottomY,
                    stroke: onBeat ? '#7a6f5d' : '#d4c5aa',
                    'stroke-width': onBeat ? 1.5 : 1,
                }));
            }
        }

        group.appendChild(svg_element('rect', {
            x: left, y: topY, width: right - left, height: STRIP_HEIGHT,
            fill: 'none', stroke: '#d4c5aa', 'stroke-width': 1,
        }));

        // heavy rule at every barline, drawn last so it sits over the shading and
        // divisions -- makes the measure you're in obvious while the playhead moves
        const barlines = [];
        for (let mi = firstIndex; mi <= lastIndex; mi++) barlines.push(rhythm_domains[mi].start);
        barlines.push(right); // close the far end of the line
        barlines.forEach((x) => {
            group.appendChild(svg_element('line', {
                x1: x, y1: topY, x2: x, y2: bottomY,
                stroke: '#2a2520', 'stroke-width': 3,
            }));
        });

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
// in melody mode only notes of the right pitch are candidates, so a wrong note reads as
// off however well timed it was. the strict one-tap-per-note scoring happens at the end
// of the run in score_run().
function accuracy_for(beat, midi) {
    const { onsets, onsetPitches } = current_rhythm;
    let nearest = Infinity;
    onsets.forEach((onset, i) => {
        if (melodic() && !same_pitch_class(midi, onsetPitches[i])) return;
        nearest = Math.min(nearest, Math.abs(onset - beat) * beat_duration());
    });
    if (nearest <= PERFECT_WINDOW) return 'perfect';
    if (nearest <= GOOD_WINDOW) return 'good';
    return 'off';
}

// octave-agnostic, matching how every other quiz here compares notes -- and the on-screen
// keyboard only spans one octave, so exact-octave matching would rule it out entirely
function same_pitch_class(a, b) {
    if (a === null || a === undefined || b === null || b === undefined) return true;
    return a.mod(12) === b.mod(12);
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

    // confined to the timing strip. it used to run down through the staff as well, but
    // the strip is proportional in time while the notation is spaced by engraving
    // convention, so down there the line sat away from the note it was sounding.
    const { x, stripTop } = beat_to_position(beat);
    rhythm_playhead.style.display = 'block';
    rhythm_playhead.style.left = `${x}px`;
    rhythm_playhead.style.top = `${stripTop - PLAYHEAD_OVERHANG}px`;
    rhythm_playhead.style.height = `${STRIP_HEIGHT + PLAYHEAD_OVERHANG * 2}px`;
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

    rhythm_hits.push({ beat, midi: key });
    stamp_hit(beat, accuracy_for(beat, key));
}

function score_run() {
    rhythm_running = false;
    cancelAnimationFrame(rhythm_raf);
    clearTimeout(rhythm_end_timer);
    rhythm_playhead.style.display = 'none';
    rhythm_start_button.disabled = false;

    const beatDur = beat_duration();
    const { onsets, onsetPitches } = current_rhythm;
    const claimed = new Set();
    let good = 0;
    let perfect = 0;
    let wrongNote = 0; // played in time, but not the note that was written

    // greedily credit each written note to its nearest not-yet-used tap, so one tap can't
    // satisfy two notes and a burst of taps can't inflate the score. in melody mode only
    // taps of the right pitch are eligible at all.
    onsets.forEach((onset, oi) => {
        let bestIndex = -1;
        let bestDiff = Infinity;
        let bestWrongDiff = Infinity;
        rhythm_hits.forEach((hit, i) => {
            if (claimed.has(i)) return;
            const diff = Math.abs(hit.beat - onset) * beatDur;
            if (melodic() && !same_pitch_class(hit.midi, onsetPitches[oi])) {
                bestWrongDiff = Math.min(bestWrongDiff, diff);
                return;
            }
            if (diff < bestDiff) { bestDiff = diff; bestIndex = i; }
        });
        if (bestIndex >= 0 && bestDiff <= MATCH_WINDOW) {
            claimed.add(bestIndex);
            if (bestDiff <= GOOD_WINDOW) good++;
            if (bestDiff <= PERFECT_WINDOW) perfect++;
        } else if (bestWrongDiff <= GOOD_WINDOW) {
            wrongNote++;
        }
    });

    const extra = rhythm_hits.length - claimed.size;
    const allowedExtra = Math.max(1, Math.floor(onsets.length * 0.15));
    const ratio = onsets.length ? good / onsets.length : 0;
    const passed = ratio >= PASS_RATIO && extra <= allowedExtra;

    const pct = Math.round(ratio * 100);
    const scored = melodic() ? 'right' : 'in time';
    const extraNote = extra > 0 ? ` · ${extra} extra tap${extra === 1 ? '' : 's'}` : '';
    // worth separating out: hitting the beat but the wrong note is a different mistake
    // from being out of time, and the count alone wouldn't tell them apart
    const wrongNote_note = wrongNote > 0 ? ` · ${wrongNote} in time but wrong note` : '';
    let message;
    if (passed) {
        message = `pass — ${good}/${onsets.length} ${scored} (${perfect} dead on)${extraNote}`;
    } else if (ratio >= PASS_RATIO) {
        // the notes themselves were fine; it was the stray taps that sank it
        message = `${good}/${onsets.length} ${scored}, but ${extra} extra tap${extra === 1 ? '' : 's'} — at most ${allowedExtra} allowed`;
    } else {
        message = `${pct}% — ${good}/${onsets.length} ${scored}${wrongNote_note}${extraNote}, need ${Math.round(PASS_RATIO * 100)}%`;
    }
    rhythm_feedback.textContent = message;
    rhythm_feedback.className = passed ? 'passed' : 'failed';

    // a pass earns a fresh rhythm; a miss leaves this one up so it can be retried
    if (passed) setTimeout(next_rhythm, 1600);
}

// --- wiring -------------------------------------------------------------------

function next_rhythm() {
    const passage = rhythm_settings.source === 'bach' ? bach_excerpt() : null;
    let note = '';
    if (rhythm_settings.source === 'bach' && !passage) {
        // no real passage runs that long -- say so rather than silently generating one
        note = ' (no chorale passage that long — generated instead)';
    }
    current_rhythm = passage || generate_rhythm();

    render_rhythm_score();
    clear_stamps();
    rhythm_playhead.style.display = 'none';
    show_attribution(current_rhythm.attribution);
    rhythm_feedback.textContent = melodic()
        ? 'press start, then play the notes as written' + note
        : 'press start, then play the rhythm on any key' + note;
    rhythm_feedback.className = '';
}

function show_attribution(attribution) {
    rhythm_source_label.innerHTML = '';
    if (!attribution) return;
    const title = document.createElement('span');
    title.className = 'piece_title';
    title.textContent = attribution.title;
    const detail = document.createElement('span');
    detail.className = 'piece_detail';
    detail.textContent = attribution.detail;
    rhythm_source_label.append(title, detail);
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

document.getElementById('rhythm_melody').addEventListener('change', (e) => {
    rhythm_settings.melody = e.target.checked;
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

// note vocabulary and rests only shape generated rhythms, and only a real passage carries
// pitches to play -- grey out whichever don't apply rather than letting them look effective
function sync_generator_controls() {
    const generated = rhythm_settings.source === 'generated';
    const set_enabled = (id, enabled) => {
        const input = document.getElementById(id);
        input.disabled = !enabled;
        input.closest('label').classList.toggle('disabled', !enabled);
    };
    set_enabled('rhythm_vocabulary', generated);
    set_enabled('rhythm_rests', generated);
    set_enabled('rhythm_melody', !generated);
}
sync_generator_controls();

document.getElementById('rhythm_metronome').addEventListener('change', (e) => {
    rhythm_settings.metronome = e.target.checked;
});

// Melody is the same trainer with pitches switched on. It gets its own topic button so
// it's discoverable alongside the other practice modes, but the panel and its controls
// are shared -- either button leaves you free to flip Pitches on or off from there.
function init_melody() {
    rhythm_settings.source = 'bach';
    rhythm_settings.melody = true;
    document.getElementById('rhythm_source').value = 'bach';
    document.getElementById('rhythm_melody').checked = true;
    sync_generator_controls();
    init_rhythm();
}

add_game_button('Rhythm', init_rhythm, 'menu_rhythm', 'teal');
add_game_button('Melody', init_melody, 'menu_rhythm', 'teal');
