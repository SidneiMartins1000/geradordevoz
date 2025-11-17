
import React from 'react';

const Confetti: React.FC = () => {
  const confettiCount = 150;
  const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#cddc39', '#ffeb3b', '#ffc107', '#ff9800', '#ff5722'];

  return (
    <div className="confetti-container" aria-hidden="true">
      {Array.from({ length: confettiCount }).map((_, index) => (
        <div
          key={index}
          className="confetti"
          style={{
            left: `${Math.random() * 100}vw`,
            animationDelay: `${Math.random() * 3}s`,
            backgroundColor: colors[Math.floor(Math.random() * colors.length)],
            transform: `scale(${Math.random() * 0.75 + 0.25})`,
          }}
        />
      ))}
    </div>
  );
};

export default Confetti;
