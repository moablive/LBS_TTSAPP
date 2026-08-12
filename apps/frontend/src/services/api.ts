import { Language, SpeedOption, TranslationResult } from "../types";

const API_BASE = "/api/v1/translate";

export async function fetchLanguages(): Promise<{ languages: Language[]; speeds: SpeedOption[] }> {
  const token = localStorage.getItem("token");
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${API_BASE}/languages`, { headers });
  if (!res.ok) throw new Error("Falha ao buscar idiomas.");
  return res.json();
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

  const token = localStorage.getItem("token");
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

  const res = await fetch(`${API_BASE}/process`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || "Erro ao processar tradução.");
  }

  return res.json();
}

export async function fetchSectionTtsAudio(
  spokenText: string,
  voice: string,
  speed: string
): Promise<Blob> {
  const token = localStorage.getItem("token");
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}/tts-section`, {
    method: "POST",
    headers,
    body: JSON.stringify({ text: spokenText, voice, speed }),
  });

  if (!res.ok) {
    throw new Error("Erro ao gerar áudio TTS para esta seção.");
  }

  return res.blob();
}
