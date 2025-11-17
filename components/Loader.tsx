
import React from 'react';

interface LoaderProps {
    text?: string;
}

const Loader: React.FC<LoaderProps> = ({ text = "Carregando..." }) => {
  return (
    <div className="flex items-center justify-center space-x-2 mt-2 p-2">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-500"></div>
        <p className="text-red-400 text-sm">{text}</p>
    </div>
  );
};

export default Loader;
