// Species counterpoint on Fux's own cantus firmi, generated fresh each round by searching
// for a line that satisfies the rules of Gradus ad Parnassum (1725).
//
// The cantus firmus is the given and the counterpoint is the exercise -- that is what a
// species exercise *is* -- so the six canti firmi here are Fux's own, one per mode, rather
// than generated ones (PHILOSOPHY.md: real music beats generated music, and say what it
// is). What gets generated is the counterpoint against them, which is the part a student
// writes. Variety comes from that search finding a different valid line each time, times
// five species, times above-or-below, times seven canti firmi.
//
// Everything is computed in *diatonic index* space -- one integer per letter-name step,
// so 'c4' and 'd4' are adjacent whatever accidentals are involved. That is what makes an
// interval's spelling checkable rather than just its size in semitones, which matters
// twice over here: a diminished fifth is a dissonance where a perfect fifth is a
// consonance (mi contra fa), and F to G-sharp is a forbidden augmented second where F to
// G-natural is a fine minor third. Both distinctions vanish if you only count semitones.

// --- Fux's cantus firmi -------------------------------------------------------------
//
// Verified note-for-note against two independent transcriptions of Gradus ad Parnassum
// (Open Music Theory's exercise tables and fourscoreandmore.org's species survey), which
// agree exactly. Fux gives one per mode, plus a second, shorter one in C. The written
// octaves are his; place_cantus() shifts each by whole octaves into playable register
// without touching the contour.
const FUX_CANTUS_FIRMI = [
    { mode: 'Dorian',     final: 'D', notes: 'd4 f4 e4 d4 g4 f4 a4 g4 f4 e4 d4' },
    { mode: 'Phrygian',   final: 'E', notes: 'e4 c4 d4 c4 a3 a4 g4 e4 f4 e4' },
    { mode: 'Lydian',     final: 'F', notes: 'f3 g3 a3 f3 d3 e3 f3 c4 a3 f3 g3 f3' },
    { mode: 'Mixolydian', final: 'G', notes: 'g3 c4 b3 g3 c4 e4 d4 g4 e4 c4 d4 b3 a3 g3' },
    { mode: 'Aeolian',    final: 'A', notes: 'a3 c4 b3 d4 c4 e4 f4 e4 d4 c4 b3 a3' },
    { mode: 'Ionian',     final: 'C', notes: 'c4 e4 f4 g4 e4 a4 g4 e4 f4 e4 d4 c4' },
    { mode: 'Ionian',     final: 'C', notes: 'c4 d4 f4 e4 g4 e4 f4 e4 d4 c4' },
];

// --- diatonic pitch space -----------------------------------------------------------

const CP_LETTERS = ['c', 'd', 'e', 'f', 'g', 'a', 'b'];
const CP_LETTER_SEMITONES = [0, 2, 4, 5, 7, 9, 11];

// a note is { di, sharp } -- di counts letter-name steps from c0, so di 28 is c4
function cp_midi(note) {
    return 12 + 12 * Math.floor(note.di / 7) + CP_LETTER_SEMITONES[note.di.mod(7)] + (note.sharp ? 1 : 0);
}

function cp_name(note) {
    return CP_LETTERS[note.di.mod(7)] + (note.sharp ? '#' : '') + Math.floor(note.di / 7);
}

function parse_cp_note(text) {
    const letter = CP_LETTERS.indexOf(text[0]);
    const octave = parseInt(text.slice(-1), 10);
    return { di: octave * 7 + letter, sharp: false };
}

// Shifts a cantus by whole octaves until it sits where the hand that plays it can reach,
// leaving every interval in it untouched. Fux writes his canti in whatever octave suited
// the vocal clef he had in mind, which is not necessarily where a keyboard wants them --
// and the same cantus needs a different register depending on whether it is the lower
// voice (counterpoint above it) or the upper one.
function place_cantus(cantus, above) {
    const targetLow = above ? 48 : 59; // C3 as the bass voice, or around B3 as the upper
    const low = Math.min(...cantus.map(cp_midi));
    const shift = Math.round((targetLow - low) / 12);
    return cantus.map((n) => ({ di: n.di + 7 * shift, sharp: n.sharp }));
}

