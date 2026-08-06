import pino from "pino";

const logger = pino({ name: "ollama-service" });

const OLLAMA_URL = process.env.OLLAMA_URL || process.env.OLLAMA_BASE_URL || "http://server_ollama:11434";
const OLLAMA_TEXT_MODEL = process.env.OLLAMA_TEXT_MODEL || "qwen2.5vl:7b";
const OLLAMA_VISION_MODEL = process.env.OLLAMA_MODEL || process.env.OLLAMA_TEXT_MODEL || "qwen2.5vl:7b";
const OLLAMA_KEEP_ALIVE = process.env.OLLAMA_KEEP_ALIVE || "30m";
const OLLAMA_TIMEOUT = parseInt(process.env.OLLAMA_TIMEOUT || "240", 10) * 1000;

const BATCH_CHARS = 3000;

const TRANSLATIONS_SCHEMA = {
  type: "object",
  properties: {
    translations: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["translations"],
};

async function generate(
  prompt: string,
  options: {
    model?: string;
    images?: string[];
    temperature?: number;
    fmt?: any;
  } = {}
): Promise<string> {
  const payload: any = {
    model: options.model || OLLAMA_TEXT_MODEL,
    prompt,
    stream: false,
    keep_alive: OLLAMA_KEEP_ALIVE,
    options: { temperature: options.temperature ?? 0.1 },
  };

  if (options.images) payload.images = options.images;
  if (options.fmt) payload.format = options.fmt;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT);

  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Ollama HTTP ${res.status}`);
    }

    const data = (await res.json()) as any;
    return (data?.response || "").trim();
  } catch (err: any) {
    logger.error({ err }, "Erro na chamada ao Ollama");
    return "";
  } finally {
    clearTimeout(timer);
  }
}

function stripFences(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "");
  }
  return cleaned.trim();
}

export async function detectLanguage(text: string): Promise<string> {
  const sample = text.trim().slice(0, 600);
  if (!sample) return "unknown";

  const prompt =
    "Identify the language of the text below. " +
    'Answer with ONLY the two-letter ISO 639-1 code in lowercase (e.g. "pt", "en", "es", "ja"). ' +
    "No explanation, no punctuation, no quotes.\n\n" +
    `Text:\n${sample}\n\nCode:`;

  const raw = await generate(prompt);
  const match = stripFences(raw).toLowerCase().match(/[a-z]{2}/);
  return match ? match[0] : "unknown";
}

export async function translateBlocks(blocks: string[], targetName: string): Promise<string[]> {
  const out: string[] = new Array(blocks.length).fill("");
  let batchIndices: number[] = [];
  let currentSize = 0;

  const flush = async () => {
    if (batchIndices.length === 0) return;
    const currentBlocks = batchIndices.map((idx) => blocks[idx]);
    const translated = await translateBatch(currentBlocks, targetName);

    batchIndices.forEach((origIdx, pos) => {
      out[origIdx] = translated[pos] && translated[pos].trim() ? translated[pos] : blocks[origIdx];
    });

    batchIndices = [];
    currentSize = 0;
  };

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (!block.trim()) {
      out[i] = block;
      continue;
    }

    if (currentSize + block.length > BATCH_CHARS && batchIndices.length > 0) {
      await flush();
    }

    batchIndices.push(i);
    currentSize += block.length;
  }

  await flush();
  return out;
}

async function translateBatch(blocks: string[], targetName: string): Promise<string[]> {
  if (blocks.length === 0) return [];

  if (blocks.length === 1) {
    const prompt =
      `Translate the text below into ${targetName}.\n` +
      "Keep the meaning faithful and the tone natural. Preserve line breaks and " +
      "paragraph structure. Do NOT add notes, quotes, explanations or markdown fences.\n" +
      "Return ONLY the translation.\n\n" +
      `Text:\n${blocks[0]}\n\nTranslation:`;

    const result = stripFences(await generate(prompt, { temperature: 0.2 }));
    return [result || blocks[0]];
  }

  const prompt =
    `Translate every string of the JSON array below into ${targetName}.\n` +
    `Return JSON: {"translations": [...]} with EXACTLY ${blocks.length} strings, same order.\n` +
    "Translate the content only — do not merge, split, summarize, comment or add brackets.\n" +
    "Keep the meaning faithful, the tone natural and the line breaks inside each string.\n\n" +
    JSON.stringify(blocks, null, 1);

  const raw = await generate(prompt, { temperature: 0.2, fmt: TRANSLATIONS_SCHEMA });
  const parsed = parseTranslations(raw, blocks.length);
  if (parsed) return parsed;

  logger.warn({ count: blocks.length }, "Tradução em lote fora do formato — refazendo individualmente");
  const results: string[] = [];
  for (const block of blocks) {
    const single = await translateBatch([block], targetName);
    results.push(single[0]);
  }
  return results;
}

function parseTranslations(raw: string, expected: number): string[] | null {
  if (!raw.trim()) return null;
  try {
    const data = JSON.parse(stripFences(raw));
    const items = Array.isArray(data?.translations) ? data.translations : Array.isArray(data) ? data : null;
    if (!items || items.length !== expected) return null;
    const out = items.map((it: any) => String(it).trim());
    return out.every((s: string) => s.length > 0) ? out : null;
  } catch {
    return null;
  }
}

export async function ocrImage(imageBuffer: Buffer): Promise<string> {
  const base64Image = imageBuffer.toString("base64");
  const prompt =
    "Extract ALL the text visible in this image, exactly as written, in the original language. " +
    "Preserve line breaks, headings and list structure. " +
    "Do NOT translate, summarize, describe the image or add comments. " +
    "If there is no readable text, answer exactly: NO_TEXT";

  const raw = stripFences(
    await generate(prompt, { model: OLLAMA_VISION_MODEL, images: [base64Image] })
  );
  return raw.toUpperCase().startsWith("NO_TEXT") ? "" : raw;
}
