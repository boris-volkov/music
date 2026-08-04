// Wires the sliders/select in the "more options" -> "sound" panel to synth_settings
// (defined in audio.js), so the tone can be tuned by ear instead of by guesswork.
// Changing a control only affects notes played after that point -- Web Audio params
// are locked in once a note starts, so nothing retroactively changes a note already
// mid-playback.

function bind_synth_range(inputId, valueId, settingKey, format, transform = (v) => v) {
    const input = document.getElementById(inputId);
    const valueLabel = document.getElementById(valueId);
    input.addEventListener('input', () => {
        const raw = parseFloat(input.value);
        synth_settings[settingKey] = transform(raw);
        if (valueLabel) valueLabel.textContent = format(raw);
    });
}

bind_synth_range('synth_detune', 'synth_detune_value', 'detune_cents', (v) => `${v}¢`);
bind_synth_range('synth_attack', 'synth_attack_value', 'attack', (v) => `${v}ms`, (v) => v / 1000);
bind_synth_range('synth_release', 'synth_release_value', 'release', (v) => `${v}ms`, (v) => v / 1000);
bind_synth_range('synth_volume', 'synth_volume_value', 'peak', (v) => `${v}%`, (v) => v / 100);
bind_synth_range('synth_duration', 'synth_duration_value', 'note_duration', (v) => `${v.toFixed(1)}s`);
bind_synth_range('synth_gap', 'synth_gap_value', 'gap', (v) => `${v.toFixed(1)}s`);

document.getElementById('synth_waveform').addEventListener('change', (e) => {
    synth_settings.waveform = e.target.value;
});

document.getElementById('playback_output').addEventListener('change', (e) => {
    playback_settings.output = e.target.value;
    sync_playback_controls();
});

// The tone controls only shape the built-in synth, so grey them out when notes are going
// to a real instrument. Also says so when MIDI is chosen but nothing can sound it, rather
// than silently playing through the synth and leaving the setting looking wrong.
function sync_playback_controls() {
    const wanted_midi = playback_settings.output === 'midi';
    const on_midi = using_midi_output();
    const port = sounding_midi_output();

    document.getElementById('playback_output_note').textContent =
        !wanted_midi ? '' : on_midi ? (port.name || 'connected') : 'none found — using synth';

    ['synth_waveform', 'synth_detune', 'synth_attack', 'synth_release', 'synth_volume']
        .forEach((id) => {
            const input = document.getElementById(id);
            input.disabled = on_midi;
            input.closest('label').classList.toggle('disabled', on_midi);
        });
}
sync_playback_controls();

document.getElementById('synth_preview_note').addEventListener('pointerdown', () => {
    const ctx = get_audio_context();
    play_tone(64, ctx.currentTime, synth_settings.note_duration); // E4
});

document.getElementById('synth_preview_interval').addEventListener('pointerdown', () => {
    play_notes_sequentially([60, 64]); // C4 + E4, a major third
});
