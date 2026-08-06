import pdfParse from "pdf-parse";
import { ocrImage } from "./ollama.service.js";

export type SectionKind = "heading" | "paragraph" | "list" | "quote" | "code";

export interface Section {
  kind: SectionKind;
  text: string;
  items?: string[];
  level?: number;
  preview: string;
}

const ANNOUNCE: Record<string, Record<string, string>> = {
  pt: { heading: "Título", list: "Lista com {n} itens", item: "Item", quote: "Citação", code: "Bloco de código com {n} linhas" },
  en: { heading: "Heading", list: "List with {n} items", item: "Item", quote: "Quote", code: "Code block with {n} lines" },
  es: { heading: "Título", list: "Lista con {n} elementos", item: "Elemento", quote: "Cita", code: "Bloque de código con {n} líneas" },
  fr: { heading: "Titre", list: "Liste de {n} éléments", item: "Élément", quote: "Citation", code: "Bloc de code de {n} lignes" },
  de: { heading: "Überschrift", list: "Liste mit {n} Einträgen", item: "Eintrag", quote: "Zitat", code: "Codeblock mit {n} Zeilen" },
  it: { heading: "Titolo", list: "Elenco con {n} voci", item: "Voce", quote: "Citazione", code: "Blocco di codice con {n} righe" },
  ja: { heading: "見出し", list: "{n}項目のリスト", item: "項目", quote: "引用", code: "{n}行のコードブロック" },
  zh: { heading: "标题", list: "包含{n}项的列表", item: "第", quote: "引用", code: "{n}行代码块" },
  ru: { heading: "Заголовок", list: "Список из {n} пунктов", item: "Пункт", quote: "Цитата", code: "Блок кода из {n} строк" },
};

