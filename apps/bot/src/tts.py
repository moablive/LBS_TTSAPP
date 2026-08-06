"""
Síntese de voz via edge-tts (vozes neurais da Microsoft, grátis, sem API key).

O split_text é o mesmo do MailAPP/apps/tts-service — texto longo em uma única
chamada estoura o edge-tts, e blocos puramente decorativos ("-----") fazem ele
responder "No audio was received" e derrubar a requisição inteira.
"""
import asyncio
import logging
import re
from typing import List

import edge_tts

logger = logging.getLogger(__name__)

CHUNK_SIZE = 1800
HAS_SPEAKABLE = re.compile(r"\w", re.UNICODE)


def _split_long_paragraph(para: str, size: int) -> List[str]:
    """Parágrafo maior que `size`: quebra por frase, sem cortar palavras."""
    buf = ""
    out: List[str] = []
    for sentence in para.replace("\n", " ").split(". "):
        piece = sentence if sentence.endswith((".", "!", "?")) else sentence + "."
        if len(buf) + len(piece) + 1 > size:
            if buf:
                out.append(buf.strip())
            buf = piece
        else:
            buf = f"{buf} {piece}".strip()
    if buf:
        out.append(buf.strip())
    return out


def split_text(text: str, size: int = CHUNK_SIZE) -> List[str]:
    """Agrupa parágrafos em blocos de até `size` chars e descarta o que não tem
    nada falável."""
    text = text.strip()
    if not text:
        return []

    raw_chunks: List[str] = []
    buf = ""
    for para in text.split("\n\n"):
        para = para.strip()
        if not para:
            continue
        if len(para) > size:
            if buf:
                raw_chunks.append(buf.strip())
                buf = ""
            raw_chunks.extend(_split_long_paragraph(para, size))
            continue
        candidate = f"{buf}\n\n{para}" if buf else para
        if len(candidate) > size:
            raw_chunks.append(buf.strip())
            buf = para
        else:
            buf = candidate
    if buf:
        raw_chunks.append(buf.strip())

    return [c for c in raw_chunks if HAS_SPEAKABLE.search(c)]


async def _synth_chunk(text: str, voice: str, rate: str) -> bytes:
    communicate = edge_tts.Communicate(text, voice, rate=rate)
    parts: List[bytes] = []
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            parts.append(chunk["data"])
    return b"".join(parts)


async def synthesize(text: str, voice: str, rate: str = "+0%") -> bytes:
    """MP3 do texto inteiro. Levanta RuntimeError se não sobrar nada falável."""
    chunks = split_text(text)
    if not chunks:
        raise RuntimeError("texto sem conteúdo falável")

    logger.info("TTS: %d chars, %d bloco(s), voz=%s, rate=%s", len(text), len(chunks), voice, rate)
    # Sequencial de propósito: o edge-tts toma rate-limit quando paralelizado.
    parts = [await _synth_chunk(c, voice, rate) for c in chunks]
    # Concatenação binária de frames MPEG — mesmo codec/bitrate em todos os
    # blocos, sem ID3 no meio, então o player emenda sem ruído.
    return b"".join(parts)


async def synthesize_to_file(text: str, voice: str, rate: str, path) -> None:
    audio = await synthesize(text, voice, rate)
    await asyncio.to_thread(path.write_bytes, audio)
