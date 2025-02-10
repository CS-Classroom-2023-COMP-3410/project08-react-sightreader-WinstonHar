// src/hooks/useAudioProcessing.js
import { useState, useEffect, useRef } from 'react';
import Pitchfinder from 'pitchfinder';

const MIN_VOLUME = 0.075;

const useAudioProcessing = (setCurrentMidiNumber) => {
  const [volume, setVolume] = useState(0);
  const audioContextRef = useRef(null);
  const sourceStreamRef = useRef(null);
  const pitchIntervalRef = useRef(null);
  const detectPitchRef = useRef(null);

  useEffect(() => {
    // Create an AudioContext when the hook mounts.
    audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const startMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      sourceStreamRef.current = stream;
      const sourceNode = audioContextRef.current.createMediaStreamSource(stream);
      // Create an analyser node for pitch detection.
      const analyser = audioContextRef.current.createAnalyser();
      sourceNode.connect(analyser);
      // Instantiate the pitch detector (using the YIN algorithm).
      detectPitchRef.current = new Pitchfinder.YIN({
        sampleRate: audioContextRef.current.sampleRate,
      });
      // Repeatedly get pitch data.
      pitchIntervalRef.current = setInterval(() => {
        const array = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(array);
        const freq = detectPitchRef.current(array);
        if (freq && freq > 0) {
          // Convert frequency to MIDI note (formula from the original code).
          const midi = Math.round(12 * (Math.log(freq / 440) / Math.log(2)) + 69);
          setCurrentMidiNumber(midi);
        } else {
          setCurrentMidiNumber(0);
        }
      }, 10);
    } catch (err) {
      console.error('Error accessing microphone:', err);
    }
  };

  const stopMic = () => {
    if (pitchIntervalRef.current) {
      clearInterval(pitchIntervalRef.current);
    }
    if (sourceStreamRef.current) {
      sourceStreamRef.current.getTracks().forEach((track) => track.stop());
    }
  };

  return { volume, startMic, stopMic, audioContext: audioContextRef.current };
};

export default useAudioProcessing;