// --- intervals ----------------------------------------------------------------------

// Consonances, as semitones within an octave: unison/octave, minor and major third,
// perfect fifth, minor and major sixth. The perfect fourth is deliberately absent -- in
// two voices it counts as a dissonance, which is the rule that surprises everyone once
// and is then never in doubt again. Reducing by the octave first is what lets a tenth or
// a twelfth be recognised as the third and fifth they are.
function cp_consonant(semitones) {
    const s = semitones.mod(12);
    return s === 0 || s === 3 || s === 4 || s === 7 || s === 8 || s === 9;
}

function cp_perfect(semitones) {
    const s = semitones.mod(12);
    return s === 0 || s === 7;
}

// Which semitone sizes each letter-distance is allowed to have, so a melodic interval is
// judged by its spelling and not just its width. Keys are letter steps: 1 is a second, 2
// a third, and so on. A fourth may only be perfect (5) and a fifth only perfect (7), which
// is what rules out the melodic tritone in both its spellings; a sixth may only be minor
// (8), Fux allowing that one ascending and disallowing the major sixth outright; sevenths
// are absent entirely, and the octave (7 steps) is the largest leap permitted.
const CP_MELODIC_SIZES = { 1: [1, 2], 2: [3, 4], 3: [5], 4: [7], 5: [8], 7: [12] };

function cp_melodic_ok(from, to) {
    const steps = Math.abs(to.di - from.di);
    const semis = Math.abs(cp_midi(to) - cp_midi(from));
    if (steps === 0) return false; // no repeated note in the counterpoint line
    const allowed = CP_MELODIC_SIZES[steps];
    if (!allowed || !allowed.includes(semis)) return false;
    if (steps === 5 && cp_midi(to) < cp_midi(from)) return false; // minor sixth ascending only
    return true;
}

function cp_is_step(a, b) {
    return Math.abs(a.di - b.di) === 1;
}

// --- the species skeletons ----------------------------------------------------------
//
// Each species is a fixed rhythmic shape against the cantus, and the shape is most of what
// the species *is*. A skeleton lists the counterpoint's note slots -- when each sounds and
// for how long -- and which pitch decision each slot belongs to. Two slots sharing a
// decision are two halves of one tied note: one pitch, struck once, heard across a
// barline. That indirection is what lets fourth species be described here as the plain
// chain of suspensions it is, rather than as pitches plus a separate list of ties.

const CP_SPECIES = [
    { id: 1, name: 'First species', detail: 'note against note' },
    { id: 2, name: 'Second species', detail: 'two half notes against each whole' },
    { id: 3, name: 'Third species', detail: 'four quarters against each whole' },
    { id: 4, name: 'Fourth species', detail: 'syncopated — suspensions across the barline' },
    { id: 5, name: 'Fifth species', detail: 'florid — all of the above at once' },
];

