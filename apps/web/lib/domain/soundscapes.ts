export type SoundPreset =
  | "off"
  | "brown"
  | "pink"
  | "rain"
  | "ocean"
  | "forest"
  | "fireplace"
  | "cafe"
  | "binaural"
  | "lofi";

export interface SoundscapeDefinition {
  id: SoundPreset;
  label: string;
  labelVi: string;
  description: string;
  descriptionVi: string;
}

export const SOUNDSCAPE_PRESETS: ReadonlyArray<SoundscapeDefinition> = [
  {
    id: "off",
    label: "Off",
    labelVi: "Tắt",
    description: "Audio muted",
    descriptionVi: "Đã tắt âm thanh",
  },
  {
    id: "brown",
    label: "Brown Noise",
    labelVi: "Tiếng ồn nâu",
    description: "Deep warm low-frequency rumble for blocking chatter.",
    descriptionVi: "Âm trầm ấm giúp che tiếng ồn xung quanh và dễ vào luồng.",
  },
  {
    id: "pink",
    label: "Pink Noise",
    labelVi: "Tiếng ồn hồng",
    description: "Balanced soft spectrum, gentler than white noise.",
    descriptionVi: "Dải âm cân bằng, êm tai hơn tiếng ồn trắng truyền thống.",
  },
  {
    id: "rain",
    label: "Steady Rain",
    labelVi: "Tiếng mưa",
    description: "Layered rainfall shimmer with subtle roof patter.",
    descriptionVi: "Tiếng mưa rơi đều kết hợp âm hạt mưa nhẹ trên mái.",
  },
  {
    id: "ocean",
    label: "Ocean Waves",
    labelVi: "Sóng biển",
    description: "Rhythmic 9-second coastal surf swelling in and out.",
    descriptionVi: "Nhịp sóng biển vỗ bờ đều đặn mỗi 9 giây giúp thư giãn.",
  },
  {
    id: "forest",
    label: "Forest Stream",
    labelVi: "Suối & Gió rừng",
    description: "Gentle woodland breeze with a rippling brook.",
    descriptionVi: "Gió thổi nhẹ qua tán cây hòa cùng tiếng suối chảy róc rách.",
  },
  {
    id: "fireplace",
    label: "Fireplace",
    labelVi: "Lò sưởi ấm",
    description: "Cozy hearth warmth with soft wood crackles.",
    descriptionVi: "Hơi ấm trầm dịu kèm tiếng củi cháy nổ lách tách nhẹ.",
  },
  {
    id: "cafe",
    label: "Study Café",
    labelVi: "Quán cà phê",
    description: "Soft ambient room tone with distant quiet murmur.",
    descriptionVi: "Không gian làm việc êm nhẹ như góc quán cà phê yên tĩnh.",
  },
  {
    id: "binaural",
    label: "Alpha Focus (10Hz)",
    labelVi: "Sóng Alpha 10Hz",
    description: "200Hz / 210Hz binaural beat cushioned in soft pink air (best with headphones).",
    descriptionVi: "Nhịp song âm 10Hz (200Hz/210Hz) hỗ trợ tập trung sâu (nên đeo tai nghe).",
  },
  {
    id: "lofi",
    label: "Ambient Pad",
    labelVi: "Nhạc nền êm",
    description: "Slow-breathing warm chord progression (Fmaj7 – Am7 – Dm9 – Cmaj7).",
    descriptionVi: "Hòa âm chậm rãi êm dịu (Fmaj7 – Am7 – Dm9 – Cmaj7) không gây xao nhãng.",
  },
];

/**
 * Paul Kellet refined pink noise coefficient filter state helper for unit testing
 * and Web Audio / PCM synthesis.
 */
export function generatePinkSample(
  white: number,
  state: { b0: number; b1: number; b2: number; b3: number; b4: number; b5: number; b6: number },
): number {
  state.b0 = 0.99886 * state.b0 + white * 0.0555179;
  state.b1 = 0.99332 * state.b1 + white * 0.0750759;
  state.b2 = 0.96900 * state.b2 + white * 0.1538520;
  state.b3 = 0.86650 * state.b3 + white * 0.3104856;
  state.b4 = 0.55000 * state.b4 + white * 0.5329522;
  state.b5 = -0.7616 * state.b5 - white * 0.0168980;
  const pink = state.b0 + state.b1 + state.b2 + state.b3 + state.b4 + state.b5 + state.b6 + white * 0.5362;
  state.b6 = white * 0.115926;
  return Math.max(-1, Math.min(1, pink * 0.11));
}
