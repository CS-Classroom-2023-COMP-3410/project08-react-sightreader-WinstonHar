import React, { useState, useRef, useCallback, useEffect } from 'react';
import ABCJS from 'abcjs';
import NotationDisplay from './NotationDisplay';
import Controls from './Controls';
import Playlist from './Playlist';
import StatusBar from './StatusBar';
import useAudioProcessing from './useAudioProcessing';

const DEFAULT_TEMPO = 60;
const DEFAULT_SCALE = 1.5;

const SightreaderApp = () => {
  // State for ABC file and playback
  const [abcString, setAbcString] = useState('');
  const [currentQpm, setCurrentQpm] = useState(DEFAULT_TEMPO);
  const [tunebook, setTunebook] = useState(null);
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState('Select a file or enter ABC text.');
  const [playlistFiles, setPlaylistFiles] = useState([]);
  const [playlistIndex, setPlaylistIndex] = useState(0);
  // State for pitch/score display (you might extend this to include detailed score stats)
  const [currentMidiNumber, setCurrentMidiNumber] = useState(0);
  const [expectedMidiNumber, setExpectedMidiNumber] = useState(0);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [profiles, setProfiles] = useState([{ value: 'default', name: 'Default Profile' }]);
  const [selectedProfile, setSelectedProfile] = useState('default');
  const [newProfile, setNewProfile] = useState('');

  // Refs for synth and (optionally) the ABCJS timing object
  const synthRef = useRef(null);
  const timerRef = useRef(null);

  // Use a custom hook for microphone and pitch processing.
  const { startMic, stopMic, volume, devices } = useAudioProcessing(setCurrentMidiNumber);

  // Compute milliseconds per beat/measure (used to configure synth timing)
  const getMillisecondsPerBeat = (qpm) => 60000 / qpm;
  const getMillisecondsPerMeasure = (qpm, tune) => {
    return tune.getBeatsPerMeasure() * getMillisecondsPerBeat(qpm);
  };

  // Called when ABC text is loaded or changed.
  const loadABC = useCallback((abcText) => {
    let qpm = DEFAULT_TEMPO;
    // Check for an override in the ABC text.
    const tempoMatch = abcText.match(/Q:\s*(\d+)/i);
    if (tempoMatch) {
      qpm = parseInt(tempoMatch[1]);
      // Remove the Q-line so it does not show up in the rendered notation.
      abcText = abcText.replace(/Q:\s*(\d+\n)/i, '');
    }
    setCurrentQpm(qpm);
    setAbcString(abcText);
    setStatus('ABC loaded. Press start to play.');

    // Render the ABC notation and store the tunebook.
    const book = ABCJS.renderAbc('notation', abcText, {
      responsive: "resize",
      scale: DEFAULT_SCALE,
      add_classes: true,
    });
    if (book && book[0]) {
      setTunebook(book[0]);
    }

    // Initialize (or reinitialize) the synth.
    if (!synthRef.current) {
      synthRef.current = new ABCJS.synth.CreateSynth();
    }
    synthRef.current
      .init({
        audioContext: new AudioContext(),
        visualObj: book[0],
        millisecondsPerMeasure: getMillisecondsPerMeasure(qpm, book[0]),
      })
      .then(() => {
        synthRef.current.prime().then(() => {
          setStatus('Synth primed. Ready to start.');
        });
      });
  }, []);

  // Handler for the start button.
  const handleStart = () => {
    if (!tunebook) {
      setStatus('No valid ABC loaded.');
      return;
    }
    if (recording) {
      handleStop();
      return;
    }
    // Here you might add a countdown (e.g. via setTimeout) before starting.
    setRecording(true);
    setStatus('Starting in 3…');
    setTimeout(() => {
      // Start mic, synth, and (if needed) the ABCJS timing callbacks.
      startMic(selectedDeviceId);
      if (synthRef.current) {
        synthRef.current.start();
      }
      setStatus('Playing.');
      // (Optionally) start a note–checker interval here to call your check_note logic.
    }, 3000);
  };

  // Stop playback, mic, and timing callbacks.
  const handleStop = () => {
    setRecording(false);
    stopMic();
    if (synthRef.current) {
      synthRef.current.stop();
    }
    setStatus('Stopped.');
  };

  // Reset score and ABC playback. (You can expand this to reset more state.)
  const handleReset = () => {
    setStatus('Resetting...');
    if (tunebook) {
      ABCJS.midi.restartPlaying();
      if (timerRef.current) {
        timerRef.current.reset();
      }
    }
  };

  // Handle device change
  const handleDeviceChange = (event) => {
    const deviceId = event.target.value;
    setSelectedDeviceId(deviceId);
    if (recording) {
      stopMic();
      startMic(deviceId);
    }
  };

  // Handle profile change
  const handleProfileChange = (event) => {
    const profileValue = event.target.value;
    if (profileValue === 'new') {
      setNewProfile('');
    } else {
      setSelectedProfile(profileValue);
    }
  };

  // Handle new profile creation
  const handleCreateProfile = (event) => {
    if (event.key === 'Enter' && newProfile.trim()) {
      const newProfileObj = { value: newProfile.trim(), name: newProfile.trim() };
      setProfiles([...profiles, newProfileObj]);
      setSelectedProfile(newProfile.trim());
      setNewProfile('');
    }
  };

  return (
    <div className="sightreader-app">
      <StatusBar message={status} />
      {/* NotationDisplay renders the ABCJS output */}
      <NotationDisplay abcString={abcString} />
      {/* Controls passes callbacks for file/ABC loading and playback */}
      <Controls
        onLoadABC={loadABC}
        onStart={handleStart}
        onStop={handleStop}
        onReset={handleReset}
        recording={recording}
        currentQpm={currentQpm}
      />
      {/* Playlist component (if you wish to load and manage playlists) */}
      <Playlist
        files={playlistFiles}
        currentIndex={playlistIndex}
        onSelect={(index) => setPlaylistIndex(index)}
      />
      {/* A simple display of expected/current note and volume */}
      <div className="note-display">
        Expected: {expectedMidiNumber} | Current: {currentMidiNumber}
      </div>
      <div className="volume-display">Volume: {Math.round(volume * 100)}</div>
      {/* Dropdown to select microphone device */}
      <select onChange={handleDeviceChange} value={selectedDeviceId || ''}>
        <option value="">Select Microphone</option>
        {devices.map(device => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label || `Microphone ${device.deviceId}`}
          </option>
        ))}
      </select>
      {/* Dropdown to select profile */}
      <select onChange={handleProfileChange} value={selectedProfile}>
        {profiles.map(profile => (
          <option key={profile.value} value={profile.value}>
            {profile.name}
          </option>
        ))}
        <option value="new">Create New Profile</option>
      </select>
      {selectedProfile === 'new' && (
        <input
          type="text"
          value={newProfile}
          onChange={(e) => setNewProfile(e.target.value)}
          onKeyDown={handleCreateProfile}
          placeholder="Enter name and press enter"
        />
      )}
    </div>
  );
};

export default SightreaderApp;