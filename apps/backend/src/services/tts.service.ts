import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";
import crypto from "crypto";
import pino from "pino";

const execFileAsync = promisify(execFile);
const logger = pino({ name: "tts-service" });

const CHUNK_SIZE = 1800;
const HAS_SPEAKABLE = /\w/u;

function splitLongParagraph(para: string, size: number): string[] {
  let buf = "";
  const out: string[] = [];
  const sentences = para.replace(/\n/g, " ").split(". ");

  for (let sentence of sentences) {
    const piece = sentence.endsWith(".") || sentence.endsWith("!") || sentence.endsWith("?") ? sentence : sentence + ".";
    if (buf.length + piece.length + 1 > size) {
      if (buf) out.push(buf.trim());
      buf = piece;
    } else {
      buf = buf ? `${buf} ${piece}`.trim() : piece.trim();
    }
  }
  if (buf) out.push(buf.trim());
  return out;
}

export function splitTextForTts(text: string, size: number = CHUNK_SIZE): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const rawChunks: string[] = [];
  let buf = "";

  for (const para of trimmed.split("\n\n")) {
    const p = para.trim();
    if (!p) continue;

    if (p.length > size) {
      if (buf) {
        rawChunks.push(buf.trim());
        buf = "";
      }
      rawChunks.push(...splitLongParagraph(p, size));
      continue;
    }

    const candidate = buf ? `${buf}\n\n${p}` : p;
    if (candidate.length > size) {
      rawChunks.push(buf.trim());
      buf = p;
    } else {
      buf = candidate;
    }
  }

  if (buf) rawChunks.push(buf.trim());
  return rawChunks.filter((c) => HAS_SPEAKABLE.test(c));
}

async function synthesizeChunk(text: string, voice: string, rate: string): Promise<Buffer> {
  const tmpId = crypto.randomBytes(8).toString("hex");
  const tmpAudioPath = path.join(os.tmpdir(), `tts_${tmpId}.mp3`);

  try {
    // Invoke python edge-tts CLI: edge-tts --text "..." --voice "..." --rate "+0%" --write-media file.mp3
    await execFileAsync("edge-tts", [
      "--text", text,
      "--voice", voice,
      "--rate", rate,
      "--write-media", tmpAudioPath
    ]);

    const audioBuffer = await fs.readFile(tmpAudioPath);
    return audioBuffer;
  } catch (err: any) {
    logger.error({ err, text: text.slice(0, 50), voice, rate }, "Erro na síntese edge-tts");
    throw new Error(`Falha ao gerar áudio TTS: ${err.message}`);
  } finally {
    await fs.unlink(tmpAudioPath).catch(() => {});
  }
}

export async function synthesizeTts(text: string, voice: string, rate: string = "+0%"): Promise<Buffer> {
  const chunks = splitTextForTts(text);
  if (chunks.length === 0) {
    throw new Error("Texto sem conteúdo falável para sintetizar.");
  }

  logger.info({ charCount: text.length, chunkCount: chunks.length, voice, rate }, "Iniciando síntese TTS");

  const audioBuffers: Buffer[] = [];
  for (const chunk of chunks) {
    const buf = await synthesizeChunk(chunk, voice, rate);
    audioBuffers.push(buf);
  }

  return Buffer.concat(audioBuffers);
}
