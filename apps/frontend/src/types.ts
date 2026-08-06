export interface Language {
  code: string;
  iso: string;
  name: string;
  flag: string;
  female: string;
  male: string;
}

export interface SpeedOption {
  key: string;
  label: string;
  rate: string;
}

export interface SectionItem {
  index: number;
  kind: "heading" | "paragraph" | "list" | "quote" | "code";
  text: string;
  preview: string;
  spokenText: string;
}

export interface TranslationResult {
  detectedLanguage: string;
  targetLanguage: Language;
  voice: string;
  rate: string;
  totalSections: number;
  originalText: string;
  sections: SectionItem[];
}
