import React, { useState, useCallback, useEffect } from 'react';
import { GoogleGenAI, Modality, GenerateContentParameters } from '@google/genai';
import { VoiceOption, TextBlock, GeneratedAudio } from './types';
import { VOICES } from './constants';

import { Header } from './components/Header';
import { DownloadIcon } from './components/Icon';
import VoiceGrid from './components/VoiceGrid';
import SpeedControl from './components/SpeedControl';
import Loader from './components/Loader';
import AudioPlayer from './components/AudioPlayer';
import { audioBufferToWavBlob, decode, decodeAudioData, float32ToInt16 } from './utils/audioUtils';
import { splitText } from './utils/textUtils';

// Fix: Define the AIStudio interface and use it for window.aistudio to resolve the type conflict.
// This aligns with an existing global type definition for window.aistudio.
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    JSZip: any;
    lamejs: any;
    aistudio?: AIStudio;
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
  const [charLimit, setCharLimit] = useState<string>('2500');
  const [distributedBlocks, setDistributedBlocks] = useState<TextBlock[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [statusType, setStatusType] = useState<'success' | 'info' | 'error'>('info');

  const [selectedVoice, setSelectedVoice] = useState<VoiceOption>(VOICES.find(v => v.id === 'm-alex')!);
  const [voicePreviews, setVoicePreviews] = useState<Record<string, { url: string; isLoading: boolean }>>({});

  const [speed, setSpeed] = useState<number>(1.0);
  const [tone, setTone] = useState<string>('normal');
  
  const [generatedAudios, setGeneratedAudios] = useState<Record<string, GeneratedAudio>>({});
  const [isGeneratingAll, setIsGeneratingAll] = useState<boolean>(false);
  const [isZipping, setIsZipping] = useState<boolean>(false);
  const [isMerging, setIsMerging] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);

  const generateWithRetry = useCallback(async (params: GenerateContentParameters) => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    let retries = 3;
    let delay = 1000;

    for (let i = 0; i < retries; i++) {
        try {
            const response = await ai.models.generateContent(params);
            return response;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            const isOverloaded = errorMessage.includes('503') || errorMessage.includes('UNAVAILABLE') || errorMessage.includes('overloaded');
            
            if (isOverloaded && i < retries - 1) {
                console.warn(`API is overloaded. Retrying in ${delay}ms... (Attempt ${i + 1}/${retries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // Exponential backoff
            } else {
                throw err; // Re-throw the error if it's not a retryable one or retries are exhausted
            }
        }
    }
    throw new Error("Falha na chamada da API após múltiplas tentativas.");
  }, []);

  const handleSplitAndDistributeScript = useCallback(() => {
    setError(null);
    if (!fullScript.trim()) {
      setStatusMessage('Por favor, insira um roteiro primeiro.');
      setStatusType('error');
      return;
    }

    let limit = parseInt(charLimit, 10);
    if (isNaN(limit) || limit < 10) limit = 10;
    else if (limit > 5000) limit = 5000;
    
    if (String(limit) !== charLimit) setCharLimit(String(limit));

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
    setStatusType('success');
  }, [fullScript, charLimit, selectedVoice, tone]);

  const handleUpdateBlock = useCallback((id: string, newProps: Partial<TextBlock>) => {
    setDistributedBlocks(prev => prev.map(b => b.id === id ? { ...b, ...newProps } : b));
  }, []);


  const handlePreviewVoice = useCallback(async (voice: VoiceOption) => {
    if (voicePreviews[voice.id]?.url) {
      const audio = new Audio(voicePreviews[voice.id].url);
      audio.play();
      return;
    }

    setVoicePreviews(prev => ({ ...prev, [voice.id]: { url: '', isLoading: true } }));

    try {
      const textForPreview = `${TONE_PRESETS[tone]}Olá, esta é uma demonstração da minha voz.`;
      const response = await generateWithRetry({
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
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (errorMessage.includes('API key not valid') || errorMessage.includes('Requested entity was not found')) {
          setError("Chave de API inválida. Por favor, selecione uma chave de API válida e tente novamente.");
      } else {
        setError("Falha ao pré-visualizar a voz. O modelo pode estar sobrecarregado.");
      }
      setVoicePreviews(prev => ({ ...prev, [voice.id]: { url: '', isLoading: false } }));
    }
  }, [voicePreviews, tone, generateWithRetry]);
  
  const generateSingleAudio = useCallback(async (block: TextBlock) => {
    setGeneratedAudios(prev => ({...prev, [block.id]: {url: '', isLoading: true, error: null}}));
    try {
        const voice = VOICES.find(v => v.id === block.voiceId);
        if (!voice) throw new Error('Voz não encontrada para o bloco.');

        const textToGenerate = `${TONE_PRESETS[block.tone]}${block.text}`;
        const response = await generateWithRetry({
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
        let errorMsg = err instanceof Error ? err.message : 'Erro desconhecido.';
        if (errorMsg.includes('API key not valid') || errorMsg.includes('Requested entity was not found')) {
            errorMsg = 'Chave de API inválida.';
            setError("Chave de API inválida. Por favor, selecione uma chave válida e tente gerar novamente.");
        } else if (errorMsg.includes('503') || errorMsg.includes('UNAVAILABLE')) {
            errorMsg = 'Modelo sobrecarregado. Tente novamente.';
        }
        setGeneratedAudios(prev => ({...prev, [block.id]: {url: '', isLoading: false, error: errorMsg}}));
    }
  }, [generateWithRetry]);

  const handleGenerateAllAudios = useCallback(async () => {
    if (distributedBlocks.length === 0) {
        alert('Nenhum bloco de texto para gerar.');
        return;
    }
    setIsGeneratingAll(true);
    setError(null);
    
    await Promise.allSettled(distributedBlocks.map(block => generateSingleAudio(block)));
    
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
        const generatedCount = distributedBlocks.filter(b => generatedAudios[b.id]?.url).length;
        if (generatedCount === 0) throw new Error("Nenhum áudio foi gerado para baixar.");
        
        await Promise.all(distributedBlocks.map(async (block, index) => {
            const audioInfo = generatedAudios[block.id];
            if (audioInfo?.url) {
                const response = await fetch(audioInfo.url);
                const blob = await response.blob();
                zip.file(`narracao_bloco_${index + 1}.wav`, blob);
            }
        }));
        
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(zipBlob);
        link.download = 'narracoes.zip';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
    } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao criar o arquivo ZIP.");
    } finally {
        setIsZipping(false);
    }
  };

  const handleDownloadSingleAudio = async () => {
    if (!window.lamejs) {
        setError("A biblioteca de codificação MP3 (LameJS) não foi carregada.");
        return;
    }

    setIsMerging(true);
    setError(null);
    try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const audioUrls = distributedBlocks.map(block => generatedAudios[block.id]?.url).filter(Boolean) as string[];

        if (audioUrls.length === 0) throw new Error("Nenhum áudio foi gerado para unir.");

        const audioBuffers = await Promise.all(
            audioUrls.map(url => fetch(url).then(res => res.arrayBuffer()).then(ab => audioContext.decodeAudioData(ab)))
        );
        
        const totalLength = audioBuffers.reduce((acc, buffer) => acc + buffer.length, 0);
        const sampleRate = audioBuffers[0].sampleRate;
        const numChannels = 1;
        
        const mergedBuffer = audioContext.createBuffer(numChannels, totalLength, sampleRate);
        let offset = 0;
        for (const buffer of audioBuffers) {
            mergedBuffer.getChannelData(0).set(buffer.getChannelData(0), offset);
            offset += buffer.length;
        }

        const pcmData = float32ToInt16(mergedBuffer.getChannelData(0));
        const mp3encoder = new window.lamejs.Mp3Encoder(numChannels, sampleRate, 128); // 128kbps
        // Fix: Explicitly type mp3Data and create the Blob without a redundant .map() call.
        const mp3Data: Int8Array[] = [];
        const bufferSize = 1152;
        for (let i = 0; i < pcmData.length; i += bufferSize) {
            const chunk = pcmData.subarray(i, i + bufferSize);
            const mp3buf = mp3encoder.encodeBuffer(chunk);
            if (mp3buf.length > 0) mp3Data.push(mp3buf);
        }
        const flushed = mp3encoder.flush();
        if (flushed.length > 0) mp3Data.push(flushed);

        const mp3Blob = new Blob(mp3Data, { type: 'audio/mp3' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(mp3Blob);
        link.download = 'narracao_completa.mp3';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao unir os arquivos de áudio.");
    } finally {
        setIsMerging(false);
    }
  };
  
  // Fix: The line number in the error was likely misleading. This type of error
  // often occurs when TypeScript's type inference fails, for instance with
  // Object.values in some environments. Casting the iterated item to the
  // correct type resolves the ambiguity.
  const hasGeneratedAudios = Object.values(generatedAudios).some(a => (a as GeneratedAudio).url);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-300 flex flex-col items-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-4xl mx-auto space-y-8">
        
        <Header />

        <div className="text-center">
            <button 
                onClick={() => setIsPromptModalOpen(true)}
                className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white font-bold py-3 px-6 rounded-lg shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
            >
                ✨ Conheça o Prompt Automático
            </button>
        </div>

        {isPromptModalOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50" onClick={() => setIsPromptModalOpen(false)}>
                <div className="bg-gray-800 rounded-lg p-8 max-w-lg w-full shadow-2xl" onClick={e => e.stopPropagation()}>
                    <h3 className="text-2xl font-bold text-white mb-4">Prompt Automático</h3>
                    <p className="text-gray-400 mb-6">
                        Esta é uma funcionalidade em desenvolvimento. Em breve, você poderá gerar roteiros automaticamente com base em um tópico ou ideia!
                    </p>
                    <button onClick={() => setIsPromptModalOpen(false)} className="w-full bg-red-600 text-white font-bold py-2 px-4 rounded-md hover:bg-red-700">
                        Fechar
                    </button>
                </div>
            </div>
        )}
        
        {error && (
            <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg relative" role="alert">
                <strong className="font-bold">Erro: </strong>
                <span className="block sm:inline">{error}</span>
                <span className="absolute top-0 bottom-0 right-0 px-4 py-3 cursor-pointer" onClick={() => setError(null)}>
                    <svg className="fill-current h-6 w-6 text-red-400" role="button" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><title>Fechar</title><path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697L11.819 10l2.651 3.151a1.2 1.2 0 0 1-.15 1.698z"/></svg>
                </span>
            </div>
        )}
        
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg space-y-4">
            <h2 className="text-xl font-bold text-white">1. Insira seu roteiro completo</h2>
            <textarea
                id="script"
                rows={8}
                className="w-full bg-gray-700 border border-gray-600 rounded-md p-3 text-white focus:ring-red-500 focus:border-red-500 resize-y"
                placeholder="Cole ou digite seu roteiro aqui..."
                value={fullScript}
                onChange={(e) => setFullScript(e.target.value)}
            />
            <div>
                <label htmlFor="char-limit" className="block text-sm font-medium text-gray-300 mb-1">Limite de caracteres por bloco (10-5000)</label>
                <input
                    id="char-limit"
                    type="number"
                    min="10" max="5000"
                    value={charLimit}
                    onChange={(e) => setCharLimit(e.target.value)}
                    className="w-48 bg-gray-700 border border-gray-600 rounded-md p-2 text-white focus:ring-red-500 focus:border-red-500"
                />
            </div>
            <button onClick={handleSplitAndDistributeScript} className="w-full bg-red-600 text-white font-bold py-3 px-4 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-red-500 transition-colors">
                Separar e Distribuir Roteiro
            </button>
            {statusMessage && (
              <div className={`p-3 rounded-md text-center ${statusType === 'success' ? 'bg-green-900/50 border border-green-700 text-green-300' : 'bg-gray-700 text-gray-300'}`}>
                {statusMessage}
              </div>
            )}
        </div>

        <div className="bg-gray-800 p-6 rounded-lg shadow-lg space-y-4">
            <h2 className="text-xl font-bold text-white">2. Escolha uma voz padrão</h2>
            <p className="text-sm text-gray-400">Esta será a voz inicial para todos os blocos. Você poderá alterá-la individualmente na Etapa 5.</p>
            <VoiceGrid voices={VOICES} selectedVoice={selectedVoice} onSelectVoice={setSelectedVoice} onPreviewVoice={handlePreviewVoice} previews={voicePreviews}/>
        </div>

        <div className="bg-gray-800 p-6 rounded-lg shadow-lg space-y-4">
            <h2 className="text-xl font-bold text-white">3. Ajustes de Tom e Velocidade</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                  <label htmlFor="tone" className="block text-sm font-medium text-gray-300 mb-2">Tom de Voz Padrão</label>
                  <select id="tone" value={tone} onChange={(e) => setTone(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white focus:ring-red-500 focus:border-red-500">
                      {Object.entries(TONE_PRESETS).map(([key, _]) => <option key={key} value={key}>{key.charAt(0).toUpperCase() + key.slice(1)}</option>)}
                  </select>
              </div>
              <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Velocidade da Fala ({speed.toFixed(1)}x)</label>
                  <SpeedControl speed={speed} onSpeedChange={setSpeed} />
              </div>
            </div>
        </div>

        {distributedBlocks.length > 0 && (
          <div className="bg-gray-800 p-6 rounded-lg shadow-lg space-y-6">
            <h2 className="text-xl font-bold text-white">5. Revise os blocos e gere os áudios</h2>
            
            <div className="space-y-4">
              {distributedBlocks.map((block, index) => {
                const audioInfo = generatedAudios[block.id];
                return (
                  <div key={block.id} className="bg-gray-700 p-4 rounded-lg">
                    <label className="block text-sm font-medium text-gray-400 mb-1">Bloco {index + 1}</label>
                    <textarea value={block.text} onChange={e => handleUpdateBlock(block.id, {text: e.target.value})} className="w-full bg-gray-900/50 border border-gray-600 rounded-md p-2 text-white focus:ring-red-500 focus:border-red-500 resize-y" rows={4}/>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">Voz</label>
                            <select value={block.voiceId} onChange={e => handleUpdateBlock(block.id, {voiceId: e.target.value})} className="w-full bg-gray-600 border border-gray-500 rounded-md p-2 text-white text-sm">
                                {VOICES.map(v => <option key={v.id} value={v.id}>{v.name} ({v.gender === 'male' ? 'M' : 'F'})</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">Tom</label>
                            <select value={block.tone} onChange={e => handleUpdateBlock(block.id, {tone: e.target.value})} className="w-full bg-gray-600 border border-gray-500 rounded-md p-2 text-white text-sm">
                                {Object.entries(TONE_PRESETS).map(([key, _]) => <option key={key} value={key}>{key.charAt(0).toUpperCase() + key.slice(1)}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-4">
                        {audioInfo?.url && !audioInfo.isLoading && (
                            <div className="w-full sm:w-2/3">
                                <AudioPlayer src={audioInfo.url} speed={speed} />
                            </div>
                        )}
                        {audioInfo?.isLoading && <Loader text="Gerando áudio..." />}
                        {audioInfo?.error && <p className="text-red-400 text-sm">Erro: {audioInfo.error}</p>}
                        
                        <button onClick={() => generateSingleAudio(block)} disabled={audioInfo?.isLoading} className="w-full sm:w-auto bg-gray-600 hover:bg-gray-500 disabled:bg-gray-800 text-white font-semibold py-2 px-4 rounded-md transition-colors text-sm flex-shrink-0">
                            {audioInfo?.isLoading ? 'Gerando...' : (audioInfo?.url ? 'Gerar Novamente' : 'Gerar Áudio')}
                        </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-gray-700 pt-6 flex flex-col items-center gap-4">
                <button onClick={handleGenerateAllAudios} disabled={isGeneratingAll} className="w-full max-w-sm bg-gray-700 text-white font-bold py-3 px-6 rounded-md hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                     {isGeneratingAll ? <><Loader text="Gerando..."/> Gerando...</> : 'Gerar Todas as Narrações'}
                </button>
                {hasGeneratedAudios && (
                  <div className="flex flex-col sm:flex-row gap-4 w-full max-w-sm">
                    <button onClick={handleDownloadAllAsZip} disabled={isZipping} className="flex-1 w-full bg-blue-600 text-white font-bold py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-blue-800 flex items-center justify-center gap-2">
                         {isZipping ? <><Loader text=""/>Compactando...</> : <><DownloadIcon className="w-5 h-5" /> Baixar (ZIP)</>}
                    </button>
                    <button onClick={handleDownloadSingleAudio} disabled={isMerging} className="flex-1 w-full bg-purple-600 text-white font-bold py-2 px-4 rounded-md hover:bg-purple-700 disabled:bg-purple-800 flex items-center justify-center gap-2">
                         {isMerging ? <><Loader text=""/>Unindo...</> : <><DownloadIcon className="w-5 h-5" /> Baixar (MP3)</>}
                    </button>
                  </div>
                )}
            </div>
          </div>
        )}
      </div>
      <footer className="text-center text-gray-500 text-sm mt-8 pb-4">
        Desenvolvido por Sidnei Martins, Ferramentas Ilimitadas
      </footer>
    </div>
  );
};

export default App;