// bar 0 opens with a rest in every species but the first, so the counterpoint enters after
// the cantus rather than alongside it
function cp_skeleton(species, bars, breakChance = 0) {
    const slots = [];
    let decision = 0;
    const last = bars - 1;

    if (species === 1) {
        for (let b = 0; b < bars; b++) slots.push({ beat: 4 * b, dur: 'w', decision: decision++ });
        return { slots, decisions: decision, lead: null };
    }

    if (species === 2 || species === 4) {
        slots.push({ beat: 2, dur: 'h', decision: decision++ });
        for (let b = 1; b <= last - 1; b++) {
            // Second species restrikes on the downbeat; fourth ties the previous note over
            // it, and that is the entire difference between them. Fux permits the fourth's
            // chain of ties to be broken where it cannot be continued, and below some of
            // his own canti it genuinely cannot -- there is no consonance left to resolve
            // onto. `breakChance` lets a bar restrike instead, and stays 0 for the first
            // attempts so an unbroken chain is always what gets tried first.
            const tied = species === 4 && Math.random() >= breakChance;
            slots.push({ beat: 4 * b, dur: 'h', decision: tied ? decision - 1 : decision++ });
            slots.push({ beat: 4 * b + 2, dur: 'h', decision: decision++ });
        }
        slots.push({ beat: 4 * last, dur: 'w', decision: decision++ });
        return { slots, decisions: decision, lead: { dur: 'h' } };
    }

    if (species === 3) {
        for (let i = 1; i < 4; i++) slots.push({ beat: i, dur: 'q', decision: decision++ });
        for (let b = 1; b <= last - 1; b++) {
            for (let i = 0; i < 4; i++) slots.push({ beat: 4 * b + i, dur: 'q', decision: decision++ });
        }
        slots.push({ beat: 4 * last, dur: 'w', decision: decision++ });
        return { slots, decisions: decision, lead: { dur: 'q' } };
    }

    // Fifth species: the rhythm itself is chosen here, bar by bar, from the figures Fux
    // actually mixes -- and a bar may tie in from the one before, which is how a suspension
    // gets into florid writing. A bar can only be tied into if the bar before it ended with
    // a half note on beat 3, so `tieable` tracks that rather than the pattern being free.
    const CP_PLAIN_BARS = [['h', 'h'], ['h', 'q', 'q'], ['q', 'q', 'h'], ['q', 'q', 'q', 'q'], ['hd', 'q']];
    const CP_TIED_BARS = [['h', 'h'], ['h', 'q', 'q']]; // whose first note is the one tied in

    slots.push({ beat: 2, dur: 'h', decision: decision++ });
    let tieable = true; // the opening half note sits on beat 3, so bar 1 may tie it over
    for (let b = 1; b <= last - 1; b++) {
        const tiesIn = tieable && Math.random() < 0.45;
        const pattern = random_element(tiesIn ? CP_TIED_BARS : CP_PLAIN_BARS);
        let beat = 4 * b;
        pattern.forEach((dur, i) => {
            slots.push({ beat, dur, decision: i === 0 && tiesIn ? decision - 1 : decision++ });
            beat += DURATION_BEATS[dur];
        });
        // only a half note landing on beat 3 reaches the barline, so only that can be
        // tied over into the next bar
        const tail = pattern[pattern.length - 1];
        tieable = tail === 'h' && beat - DURATION_BEATS[tail] === 4 * b + 2;
    }
    slots.push({ beat: 4 * last, dur: 'w', decision: decision++ });
    return { slots, decisions: decision, lead: { dur: 'h' } };
}

// --- the search ---------------------------------------------------------------------

function cp_shuffled(list) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

// Reaches for a step before a leap. Fux's lines are overwhelmingly stepwise, so trying the
// near notes first finds an idiomatic line sooner and cuts the search hard -- third
// species, at four notes to the bar, was taking a third of a second a round before this and
// is immediate after. The jitter keeps it a leaning rather than a rule, so the line still
// comes out different each time; the key is computed once per candidate rather than inside
// the comparator, which would make the sort's own ordering incoherent.
function cp_nearest_first(list, prev) {
    if (!prev) return cp_shuffled(list);
    return list
        .map((c) => ({ c, key: Math.abs(c.di - prev.di) + Math.random() * 2.5 }))
        .sort((a, b) => a.key - b.key)
        .map((e) => e.c);
}

