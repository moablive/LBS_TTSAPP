import { Language, SpeedOption, TranslationResult } from "../types";
import { api } from "@loginhub/api-client";

const API_BASE = "/api/v1/translate";

export async function fetchLanguages(): Promise<{ languages: Language[]; speeds: SpeedOption[] }> {
  const { data } = await api.get(`${API_BASE}/languages`);
  return data;
}

export async function processTranslation(options: {
  file?: File;
  text?: string;
  targetLang: string;
  gender: string;
  speed: string;
}): Promise<TranslationResult> {
  const formData = new FormData();
  if (options.file) {
    formData.append("file", options.file);
  }
  if (options.text) {
    formData.append("text", options.text);
  }
  formData.append("targetLang", options.targetLang);
  formData.append("gender", options.gender);
  formData.append("speed", options.speed);

  try {
    const { data } = await api.post(`${API_BASE}/process`, formData, {
      headers: {
        "Content-Type": "multipart/form-data"
      }
    });
    return data;
  } catch (error: any) {
    throw new Error(error.response?.data?.error || "Erro ao processar tradução.");
  }
}

export async function fetchSectionTtsAudio(
  spokenText: string,
  voice: string,
  speed: string
): Promise<Blob> {
  try {
    const { data } = await api.post(`${API_BASE}/tts-section`, 
      { text: spokenText, voice, speed },
      { responseType: 'blob' }
    );
    return data;
  } catch (error: any) {
    throw new Error("Erro ao gerar áudio TTS para esta seção.");
  }
}
