// src/components/NotationDisplay.js
import React, { useEffect } from 'react';
import ABCJS from 'abcjs';

const NotationDisplay = ({ abcString }) => {
  useEffect(() => {
    if (abcString) {
      // Render the notation into the element with id "notation"
      ABCJS.renderAbc('notation', abcString);
    }
  }, [abcString]);

  return <div id="notation" style={{ opacity: 0.5 }}></div>;
};

export default NotationDisplay;
