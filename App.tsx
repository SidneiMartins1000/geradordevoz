

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
import Confetti from './components/Confetti';
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
  const [apiKey, setApiKey] = useState<string>(() => sessionStorage.getItem('gemini-api-key') || '');
  const [showConfetti, setShowConfetti] = useState<boolean>(false);
  const [fullScript, setFullScript] = useState<string>('');
  const [charLimit, setCharLimit] = useState<string>('5000');
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

  const isKeyValid = apiKey.trim().length > 0;

  const handleApiKeyChange = (key: string) => {
    const wasEmpty = apiKey.trim().length === 0;
    setApiKey(key);
    sessionStorage.setItem('gemini-api-key', key);
    if (wasEmpty && key.trim().length > 0) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 5000); // Confetti lasts 5 seconds
    }
  };

  const handleRemoveKey = () => {
      setApiKey('');
      sessionStorage.removeItem('gemini-api-key');
  };

  const generateWithRetry = useCallback(async (params: GenerateContentParameters) => {
    if (!apiKey) {
      throw new Error("An API Key must be set when running in a browser");
    }
    const ai = new GoogleGenAI({ apiKey: apiKey });
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
  }, [apiKey]);

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

  const handleApplyVoiceToAll = useCallback(() => {
    if (distributedBlocks.length === 0) return;
    
    setDistributedBlocks(prevBlocks => 
      prevBlocks.map(block => ({ 
          ...block, 
          voiceId: selectedVoice.id,
      }))
    );
    setStatusMessage(`Voz padrão ('${selectedVoice.name}') aplicada a todos os ${distributedBlocks.length} blocos.`);
    setStatusType('success');
  }, [selectedVoice, distributedBlocks.length]);

  const handleApplyToneToAll = useCallback(() => {
    if (distributedBlocks.length === 0) return;
    
    setDistributedBlocks(prevBlocks => 
      prevBlocks.map(block => ({ 
          ...block,
          tone: tone,
      }))
    );
    setStatusMessage(`Tom padrão ('${tone}') aplicado a todos os ${distributedBlocks.length} blocos.`);
    setStatusType('success');
  }, [tone, distributedBlocks.length]);


  const handlePreviewVoice = useCallback(async (voice: VoiceOption) => {
    if (!apiKey) {
      setError("Por favor, insira sua Chave de API para pré-visualizar as vozes.");
      return;
    }
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
      if (errorMessage.includes('API key not valid') || errorMessage.includes('Requested entity was not found') || errorMessage.includes('API Key must be set')) {
          setError("Chave de API inválida. Por favor, verifique sua chave e tente novamente.");
      } else {
        setError("Falha ao pré-visualizar a voz. O modelo pode estar sobrecarregado.");
      }
      setVoicePreviews(prev => ({ ...prev, [voice.id]: { url: '', isLoading: false } }));
    }
  }, [voicePreviews, tone, generateWithRetry, apiKey]);
  
  const generateSingleAudio = useCallback(async (block: TextBlock) => {
    if (!apiKey) {
      setError("Por favor, insira sua Chave de API para gerar áudios.");
      setGeneratedAudios(prev => ({ ...prev, [block.id]: { url: '', isLoading: false, error: 'Chave de API não configurada.' } }));
      return;
    }

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
        if (errorMsg.includes('API key not valid') || errorMsg.includes('Requested entity was not found') || errorMsg.includes('API Key must be set')) {
            errorMsg = 'Chave de API inválida.';
            setError("Chave de API inválida. Por favor, verifique sua chave e tente gerar novamente.");
        } else if (errorMsg.includes('503') || errorMsg.includes('UNAVAILABLE')) {
            errorMsg = 'Modelo sobrecarregado. Tente novamente.';
        }
        setGeneratedAudios(prev => ({...prev, [block.id]: {url: '', isLoading: false, error: errorMsg}}));
    }
  }, [generateWithRetry, apiKey]);

  const handleGenerateAllAudios = useCallback(async () => {
    if (!apiKey) {
      setError("Por favor, insira sua Chave de API para gerar os áudios.");
      return;
    }

    setError(null);
    let blocksToProcess = [...distributedBlocks];

    if (blocksToProcess.length === 0) {
        if (!fullScript.trim()) {
            setStatusMessage('Por favor, insira um roteiro primeiro.');
            setStatusType('error');
            return;
        }

        let limit = parseInt(charLimit, 10);
        if (isNaN(limit) || limit < 10) limit = 10;
        else if (limit > 5000) limit = 5000;
        if (String(limit) !== charLimit) setCharLimit(String(limit));

        const newBlocksRaw = splitText(fullScript, limit);
        const newBlocks: TextBlock[] = newBlocksRaw.map((block, index) => ({
            id: `block-${Date.now()}-${index}`,
            text: block,
            voiceId: selectedVoice.id,
            tone: tone,
        }));

        if (newBlocks.length === 0) {
            setStatusMessage('O roteiro está vazio ou não pôde ser dividido.');
            setStatusType('error');
            return;
        }

        setDistributedBlocks(newBlocks);
        setGeneratedAudios({});
        blocksToProcess = newBlocks;
    }

    setIsGeneratingAll(true);
    setStatusMessage(`Gerando áudio para ${blocksToProcess.length} blocos...`);
    setStatusType('info');
    
    await Promise.allSettled(blocksToProcess.map(block => generateSingleAudio(block)));
    
    setIsGeneratingAll(false);
    setStatusMessage(`Geração de áudio concluída para ${blocksToProcess.length} blocos.`);
    setStatusType('success');
}, [fullScript, charLimit, distributedBlocks, selectedVoice, tone, generateSingleAudio, apiKey]);


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

  const handleDownloadSingleBlock = useCallback(async (blockId: string) => {
    const audioInfo = generatedAudios[blockId];
    const blockIndex = distributedBlocks.findIndex(b => b.id === blockId);

    if (!audioInfo?.url) {
        setError("Áudio não encontrado para este bloco.");
        return;
    }

    try {
        const response = await fetch(audioInfo.url);
        const blob = await response.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `narracao_bloco_${blockIndex + 1}.wav`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao baixar o áudio.");
    }
  }, [generatedAudios, distributedBlocks]);
  
  const hasGeneratedAudios = Object.values(generatedAudios).some(a => (a as GeneratedAudio).url);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-300 flex flex-col items-center p-4 sm:p-6 lg:p-8">
      {showConfetti && <Confetti />}
      <div className="w-full max-w-4xl mx-auto space-y-8">
        
        <Header />

        <div className="text-center">
            <a 
                href="https://mercadodigitalonline.net/promptautomatico/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block bg-gradient-to-r from-purple-500 to-indigo-600 text-white font-bold py-3 px-6 rounded-lg shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
            >
                ✨ Conheça o Prompt Automático
            </a>
        </div>
        
        <div className="mt-6 max-w-3xl mx-auto">
            <div className="aspect-video w-full rounded-lg overflow-hidden shadow-2xl shadow-red-900/20">
                <iframe 
                    className="w-full h-full"
                    src="https://www.youtube.com/embed/TxtORUFTiGE" 
                    title="YouTube video player" 
                    frameBorder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                    allowFullScreen>
                </iframe>
            </div>
        </div>

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
            <h2 className="text-xl font-bold text-white">0. Configuração da Chave de API</h2>
            {!isKeyValid ? (
                <>
                    <p className="text-sm text-gray-400">
                        Sua Chave de API do Google AI Studio é necessária. Ela é armazenada apenas no seu navegador nesta sessão.
                        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-red-400 hover:underline ml-1">
                            Obtenha sua chave aqui.
                        </a>
                    </p>
                    <div className="flex items-center gap-2">
                        <input
                            type="password"
                            id="api-key"
                            className="w-full bg-gray-700 border border-gray-600 rounded-md p-3 text-white focus:ring-red-500 focus:border-red-500"
                            placeholder="Cole sua Chave de API aqui"
                            value={apiKey}
                            onChange={(e) => handleApiKeyChange(e.target.value)}
                        />
                    </div>
                    {!apiKey && <p className="text-yellow-400 text-sm font-semibold">⚠️ Por favor, insira sua Chave de API para habilitar a geração de áudio.</p>}
                </>
            ) : (
                <div className="space-y-3">
                    <p className="text-green-400 text-sm font-semibold flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        Chave de API inserida com sucesso! A geração de áudio está habilitada.
                    </p>
                    <button 
                        onClick={handleRemoveKey} 
                        className="bg-gray-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition-colors text-sm"
                    >
                        Alterar Chave de API
                    </button>
                </div>
            )}
        </div>
        
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
                Separar e distribuir roteiro
            </button>
            {statusMessage && (
              <div className={`p-3 rounded-md text-center ${statusType === 'success' ? 'bg-green-900/50 border border-green-700 text-green-300' : 'bg-gray-700 text-gray-300'}`}>
                {statusMessage}
              </div>
            )}
        </div>

        <div className="bg-gray-800 p-6 rounded-lg shadow-lg space-y-4">
            <h2 className="text-xl font-bold text-white">2. Escolha uma voz padrão</h2>
            <p className="text-sm text-gray-400">Esta será a voz inicial para todos os blocos. Você poderá alterá-la individualmente mais tarde.</p>
            <VoiceGrid voices={VOICES} selectedVoice={selectedVoice} onSelectVoice={setSelectedVoice} onPreviewVoice={handlePreviewVoice} previews={voicePreviews}/>
            {distributedBlocks.length > 0 && (
              <div className="border-t border-gray-700 mt-4 pt-4">
                  <button 
                      onClick={handleApplyVoiceToAll} 
                      className="w-full bg-indigo-600 text-white font-bold py-2 px-4 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-indigo-500 transition-colors"
                  >
                      Aplicar Voz Padrão a Todos os Blocos
                  </button>
              </div>
            )}
        </div>

        <div className="bg-gray-800 p-6 rounded-lg shadow-lg space-y-4">
            <h2 className="text-xl font-bold text-white">3. Ajustes de Tom e Velocidade</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                  <label htmlFor="tone" className="block text-sm font-medium text-gray-300 mb-2">Escolha o Tom de Voz</label>
                  <select id="tone" value={tone} onChange={(e) => setTone(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white focus:ring-red-500 focus:border-red-500">
                      {Object.entries(TONE_PRESETS).map(([key, _]) => <option key={key} value={key}>{key.charAt(0).toUpperCase() + key.slice(1)}</option>)}
                  </select>
                  {distributedBlocks.length > 0 && (
                    <button
                      onClick={handleApplyToneToAll}
                      className="w-full mt-2 bg-indigo-600 text-white font-bold py-2 px-4 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-indigo-500 transition-colors text-sm"
                    >
                      Aplicar Tom Padrão a Todos os Blocos
                    </button>
                  )}
              </div>
              <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Velocidade da Fala ({speed.toFixed(1)}x)</label>
                  <SpeedControl speed={speed} onSpeedChange={setSpeed} />
              </div>
            </div>
        </div>

        {distributedBlocks.length > 0 && (
          <div className="bg-gray-800 p-6 rounded-lg shadow-lg space-y-6">
            <h2 className="text-xl font-bold text-white">4. Revise e gere os áudios individualmente</h2>
            
            <div className="space-y-4">
              {distributedBlocks.map((block, index) => {
                const audioInfo = generatedAudios[block.id];
                const blockCharLimit = 5000;
                return (
                  <div key={block.id} className="bg-gray-700 p-4 rounded-lg">
                    <label className="block text-sm font-medium text-gray-400 mb-1">Bloco {index + 1}</label>
                    <div className="relative">
                        <textarea 
                          value={block.text} 
                          onChange={e => handleUpdateBlock(block.id, {text: e.target.value})} 
                          className="w-full bg-gray-900/50 border border-gray-600 rounded-md p-2 text-white focus:ring-red-500 focus:border-red-500 resize-y" 
                          rows={4}
                          maxLength={blockCharLimit}
                        />
                        <span className={`absolute bottom-3 right-3 text-xs pointer-events-none ${
                            block.text.length >= blockCharLimit ? 'text-red-400 font-bold' : 'text-gray-400'
                        }`}>
                            {block.text.length} / {blockCharLimit}
                        </span>
                    </div>
                    
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
                    
                    <div className="mt-3 space-y-3">
                        {audioInfo?.url && !audioInfo.isLoading && (
                            <AudioPlayer src={audioInfo.url} speed={speed} />
                        )}
                        {audioInfo?.isLoading && <Loader text="Gerando áudio..." />}
                        {audioInfo?.error && <p className="text-red-400 text-sm">Erro: {audioInfo.error}</p>}

                        <div className="flex items-center gap-3">
                            <button onClick={() => generateSingleAudio(block)} disabled={audioInfo?.isLoading || !apiKey} className="w-full bg-gray-600 hover:bg-gray-500 disabled:bg-gray-800 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-md transition-colors text-sm">
                                {audioInfo?.isLoading ? 'Gerando...' : (audioInfo?.url ? 'Gerar Novamente' : 'Gerar Áudio')}
                            </button>
                            {audioInfo?.url && !audioInfo.isLoading && (
                                <button
                                    onClick={() => handleDownloadSingleBlock(block.id)}
                                    className="flex-shrink-0 bg-green-600 hover:bg-green-700 text-white font-bold p-2 rounded-md transition-colors"
                                    title={`Baixar áudio do bloco ${index + 1}`}
                                >
                                    <DownloadIcon className="w-5 h-5" />
                                </button>
                            )}
                        </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="bg-gray-800 p-6 rounded-lg shadow-lg space-y-4">
            <h2 className="text-xl font-bold text-white">{distributedBlocks.length > 0 ? '5. Geração Final' : '4. Geração Final'}</h2>
             <div className="border-t border-gray-700 pt-6 flex flex-col items-center gap-4">
                <button 
                    onClick={handleGenerateAllAudios} 
                    disabled={isGeneratingAll || !fullScript.trim() || !apiKey}
                    className="w-full max-w-sm bg-gradient-to-r from-red-600 to-orange-500 text-white font-bold py-3 px-5 rounded-lg shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
                >
                    {isGeneratingAll ? <><Loader text="Gerando..."/> Gerando...</> : (distributedBlocks.length > 0 ? 'Gerar/Regerar Todas as Narrações' : 'Gerar Todas as Narrações')}
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

      </div>
      <footer className="text-center text-gray-500 text-sm mt-8 pb-4">
        Desenvolvido por Sidnei Martins, Ferramentas Ilimitadas
      </footer>
    </div>
  );
};

export default App;
