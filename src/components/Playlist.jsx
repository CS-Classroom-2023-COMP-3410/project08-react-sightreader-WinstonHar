// src/components/Playlist.js
import React from 'react';

const Playlist = ({ files, currentIndex, onSelect }) => {
  return (
    <ol className="playlist list-group">
      {files.map((file, index) => (
        <li
          key={file}
          className={`list-group-item ${index === currentIndex ? 'active' : ''}`}
          onClick={() => onSelect(index)}
        >
          {file}
        </li>
      ))}
    </ol>
  );
};

export default Playlist;
