import { Router, Request, Response } from "express";
import multer from "multer";
import { LANGUAGES, SPEEDS, getLanguage, getVoiceForLanguage, getRate } from "../languages.js";
import { extractText, parseSections, formatSpokenSection } from "../services/extract.service.js";
import { detectLanguage, translateBlocks } from "../services/ollama.service.js";
import { synthesizeTts } from "../services/tts.service.js";

const upload = multer({
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
});

export const translateRouter = Router();

// GET /api/v1/languages
translateRouter.get("/languages", (req: Request, res: Response) => {
  res.json({
    languages: Object.values(LANGUAGES),
    speeds: Object.entries(SPEEDS).map(([key, val]) => ({ key, ...val })),
  });
});

// POST /api/v1/translate/process
translateRouter.post("/process", upload.single("file"), async (req: Request, res: Response) => {
  try {
    const rawTextParam = req.body.text as string | undefined;
    const targetLangCode = (req.body.targetLang || "pt-BR") as string;
    const gender = (req.body.gender || "female") as string;
    const speed = (req.body.speed || "medium") as string;

    let sourceText = "";
    if (req.file) {
      sourceText = await extractText(req.file.buffer, req.file.mimetype, req.file.originalname);
    } else if (rawTextParam && rawTextParam.trim()) {
      sourceText = rawTextParam.trim();
    } else {
      return res.status(400).json({ error: "Nenhum arquivo ou texto fornecido." });
    }

    if (sourceText.length > 30000) {
      return res.status(400).json({ error: "O texto excede o limite máximo de 30.000 caracteres." });
    }

    // 1. Detect language
    const detectedIso = await detectLanguage(sourceText);
    const targetLangObj = getLanguage(targetLangCode);
    const targetIso = targetLangObj.iso;

    // 2. Parse sections from raw text
    const originalSections = parseSections(sourceText);

    // 3. Translate if detected language doesn't match target ISO
    let translatedSections = originalSections;
    if (detectedIso !== targetIso && detectedIso !== "unknown") {
      const blocksToTranslate = originalSections.map((s) => s.text);
      const translatedBlocks = await translateBlocks(blocksToTranslate, targetLangObj.name);

      translatedSections = originalSections.map((sec, idx) => {
        const transText = translatedBlocks[idx] || sec.text;
        const src = sec.kind === "list" && sec.items ? sec.items.join("; ") : transText;
        const flat = src.split(/\s+/).join(" ");
        const preview = flat.length <= 60 ? flat : flat.slice(0, 57) + "…";

        return {
          ...sec,
          text: transText,
          preview,
        };
      });
    }

    // 4. Format spoken text for each section
    const spokenSections = translatedSections.map((sec) => formatSpokenSection(sec, targetIso));

    return res.json({
      detectedLanguage: detectedIso,
      targetLanguage: targetLangObj,
      voice: getVoiceForLanguage(targetLangObj, gender),
      rate: getRate(speed),
      totalSections: translatedSections.length,
      originalText: sourceText,
      sections: translatedSections.map((sec, idx) => ({
        index: idx,
        kind: sec.kind,
        text: sec.text,
        preview: sec.preview,
        spokenText: spokenSections[idx],
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Erro no processamento do documento." });
  }
});

// POST /api/v1/translate/tts-section
translateRouter.post("/tts-section", async (req: Request, res: Response) => {
  try {
    const { text, voice, speed } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Texto falável ausente." });
    }

    const rate = getRate(speed || "medium");
    const voiceName = voice || "pt-BR-FranciscaNeural";

    const audioBuffer = await synthesizeTts(text, voiceName, rate);

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", audioBuffer.length);
    res.setHeader("Accept-Ranges", "bytes");
    return res.send(audioBuffer);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Erro ao sintetizar áudio." });
  }
});