// Searches for a counterpoint over `cantus` satisfying the rules, by choosing one pitch per
// decision in order and backtracking whenever a choice paints the line into a corner. The
// candidate order is shuffled at every node, so the same cantus and species yield a
// different (equally legal) line each round rather than the one a fixed order would always
// find first.
//
// `finalDi` is fixed before the search rather than discovered by it: the last note of a
// counterpoint is forced to the octave (or unison) on the final, and knowing it up front is
// what lets the penultimate note be checked for the stepwise contrary approach, and be
// offered with its leading-tone sharp, at the moment it is placed instead of long after.
function cp_search(cantus, skeleton, above, finalDi, opts) {
    const { slots, decisions } = skeleton;
    const slotsFor = [];
    for (let d = 0; d < decisions; d++) slotsFor.push([]);
    slots.forEach((s) => slotsFor[s.decision].push(s));

    const cantusAt = (beat) => cantus[Math.floor(beat / 4)];
    const chosen = [];
    const runs = []; // parallel thirds/sixths in a row ending at each decision
    let nodes = 0;

    // whether a note that comes out dissonant is nevertheless allowed to stand there
    function dissonance_licensed(k, slot) {
        const cur = chosen[k];
        const next = chosen[k + 1];
        const attack = slotsFor[k][0];
        if (!next) return false; // nothing can resolve it

        // A suspension: the note was struck earlier, is still sounding on a downbeat, and
        // steps down onto a consonance. This is the one dissonance allowed in a strong
        // position, and the whole substance of fourth species.
        if (slot !== attack && slot.beat.mod(4) === 0) {
            return next.di === cur.di - 1
                && cp_consonant(Math.abs(cp_midi(next) - cp_midi(cantusAt(slotsFor[k + 1][0].beat))));
        }

        // Otherwise it has to be a passing note: weak position, stepped into and out of,
        // continuing in the same direction. (Fux's cambiata and double neighbour are not
        // offered -- they'd widen the search for figures the ear reads as ornament, and
        // leaving them out only ever refuses a line, never admits a wrong one.)
        if (slot.beat.mod(4) === 0) return false;
        const prev = chosen[k - 1];
        if (!prev) return false;
        if (!cp_is_step(prev, cur) || !cp_is_step(cur, next)) return false;
        return Math.sign(cur.di - prev.di) === Math.sign(next.di - cur.di);
    }

    // everything checkable about decision k once its successor is known too
    function settled_ok(k) {
        for (const slot of slotsFor[k]) {
            const against = cantusAt(slot.beat);
            const semis = Math.abs(cp_midi(chosen[k]) - cp_midi(against));
            if (!cp_consonant(semis) && !dissonance_licensed(k, slot)) return false;
        }
        return true;
    }

    function candidate_ok(k, cand) {
        const attack = slotsFor[k][0];
        const isFirst = k === 0;
        const isLast = k === decisions - 1;

        for (const slot of slotsFor[k]) {
            const against = cantusAt(slot.beat);
            const gap = cp_midi(cand) - cp_midi(against);
            if (above ? gap <= 0 : gap >= 0) {
                // voices may touch on a unison only where the exercise begins or ends
                if (!(gap === 0 && (isFirst || isLast))) return false;
            }
            if (Math.abs(cand.di - against.di) > 11) return false; // keep within a twelfth
            // a dissonance in a strong position is only ever a suspension, which means a
            // note tied into it -- one struck right there has no excuse, and settled_ok()
            // would refuse it later anyway, so save the search the detour
            if (slot === attack && slot.beat.mod(4) === 0 && !cp_consonant(Math.abs(gap))) return false;
        }

        // Stay inside a twelfth overall, judged as the line is built rather than once it is
        // finished. A whole completed line thrown away at the last node sends the search
        // back to the top having learnt nothing from the attempt, which at third species'
        // four notes to the bar is the difference between instant and half a second.
        let lo = cand.di, hi = cand.di;
        for (let i = 0; i < k; i++) { lo = Math.min(lo, chosen[i].di); hi = Math.max(hi, chosen[i].di); }
        if (hi - lo > 11) return false;

        if (isFirst) return cp_perfect(Math.abs(cp_midi(cand) - cp_midi(cantusAt(attack.beat))));

        const prev = chosen[k - 1];
        if (!cp_melodic_ok(prev, cand)) return false;

        // a leap of a fifth or more is answered by a step back the other way
        if (k >= 1) {
            const leap = Math.abs(cp_midi(cand) - cp_midi(prev));
            const before = chosen[k - 2];
            if (before) {
                const prevLeap = Math.abs(cp_midi(prev) - cp_midi(before));
                const prevDir = Math.sign(prev.di - before.di);
                if (prevLeap >= 7 && !(cp_is_step(prev, cand) && Math.sign(cand.di - prev.di) === -prevDir)) {
                    return false;
                }
                // two leaps the same way must at least outline something consonant
                if (prevLeap > 2 && leap > 2 && Math.sign(cand.di - prev.di) === prevDir) {
                    if (!cp_consonant(Math.abs(cp_midi(cand) - cp_midi(before)))) return false;
                }
            }
        }

        // motion between this attack and the previous one, against the cantus underneath
        const prevAttack = slotsFor[k - 1][0];
        const cfPrev = cantusAt(prevAttack.beat);
        const cfNow = cantusAt(attack.beat);
        const prevGap = Math.abs(cp_midi(prev) - cp_midi(cfPrev));
        const nowGap = Math.abs(cp_midi(cand) - cp_midi(cfNow));
        const cpDir = Math.sign(cp_midi(cand) - cp_midi(prev));
        const cfDir = Math.sign(cp_midi(cfNow) - cp_midi(cfPrev));

        if (cfDir !== 0 && cpDir !== 0) {
            // consecutive perfects of the same kind, in any motion -- Fux forbids the pair
            // even when the voices approach them contrarily
            if (cp_perfect(prevGap) && cp_perfect(nowGap) && prevGap.mod(12) === nowGap.mod(12)) return false;
            // ...and arriving at any perfect consonance by similar motion (the "direct"
            // fifth or octave) is out too
            if (cp_perfect(nowGap) && cpDir === cfDir) return false;
        }

        // no more than three thirds or sixths in a row in parallel -- tracked forward per
        // decision so backtracking restores it for free, rather than recounted at the end
        const parallelImperfect = cpDir !== 0 && cfDir !== 0 && cpDir === cfDir
            && !cp_perfect(nowGap) && prevGap.mod(12) === nowGap.mod(12);
        runs[k] = parallelImperfect ? (runs[k - 1] || 0) + 1 : 0;
        if (runs[k] >= 4) return false;

        if (isLast) {
            // the close: onto the octave or unison, by step, against the cantus
            if (!cp_perfect(nowGap) || nowGap.mod(12) !== 0) return false;
            if (!cp_is_step(prev, cand)) return false;
            if (cfDir === 0 || cpDir === cfDir) return false;
        }
        return true;
    }

    function candidates(k) {
        const attack = slotsFor[k][0];
        const isLast = k === decisions - 1;
        if (isLast) return [{ di: finalDi, sharp: false }];

        const against = cantusAt(attack.beat);
        const out = [];
        for (let step = 1; step <= 11; step++) {
            out.push({ di: against.di + (above ? step : -step), sharp: false });
        }
        if (k === decisions - 2) {
            // The penultimate note is the leading tone if the mode has to be told to have
            // one. Where the step up to the final is a whole tone, musica ficta raises it,
            // so that spelling is offered first and the plain one kept as the fallback --
            // and nothing here has to know which modes those are, because in Phrygian the
            // raised note simply fails the consonance check and the natural one stands,
            // which is exactly the cadence that mode is known for.
            const under = { di: finalDi - 1, sharp: false };
            const whole = cp_midi({ di: finalDi, sharp: false }) - cp_midi(under) === 2;
            const ordered = whole ? [{ di: finalDi - 1, sharp: true }, under] : [under];
            const rest = cp_nearest_first(out.filter((c) => c.di !== finalDi - 1), chosen[k - 1]);
            return ordered.concat(rest);
        }
        return cp_nearest_first(out, chosen[k - 1]);
    }

    // The one shape that can only be judged whole: the line should rise to a single high
    // point rather than touching its ceiling twice. Asked for in first and second species,
    // where the line is short enough that the peak reads as a peak -- a third-species line
    // of forty-odd quarters will pass through its top note more than once as a matter of
    // course, and Fux does not ask otherwise.
    function whole_line_ok() {
        if (!opts.singleClimax) return true;
        const dis = chosen.map((c) => c.di);
        const top = Math.max(...dis);
        if (dis.filter((d) => d === top).length !== 1) return false;
        return dis[0] !== top && dis[dis.length - 1] !== top;
    }

    function recurse(k) {
        if (++nodes > 300000) return false; // a cantus this refuses is reported, not hidden
        if (k === decisions) return settled_ok(k - 1) && whole_line_ok();
        for (const cand of candidates(k)) {
            if (!candidate_ok(k, cand)) continue;
            chosen[k] = cand;
            // k-1 could not be judged until its successor existed -- now it does
            if (k >= 1 && !settled_ok(k - 1)) continue;
            if (recurse(k + 1)) return true;
        }
        chosen.length = k;
        return false;
    }

    return recurse(0) ? chosen.slice() : null;
}

