export interface Language {
  code: string;       // e.g. "pt-BR"
  iso: string;        // ISO 639-1, e.g. "pt"
  name: string;       // Name in UI
  flag: string;       // Flag emoji
  female: string;     // edge-tts female voice
  male: string;       // edge-tts male voice
}

export const LANGUAGES: Record<string, Language> = {
  "pt-BR": { code: "pt-BR", iso: "pt", name: "Português (Brasil)", flag: "🇧🇷", female: "pt-BR-FranciscaNeural", male: "pt-BR-AntonioNeural" },
  "pt-PT": { code: "pt-PT", iso: "pt", name: "Português (Portugal)", flag: "🇵🇹", female: "pt-PT-RaquelNeural", male: "pt-PT-DuarteNeural" },
  "en-US": { code: "en-US", iso: "en", name: "Inglês (EUA)", flag: "🇺🇸", female: "en-US-AriaNeural", male: "en-US-GuyNeural" },
  "en-GB": { code: "en-GB", iso: "en", name: "Inglês (Reino Unido)", flag: "🇬🇧", female: "en-GB-SoniaNeural", male: "en-GB-RyanNeural" },
  "es-ES": { code: "es-ES", iso: "es", name: "Espanhol (Espanha)", flag: "🇪🇸", female: "es-ES-ElviraNeural", male: "es-ES-AlvaroNeural" },
  "es-MX": { code: "es-MX", iso: "es", name: "Espanhol (México)", flag: "🇲🇽", female: "es-MX-DaliaNeural", male: "es-MX-JorgeNeural" },
  "fr-FR": { code: "fr-FR", iso: "fr", name: "Francês", flag: "🇫🇷", female: "fr-FR-DeniseNeural", male: "fr-FR-HenriNeural" },
  "de-DE": { code: "de-DE", iso: "de", name: "Alemão", flag: "🇩🇪", female: "de-DE-KatjaNeural", male: "de-DE-ConradNeural" },
  "it-IT": { code: "it-IT", iso: "it", name: "Italiano", flag: "🇮🇹", female: "it-IT-ElsaNeural", male: "it-IT-DiegoNeural" },
  "ja-JP": { code: "ja-JP", iso: "ja", name: "Japonês", flag: "🇯🇵", female: "ja-JP-NanamiNeural", male: "ja-JP-KeitaNeural" },
  "zh-CN": { code: "zh-CN", iso: "zh", name: "Chinês (Mandarim)", flag: "🇨🇳", female: "zh-CN-XiaoxiaoNeural", male: "zh-CN-YunxiNeural" },
  "ru-RU": { code: "ru-RU", iso: "ru", name: "Russo", flag: "🇷🇺", female: "ru-RU-SvetlanaNeural", male: "ru-RU-DmitryNeural" },
};

export const SPEEDS: Record<string, { label: string; rate: string }> = {
  slow: { label: "🐢 Lento", rate: "-25%" },
  medium: { label: "🚶 Médio", rate: "+0%" },
  fast: { label: "🐇 Rápido", rate: "+30%" },
};

export function getLanguage(code: string): Language {
  return LANGUAGES[code] || LANGUAGES["pt-BR"];
}

export function getVoiceForLanguage(lang: Language, gender: string): string {
  return gender === "male" ? lang.male : lang.female;
}

export function getRate(speed: string): string {
  return SPEEDS[speed]?.rate || "+0%";
}
