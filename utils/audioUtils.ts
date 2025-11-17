

export function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
}

export function float32ToInt16(buffer: Float32Array): Int16Array {
    let l = buffer.length;
    let buf = new Int16Array(l);
    while (l--) {
        buf[l] = Math.min(1, buffer[l]) * 0x7FFF;
    }
    return buf;
}

export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    
    let result: Float32Array;
    if (numChannels === 2) {
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);
        result = new Float32Array(left.length + right.length);
        let index = 0, inputIndex = 0;
        while (index < result.length) {
            result[index++] = left[inputIndex];
            result[index++] = right[inputIndex];
            inputIndex++;
        }
    } else {
        result = buffer.getChannelData(0);
    }
    
    const pcmData = new ArrayBuffer(result.length * (bitDepth / 8));
    const view = new DataView(pcmData);
    floatTo16BitPCM(view, 0, result);
    
    const wavHeader = new ArrayBuffer(44);
    const headerView = new DataView(wavHeader);
    
    writeString(headerView, 0, 'RIFF');
    headerView.setUint32(4, 36 + pcmData.byteLength, true);
    writeString(headerView, 8, 'WAVE');
    writeString(headerView, 12, 'fmt ');
    headerView.setUint32(16, 16, true);
    headerView.setUint16(20, format, true);
    headerView.setUint16(22, numChannels, true);
    headerView.setUint32(24, sampleRate, true);
    headerView.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
    headerView.setUint16(32, numChannels * (bitDepth / 8), true);
    headerView.setUint16(34, bitDepth, true);
    writeString(headerView, 36, 'data');
    headerView.setUint32(40, pcmData.byteLength, true);
    
    return new Blob([headerView, view], { type: 'audio/wav' });
}