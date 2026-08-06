"""
Extração de texto das entradas aceitas: imagem (OCR pelo modelo de visão),
PDF e arquivos de texto.

PDF é BÁSICO de propósito: lê a camada de texto com pypdf. PDF escaneado (só
imagem, sem camada de texto) não é rasterizado aqui — renderizar página a
página e mandar cada uma para um 7B de visão é lento e impreciso. Nesse caso o
bot avisa e sugere mandar as páginas como foto, que cai no caminho de OCR.
"""
import io
import logging
from typing import Tuple

from pypdf import PdfReader

from . import ai

logger = logging.getLogger(__name__)

TEXT_SUFFIXES = {".txt", ".md", ".markdown", ".csv", ".log", ".srt", ".rst"}
TEXT_MIMES = {"text/plain", "text/markdown", "text/csv"}
IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp", "image/bmp", "image/heic"}
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

# Abaixo disso a "camada de texto" é ruído de PDF escaneado, não conteúdo.
MIN_PDF_TEXT = 20


class ExtractionError(Exception):
    """Erro com mensagem já pronta para mostrar ao usuário."""


async def from_image(data: bytes) -> str:
    text = await ai.ocr_image(data)
    if not text.strip():
        raise ExtractionError(
            "Não consegui ler texto nessa imagem. Tente uma foto mais nítida, "
            "com o texto enquadrado e sem sombra."
        )
    return text


def from_pdf(data: bytes) -> Tuple[str, int]:
    """(texto, número de páginas). Levanta ExtractionError se não houver
    camada de texto."""
    try:
        reader = PdfReader(io.BytesIO(data))
    except Exception as exc:                       # noqa: BLE001
        logger.warning("PDF ilegível: %s", exc)
        raise ExtractionError("Não consegui abrir esse PDF — o arquivo parece corrompido.") from exc

    if reader.is_encrypted:
        # Muitos PDFs "protegidos" abrem com senha vazia; tenta antes de desistir.
        try:
            reader.decrypt("")
        except Exception:                          # noqa: BLE001
            raise ExtractionError("Esse PDF está protegido por senha.") from None

    pages = []
    for number, page in enumerate(reader.pages, 1):
        try:
            pages.append(page.extract_text() or "")
        except Exception as exc:                   # noqa: BLE001
            logger.warning("Página %d ilegível: %s", number, exc)

    text = "\n\n".join(p.strip() for p in pages if p.strip())
    if len(text.strip()) < MIN_PDF_TEXT:
        raise ExtractionError(
            "Esse PDF não tem camada de texto — provavelmente é um documento "
            "escaneado. Mande as páginas como <b>foto</b> que eu leio por OCR."
        )
    return text, len(reader.pages)


def from_text_file(data: bytes) -> str:
    for encoding in ("utf-8", "utf-8-sig", "latin-1"):
        try:
            text = data.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise ExtractionError("Não consegui decodificar esse arquivo de texto.")

    if not text.strip():
        raise ExtractionError("O arquivo está vazio.")
    return text


def classify(file_name: str, mime_type: str) -> str:
    """-> "image" | "pdf" | "text" | "unsupported" """
    name = (file_name or "").lower()
    mime = (mime_type or "").lower()

    if mime in IMAGE_MIMES or any(name.endswith(s) for s in IMAGE_SUFFIXES):
        return "image"
    if mime == "application/pdf" or name.endswith(".pdf"):
        return "pdf"
    if mime in TEXT_MIMES or mime.startswith("text/") or any(name.endswith(s) for s in TEXT_SUFFIXES):
        return "text"
    return "unsupported"
