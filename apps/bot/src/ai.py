"""
Cliente do Ollama (server_ollama na awl_network): detecção de idioma, tradução
e OCR de imagem.

Tradução é feita em LOTES, não uma chamada por seção: um PDF vira dezenas de
parágrafos e um round-trip por parágrafo num 7B levaria minutos.

O lote entra e sai como JSON com schema (`format` do Ollama, que restringe a
geração). Marcadores em texto puro foram tentados antes e o qwen2.5vl:7b não
os respeita — omitia o primeiro marcador ou parava no primeiro bloco. Se ainda
assim o array vier com tamanho errado, cai para tradução individual: mais
lenta, mas nunca perde nem desalinha texto.
"""
import asyncio
import base64
import json
import logging
import re
from typing import Any, Dict, List, Optional

import aiohttp

from . import config

logger = logging.getLogger(__name__)

# Lote de tradução: chars por requisição. 3000 cabe folgado no contexto do
# qwen2.5vl:7b junto com o prompt e a resposta.
BATCH_CHARS = 3000

TRANSLATIONS_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {"translations": {"type": "array", "items": {"type": "string"}}},
    "required": ["translations"],
}


async def _generate(
    prompt: str,
    *,
    model: Optional[str] = None,
    images: Optional[List[str]] = None,
    temperature: float = 0.1,
    fmt: Optional[Any] = None,
) -> str:
    payload: Dict[str, Any] = {
        "model": model or config.OLLAMA_TEXT_MODEL,
        "prompt": prompt,
        "stream": False,
        "keep_alive": config.OLLAMA_KEEP_ALIVE,
        "options": {"temperature": temperature},
    }
    if images:
        payload["images"] = images
    if fmt is not None:
        payload["format"] = fmt

    timeout = aiohttp.ClientTimeout(total=config.OLLAMA_TIMEOUT)
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(f"{config.OLLAMA_URL}/api/generate", json=payload) as resp:
                resp.raise_for_status()
                data = await resp.json()
                return (data.get("response") or "").strip()
    except asyncio.TimeoutError:
        logger.error("Ollama: timeout após %ss", config.OLLAMA_TIMEOUT)
        return ""
    except Exception as exc:                       # noqa: BLE001 — log e degrada
        logger.error("Ollama: %s", exc)
        return ""


def _strip_fences(text: str) -> str:
    """Modelo às vezes embrulha a resposta em ```; tira antes de usar."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
    return text.strip()


async def detect_language(text: str) -> str:
    """ISO 639-1 do texto, ou "unknown". Usa só o início: o idioma não muda no
    meio e mandar 20k chars só para detectar desperdiça contexto."""
    sample = text.strip()[:600]
    if not sample:
        return "unknown"

    prompt = (
        "Identify the language of the text below. "
        'Answer with ONLY the two-letter ISO 639-1 code in lowercase (e.g. "pt", "en", "es", "ja"). '
        "No explanation, no punctuation, no quotes.\n\n"
        f"Text:\n{sample}\n\nCode:"
    )
    raw = await _generate(prompt)
    match = re.search(r"[a-z]{2}", _strip_fences(raw).lower())
    return match.group(0) if match else "unknown"


async def translate(text: str, target_name: str) -> str:
    """Traduz preservando as quebras de parágrafo do original."""
    if not text.strip():
        return text
    result = await _translate_batch([text], target_name)
    return result[0] if result else text


async def translate_blocks(blocks: List[str], target_name: str) -> List[str]:
    """Traduz N blocos preservando a correspondência 1-para-1 com a entrada.

    Sempre devolve uma lista do mesmo tamanho — bloco que falha volta no
    original, para o usuário nunca perder conteúdo silenciosamente.
    """
    out: List[str] = [""] * len(blocks)
    batch: List[int] = []
    size = 0

    async def flush() -> None:
        nonlocal batch, size
        if not batch:
            return
        translated = await _translate_batch([blocks[i] for i in batch], target_name)
        for pos, idx in enumerate(batch):
            out[idx] = translated[pos] if pos < len(translated) and translated[pos].strip() else blocks[idx]
        batch, size = [], 0

    for i, block in enumerate(blocks):
        if not block.strip():
            out[i] = block
            continue
        if size + len(block) > BATCH_CHARS and batch:
            await flush()
        batch.append(i)
        size += len(block)
    await flush()
    return out


async def _translate_batch(blocks: List[str], target_name: str) -> List[str]:
    if not blocks:
        return []

    if len(blocks) == 1:
        prompt = (
            f"Translate the text below into {target_name}.\n"
            "Keep the meaning faithful and the tone natural. Preserve line breaks and "
            "paragraph structure. Do NOT add notes, quotes, explanations or markdown fences.\n"
            "Return ONLY the translation.\n\n"
            f"Text:\n{blocks[0]}\n\nTranslation:"
        )
        result = _strip_fences(await _generate(prompt, temperature=0.2))
        return [result or blocks[0]]

    prompt = (
        f"Translate every string of the JSON array below into {target_name}.\n"
        f'Return JSON: {{"translations": [...]}} with EXACTLY {len(blocks)} strings, same order.\n'
        "Translate the content only — do not merge, split, summarize, comment or add brackets.\n"
        "Keep the meaning faithful, the tone natural and the line breaks inside each string.\n\n"
        + json.dumps(blocks, ensure_ascii=False, indent=1)
    )
    raw = await _generate(prompt, temperature=0.2, fmt=TRANSLATIONS_SCHEMA)
    parsed = _parse_translations(raw, len(blocks))
    if parsed:
        return parsed

    # Array fora do tamanho: refaz um a um. Custa mais, mas mantém o alinhamento.
    logger.warning("Tradução em lote fora do formato (%d blocos) — refazendo individualmente", len(blocks))
    results = []
    for block in blocks:
        single = await _translate_batch([block], target_name)
        results.append(single[0])
    return results


def _parse_translations(raw: str, expected: int) -> Optional[List[str]]:
    """Extrai o array do JSON. None se não vier com o tamanho exato — deixar
    passar curto desalinharia as seções com o texto errado."""
    if not raw.strip():
        return None
    try:
        data = json.loads(_strip_fences(raw))
    except json.JSONDecodeError:
        return None

    items = data.get("translations") if isinstance(data, dict) else data
    if not isinstance(items, list) or len(items) != expected:
        return None

    out = [str(item).strip() for item in items]
    return out if all(out) else None


async def ocr_image(image_bytes: bytes) -> str:
    """Extrai o texto de uma imagem com o modelo de visão."""
    encoded = base64.b64encode(image_bytes).decode("ascii")
    prompt = (
        "Extract ALL the text visible in this image, exactly as written, in the original language. "
        "Preserve line breaks, headings and list structure. "
        "Do NOT translate, summarize, describe the image or add comments. "
        "If there is no readable text, answer exactly: NO_TEXT"
    )
    raw = _strip_fences(await _generate(prompt, model=config.OLLAMA_VISION_MODEL, images=[encoded]))
    return "" if raw.strip().upper().startswith("NO_TEXT") else raw
