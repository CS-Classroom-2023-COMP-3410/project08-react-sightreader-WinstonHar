import React from 'react';

const App = ({ title, profiles = [], files = [] }) => {
  return (
    <div>
      {/* The header/meta tags should be placed in public/index.html or handled with react-helmet */}
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
            <select id="devices"></select>
            <label htmlFor="profiles">Profile:</label>
            <select id="profiles">
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
            />
            <label htmlFor="file">File:</label>
            <select id="file">
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
              disabled
              title="Enable mic and begin playing along to sheet music."
            >
              Start
            </button>
            <button id="reset">Reset</button>
            <button id="tune" title="Enable mic and show pitch but don't play a game.">
              Tune
            </button>
          </div>
        </div>
        <div className="row-fluid" id="abc-textarea-container">
          <div className="span-12">
            <textarea id="abc-textarea"></textarea>
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
          <div className="span12" id="notation"></div>
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
            {/* The following images have been commented out in the original HTML */}
            {/*
            <img src="img/letter-s-icon.png" width="50" title="Start/Stop Game" />
            <img src="img/letter-r-icon.png" width="50" title="Reset Game" />
            <img src="img/letter-t-icon.png" width="50" title="Start/Stop Tuner" />
            <img src="img/letter-b-icon.png" width="50" title="Back One Playlist Item" />
            <img src="img/letter-n-icon.png" width="50" title="Next One Playlist Item" />
            */}
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
