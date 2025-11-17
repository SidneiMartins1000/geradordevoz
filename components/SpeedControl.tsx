
import React from 'react';

interface SpeedControlProps {
  speed: number;
  onSpeedChange: (speed: number) => void;
}

const SpeedControl: React.FC<SpeedControlProps> = ({ speed, onSpeedChange }) => {
  return (
    <div className="flex items-center gap-4 w-full">
      <input
        type="range"
        min="0.5"
        max="2.0"
        step="0.1"
        value={speed}
        onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
        className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-red-500"
      />
      <div className="flex items-center gap-1 bg-gray-900 border border-gray-600 rounded-md px-2 py-1">
        <input
          type="number"
          min="0.5"
          max="2.0"
          step="0.1"
          value={speed.toFixed(1)}
          onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
          className="w-12 bg-transparent text-white text-center outline-none"
        />
        <span>x</span>
      </div>
    </div>
  );
};

export default SpeedControl;
