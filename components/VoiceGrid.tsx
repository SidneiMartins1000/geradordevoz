
import React, { useState } from 'react';
import type { VoiceOption } from '../types';
import { PlayIcon } from './Icon';
import Loader from './Loader';

interface VoiceGridProps {
  voices: VoiceOption[];
  selectedVoice: VoiceOption;
  onSelectVoice: (voice: VoiceOption) => void;
  onPreviewVoice: (voice: VoiceOption) => void;
  previews: Record<string, { url: string, isLoading: boolean }>;
}

const VoiceGrid: React.FC<VoiceGridProps> = ({ voices, selectedVoice, onSelectVoice, onPreviewVoice, previews }) => {
  const [filter, setFilter] = useState<'all' | 'male' | 'female'>('all');

  const filteredVoices = voices.filter(voice => {
    if (filter === 'all') return true;
    return voice.gender === filter;
  });

  const getButtonClasses = (buttonFilter: typeof filter) => {
    return `px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${
      filter === buttonFilter
        ? 'bg-red-600 text-white'
        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
    }`;
  };

  return (
    <div>
      <div className="flex justify-center gap-2 mb-6">
        <button onClick={() => setFilter('all')} className={getButtonClasses('all')}>
          Todos
        </button>
        <button onClick={() => setFilter('male')} className={getButtonClasses('male')}>
          Masculino
        </button>
        <button onClick={() => setFilter('female')} className={getButtonClasses('female')}>
          Feminino
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {filteredVoices.map(voice => {
          const isSelected = selectedVoice.id === voice.id;
          const previewState = previews[voice.id];

          return (
            <div
              key={voice.id}
              onClick={() => onSelectVoice(voice)}
              className={`p-4 rounded-lg cursor-pointer transition-all duration-200 ${
                isSelected
                  ? 'bg-red-600 shadow-lg ring-2 ring-red-400'
                  : 'bg-gray-700 hover:bg-gray-600 hover:scale-105'
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white ${voice.avatarColor}`}>
                  {voice.name.charAt(0)}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onPreviewVoice(voice);
                  }}
                  disabled={previewState?.isLoading}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-black bg-opacity-20 text-white hover:bg-opacity-40 transition-opacity disabled:opacity-50"
                  aria-label={`Preview voice ${voice.name}`}
                >
                    {previewState?.isLoading ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    ) : (
                        <PlayIcon className="w-5 h-5" />
                    )}
                </button>
              </div>
              <h3 className={`font-semibold ${isSelected ? 'text-white' : 'text-gray-200'}`}>{voice.name}</h3>
              <p className={`text-xs ${isSelected ? 'text-red-100' : 'text-gray-400'}`}>{voice.description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default VoiceGrid;
