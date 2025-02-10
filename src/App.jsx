import React, { useState, useEffect } from 'react';
import NotationDisplay from './components/NotationDisplay';
import Controls from './components/Controls';
import useAudioProcessing from './components/useAudioProcessing';
import ABCJS from 'abcjs';

const App = ({ title, profiles = [], files = [] }) => {
    const [abcString, setAbcString] = useState('');
    const [currentQpm, setCurrentQpm] = useState(60);
    const [tunebook, setTunebook] = useState(null);
    const [recording, setRecording] = useState(false);
    const [status, setStatus] = useState('Select a file or enter ABC text.');
    const [playlistFiles, setPlaylistFiles] = useState([]);
    const [playlistIndex, setPlaylistIndex] = useState(0);
    const [currentMidiNumber, setCurrentMidiNumber] = useState(0);
    const [expectedMidiNumber, setExpectedMidiNumber] = useState(0);
    const [selectedDeviceId, setSelectedDeviceId] = useState(null);
    const [newProfile, setNewProfile] = useState('');
    const { startMic, stopMic, volume, devices } = useAudioProcessing(setCurrentMidiNumber);

    const loadABC = async (fileName) => {
        try {
            const response = await fetch(`/music/${fileName}`);
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            let abcText = await response.text();
            let qpm = 60;
            const tempoMatch = abcText.match(/Q:\s*(\d+)/i);
            if (tempoMatch) {
                qpm = parseInt(tempoMatch[1]);
                abcText = abcText.replace(/Q:\s*(\d+\n)/i, '');
            }
            setCurrentQpm(qpm);
            setAbcString(abcText);
            setStatus('ABC loaded. Press start to play.');
            const book = ABCJS.renderAbc('notation', abcText, {
                responsive: "resize",
                scale: 1.5,
                add_classes: true,
            });
            if (book && book[0]) {
                setTunebook(book[0]);
            }
        } catch (error) {
            console.error('Error loading ABC file:', error);
            setStatus('Error loading ABC file.');
        }
    };

    const handleStart = () => {
        setRecording(true);
        startMic(selectedDeviceId);
        setStatus('Playing.');
    };

    const handleStop = () => {
        setRecording(false);
        stopMic();
        setStatus('Stopped.');
    };

    const handleReset = () => {
        setStatus('Resetting...');
        if (tunebook) {
            ABCJS.midi.restartPlaying();
        }
    };

    const handleDeviceChange = (event) => {
        const deviceId = event.target.value;
        setSelectedDeviceId(deviceId);
        if (recording) {
            stopMic();
            startMic(deviceId);
        }
    };

    const handleProfileChange = (event) => {
        const profileValue = event.target.value;
        if (profileValue === 'new') {
            setNewProfile('');
        } else {
            setSelectedProfile(profileValue);
        }
    };

    const handleCreateProfile = (event) => {
        if (event.key === 'Enter' && newProfile.trim()) {
            const newProfileObj = { value: newProfile.trim(), name: newProfile.trim() };
            setProfiles([...profiles, newProfileObj]);
            setSelectedProfile(newProfile.trim());
            setNewProfile('');
        }
    };

    return (
        <div>
            <div className="container">
                <h3>ABC Sightreader</h3>
            </div>
            <div className="container">
                <div className="row-fluid">
                    <div className="span12" id="status" title="Status">
                        1. Select your mic 2. Select your ABC file 3. Press start
                    </div>
                </div>
                <div className="row-fluid controls">
                    <div className="span12">
                        <label htmlFor="devices">Microphone:</label>
                        <select id="devices" onChange={handleDeviceChange}>
                            <option value="">Select Microphone</option>
                            {devices.map(device => (
                                <option key={device.deviceId} value={device.deviceId}>
                                    {device.label || `Microphone ${device.deviceId}`}
                                </option>
                            ))}
                        </select>
                        <label htmlFor="profiles">Profile:</label>
                        <select id="profiles" onChange={handleProfileChange}>
                            {profiles.map(([profileValue, profileName]) => (
                                <option key={profileValue} value={profileValue}>
                                    {profileName}
                                </option>
                            ))}
                        </select>
                        <input
                            type="text"
                            id="newProfile"
                            style={{ display: 'none' }}
                            placeholder="Enter name and press enter"
                            onKeyDown={handleCreateProfile}
                        />
                        <label htmlFor="file">File:</label>
                        <select id="file" onChange={(e) => loadABC(e.target.value)}>
                            <option value="">---Custom ABC---</option>
                            {files.map(fn => (
                                <option key={fn} value={fn}>
                                    {fn}
                                </option>
                            ))}
                        </select>
                        <label htmlFor="tempo">Tempo:</label>
                        <select id="tempo">
                            <option value="">inherit</option>
                            <option value="30">30</option>
                            <option value="60">60</option>
                            <option value="90">90</option>
                            <option value="120">120</option>
                            <option value="180">180</option>
                            <option value="240">240</option>
                        </select>
                        <button
                            id="start"
                            disabled={!abcString}
                            title="Enable mic and begin playing along to sheet music."
                            onClick={handleStart}
                        >
                            Start
                        </button>
                        <button id="reset" onClick={handleReset}>Reset</button>
                        <button id="tune" title="Enable mic and show pitch but don't play a game.">
                            Tune
                        </button>
                    </div>
                </div>
                <div className="row-fluid" id="abc-textarea-container">
                    <div className="span-12">
                        <textarea id="abc-textarea" onChange={(e) => loadABC(e.target.value)}></textarea>
                    </div>
                </div>
                <div className="row-fluid main-display">
                    <div className="row-fluid top-info">
                        <div id="current-playlist-position" title="Playlist position." className="span4 left">
                            -
                        </div>
                        <div id="qpm-display" title="QPM" className="span4 center">
                            -
                        </div>
                        <div className="span4 right">
                            <span id="current-score" title="Your current score.">
                                -
                            </span>
                            <span id="score-stats" title="Score statistics."></span>
                        </div>
                    </div>
                    <div className="span12" id="notation">
                        <NotationDisplay abcString={abcString} />
                    </div>
                    <span id="current-note" title="Expected and actual note detected on the microphone.">
                        -
                    </span>
                    <span id="current-volume" title="Microphone volume.">
                        -
                    </span>
                    <div id="midi" style={{ display: 'none' }}></div>
                    <span id="count-down"></span>
                    <span id="loaded-filename">-</span>
                </div>
                <div className="row-fluid controls">
                    <div className="span12 keyboard-legend">
                        <span className="cb-field">
                            <input id="auto-continue" type="checkbox" />
                            <label
                                htmlFor="auto-continue"
                                title="Once score is above average, immediately move on to next playlist item."
                            >
                                Auto-Continue
                            </label>
                        </span>
                        <span className="cb-field">
                            <input id="ignore-duration" type="checkbox" />
                            <label
                                htmlFor="ignore-duration"
                                title="If checked, will score a note if it's met and will not check duration."
                            >
                                Ignore Duration
                            </label>
                        </span>
                    </div>
                </div>
                <div className="row-fluid">
                    <div className="span12">
                        <ol id="playlist" className="list-group"></ol>
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
};

export default App;