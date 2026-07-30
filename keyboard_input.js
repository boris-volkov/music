// Lets the on-screen piano keys act as input, by synthesizing the same event shape
// real MIDI messages have and feeding it through the same onMIDIMessage/quiz-callback
// pipeline midi.js already drives. No quiz file needs to know the difference.
//
// Each pointer is tracked by its own pointerId, so multiple simultaneous touches don't
// clobber each other -- on a touchscreen this means chords/intervals can be played with
// several fingers. A single mouse can still only ever hold one key down at a time, same
// as a single finger would.

const held_pointers = new Map(); // pointerId -> key

function fire_key_event(type, key) {
    const event = { data: [type, key, 100] };
    onMIDIMessage(event);
    if (current_quiz_callback) current_quiz_callback(event);
}

document.querySelectorAll('#keyboard .white, #keyboard .black').forEach((el) => {
    const key = parseInt(el.id, 10);
    el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        held_pointers.set(e.pointerId, key);
        fire_key_event(KEYDOWN, key);
    });
});

function release_pointer(e) {
    const key = held_pointers.get(e.pointerId);
    if (key === undefined) return;
    held_pointers.delete(e.pointerId);
    fire_key_event(KEYUP, key);
}

document.addEventListener('pointerup', release_pointer);
document.addEventListener('pointercancel', release_pointer);
