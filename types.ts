export type VoiceName = 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr';

export interface VoiceOption {
  id: string;
  name: string;
  gender: 'female' | 'male';
  description: string;
  apiName: VoiceName;
  avatarColor: string;
}

export interface TextBlock {
  id: string;
  text: string;
  voiceId: string;
  tone: string;
}

export interface GeneratedAudio {
    url: string;
    isLoading: boolean;
    error: string | null;
}