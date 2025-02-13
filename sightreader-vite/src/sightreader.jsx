// sightreader.jsx
import React, { useEffect, useRef } from 'react';
import ABCJS from 'abcjs'; // ensure this package is installed
import Pitchfinder from 'pitchfinder'; // ensure this package is installed
import Cookies from 'js-cookie'; // ensure this package is installed
import $ from 'jquery'; // assuming jQuery is installed

// Some constants from your original code:
const DEFAULT_SCALE = 1.5;
const DEFAULT_TEMPO = 60;
const SILENCE = '-';
const MIN_VOLUME = 0.075;
const scales = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function SightReader() {
    // Create refs for all the important DOM elements.
    const notationRef = useRef(null);
    const abcTextareaRef = useRef(null);
    const statusRef = useRef(null);
    const devicesRef = useRef(null);
    const profilesRef = useRef(null);
    const newProfileRef = useRef(null);
    const fileSelectRef = useRef(null);
    const tempoSelectRef = useRef(null);
    const startButtonRef = useRef(null);
    const resetButtonRef = useRef(null);
    const tuneButtonRef = useRef(null);
    const currentNoteRef = useRef(null);
    const currentScoreRef = useRef(null);
    const currentVolumeRef = useRef(null);
    const midiRef = useRef(null);
    const countdownRef = useRef(null);
    const loadedFilenameRef = useRef(null);
    const qpmDisplayRef = useRef(null);
    const currentPlaylistPositionRef = useRef(null);
    const scoreStatsRef = useRef(null);
    const autoContinueRef = useRef(null);
    const ignoreDurationRef = useRef(null);
    const playlistRef = useRef(null);

    useEffect(() => {
        // --- AudioContext and related setup ---
        let audioContext = new (window.AudioContext || window.webkitAudioContext)();
        audioContext.suspend();

        // --- createAudioMeter Implementation ---
        function createAudioMeter(audioCtx) {
            const processor = audioCtx.createScriptProcessor(512);
            processor.volume = 0;
            processor.onaudioprocess = function (event) {
                const buf = event.inputBuffer.getChannelData(0);
                let sum = 0;
                for (let i = 0; i < buf.length; i++) {
                    sum += buf[i] * buf[i];
                }
                processor.volume = Math.sqrt(sum / buf.length);
            };
            processor.connect(audioCtx.destination);
            return processor;
        }

        // --- State Variables ---
        let detectPitch = null;
        let recording = false;
        let tunebook;
        let original_loaded_abc = null;
        let loaded_abc = null;
        let loaded_abc_raw = null;
        let timer = null;
        let synth = null;
        let current_event = null;
        let source_stream;

        // Playlist-related state.
        let playlist_files = [];
        let playlist_index = 0;
        let note_checker_id = null;
        let new_note_checked = false;
        let new_note_checked_and_found = false;
        let notes_checked_count = 0;
        let notes_checked_correct_count = 0;
        let pitch_getter_id = null;
        let volume_meter = null;
        let loaded_abc_filename = null;

        // For keeping track of note detection.
        let current_midi_number = 0;
        let expected_midi_number = 0;
        let current_qpm = null;
        let current_score_stats = null;

        // ––––– Helper Functions –––––
        const clamp = (val, min, max) => (val > max ? max : val < min ? min : val);

        function midi_number_to_octave(number) {
            return parseInt(number / 12) - 1;
        }
        function midi_number_to_scale(number) {
            return scales[number % 12];
        }
        function midi_number_to_string(number) {
            return number ? midi_number_to_scale(number) + midi_number_to_octave(number) : SILENCE;
        }
        function noteFromPitch(frequency) {
            let noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
            return Math.round(noteNum) + 69;
        }
        function milliseconds_per_beat(qpm) {
            return 60000 / qpm;
        }
        function milliseconds_per_measure(qpm, tune) {
            return tune.getBeatsPerMeasure() * milliseconds_per_beat(qpm);
        }

        function update_qpm_display() {
            if (qpmDisplayRef.current) {
                qpmDisplayRef.current.textContent = current_qpm ? current_qpm : '-';
            }
        }
        function update_start_button() {
            if (startButtonRef.current) {
                startButtonRef.current.disabled = !(source_stream && tunebook && tunebook[0].lines.length > 0);
            }
        }
        function color_note(event, color) {
            if (!event || !event.elements) return;
            for (let e of event.elements) {
                for (let s of e) {
                    s.setAttribute('fill', color);
                }
            }
        }
        function report_status(message) {
            if (statusRef.current) statusRef.current.innerHTML = message;
        }
        function update_score_display() {
            if (currentScoreRef.current) {
                currentScoreRef.current.textContent = notes_checked_count
                    ? `${notes_checked_correct_count}/${notes_checked_count} = ${Math.round(
                          (notes_checked_correct_count / notes_checked_count) * 100
                      )}%`
                    : '-';
            }
        }
        function update_current_note_display() {
            if (currentNoteRef.current) {
                $(currentNoteRef.current).removeClass('good bad');
                if (expected_midi_number) {
                    if (expected_midi_number === current_midi_number) {
                        $(currentNoteRef.current).addClass('good');
                    } else {
                        $(currentNoteRef.current).addClass('bad');
                    }
                }
                currentNoteRef.current.textContent =
                    midi_number_to_string(expected_midi_number) +
                    '/' +
                    midi_number_to_string(current_midi_number);
            }
        }
        function is_ignore_duration() {
            return $(ignoreDurationRef.current).is(':checked');
        }
        function is_auto_continue() {
            return $(autoContinueRef.current).is(':checked');
        }
        function check_note() {
            if (isNaN(current_midi_number)) current_midi_number = 0;
            if (isNaN(expected_midi_number)) expected_midi_number = 0;
            if (is_ignore_duration()) {
                if (!new_note_checked) {
                    new_note_checked = true;
                    notes_checked_count += 1;
                }
                if (!new_note_checked_and_found && expected_midi_number === current_midi_number) {
                    new_note_checked_and_found = true;
                    notes_checked_correct_count += 1;
                }
            } else {
                notes_checked_correct_count += expected_midi_number === current_midi_number ? 1 : 0;
                notes_checked_count += 1;
            }
            update_score_display();
        }
        function mark_start_button_as_started() {
            if (startButtonRef.current) startButtonRef.current.textContent = 'Stop';
        }
        function mark_start_button_as_stopped() {
            if (startButtonRef.current) startButtonRef.current.textContent = 'Start';
        }

        // --- Modified Countdown Function ---, works most of the time a little glitchy
        function begin_countdown() {
            mark_start_button_as_started();
            recording = true;
            let countdownVal = 1; // start at 1 second
        
            function animateCountdown() {
                if (countdownVal < 6) {
                    if (countdownRef.current) {
                        countdownRef.current.style.display = 'block';
                        countdownRef.current.textContent = countdownVal;
                        $(countdownRef.current)
                            .css({ 'font-size': '15em', opacity: 1.0 })
                            .show()
                            .animate({ opacity: 0 }, 1000, 'linear', () => {
                                countdownVal++;
                                setTimeout(animateCountdown, 1000);
                            });
                    }
                } else {
                    if (countdownRef.current) {
                        countdownRef.current.style.display = 'none';
                    }
                    start();
                }
            }
        
            animateCountdown();
        }

        // ––––– Preprocess ABC Data Function –––––
        function preprocess_abc_data(data) {
            const HEADER_KEYS_TO_IGNORE = new Set(['T', 'C', 'Z', 'S', 'N', 'G', 'O', 'H', 'I', 'P', 'W', 'F', 'B']);
            let headers = [];
            let notes = [];
            
            let lines = data.split('\n');
            for (let line of lines) {
                line = line.trim();
                if (!line || line.startsWith('%')) {
                    console.debug('Ignoring comment:', line);
                    continue;
                }
                
                if (line.length >= 2 && line[1] === ':' && /^[A-Za-z]$/.test(line[0])) {
                    if (HEADER_KEYS_TO_IGNORE.has(line[0].toUpperCase())) {
                        console.debug('Ignoring header:', line);
                        continue;
                    }
                    console.debug('Keeping header:', line);
                    headers.push(line);
                } else {
                    console.debug('Keeping notes:', line);
                    notes.push(line);
                }
            }
            
            return headers.join('\n') + '\n' + notes.join('\n');
        }

        // ––––– ABC and Playlist Loading Functions –––––
        function load_abc(abc_string) {
            let qpm = null;
            let abc_string_raw = abc_string;
            stop(); // stop any playing
            if (tempoSelectRef.current.value) {
                qpm = parseInt(tempoSelectRef.current.value);
            } else {
                let qpm_matches = abc_string.match(/Q:\s*(\d+)/i);
                if (qpm_matches) {
                    qpm = parseInt(qpm_matches[1]);
                    abc_string = abc_string.replace(/Q:\s*(\d+\n)/i, '');
                }
            }
            qpm = parseInt(qpm || DEFAULT_TEMPO);
            loaded_abc_raw = abc_string_raw;
            loaded_abc = abc_string;
            current_qpm = qpm;
            update_qpm_display();

            tunebook = ABCJS.renderAbc(notationRef.current.id, abc_string, {
                responsive: 'resize',
                scale: DEFAULT_SCALE,
                add_classes: true,
            });
            $(notationRef.current).css('opacity', 0.5);

            if (!synth) {
                synth = new ABCJS.synth.CreateSynth();
            }
            if (startButtonRef.current) startButtonRef.current.disabled = true;
            synth
                .init({
                    audioContext: audioContext,
                    visualObj: tunebook[0],
                    millisecondsPerMeasure: milliseconds_per_measure(current_qpm, tunebook[0]),
                })
                .then(() => {
                    synth
                        .prime()
                        .then(() => {
                            if (startButtonRef.current) startButtonRef.current.disabled = false;
                        })
                        .catch((error) => {
                            console.error("Synth prime error:", error);
                        });
                });
        }

        // Updated load_abc_file to include preprocessing
        function load_abc_file(filename) {
            if (!filename) return;
            if (loadedFilenameRef.current) loadedFilenameRef.current.textContent = '';
            $.ajax({
                url: '/music/' + filename,
                dataType: 'text',
                success: function (data) {
                    data = data.trim();
                    if (data.charCodeAt(0) === 0xFEFF) {
                        data = data.slice(1);
                    }
                    original_loaded_abc = data;
                    loaded_abc_filename = filename;
                    if (loadedFilenameRef.current) loadedFilenameRef.current.textContent = filename;
                    
                    // Preprocess the ABC data before loading
                    const processedData = preprocess_abc_data(data);
                    
                    if (abcTextareaRef.current) $(abcTextareaRef.current).val(processedData);
                    load_abc(processedData);
                    $(fileSelectRef.current).removeAttr('disabled');
                    report_status('File loaded. Press start to play.');
                    update_start_button();
                    update_score_stats_display();
                },
                error: function () {
                    report_status('Unable to load file.');
                    update_start_button();
                },
            });
        }

        function load_playlist_file(filename) {
            $.ajax({
                url: '/music/' + filename,
                dataType: 'json',
                success: function (data) {
                    clear_playlist();
                    playlist_files = data;
                    playlist_index = 0;
                    if (playlistRef.current) {
                        $(playlistRef.current).empty();
                        for (let i = 0; i < data.length; i += 1) {
                            $(playlistRef.current).append(
                                '<li class="list-group-item" data-playlist-index="' + i + '">' + data[i] + '</li>'
                            );
                        }
                        update_playlist();
                        $('#playlist li').click(function () {
                            let index = parseInt($(this).data('playlist-index'));
                            goto_playlist_index(index);
                        });
                    }
                },
                error: function () {
                    report_status('Unable to load playlist file: ' + filename);
                    update_start_button();
                },
            });
        }
        function load_abc_textarea() {
            if (loadedFilenameRef.current) loadedFilenameRef.current.textContent = '';
            let data = $(abcTextareaRef.current).val();
            original_loaded_abc = data;
            load_abc(data);
            $(fileSelectRef.current).removeAttr('disabled');
            if (tunebook && tunebook[0].lines.length > 0) {
                loaded_abc_filename = tunebook[0].metaText.title;
                report_status('File loaded. Press start to play.');
                update_score_stats_display();
            } else {
                report_status('Invalid ABC text. Please try again.');
            }
            update_start_button();
        }
        function clear_playlist() {
            playlist_files = [];
            playlist_index = 0;
            if (playlistRef.current) $(playlistRef.current).empty();
        }
        function goto_playlist_index(i) {
            let _playlist_index = playlist_index;
            playlist_index = clamp(i, 0, playlist_files.length - 1);
            if (_playlist_index !== playlist_index) {
                update_playlist();
            }
        }
        function increment_playlist() {
            let _playlist_index = playlist_index;
            playlist_index = clamp(playlist_index + 1, 0, playlist_files.length - 1);
            if (_playlist_index !== playlist_index) {
                update_playlist();
            }
        }
        function decrement_playlist() {
            let _playlist_index = playlist_index;
            playlist_index = clamp(playlist_index - 1, 0, playlist_files.length - 1);
            if (_playlist_index !== playlist_index) {
                update_playlist();
            }
        }
        function update_playlist() {
            notes_checked_correct_count = 0;
            notes_checked_count = 0;
            $('li').removeClass('active');
            $('li[data-playlist-index=' + playlist_index + ']').addClass('active');
            let fn = playlist_files[playlist_index];
            load_abc_file(fn);
            if (playlist_files.length && currentPlaylistPositionRef.current) {
                currentPlaylistPositionRef.current.textContent = (playlist_index + 1) + '/' + playlist_files.length;
            }
        }
        function update_score_stats_display() {
            $.ajax({
                url: 'score/get/' + loaded_abc_filename + '/' + current_qpm + '/' + $(profilesRef.current).val(),
                dataType: 'json',
                success: function (data) {
                    try {
                        current_score_stats = data;
                        if (scoreStatsRef.current) {
                            scoreStatsRef.current.textContent =
                                data.most_recent_scores && data.most_recent_scores.length
                                    ? data.min_score + '/' + data.mean_score + '/' + data.max_score
                                    : '';
                        }
                    } catch (error) {
                        console.log("Error processing score statistics:", error);
                    }
                },
                error: function () {
                    console.log('Error retrieving score statistics!');
                },
            });
        }

        // ––––– Audio and Pitch Handling –––––
        function start_pitch_detector() {
            audioContext.resume();
            detectPitch = new Pitchfinder.YIN({ sampleRate: audioContext.sampleRate });
            const sourceNode = audioContext.createMediaStreamSource(source_stream);
            const analyser = audioContext.createAnalyser();
            sourceNode.connect(analyser);
            const arrayUInt = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteTimeDomainData(arrayUInt);

            function get_pitch() {
                const volume = volume_meter.volume;
                current_midi_number = 0;
                if (volume > MIN_VOLUME) {
                    const array32 = new Float32Array(analyser.fftSize);
                    analyser.getFloatTimeDomainData(array32);
                    const freq = detectPitch(array32);
                    current_midi_number = parseInt(noteFromPitch(freq));
                    if (isNaN(current_midi_number)) current_midi_number = 0;
                }
                update_current_note_display();
                update_current_volume_display();
            }
            pitch_getter_id = setInterval(get_pitch, 10);
        }
        function stop_pitch_detector() {
            if (pitch_getter_id) clearInterval(pitch_getter_id);
            pitch_getter_id = null;
            current_midi_number = 0;
        }
        function start_volume_meter() {
            if (!volume_meter) {
                volume_meter = createAudioMeter(audioContext);
                const mediaStreamSource = audioContext.createMediaStreamSource(source_stream);
                mediaStreamSource.connect(volume_meter);
            }
        }
        function update_current_volume_display() {
            if (currentVolumeRef.current) {
                const volume = recording && volume_meter ? parseInt(Math.round(volume_meter.volume * 100)) : '-';
                currentVolumeRef.current.textContent = volume;
            }
        }
        function start_mic() {
            recording = true;
            audioContext.resume();
            start_volume_meter();
            start_pitch_detector();
        }
        function stop_mic() {
            current_midi_number = 0;
            recording = false;
            stop_pitch_detector();
        }
        function start_note_checker() {
            note_checker_id = setInterval(check_note, 100);
        }
        function stop_note_checker() {
            if (note_checker_id) clearInterval(note_checker_id);
            note_checker_id = null;
        }

        // ––––– Timing, Event Callback, Start/Stop, and Reset –––––
        function event_callback(event) {
            if (current_event) {
                color_note(current_event, '#000000');
            }
            if (event) {
                new_note_checked = false;
                new_note_checked_and_found = false;
                color_note(event, '#3D9AFC');
                current_event = event;
                const midiPitch = event.midiPitches && event.midiPitches[0];
                if (!midiPitch) {
                    expected_midi_number = 0;
                    update_current_note_display();
                    return;
                }
                expected_midi_number = midiPitch.pitch;
                update_current_note_display();
            } else {
                stop_note_checker();
                const score = Math.round((notes_checked_correct_count / notes_checked_count) * 100);
                report_status('Scored ' + score + '.');
                record_score(score);
                update_score_stats_display();
                stop(true);
                setTimeout(reset, 100);
                if (is_auto_continue()) {
                    if (current_score_stats && current_score_stats.mean_score && score >= current_score_stats.mean_score) {
                        increment_playlist();
                    }
                }
            }
        }
        function start() {
            timer = new ABCJS.TimingCallbacks(tunebook[0], {
                qpm: current_qpm,
                extraMeasuresAtBeginning: 0,
                lineEndAnticipation: 0,
                beatSubdivisions: 4,
                beatCallback: function (beatNumber, totalBeats, totalTime) {
                    // (Optional beat callback code)
                },
                eventCallback: event_callback,
                lineEndCallback: function (info) { },
            });
            notes_checked_count = 0;
            notes_checked_correct_count = 0;
            start_mic();
            mark_start_button_as_started();
            start_note_checker();
            timer.start();
            synth.start();
            report_status('Playing.');
            $(notationRef.current).css('opacity', 1);
        }
        function stop(verbose = true) {
            if (verbose && recording) {
                // If a countdown was in progress, cancel it.
            }
            if (!recording) return;
            $(notationRef.current).css('opacity', 0.5);
            stop_mic();
            expected_midi_number = 0;
            current_midi_number = 0;
            stop_note_checker();
            mark_start_button_as_stopped();
            if (timer) timer.stop();
            if (synth) synth.stop();
            if (verbose) report_status('Stopped.');
            if (current_event) {
                color_note(current_event, '#000000');
            }
        }
        function reset() {
            notes_checked_count = 0;
            update_score_display();
            stop();
            if (ABCJS.midi && ABCJS.midi.restartPlaying) {
                ABCJS.midi.restartPlaying();
            }
            if (timer) timer.reset();
            $(notationRef.current).find('svg').css('marginLeft', '0px');
            update_playlist();
        }
        function record_score(score) {
            $.ajax({
                url: 'score/set/' + loaded_abc_filename + '/' + score + '/' + current_qpm + '/' + $(profilesRef.current).val(),
                dataType: 'text',
                success: function () {
                    console.log('Score saved!');
                },
                error: function () {
                    console.log('Error saving score!');
                },
            });
        }
        // ––––– Event Listeners Setup –––––
        if (devicesRef.current) {
            devicesRef.current.addEventListener('change', async (e) => {
                if (e.target.value) {
                    if (recording) stop();
                    source_stream = await navigator.mediaDevices.getUserMedia({
                        audio: { deviceId: { exact: e.target.value } },
                    });
                    update_start_button();
                }
            });
        }
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
                navigator.mediaDevices.enumerateDevices().then((devices) => {
                    const fragment = document.createDocumentFragment();
                    devices.forEach((device) => {
                        if (device.kind === 'audioinput') {
                            const option = document.createElement('option');
                            option.textContent = device.label;
                            option.value = device.deviceId;
                            fragment.appendChild(option);
                        }
                    });
                    if (devicesRef.current) devicesRef.current.appendChild(fragment);
                    devicesRef.current.dispatchEvent(new Event('change'));
                });
            });
        } else {
            $('#message-model .modal-body').html('This browser is not supported.');
            $('#message-model').modal('show');
        }
        function file_select_change() {
            const filename = fileSelectRef.current.value;
            report_status('Loading file ' + filename + '.');
            clear_playlist();
            update_playlist();
            if (filename.endsWith('.abc')) {
                $('#abc-textarea-container').hide();
                load_abc_file(filename);
            } else if (filename.endsWith('.pls')) {
                $('#abc-textarea-container').hide();
                load_playlist_file(filename);
            } else {
                $('#abc-textarea-container').show();
                load_abc($(abcTextareaRef.current).val());
            }
            fileSelectRef.current.blur();
            Cookies.set(fileSelectRef.current.id, filename);
        }
        if (fileSelectRef.current) {
            fileSelectRef.current.addEventListener('change', file_select_change);
        }
        if (abcTextareaRef.current) {
            abcTextareaRef.current.addEventListener('change', load_abc_textarea);
        }
        if (tuneButtonRef.current) {
            tuneButtonRef.current.addEventListener('click', () => {
                if (recording) {
                    stop_mic();
                    $(tuneButtonRef.current).removeClass('active');
                    update_start_button();
                } else {
                    if (startButtonRef.current) startButtonRef.current.disabled = true;
                    start_mic();
                    $(tuneButtonRef.current).addClass('active');
                }
                update_current_volume_display();
            });
        }
        if (tempoSelectRef.current) {
            tempoSelectRef.current.addEventListener('change', () => {
                if (loaded_abc) {
                    load_abc(original_loaded_abc);
                    update_score_stats_display();
                }
            });
        }
        if (startButtonRef.current) {
            startButtonRef.current.addEventListener('click', (event) => {
                if (event.target.disabled || !(tunebook && tunebook[0].lines.length > 0)) {
                    report_status('Select a file before starting.');
                    return;
                }
                audioContext.resume();
                if (recording) {
                    stop();
                } else {
                    begin_countdown();
                }
                update_current_volume_display();
            });
        }
        if (resetButtonRef.current) {
            resetButtonRef.current.addEventListener('click', (event) => {
                if (event.target.disabled || !fileSelectRef.current.value) {
                    report_status('Select a file before resetting.');
                    return;
                } else {
                    reset();
                }
                update_score_display();
            });
        }
        $(document).keypress(function (e) {
            switch (e.keyCode) {
                case 115: // s
                    startButtonRef.current.click();
                    break;
                case 114: // r
                    resetButtonRef.current.click();
                    break;
                case 116: // t
                    tuneButtonRef.current.click();
                    break;
                case 110: // n
                    increment_playlist();
                    break;
                case 98: // b
                    decrement_playlist();
                    break;
                case 106: // j
                    // scroll_left(); // (if implemented)
                    break;
                case 107: // k
                    // scroll_right(); // (if implemented)
                    break;
                default:
                    break;
            }
        });
        $(document).ready(function () {
            let cb = parseInt(Cookies.get(autoContinueRef.current.id));
            if (!isNaN(cb)) $(autoContinueRef.current).prop('checked', cb);
            cb = parseInt(Cookies.get(ignoreDurationRef.current.id));
            if (!isNaN(cb)) $(ignoreDurationRef.current).prop('checked', cb);
            cb = Cookies.get(profilesRef.current.id);
            if (cb) $(profilesRef.current).val(cb);
            cb = Cookies.get(fileSelectRef.current.id);
            if (cb) {
                fileSelectRef.current.value = cb;
                file_select_change();
            }
        });
        return () => {
            if (note_checker_id) clearInterval(note_checker_id);
            if (pitch_getter_id) clearInterval(pitch_getter_id);
        };
    }, []);

    return (
        <div className="container">
            <h3>ABC Sightreader</h3>
            <div className="container">
                <div className="row-fluid">
                    <div className="span12" id="status" title="Status" ref={statusRef}>
                        1. Select your mic 2. Select your ABC file 3. Press start
                    </div>
                </div>
                <div className="row-fluid controls">
                    <div className="span12">
                        <label htmlFor="devices">Microphone:</label>
                        <select id="devices" ref={devicesRef}></select>
                        <label htmlFor="profiles">Profile:</label>
                        <select id="profiles" ref={profilesRef}></select>
                        <input
                            type="text"
                            id="newProfile"
                            ref={newProfileRef}
                            style={{ display: 'none' }}
                            placeholder="Enter name and press enter"
                        />
                        <label htmlFor="file">File:</label>
                        <select id="file" ref={fileSelectRef}>
                            <option value="">---Custom ABC---</option>
                            <option value="cecilio-lesson1-open-strings.abc">cecilio-lesson1-open-strings.abc</option>
                            <option value="cecilio-lesson2-first-position.abc">cecilio-lesson2-first-position.abc</option>
                            <option value="cecilio-lesson2-twinkle-twinkle-little-star.abc">cecilio-lesson2-twinkle-twinkle-little-star.abc</option>
                            <option value="cecilio-lesson3-exercise-1.abc">cecilio-lesson3-exercise-1.abc</option>
                            <option value="cecilio-lesson3-exercise-2.abc">cecilio-lesson3-exercise-2.abc</option>
                            <option value="cecilio-lesson3-exercise-3.abc">cecilio-lesson3-exercise-3.abc</option>
                            <option value="cecilio-lesson3-exercise-4.abc">cecilio-lesson3-exercise-4.abc</option>
                            <option value="cecilio-lesson3-mary-had-a-little-lamb.abc">cecilio-lesson3-mary-had-a-little-lamb.abc</option>
                            <option value="cecilio-lesson3-jingle-bells.abc">cecilio-lesson3-jingle-bells.abc</option>
                            <option value="cecilio-lesson4-camptown-races.abc">cecilio-lesson4-camptown-races.abc</option>
                            <option value="cecilio-lesson4-lightly-row.abc">cecilio-lesson4-lightly-row.abc</option>
                            <option value="cecilio-lesson4-russian-dance-tune.abc">cecilio-lesson4-russian-dance-tune.abc</option>
                            <option value="cecilio-lesson5-eighth-notes.abc">cecilio-lesson5-eighth-notes.abc</option>
                            <option value="cecilio-lesson5-hungarian-folk-song-1.abc">cecilio-lesson5-hungarian-folk-song-1.abc</option>
                            <option value="cecilio-lesson5-the-old-gray-goose.abc">cecilio-lesson5-the-old-gray-goose.abc</option>
                            <option value="cecilio-lesson6-first-position-d-string.abc">cecilio-lesson6-first-position-d-string.abc</option>
                            <option value="cecilio-lesson6-ode-to-joy.abc">cecilio-lesson6-ode-to-joy.abc</option>
                            <option value="cecilio-lesson6-scherzando.abc">cecilio-lesson6-scherzando.abc</option>
                            <option value="cecilio-lesson7-gavotte.abc">cecilio-lesson7-gavotte.abc</option>
                            <option value="cecilio-lesson7-country-gardens.abc">cecilio-lesson7-country-gardens.abc</option>
                            <option value="cecilio-lesson7-can-can.abc">cecilio-lesson7-can-can.abc</option>
                            <option value="cecilio-lesson8-largo.abc">cecilio-lesson8-largo.abc</option>
                            <option value="cecilio-lesson8-dixie.abc">cecilio-lesson8-dixie.abc</option>
                            <option value="hot-cross-buns.abc">hot-cross-buns.abc</option>
                            <option value="lesson1-open-string-exercise-1.abc">lesson1-open-string-exercise-1.abc</option>
                            <option value="lesson1-open-string-exercise-2.abc">lesson1-open-string-exercise-2.abc</option>
                            <option value="lesson1-open-string-exercise-3.abc">lesson1-open-string-exercise-3.abc</option>
                            <option value="lesson1-open-string-exercise-4.abc">lesson1-open-string-exercise-4.abc</option>
                            <option value="lesson1-open-string-exercise-5.abc">lesson1-open-string-exercise-5.abc</option>
                            <option value="lesson1-open-string-exercise-6.abc">lesson1-open-string-exercise-6.abc</option>
                            <option value="lesson2-1st-finger-exercise-1.abc">lesson2-1st-finger-exercise-1.abc</option>
                            <option value="lesson2-1st-finger-exercise-2.abc">lesson2-1st-finger-exercise-2.abc</option>
                            <option value="lesson2-1st-finger-exercise-3.abc">lesson2-1st-finger-exercise-3.abc</option>
                            <option value="lesson2-1st-finger-exercise-4.abc">lesson2-1st-finger-exercise-4.abc</option>
                            <option value="lesson2-1st-finger-exercise-5.abc">lesson2-1st-finger-exercise-5.abc</option>
                            <option value="lesson2-1st-finger-exercise-6.abc">lesson2-1st-finger-exercise-6.abc</option>
                        </select>
                        <label htmlFor="tempo">Tempo:</label>
                        <select id="tempo" ref={tempoSelectRef}>
                            <option value="">inherit</option>
                            <option value="30">30</option>
                            <option value="60">60</option>
                            <option value="90">90</option>
                            <option value="120">120</option>
                            <option value="180">180</option>
                            <option value="240">240</option>
                        </select>
                        <button id="start" ref={startButtonRef} disabled title="Enable mic and begin playing along to sheet music.">
                            Start
                        </button>
                        <button id="reset" ref={resetButtonRef}>
                            Reset
                        </button>
                        <button id="tune" ref={tuneButtonRef} title="Enable mic and show pitch but don't play a game.">
                            Tune
                        </button>
                    </div>
                </div>
                <div className="row-fluid" id="abc-textarea-container">
                    <div className="span-12">
                        <textarea id="abc-textarea" ref={abcTextareaRef}></textarea>
                    </div>
                </div>
                <div className="row-fluid main-display">
                    <div className="row-fluid top-info">
                        <div id="current-playlist-position" title="Playlist position." className="span4 left" ref={currentPlaylistPositionRef}>
                            -
                        </div>
                        <div id="qpm-display" title="QPM" className="span4 center" ref={qpmDisplayRef}>
                            -
                        </div>
                        <div className="span4 right">
                            <span id="current-score" title="Your current score." ref={currentScoreRef}>
                                -
                            </span>
                            <span id="score-stats" title="Score statistics." ref={scoreStatsRef}></span>
                        </div>
                    </div>
                    <div className="span12" id="notation" ref={notationRef}></div>
                    <span id="current-note" title="Expected and actual note detected on the microphone." ref={currentNoteRef}>
                        -
                    </span>
                    <span id="current-volume" title="Microphone volume." ref={currentVolumeRef}>
                        -
                    </span>
                    <div id="midi" style={{ display: 'none' }} ref={midiRef}></div>
                    <span id="count-down" ref={countdownRef}></span>
                    <span id="loaded-filename" ref={loadedFilenameRef}>
                        -
                    </span>
                </div>
                <div className="row-fluid controls">
                    <div className="span12 keyboard-legend">
                        <span className="cb-field">
                            <input id="auto-continue" type="checkbox" ref={autoContinueRef} />
                            <label htmlFor="auto-continue" title="Once score is above average, immediately move on to next playlist item.">
                                Auto-Continue
                            </label>
                        </span>
                        <span className="cb-field">
                            <input id="ignore-duration" type="checkbox" ref={ignoreDurationRef} />
                            <label htmlFor="ignore-duration" title="If checked, will score a note if it's met and will not check duration.">
                                Ignore Duration
                            </label>
                        </span>
                    </div>
                </div>
                <div className="row-fluid">
                    <div className="span12">
                        <ol id="playlist" className="list-group" ref={playlistRef}></ol>
                    </div>
                </div>
            </div>

            <div className="modal fade" id="message-model" role="dialog">
                <div className="modal-dialog">
                    <div className="modal-content">
                        <div className="modal-body" style={{ textAlign: 'center' }}></div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default SightReader;