// --- building the passage -----------------------------------------------------------

const counterpoint_settings = { species: 1, above: true };

function counterpoint_passage() {
    const entry = random_element(FUX_CANTUS_FIRMI);
    const above = counterpoint_settings.above;
    const species = counterpoint_settings.species;
    const cantus = place_cantus(entry.notes.split(' ').map(parse_cp_note), above);
    const bars = cantus.length;
    const cfFinal = cantus[bars - 1];

    // the counterpoint's last note: an octave clear of the cantus, or two if the line has
    // been living up there anyway -- both are the same perfect consonance on the final
    const finals = above
        ? [cfFinal.di + 7, cfFinal.di + 14]
        : [cfFinal.di - 7, cfFinal.di - 14];

    let line = null, skeleton = null;
    // A rejected attempt means this particular shuffle painted itself into a corner (or, in
    // fifth species, that the rhythm drawn for the bar left nothing legal to put in it),
    // not that the exercise is impossible -- so retry before giving up. Each pass gives up
    // one thing in turn, in order of how little it costs: first nothing at all, then the
    // single-climax preference, then -- only for fourth species, and only a little at a
    // time -- the unbroken chain of ties. Ten of the twelve cantus-and-position pairings
    // never need that last concession at all; the two that do (below the Lydian and Ionian
    // canti, where the chain runs out of consonances to resolve onto) should still come out
    // with a bar or two restruck rather than a line that has stopped being fourth species.
    // A search costs well under a millisecond, so trying thirty of them is free.
    for (let attempt = 0; attempt < 30 && !line; attempt++) {
        const breakChance = species === 4 && attempt >= 6 ? Math.min(0.3, 0.04 * (attempt - 5)) : 0;
        skeleton = cp_skeleton(species, bars, breakChance);
        for (const finalDi of finals) {
            line = cp_search(cantus, skeleton, above, finalDi,
                { singleClimax: species <= 2 && attempt < 8 });
            if (line) break;
        }
    }
    if (!line) return null;

    // lay the counterpoint's slots out into bars, tying a slot to the next when the two
    // share one pitch decision -- that pair is one note held across the barline
    const cpBars = [];
    for (let b = 0; b < bars; b++) cpBars.push([]);
    if (skeleton.lead) cpBars[0].push({ duration: skeleton.lead.dur, rest: true });
    skeleton.slots.forEach((slot, i) => {
        const next = skeleton.slots[i + 1];
        cpBars[Math.floor(slot.beat / 4)].push({
            duration: slot.dur,
            rest: false,
            pitch: cp_name(line[slot.decision]),
            tie: !!next && next.decision === slot.decision,
        });
    });

    const cfBars = cantus.map((n) => [{ duration: 'w', rest: false, pitch: cp_name(n), tie: false }]);
    const upper = above ? cpBars : cfBars;
    const lower = above ? cfBars : cpBars;

    const chosenSpecies = CP_SPECIES.find((s) => s.id === species);
    const attribution = {
        title: `${chosenSpecies.name} · ${entry.mode} on ${entry.final}`,
        detail: `${chosenSpecies.detail} · counterpoint ${above ? 'above' : 'below'} `
            + 'the cantus firmus · J.J. Fux, Gradus ad Parnassum',
    };
    // no key signature: these are modes, not keys, and the one accidental that does turn up
    // is a cadential leading tone, which belongs on the note and not in a signature
    return finish_rhythm(upper, attribution, null, lower);
}

// --- wiring -------------------------------------------------------------------------

document.getElementById('counterpoint_species').addEventListener('change', (e) => {
    counterpoint_settings.species = parseInt(e.target.value, 10);
    next_rhythm();
});

document.getElementById('counterpoint_position').addEventListener('change', (e) => {
    counterpoint_settings.above = e.target.value === 'above';
    next_rhythm();
});

function init_counterpoint() {
    rhythm_settings.melody = false; // counterpoint is pitched whatever the melody switch says
    rhythm_settings.source = 'counterpoint';
    document.getElementById('rhythm_source').value = 'counterpoint';
    // hands aren't set here: two_handed() knows counterpoint is two-voice by nature, the
    // same way it knows partimento is, and sync_generator_controls() pins the control
    sync_generator_controls();
    init_rhythm_panel('counterpoint');
}

add_game_button('Counterpoint', init_counterpoint, 'menu_patterns', 'patterns');
