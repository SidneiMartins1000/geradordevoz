

import React, { useState, useCallback } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { VoiceOption, TextBlock, GeneratedAudio } from './types';
import { VOICES } from './constants';

import { Header } from './components/Header';
import { CopyIcon, DownloadIcon } from './components/Icon';
import VoiceGrid from './components/VoiceGrid';
import SpeedControl from './components/SpeedControl';
import Loader from './components/Loader';
import AudioPlayer from './components/AudioPlayer';
import { audioBufferToWavBlob, decode, decodeAudioData, float32ToInt16 } from './utils/audioUtils';
import { splitText } from './utils/textUtils';

declare global {
  interface Window {
    JSZip: any;
    lamejs: any;
  }
}

const TONE_PRESETS: Record<string, string> = {
  normal: '',
  feliz: 'Fale de forma feliz e animada: ',
  triste: 'Fale em um tom triste e melancólico: ',
  suspense: 'Fale em tom de suspense, quase sussurrando: ',
  irritado: 'Fale com um tom irritado e intenso: ',
  surpreso: 'Fale como se estivesse surpreso ou chocado: ',
  narrador: 'Narração calma e serena: ',
};


const App: React.FC = () => {
  const [fullScript, setFullScript] = useState<string>('');
  const [charLimit, setCharLimit] = useState<string>('5000');
  const [distributedBlocks, setDistributedBlocks] = useState<TextBlock[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>('');

  const [selectedVoice, setSelectedVoice] = useState<VoiceOption>(VOICES.find(v => v.id === 'm-alex')!);
  const [voicePreviews, setVoicePreviews] = useState<Record<string, { url: string; isLoading: boolean }>>({});

  const [speed, setSpeed] = useState<number>(1.0);
  const [tone, setTone] = useState<string>('normal');
  const [isConfigOpen, setIsConfigOpen] = useState(true);

  const [imagePrompts, setImagePrompts] = useState<string>('');
  const [isPromptLoading, setIsPromptLoading] = useState<boolean>(false);

  const [generatedAudios, setGeneratedAudios] = useState<Record<string, GeneratedAudio>>({});
  const [isGeneratingAll, setIsGeneratingAll] = useState<boolean>(false);
  const [isZipping, setIsZipping] = useState<boolean>(false);
  const [isMerging, setIsMerging] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);


  const handleSplitAndDistributeScript = useCallback(() => {
    if (!fullScript.trim()) {
      setStatusMessage('Por favor, insira um roteiro primeiro.');
      return;
    }

    let limit = parseInt(charLimit, 10);
    if (isNaN(limit) || limit < 10) {
        limit = 10;
    } else if (limit > 5000) {
        limit = 5000;
    }
    
    if (String(limit) !== charLimit) {
        setCharLimit(String(limit));
    }

    const blocks = splitText(fullScript, limit);
    const newBlocks: TextBlock[] = blocks.map((block, index) => ({
      id: `block-${Date.now()}-${index}`,
      text: block,
      voiceId: selectedVoice.id,
      tone: tone,
    }));
    setDistributedBlocks(newBlocks);
    setGeneratedAudios({});
    setStatusMessage(`Roteiro dividido e distribuído em ${newBlocks.length} blocos.`);
  }, [fullScript, charLimit, selectedVoice, tone]);

  const handlePreviewVoice = useCallback(async (voice: VoiceOption) => {
    if (voicePreviews[voice.id]?.url) {
      const audio = new Audio(voicePreviews[voice.id].url);
      audio.play();
      return;
    }

    setVoicePreviews(prev => ({ ...prev, [voice.id]: { url: '', isLoading: true } }));

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const textForPreview = `${TONE_PRESETS[tone]}Olá, esta é uma demonstração da minha voz.`;
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: textForPreview }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice.apiName },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContext, 24000, 1);
        const wavBlob = audioBufferToWavBlob(audioBuffer);
        const url = URL.createObjectURL(wavBlob);
        
        setVoicePreviews(prev => ({ ...prev, [voice.id]: { url, isLoading: false } }));
        const audio = new Audio(url);
        audio.play();
      }
    } catch (err) {
      console.error('Error previewing voice:', err);
      setVoicePreviews(prev => ({ ...prev, [voice.id]: { url: '', isLoading: false } }));
    }
  }, [voicePreviews, tone]);
  
  const handleGenerateImagePrompts = useCallback(async () => {
    if (!fullScript.trim()) {
      alert('Por favor, insira um roteiro completo primeiro.');
      return;
    }
    setIsPromptLoading(true);
    setImagePrompts('');
    setError(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const paragraphs = fullScript.split(/\n+/).filter(p => p.trim() !== '');
      
      const promptPromises = paragraphs.map(paragraph => {
        const promptInstruction = `Crie um prompt de imagem em inglês, curto e descritivo, para o texto a seguir. O prompt deve ser otimizado para modelos como Midjourney ou DALL-E. Retorne APENAS o texto do prompt, sem nenhuma introdução ou formatação extra. Texto: "${paragraph}"`;
        return ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: promptInstruction,
        });
      });

      const responses = await Promise.all(promptPromises);
      const prompts = responses.map(response => response.text.trim());
      
      setImagePrompts(prompts.join('\n\n'));
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Falha ao gerar prompts de imagem.');
    } finally {
      setIsPromptLoading(false);
    }
  }, [fullScript]);

  const generateSingleAudio = useCallback(async (block: TextBlock) => {
    setGeneratedAudios(prev => ({...prev, [block.id]: {url: '', isLoading: true, error: null}}));
    try {
        const voice = VOICES.find(v => v.id === block.voiceId);
        if (!voice) {
          throw new Error('Voz não encontrada para o bloco.');
        }

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const textToGenerate = `${TONE_PRESETS[block.tone]}${block.text}`;
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: textToGenerate }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: voice.apiName },
                    },
                },
            },
        });
        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
            const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContext, 24000, 1);
            const wavBlob = audioBufferToWavBlob(audioBuffer);
            const url = URL.createObjectURL(wavBlob);
            setGeneratedAudios(prev => ({...prev, [block.id]: {url, isLoading: false, error: null}}));
        } else {
            throw new Error('Resposta da API de áudio inválida.');
        }
    } catch (err) {
        console.error(`Error generating audio for block ${block.id}:`, err);
        const errorMsg = err instanceof Error ? err.message : 'Erro desconhecido.';
        setGeneratedAudios(prev => ({...prev, [block.id]: {url: '', isLoading: false, error: errorMsg}}));
    }
  }, []);

  const handleGenerateAllAudios = useCallback(async () => {
    if (distributedBlocks.length === 0) {
        alert('Nenhum bloco de texto para gerar.');
        return;
    }
    setIsGeneratingAll(true);
    setError(null);
    
    const generationPromises = distributedBlocks.map(block => generateSingleAudio(block));
    
    await Promise.allSettled(generationPromises);
    
    setIsGeneratingAll(false);
  }, [distributedBlocks, generateSingleAudio]);

  const handleDownloadAllAsZip = async () => {
    if (!window.JSZip) {
        setError("A biblioteca de compactação (JSZip) não foi carregada. Tente recarregar a página.");
        return;
    }
    
    setIsZipping(true);
    setError(null);
    try {
        const zip = new window.JSZip();
        
        const downloadPromises = distributedBlocks.map(async (block, index) => {
            const audioInfo = generatedAudios[block.id];
            if (audioInfo?.url) {
                const response = await fetch(audioInfo.url);
                if (!response.ok) {
                    throw new Error(`Falha ao buscar áudio para o bloco ${index + 1}`);
                }
                const blob = await response.blob();
                const fileName = `narracao_bloco_${index + 1}.wav`;
                zip.file(fileName, blob);
            }
        });
        
        await Promise.all(downloadPromises);
        
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(zipBlob);
        link.download = 'narracoes.zip';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        
    } catch (err) {
        console.error("Error creating ZIP file:", err);
        setError(err instanceof Error ? err.message : "Falha ao criar o arquivo ZIP.");
    } finally {
        setIsZipping(false);
    }
  };

  const handleDownloadSingleAudio = async () => {
    if (!window.lamejs) {
        setError("A biblioteca de codificação MP3 (LameJS) não foi carregada. Tente recarregar a página.");
        return;
    }

    setIsMerging(true);
    setError(null);

    try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const audioUrls = distributedBlocks
            .map(block => generatedAudios[block.id]?.url)
            .filter((url): url is string => !!url);

        if (audioUrls.length === 0) {
            throw new Error("Nenhum áudio foi gerado para unir.");
        }

        const audioBuffers = await Promise.all(
            audioUrls.map(async url => {
                const response = await fetch(url);
                const arrayBuffer = await response.arrayBuffer();
                return await audioContext.decodeAudioData(arrayBuffer);
            })
        );
        
        if (audioBuffers.length === 0) {
            throw new Error("Nenhum buffer de áudio pôde ser decodificado.");
        }

        const totalLength = audioBuffers.reduce((acc, buffer) => acc + buffer.length, 0);
        const sampleRate = audioBuffers[0].sampleRate;
        const numChannels = audioBuffers[0].numberOfChannels;
        
        const mergedBuffer = audioContext.createBuffer(numChannels, totalLength, sampleRate);
        let offset = 0;
        for (const buffer of audioBuffers) {
            for (let i = 0; i < numChannels; i++) {
                mergedBuffer.getChannelData(i).set(buffer.getChannelData(i), offset);
            }
            offset += buffer.length;
        }

        const pcmData = float32ToInt16(mergedBuffer.getChannelData(0));
        const mp3encoder = new window.lamejs.Mp3Encoder(numChannels, sampleRate, 128); // 128kbps
        const mp3Data = [];

        const bufferSize = 1152;
        for (let i = 0; i < pcmData.length; i += bufferSize) {
            const chunk = pcmData.subarray(i, i + bufferSize);
            const mp3buf = mp3encoder.encodeBuffer(chunk);
            if (mp3buf.length > 0) {
                mp3Data.push(mp3buf);
            }
        }
        const flushed = mp3encoder.flush();
        if (flushed.length > 0) {
            mp3Data.push(flushed);
        }

        const mp3Blob = new Blob(mp3Data.map(d => new Uint8Array(d)), { type: 'audio/mp3' });

        const link = document.createElement('a');
        link.href = URL.createObjectURL(mp3Blob);
        link.download = 'narracao_completa.mp3';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);

    } catch (err) {
        console.error("Error merging audio:", err);
        setError(err instanceof Error ? err.message : "Falha ao unir os arquivos de áudio.");
    } finally {
        setIsMerging(false);
    }
  };

  const hasGeneratedAudios = Object.values(generatedAudios).some((audio: GeneratedAudio) => audio.url && !audio.isLoading);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-300 flex flex-col items-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-4xl mx-auto space-y-8">
        <Header />
        <a href="https://mercadodigitalonline.net/promptautomatico/" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 w-full max-w-sm mx-auto py-3 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all duration-300 transform hover:scale-105 shadow-lg">
            <span className="text-2xl" role="img" aria-label="Pergaminho">📜</span>
            Conheça o Prompt Automático
        </a>

        {/* Step 1: Script Input */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">1. Insira seu roteiro completo</h2>
            <textarea
                value={fullScript}
                onChange={(e) => setFullScript(e.target.value)}
                placeholder="Cole seu roteiro aqui..."
                className="w-full h-40 p-3 bg-gray-900 border border-gray-600 rounded-md focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none"
            />
            <div className="mt-4">
                <label htmlFor="char-limit" className="block text-sm font-medium text-gray-400 mb-1">Limite de caracteres por bloco (10-5000)</label>
                <input
                    type="number"
                    id="char-limit"
                    value={charLimit}
                    onChange={(e) => setCharLimit(e.target.value)}
                    onBlur={(e) => {
                        let limit = parseInt(e.target.value, 10);
                        if (isNaN(limit) || limit < 10) {
                            limit = 10;
                        } else if (limit > 5000) {
                            limit = 5000;
                        }
                        setCharLimit(String(limit));
                    }}
                    className="w-40 p-2 bg-gray-900 border border-gray-600 rounded-md"
                />
            </div>
            <div className="mt-4">
                <button onClick={handleSplitAndDistributeScript} className="w-full py-2 px-4 bg-red-600 text-white font-semibold rounded-md hover:bg-red-700 transition-colors">Separar e Distribuir Roteiro</button>
            </div>
            {statusMessage && (
                <div className="mt-4 p-3 bg-green-900 border border-green-700 text-green-300 text-sm rounded-md">
                    {statusMessage}
                </div>
            )}
        </div>

        {/* Step 2: Voice Selection */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-2">2. Escolha uma voz padrão</h2>
            <p className="text-sm text-gray-400 mb-4">Esta será a voz inicial para todos os blocos. Você poderá alterá-la individualmente na Etapa 5.</p>
            <VoiceGrid 
                voices={VOICES}
                selectedVoice={selectedVoice}
                onSelectVoice={setSelectedVoice}
                onPreviewVoice={handlePreviewVoice}
                previews={voicePreviews}
            />
        </div>

        {/* Step 3: Model Config */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl">
             <button onClick={() => setIsConfigOpen(!isConfigOpen)} className="w-full flex justify-between items-center p-6 text-left">
                <h2 className="text-lg font-semibold text-white">3. Configurações do modelo</h2>
                <svg className={`w-5 h-5 transition-transform ${isConfigOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {isConfigOpen && (
                <div className="p-6 border-t border-gray-700 space-y-6">
                    <div>
                        <label className="text-gray-400 mb-2 block">Velocidade</label>
                        <SpeedControl speed={speed} onSpeedChange={setSpeed} />
                    </div>
                    <div>
                        <label htmlFor="tone-select" className="text-gray-400 mb-2 block">Tom de Voz Padrão</label>
                        <select
                            id="tone-select"
                            value={tone}
                            onChange={(e) => setTone(e.target.value)}
                            className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-2 focus:ring-red-500 focus:border-red-500"
                        >
                            <option value="normal">Normal</option>
                            <option value="feliz">Feliz / Animado</option>
                            <option value="triste">Triste / Melancólico</option>
                            <option value="suspense">Suspense / Sussurrado</option>
                            <option value="irritado">Irritado / Intenso</option>
                            <option value="surpreso">Surpreso / Chocado</option>
                            <option value="narrador">Narrador (Calmo)</option>
                        </select>
                    </div>
                </div>
            )}
        </div>

        {/* Step 4: Image Prompts */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-2">4. Gerar Prompts para Imagens (Opcional)</h2>
            <p className="text-sm text-gray-400 mb-4">Clique no botão para gerar prompts em inglês para cada bloco de texto preenchido. Útil para criar imagens consistentes com a sua narração.</p>
            <button onClick={handleGenerateImagePrompts} disabled={isPromptLoading} className="mb-4 py-2 px-4 bg-gray-600 text-white font-semibold rounded-md hover:bg-gray-700 transition-colors disabled:opacity-50">
                {isPromptLoading ? 'Gerando...' : 'Gerar Todos os Prompts'}
            </button>
            <div className="relative">
                <textarea
                    readOnly
                    value={imagePrompts}
                    placeholder="Prompts Gerados..."
                    className="w-full h-32 p-3 bg-gray-900 border border-gray-600 rounded-md resize-none"
                />
                {imagePrompts && (
                    <button onClick={() => navigator.clipboard.writeText(imagePrompts)} className="absolute top-2 right-2 p-1.5 bg-red-600 text-white rounded-md hover:bg-red-700">
                        <CopyIcon className="w-5 h-5"/>
                    </button>
                )}
            </div>
             {isPromptLoading && <Loader text="Gerando prompts..." />}
        </div>
        
        {/* Step 5: Review and Generate */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">5. Revise os blocos e gere os áudios</h2>
            <div className="space-y-6">
            {distributedBlocks.map((block, index) => {
                const audioInfo = generatedAudios[block.id];
                return (
                    <div key={block.id} className="bg-gray-900/50 p-4 rounded-lg">
                        <div className='flex justify-between items-center mb-2'>
                          <label className="block text-sm font-medium text-gray-300">Caixa de Texto #{index + 1}</label>
                          <div className='w-2/3 md:w-1/2 flex gap-2'>
                              <select
                                  value={block.tone}
                                  onChange={(e) => {
                                      const newBlocks = [...distributedBlocks];
                                      newBlocks[index].tone = e.target.value;
                                      setDistributedBlocks(newBlocks);
                                  }}
                                  className="w-full p-2 text-sm bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-2 focus:ring-red-500 focus:border-red-500"
                              >
                                  <option value="normal">Normal</option>
                                  <option value="feliz">Feliz</option>
                                  <option value="triste">Triste</option>
                                  <option value="suspense">Suspense</option>
                                  <option value="irritado">Irritado</option>
                                  <option value="surpreso">Surpreso</option>
                                  <option value="narrador">Narrador</option>
                              </select>
                              <select
                                  value={block.voiceId}
                                  onChange={(e) => {
                                      const newBlocks = [...distributedBlocks];
                                      newBlocks[index].voiceId = e.target.value;
                                      setDistributedBlocks(newBlocks);
                                  }}
                                  className="w-full p-2 text-sm bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-2 focus:ring-red-500 focus:border-red-500"
                              >
                                  {VOICES.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                              </select>
                          </div>
                        </div>

                        <textarea
                            value={block.text}
                            onChange={(e) => {
                                const newBlocks = [...distributedBlocks];
                                newBlocks[index].text = e.target.value;
                                setDistributedBlocks(newBlocks);
                            }}
                            className="w-full h-28 p-3 bg-gray-900 border border-gray-600 rounded-md resize-none"
                        />
                         <div className="mt-2 text-right text-xs text-gray-500">{block.text.length} / {charLimit}</div>

                         <div className="mt-2 flex items-center justify-between gap-4">
                            <div className="flex-grow flex items-center gap-2 min-w-0">
                                {audioInfo?.url && !audioInfo.isLoading && (
                                    <>
                                        <AudioPlayer src={audioInfo.url} speed={speed} />
                                        <a href={audioInfo.url} download={`narracao_bloco_${index+1}.wav`} className="p-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex-shrink-0">
                                            <DownloadIcon className="w-5 h-5" />
                                        </a>
                                    </>
                                )}
                                {audioInfo?.isLoading && <Loader text={`Gerando...`} />}
                            </div>

                            <div className="flex-shrink-0">
                                <button 
                                    onClick={() => generateSingleAudio(block)}
                                    disabled={audioInfo?.isLoading || !block.text.trim()}
                                    className="py-2 px-4 bg-gray-600 text-white text-sm font-semibold rounded-md hover:bg-gray-700 transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed"
                                >
                                    {audioInfo?.url ? 'Gerar Novamente' : 'Gerar Áudio'}
                                </button>
                            </div>
                        </div>
                        {audioInfo?.error && <p className="text-red-400 text-sm mt-1">{audioInfo.error}</p>}
                    </div>
                );
            })}
            </div>
        </div>

        {/* Final Action Buttons */}
        <div className="flex flex-col items-center">
            <button
              onClick={handleGenerateAllAudios}
              disabled={isGeneratingAll || distributedBlocks.length === 0}
              className="w-full max-w-md py-3 px-6 bg-gradient-to-r from-red-600 to-orange-500 text-white text-lg font-bold rounded-md hover:from-red-700 hover:to-orange-600 transition-all duration-300 transform hover:scale-105 shadow-lg disabled:from-gray-600 disabled:to-gray-700 disabled:opacity-70 disabled:cursor-not-allowed disabled:scale-100"
            >
              {isGeneratingAll ? 'Gerando Narrações...' : 'Gerar Todas as Narrações'}
            </button>

            {hasGeneratedAudios && (
                <div className="w-full max-w-md mt-4 flex flex-col sm:flex-row gap-4">
                    <button
                        onClick={handleDownloadAllAsZip}
                        disabled={isGeneratingAll || isZipping || isMerging}
                        className="w-full py-3 px-6 bg-gradient-to-r from-blue-600 to-teal-500 text-white text-lg font-bold rounded-md hover:from-blue-700 hover:to-teal-600 transition-all duration-300 transform hover:scale-105 shadow-lg disabled:from-gray-600 disabled:to-gray-700 disabled:opacity-70 disabled:cursor-not-allowed disabled:scale-100"
                    >
                        {isZipping ? 'Compactando...' : 'Baixar Todos (ZIP)'}
                    </button>
                    <button
                        onClick={handleDownloadSingleAudio}
                        disabled={isGeneratingAll || isZipping || isMerging}
                        className="w-full py-3 px-6 bg-gradient-to-r from-green-500 to-emerald-600 text-white text-lg font-bold rounded-md hover:from-green-600 hover:to-emerald-700 transition-all duration-300 transform hover:scale-105 shadow-lg disabled:from-gray-600 disabled:to-gray-700 disabled:opacity-70 disabled:cursor-not-allowed disabled:scale-100"
                    >
                        {isMerging ? 'Unindo Áudios...' : 'Baixar Áudio Único (MP3)'}
                    </button>
                </div>
            )}
            {error && <p className="text-red-400 text-center mt-4">{error}</p>}
        </div>

        <footer className="text-center text-sm text-gray-500 pt-8">
            Desenvolvido por Sidnei Martins, Ferramentas Ilimitadas
        </footer>
      </div>
    </div>
  );
};

export default App;
