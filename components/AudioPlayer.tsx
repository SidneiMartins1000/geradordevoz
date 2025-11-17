
import React, { useRef, useEffect } from 'react';

interface AudioPlayerProps {
  src: string;
  speed: number;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({ src, speed }) => {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    // Define a velocidade de reprodução sempre que a velocidade ou a fonte do áudio mudam.
    // A reprodução automática foi removida para evitar que os áudios toquem sozinhos após a geração.
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }, [src, speed]);


  return (
    <div className="w-full">
      <audio ref={audioRef} controls src={src} className="w-full rounded-full">
        Seu navegador não suporta o elemento de áudio.
      </audio>
    </div>
  );
};

export default AudioPlayer;
