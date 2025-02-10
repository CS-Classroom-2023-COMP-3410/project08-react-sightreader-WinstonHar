// src/components/Controls.js
import React, { useState } from 'react';

const Controls = ({ onLoadABC, onStart, onStop, onReset, recording, currentQpm }) => {
  const [abcInput, setAbcInput] = useState('');

  const handleFileLoad = () => {
    // Here you could load from a file or use the text from the textarea.
    onLoadABC(abcInput);
  };

  return (
    <div className="controls">
      <textarea
        value={abcInput}
        onChange={(e) => setAbcInput(e.target.value)}
        placeholder="Enter ABC notation here..."
      ></textarea>
      <button onClick={handleFileLoad}>Load ABC</button>
      <select>
        <option value="">Tempo</option>
        <option value="30">30</option>
        <option value="60">60</option>
        <option value="90">90</option>
        <option value="120">120</option>
      </select>
      <button onClick={recording ? onStop : onStart}>
        {recording ? 'Stop' : 'Start'}
      </button>
      <button onClick={onReset}>Reset</button>
    </div>
  );
};

export default Controls;