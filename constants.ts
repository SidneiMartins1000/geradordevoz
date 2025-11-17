
import type { VoiceOption } from './types';

// Helper to distribute a limited set of API names among many voice options
const distributeApiNames = (names: string[], count: number) => {
  const result = [];
  for (let i = 0; i < count; i++) {
    result.push(names[i % names.length]);
  }
  return result as ('Kore' | 'Charon' | 'Puck' | 'Fenrir' | 'Zephyr')[];
};

const femaleApiNames = distributeApiNames(['Kore', 'Charon'], 17);
const maleApiNames = distributeApiNames(['Puck', 'Fenrir', 'Zephyr'], 19);
const avatarColors = [
    'bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500',
    'bg-indigo-500', 'bg-teal-500', 'bg-orange-500', 'bg-cyan-500'
];

export const VOICES: VoiceOption[] = [
  // New "Alex" like voice
  { id: 'm-alex', name: 'Alex (Similar)', gender: 'male', description: 'Voz masculina, clara e popular, ideal para narrações', apiName: 'Puck', avatarColor: avatarColors[1] },

  // Female Voices from images
  { id: 'f-1', name: 'Aoede', gender: 'female', description: 'Voz feminina, suave e melódica', apiName: femaleApiNames[0], avatarColor: avatarColors[0] },
  { id: 'f-2', name: 'Autonoe', gender: 'female', description: 'Voz feminina, clara e expressiva', apiName: femaleApiNames[1], avatarColor: avatarColors[1] },
  { id: 'f-3', name: 'Callirrhoe', gender: 'female', description: 'Voz feminina, graciosa e calma', apiName: femaleApiNames[2], avatarColor: avatarColors[2] },
  { id: 'f-4', name: 'Despina', gender: 'female', description: 'Voz feminina, jovem e energética', apiName: femaleApiNames[3], avatarColor: avatarColors[3] },
  { id: 'f-5', name: 'Erinome', gender: 'female', description: 'Voz feminina, madura e confiante', apiName: femaleApiNames[4], avatarColor: avatarColors[4] },
  { id: 'f-6', name: 'Kore', gender: 'female', description: 'Voz feminina, profissional e articulada', apiName: 'Kore', avatarColor: avatarColors[0] },
  { id: 'f-7', name: 'Laomedeia', gender: 'female', description: 'Voz feminina, gentil e amigável', apiName: femaleApiNames[6], avatarColor: avatarColors[5] },
  { id: 'f-8', name: 'Leda', gender: 'female', description: 'Voz feminina, direta e clara', apiName: femaleApiNames[7], avatarColor: avatarColors[6] },
  { id: 'f-9', name: 'Pulcherrima', gender: 'female', description: 'Voz feminina, elegante e sofisticada', apiName: femaleApiNames[8], avatarColor: avatarColors[7] },
  { id: 'f-10', name: 'Sadachbia', gender: 'female', description: 'Voz feminina, misteriosa e suave', apiName: femaleApiNames[9], avatarColor: avatarColors[8] },
  { id: 'f-11', name: 'Schedar', gender: 'female', description: 'Voz feminina, forte e ressonante', apiName: femaleApiNames[10], avatarColor: avatarColors[0] },
  { id: 'f-12', name: 'Sulafat', gender: 'female', description: 'Voz feminina, quente e acolhedora', apiName: femaleApiNames[11], avatarColor: avatarColors[1] },
  { id: 'f-13', name: 'Vindemiatrix', gender: 'female', description: 'Voz feminina, nítida e precisa', apiName: femaleApiNames[12], avatarColor: avatarColors[2] },
  { id: 'f-14', name: 'Zephyr (F)', gender: 'female', description: 'Voz feminina, leve e arejada', apiName: 'Kore', avatarColor: avatarColors[3] }, // Using a male apiName for variety if needed
  { id: 'f-15', name: 'Thalassa', gender: 'female', description: 'Voz feminina, profunda e calmante', apiName: femaleApiNames[14], avatarColor: avatarColors[4] },
  { id: 'f-16', name: 'Ersa', gender: 'female', description: 'Voz feminina, suave como o orvalho', apiName: femaleApiNames[15], avatarColor: avatarColors[5] },
  { id: 'f-17', name: 'Pandia', gender: 'female', description: 'Voz feminina, brilhante e clara', apiName: femaleApiNames[16], avatarColor: avatarColors[6] },

  // Male Voices from images
  { id: 'm-1', name: 'Achernar', gender: 'male', description: 'Voz masculina, profunda e autoritária', apiName: maleApiNames[0], avatarColor: avatarColors[0] },
  { id: 'm-2', name: 'Achird', gender: 'male', description: 'Voz masculina, calma e ponderada', apiName: maleApiNames[1], avatarColor: avatarColors[1] },
  { id: 'm-3', name: 'Algenib', gender: 'male', description: 'Voz masculina, clara e narrativa', apiName: maleApiNames[2], avatarColor: avatarColors[2] },
  { id: 'm-4', name: 'Algieba', gender: 'male', description: 'Voz masculina, amigável e conversacional', apiName: maleApiNames[3], avatarColor: avatarColors[3] },
  { id: 'm-5', name: 'Alnilam', gender: 'male', description: 'Voz masculina, forte e heroica', apiName: maleApiNames[4], avatarColor: avatarColors[4] },
  { id: 'm-6', name: 'Charon', gender: 'male', description: 'Voz masculina, grave e sombria', apiName: 'Fenrir', avatarColor: avatarColors[5] },
  { id: 'm-7', name: 'Enceladus', gender: 'male', description: 'Voz masculina, sábia e antiga', apiName: maleApiNames[6], avatarColor: avatarColors[6] },
  { id: 'm-8', name: 'Fenrir', gender: 'male', description: 'Voz masculina, assertiva e poderosa', apiName: 'Fenrir', avatarColor: avatarColors[7] },
  { id: 'm-9', name: 'Gacrux', gender: 'male', description: 'Voz masculina, estável e confiável', apiName: maleApiNames[8], avatarColor: avatarColors[8] },
  { id: 'm-10', name: 'Iapetus', gender: 'male', description: 'Voz masculina, ressonante e épica', apiName: maleApiNames[9], avatarColor: avatarColors[0] },
  { id: 'm-11', name: 'Orus', gender: 'male', description: 'Voz masculina, jovem e otimista', apiName: maleApiNames[10], avatarColor: avatarColors[1] },
  { id: 'm-12', name: 'Puck', gender: 'male', description: 'Voz masculina, enérgica e animada', apiName: 'Puck', avatarColor: avatarColors[2] },
  { id: 'm-13', name: 'Rasalgethi', gender: 'male', description: 'Voz masculina, rouca e experiente', apiName: maleApiNames[12], avatarColor: avatarColors[3] },
  { id: 'm-14', name: 'Sadaltager', gender: 'male', description: 'Voz masculina, formal e informativa', apiName: maleApiNames[13], avatarColor: avatarColors[4] },
  { id: 'm-15', name: 'Umbriel', gender: 'male', description: 'Voz masculina, suave e introspectiva', apiName: maleApiNames[14], avatarColor: avatarColors[5] },
  { id: 'm-16', name: 'Zubenelgenubi', gender: 'male', description: 'Voz masculina, única e distinta', apiName: maleApiNames[15], avatarColor: avatarColors[6] },
  { id: 'm-17', name: 'Zosma', gender: 'male', description: 'Voz masculina, estável e professoral', apiName: maleApiNames[16], avatarColor: avatarColors[7] },
  { id: 'm-18', name: 'Fornax', gender: 'male', description: 'Voz masculina, quente e grave', apiName: maleApiNames[17], avatarColor: avatarColors[8] },
  { id: 'm-19', name: 'Caelus', gender: 'male', description: 'Voz masculina, etérea e inspiradora', apiName: maleApiNames[18], avatarColor: avatarColors[0] },
];