const MD_HEADING = /^(#{1,6})\s+(.*\S)\s*$/;
const BULLET = /^\s*(?:[-*•·–]|\d{1,3}[.)])\s+(.+)$/;
const QUOTE_LINE = /^\s*>\s?(.*)$/;
const FENCE = /^\s*```/;
const DECORATIVE = /^[\s\-=_*~#•.]+$/;
const HAS_SPEAKABLE = /\w/u;

export async function extractText(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
  const isImage = mimeType.startsWith("image/") || /\.(png|jpe?g|webp|bmp)$/i.test(filename);
  const isPdf = mimeType === "application/pdf" || filename.endsWith(".pdf");

  if (isImage) {
    const text = await ocrImage(buffer);
    if (!text.trim()) {
      throw new Error("Não foi possível ler texto nesta imagem. Tente uma foto mais clara e enquadrada.");
    }
    return text;
  }

  if (isPdf) {
    try {
      const data = await pdfParse(buffer);
      const text = data.text.trim();
      if (text.length < 20) {
        throw new Error("Este PDF não possui camada de texto editável (PDF escaneado). Envie a imagem da página para OCR.");
      }
      return text;
    } catch (err: any) {
      if (err.message?.includes("PDF escaneado")) throw err;
      throw new Error("Não foi possível abrir este PDF. O arquivo pode estar corrompido ou protegido.");
    }
  }

  // Arquivo de texto (.txt, .md, .csv, .srt, etc.)
  const text = buffer.toString("utf-8");
  if (!text.trim()) {
    throw new Error("O arquivo enviado está vazio.");
  }
  return text;
}

function looksLikeHeading(line: string): boolean {
  const stripped = line.trim();
  if (stripped.length < 3 || stripped.length > 80) return false;
  if (".!?,;:".includes(stripped.slice(-1))) return false;
  const words = stripped.split(/\s+/);
  if (words.length > 12) return false;
  const letters = Array.from(stripped).filter((c) => /[a-zA-Z]/i.test(c));
  if (letters.length > 0 && letters.every((c) => c === c.toUpperCase())) return true;
  return /^\d+(\.\d+)*[.)]?\s+\S/.test(stripped);
}

export function parseSections(text: string): Section[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const sections: Section[] = [];
  let buf: string[] = [];
  let bullets: string[] = [];
  let bulletLines: string[] = [];
  let quotes: string[] = [];
  let code: string[] = [];
  let inCode = false;

  const makePreview = (kind: SectionKind, txt: string, items?: string[]): string => {
    const src = kind === "list" && items ? items.join("; ") : txt;
    const flat = src.split(/\s+/).join(" ");
    return flat.length <= 60 ? flat : flat.slice(0, 57) + "…";
  };

  const emitLine = (body: string) => {
    if (body && HAS_SPEAKABLE.test(body)) {
      const isHeading = looksLikeHeading(body);
      const kind: SectionKind = isHeading ? "heading" : "paragraph";
      sections.push({
        kind,
        text: body,
        level: isHeading ? 1 : 0,
        preview: makePreview(kind, body),
      });
    }
  };

  const flushParagraph = () => {
    if (buf.length > 0) {
      const body = buf.map((l) => l.trim()).join(" ").trim();
      if (buf.length === 1) {
        emitLine(body);
      } else if (body && HAS_SPEAKABLE.test(body)) {
        sections.push({
          kind: "paragraph",
          text: body,
          preview: makePreview("paragraph", body),
        });
      }
      buf = [];
    }
  };

  const flushBullets = () => {
    if (bullets.length > 0) {
      if (bullets.length === 1) {
        emitLine(bulletLines[0].trim());
      } else {
        const fullText = bullets.map((b) => `• ${b}`).join("\n");
        sections.push({
          kind: "list",
          text: fullText,
          items: [...bullets],
          preview: makePreview("list", fullText, bullets),
        });
      }
      bullets = [];
      bulletLines = [];
    }
  };

  const flushQuotes = () => {
    if (quotes.length > 0) {
      const body = quotes.join(" ").trim();
      if (body) {
        sections.push({
          kind: "quote",
          text: body,
          preview: makePreview("quote", body),
        });
      }
      quotes = [];
    }
  };

  const flushAll = () => {
    flushParagraph();
    flushBullets();
    flushQuotes();
  };

  for (const line of lines) {
    if (FENCE.test(line)) {
      if (inCode) {
        if (code.length > 0) {
          const body = code.join("\n");
          sections.push({
            kind: "code",
            text: body,
            preview: makePreview("code", body),
          });
        }
        code = [];
      } else {
        flushAll();
      }
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      code.push(line);
      continue;
    }

    if (!line.trim() || DECORATIVE.test(line)) {
      flushAll();
      continue;
    }

    const md = line.match(MD_HEADING);
    if (md) {
      flushAll();
      sections.push({
        kind: "heading",
        text: md[2],
        level: md[1].length,
        preview: makePreview("heading", md[2]),
      });
      continue;
    }

    const q = line.match(QUOTE_LINE);
    if (q) {
      flushParagraph();
      flushBullets();
      quotes.push(q[1].trim());
      continue;
    }
    flushQuotes();

    const b = line.match(BULLET);
    if (b) {
      flushParagraph();
      bullets.push(b[1].trim());
      bulletLines.push(line);
      continue;
    }
    flushBullets();

    buf.push(line);
  }

  if (inCode && code.length > 0) {
    const body = code.join("\n");
    sections.push({
      kind: "code",
      text: body,
      preview: makePreview("code", body),
    });
  }
  flushAll();

  return sections;
}

export function formatSpokenSection(section: Section, iso: string): string {
  const words = ANNOUNCE[iso] || ANNOUNCE["en"];

  if (section.kind === "heading") {
    return `${words.heading}: ${section.text}.`;
  }
  if (section.kind === "quote") {
    return `${words.quote}: ${section.text}`;
  }
  if (section.kind === "code") {
    const lineCount = section.text.split("\n").length || 1;
    return words.code.replace("{n}", String(lineCount)) + ".";
  }
  if (section.kind === "list" && section.items) {
    const header = words.list.replace("{n}", String(section.items.length));
    if (iso === "zh") {
      const body = section.items.map((t, i) => `${words.item}${i + 1}项：${t}。`).join(" ");
      return `${header}。${body}`;
    }
    if (iso === "ja") {
      const body = section.items.map((t, i) => `${words.item}${i + 1}：${t}。`).join(" ");
      return `${header}。${body}`;
    }
    const body = section.items.map((t, i) => `${words.item} ${i + 1}: ${t}.`).join(" ");
    return `${header}. ${body}`;
  }
  return section.text;
}
