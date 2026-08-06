"""
LumoTranslate — bot do Telegram que recebe texto, imagem ou PDF, traduz para o
idioma preferido do usuário e devolve a leitura em áudio.

Entrada -> extração -> detecção de idioma -> tradução -> seções -> TTS.
Cada etapa vive no seu módulo; aqui é só a camada do Telegram.
"""
import asyncio
import html
import logging
import uuid
from typing import List, Optional

from aiogram import Bot, Dispatcher, F, types
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.filters import Command, CommandObject
from aiogram.types import (
    BotCommand,
    FSInputFile,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    ReplyKeyboardMarkup,
)

from . import ai, config, extract, reader, tts
from .languages import GENDERS, LANGUAGES, SPEEDS, get as get_lang, iso_name, rate_for, speed_label
from .reader import Section
from .state import Session, store

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("lumotranslate")

if not config.TOKEN:
    raise SystemExit("TELEGRAM_BOT_TOKEN ausente — confira o .env do LBSTTSAPP.")

bot = Bot(token=config.TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
dp = Dispatcher()

TELEGRAM_LIMIT = 4096
BTN_LANG, BTN_VOICE, BTN_SPEED = "🌐 Idioma", "🗣 Voz", "⚡ Velocidade"

MAIN_KEYBOARD = ReplyKeyboardMarkup(
    keyboard=[[KeyboardButton(text=BTN_LANG), KeyboardButton(text=BTN_VOICE), KeyboardButton(text=BTN_SPEED)]],
    resize_keyboard=True,
)


# ── Helpers ─────────────────────────────────────────────────────────────────
def allowed(user_id: Optional[int]) -> bool:
    if not config.ALLOWED_USER_IDS:
        return True
    return user_id in config.ALLOWED_USER_IDS


def esc(text: str) -> str:
    return html.escape(text, quote=False)


def chunk_message(text: str, limit: int = TELEGRAM_LIMIT - 100) -> List[str]:
    """Quebra em mensagens do tamanho do Telegram, preferindo cortar em
    parágrafo e depois em linha — cortar no meio de uma palavra fica feio."""
    out: List[str] = []
    remaining = text
    while len(remaining) > limit:
        cut = remaining.rfind("\n\n", 0, limit)
        if cut < limit // 2:
            cut = remaining.rfind("\n", 0, limit)
        if cut < limit // 2:
            cut = remaining.rfind(" ", 0, limit)
        if cut <= 0:
            cut = limit
        out.append(remaining[:cut].strip())
        remaining = remaining[cut:].strip()
    if remaining:
        out.append(remaining)
    return out


def nav_keyboard(session: Session) -> InlineKeyboardMarkup:
    rows = [
        [
            InlineKeyboardButton(text="⏮ Anterior", callback_data="nav:prev"),
            InlineKeyboardButton(text="🔁 Repetir", callback_data="nav:repeat"),
            InlineKeyboardButton(text="⏭ Próxima", callback_data="nav:next"),
        ],
        [
            InlineKeyboardButton(text="📚 Índice", callback_data="nav:index"),
            InlineKeyboardButton(text="▶️ Ler tudo", callback_data="nav:all"),
        ],
    ]
    if session.total <= 1:
        rows = rows[1:]          # documento de uma seção só: navegação não serve
    return InlineKeyboardMarkup(inline_keyboard=rows)


async def send_audio(
    chat_id: int, text: str, user_id: int, *, title: str, lang_code: Optional[str] = None
) -> bool:
    """Sintetiza e envia. False (com aviso no chat) se o TTS falhar.

    `lang_code` vem da sessão quando existe: se o usuário trocar o idioma no
    meio da leitura, o áudio das seções já traduzidas continua na voz certa.
    """
    prefs = store.prefs(user_id)
    lang = get_lang(lang_code or prefs.target_lang)
    path = config.TMP_DIR / f"{uuid.uuid4()}.mp3"
    try:
        await tts.synthesize_to_file(text, lang.voice(prefs.gender), rate_for(prefs.speed), path)
        await bot.send_audio(
            chat_id,
            FSInputFile(path, filename="leitura.mp3"),
            title=title[:64] or "Leitura",
            performer="LumoTranslate",
        )
        return True
    except Exception as exc:                       # noqa: BLE001
        logger.error("TTS falhou: %s", exc)
        await bot.send_message(chat_id, "⚠️ Não consegui gerar o áudio dessa parte.")
        return False
    finally:
        path.unlink(missing_ok=True)


async def speak_section(chat_id: int, session: Session, user_id: int, *, with_text: bool = True) -> None:
    section = session.current()
    if section is None:
        await bot.send_message(chat_id, "Nada para ler aqui.")
        return

    lang = get_lang(session.target_lang)
    header = f"{reader.ICONS.get(section.kind, '¶')} <b>Seção {session.index + 1}/{session.total}</b>"
    if with_text:
        body = f"{header}\n\n{esc(section.text)}"
        for part in chunk_message(body):
            await bot.send_message(chat_id, part)

    if not reader.is_speakable(section):
        await bot.send_message(chat_id, "(seção sem texto falável — pulei o áudio)")
    else:
        await send_audio(
            chat_id,
            reader.spoken(section, lang.iso),
            user_id,
            title=section.preview,
            lang_code=session.target_lang,
        )

    await bot.send_message(
        chat_id,
        f"Seção {session.index + 1} de {session.total}",
        reply_markup=nav_keyboard(session),
    )


# ── Pipeline principal ──────────────────────────────────────────────────────
async def process(message: types.Message, text: str, origin: str) -> None:
    user_id = message.from_user.id
    chat_id = message.chat.id
    prefs = store.prefs(user_id)
    target = get_lang(prefs.target_lang)

    truncated = False
    if len(text) > config.MAX_INPUT_CHARS:
        text = text[: config.MAX_INPUT_CHARS]
        truncated = True

    status = await message.answer("🔎 Detectando o idioma…")
    source_iso = await ai.detect_language(text)

    sections = reader.parse(text)
    if not sections:
        await status.edit_text("Não encontrei texto legível nisso.")
        return

    needs_translation = source_iso != target.iso
    if needs_translation:
        await status.edit_text(
            f"🌐 {esc(iso_name(source_iso))} → {target.flag} {esc(target.name)}\n"
            f"🧠 Traduzindo {len(sections)} seção(ões)…"
        )
        blocks = [s.text for s in sections]
        translated = await ai.translate_blocks(blocks, target.name)
        sections = _rebuild(sections, translated)
    else:
        await status.edit_text("✅ O texto já está no seu idioma — pulando a tradução.")

    session = store.set_session(
        user_id,
        Session(
            sections=sections,
            index=0,
            source_iso=source_iso,
            target_lang=prefs.target_lang,
            translated=needs_translation,
            original=text,
            origin=origin,
        ),
    )

    total_chars = sum(len(s.text) for s in sections)
    summary = [
        f"📄 <b>{esc(origin.capitalize())}</b> processado",
        f"🌐 {esc(iso_name(source_iso))} → {target.flag} {esc(target.name)}"
        if needs_translation
        else f"🌐 {target.flag} {esc(target.name)} (sem tradução)",
        f"🧩 {session.total} seção(ões) · {total_chars} caracteres",
        f"🗣 {GENDERS.get(prefs.gender, prefs.gender)} · {speed_label(prefs.speed)}",
    ]
    if truncated:
        summary.append(f"✂️ Texto cortado em {config.MAX_INPUT_CHARS} caracteres.")
    await status.edit_text("\n".join(summary))

    # Documento curto: entrega tudo de uma vez. Longo: seção a seção, para o
    # usuário não esperar minutos de síntese antes de ouvir a primeira frase.
    if total_chars <= config.AUTOPLAY_MAX_CHARS:
        full = session.full_text()
        for part in chunk_message(esc(full)):
            await message.answer(part)
        await send_audio(chat_id, reader.spoken_all(sections, target.iso), user_id, title=sections[0].preview)
        if session.total > 1:
            await message.answer("Controles de leitura:", reply_markup=nav_keyboard(session))
    else:
        await message.answer(
            "Documento longo — vou ler por seções. Use os botões para navegar, "
            "ou <b>▶️ Ler tudo</b> para o áudio completo."
        )
        await speak_section(chat_id, session, user_id)


def _rebuild(sections: List[Section], translated: List[str]) -> List[Section]:
    """Reconstrói as seções com o texto traduzido, mantendo tipo e nível.
    Listas voltam a ser itens — sem isso a leitura perde o "Item 1, Item 2"."""
    out: List[Section] = []
    for original, text in zip(sections, translated):
        if original.kind == reader.LIST:
            items = [line.lstrip("•-* \t") for line in text.splitlines() if line.strip()]
            out.append(Section(reader.LIST, text, items=items or original.items))
        elif original.kind == reader.CODE:
            out.append(original)               # código não se traduz
        else:
            out.append(Section(original.kind, text, level=original.level))
    return out


# ── Comandos ────────────────────────────────────────────────────────────────
HELP = """<b>LumoTranslate</b> — traduz e lê em voz alta.

<b>Mande para mim:</b>
• Texto em qualquer idioma
• Foto de um texto (leio por OCR)
• PDF com texto, .txt ou .md

<b>Comandos</b>
/idioma — idioma-alvo da tradução e da leitura
/voz — voz feminina ou masculina
/velocidade — lento, médio ou rápido
/config — mostra suas preferências
/indice — seções do último documento
/secao N — pula para a seção N
/tudo — lê o documento inteiro
/original — mostra o texto antes da tradução
/ajuda — esta mensagem

<b>Durante a leitura</b>
⏮ anterior · 🔁 repetir · ⏭ próxima · 📚 índice · ▶️ tudo
Para pausar, use o próprio player do Telegram no áudio."""


@dp.message(Command("start"))
async def cmd_start(message: types.Message) -> None:
    if not allowed(message.from_user.id):
        return
    prefs = store.prefs(message.from_user.id)
    lang = get_lang(prefs.target_lang)
    await message.answer(
        f"👋 Olá! Sou o <b>LumoTranslate</b>.\n\n"
        f"Mande texto, foto ou PDF que eu traduzo para {lang.flag} <b>{esc(lang.name)}</b> "
        f"e leio em voz alta.\n\n"
        f"Use /ajuda para ver tudo que eu faço.",
        reply_markup=MAIN_KEYBOARD,
    )


@dp.message(Command("ajuda", "help"))
async def cmd_help(message: types.Message) -> None:
    if not allowed(message.from_user.id):
        return
    await message.answer(HELP, reply_markup=MAIN_KEYBOARD)


@dp.message(Command("config"))
async def cmd_config(message: types.Message) -> None:
    if not allowed(message.from_user.id):
        return
    prefs = store.prefs(message.from_user.id)
    lang = get_lang(prefs.target_lang)
    session = store.session(message.from_user.id)
    lines = [
        "⚙️ <b>Suas preferências</b>",
        f"🌐 Idioma-alvo: {lang.flag} {esc(lang.name)}",
        f"🗣 Voz: {GENDERS.get(prefs.gender, prefs.gender)} (<code>{esc(lang.voice(prefs.gender))}</code>)",
        f"⚡ Velocidade: {speed_label(prefs.speed)} ({rate_for(prefs.speed)})",
    ]
    if session:
        lines.append(f"📄 Documento aberto: {session.total} seção(ões), na {session.index + 1}")
    await message.answer("\n".join(lines))


@dp.message(Command("idioma"))
@dp.message(F.text == BTN_LANG)
async def cmd_idioma(message: types.Message) -> None:
    if not allowed(message.from_user.id):
        return
    current = store.prefs(message.from_user.id).target_lang
    rows, row = [], []
    for code, lang in LANGUAGES.items():
        mark = "✅ " if code == current else ""
        row.append(InlineKeyboardButton(text=f"{mark}{lang.flag} {lang.name}", callback_data=f"lang:{code}"))
        if len(row) == 2:
            rows.append(row)
            row = []
    if row:
        rows.append(row)
    await message.answer(
        "🌐 Traduzir e ler em qual idioma?", reply_markup=InlineKeyboardMarkup(inline_keyboard=rows)
    )


@dp.message(Command("voz"))
@dp.message(F.text == BTN_VOICE)
async def cmd_voz(message: types.Message) -> None:
    if not allowed(message.from_user.id):
        return
    prefs = store.prefs(message.from_user.id)
    lang = get_lang(prefs.target_lang)
    rows = [
        [
            InlineKeyboardButton(
                text=("✅ " if key == prefs.gender else "") + label, callback_data=f"gender:{key}"
            )
            for key, label in GENDERS.items()
        ]
    ]
    await message.answer(
        f"🗣 Voz para {lang.flag} <b>{esc(lang.name)}</b>:",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=rows),
    )


@dp.message(Command("velocidade"))
@dp.message(F.text == BTN_SPEED)
async def cmd_velocidade(message: types.Message) -> None:
    if not allowed(message.from_user.id):
        return
    current = store.prefs(message.from_user.id).speed
    rows = [
        [
            InlineKeyboardButton(
                text=("✅ " if key == current else "") + label, callback_data=f"speed:{key}"
            )
            for key, (label, _) in SPEEDS.items()
        ]
    ]
    await message.answer("⚡ Velocidade da leitura:", reply_markup=InlineKeyboardMarkup(inline_keyboard=rows))


@dp.message(Command("indice"))
async def cmd_indice(message: types.Message) -> None:
    if not allowed(message.from_user.id):
        return
    session = store.session(message.from_user.id)
    if not session:
        await message.answer("Nenhum documento aberto. Mande um texto, foto ou PDF primeiro.")
        return
    body = f"📚 <b>Índice</b> ({session.total} seções)\n\n{reader.outline(session.sections, session.index)}"
    for part in chunk_message(body):
        await message.answer(part)


@dp.message(Command("secao"))
async def cmd_secao(message: types.Message, command: CommandObject) -> None:
    if not allowed(message.from_user.id):
        return
    session = store.session(message.from_user.id)
    if not session:
        await message.answer("Nenhum documento aberto.")
        return

    raw = (command.args or "").strip()
    if not raw.isdigit():
        await message.answer(f"Use <code>/secao N</code> — de 1 a {session.total}.")
        return
    number = int(raw)
    if not 1 <= number <= session.total:
        await message.answer(f"Esse documento tem {session.total} seção(ões).")
        return

    session.index = number - 1
    await speak_section(message.chat.id, session, message.from_user.id)


@dp.message(Command("tudo"))
async def cmd_tudo(message: types.Message) -> None:
    if not allowed(message.from_user.id):
        return
    await read_everything(message.chat.id, message.from_user.id)


@dp.message(Command("original"))
async def cmd_original(message: types.Message) -> None:
    if not allowed(message.from_user.id):
        return
    session = store.session(message.from_user.id)
    if not session or not session.original:
        await message.answer("Nenhum documento aberto.")
        return
    label = "📄 <b>Texto original</b>" + ("" if session.translated else " (não houve tradução)")
    for part in chunk_message(f"{label}\n\n{esc(session.original)}"):
        await message.answer(part)


async def read_everything(chat_id: int, user_id: int) -> None:
    session = store.session(user_id)
    if not session:
        await bot.send_message(chat_id, "Nenhum documento aberto.")
        return

    lang = get_lang(session.target_lang)
    full = reader.spoken_all(session.sections, lang.iso)
    if len(full) > 6000:
        await bot.send_message(chat_id, "▶️ Documento grande — a síntese pode levar um tempo. Já começando…")
    await send_audio(chat_id, full, user_id, title="Documento completo", lang_code=session.target_lang)


# ── Callbacks ───────────────────────────────────────────────────────────────
@dp.callback_query(F.data.startswith("lang:"))
async def cb_lang(callback: types.CallbackQuery) -> None:
    if not allowed(callback.from_user.id):
        await callback.answer("Não autorizado.", show_alert=True)
        return
    code = callback.data.split(":", 1)[1]
    if code not in LANGUAGES:
        await callback.answer("Idioma inválido.", show_alert=True)
        return
    store.update(callback.from_user.id, target_lang=code)
    lang = get_lang(code)
    await callback.message.edit_text(f"🌐 Idioma-alvo: {lang.flag} <b>{esc(lang.name)}</b>")
    await callback.answer()


@dp.callback_query(F.data.startswith("gender:"))
async def cb_gender(callback: types.CallbackQuery) -> None:
    if not allowed(callback.from_user.id):
        await callback.answer("Não autorizado.", show_alert=True)
        return
    gender = callback.data.split(":", 1)[1]
    if gender not in GENDERS:
        await callback.answer("Voz inválida.", show_alert=True)
        return
    prefs = store.update(callback.from_user.id, gender=gender)
    lang = get_lang(prefs.target_lang)
    await callback.message.edit_text(
        f"🗣 Voz: {GENDERS[gender]} — <code>{esc(lang.voice(gender))}</code>"
    )
    await callback.answer()


@dp.callback_query(F.data.startswith("speed:"))
async def cb_speed(callback: types.CallbackQuery) -> None:
    if not allowed(callback.from_user.id):
        await callback.answer("Não autorizado.", show_alert=True)
        return
    speed = callback.data.split(":", 1)[1]
    if speed not in SPEEDS:
        await callback.answer("Velocidade inválida.", show_alert=True)
        return
    store.update(callback.from_user.id, speed=speed)
    await callback.message.edit_text(f"⚡ Velocidade: {speed_label(speed)} ({rate_for(speed)})")
    await callback.answer()


@dp.callback_query(F.data.startswith("nav:"))
async def cb_nav(callback: types.CallbackQuery) -> None:
    user_id = callback.from_user.id
    if not allowed(user_id):
        await callback.answer("Não autorizado.", show_alert=True)
        return

    session = store.session(user_id)
    if not session:
        await callback.answer("Nenhum documento aberto — mande um texto novo.", show_alert=True)
        return

    action = callback.data.split(":", 1)[1]
    chat_id = callback.message.chat.id

    if action == "index":
        body = f"📚 <b>Índice</b> ({session.total} seções)\n\n{reader.outline(session.sections, session.index)}"
        for part in chunk_message(body):
            await bot.send_message(chat_id, part)
        await callback.answer()
        return

    if action == "all":
        await callback.answer("Gerando o áudio completo…")
        await read_everything(chat_id, user_id)
        return

    if action == "prev" and not session.move(-1):
        await callback.answer("Já está na primeira seção.", show_alert=True)
        return
    if action == "next" and not session.move(1):
        await callback.answer("Essa era a última seção.", show_alert=True)
        return

    await callback.answer()
    # Repetir não reenvia o texto — o usuário já leu, só quer ouvir de novo.
    await speak_section(chat_id, session, user_id, with_text=action != "repeat")


# ── Entradas ────────────────────────────────────────────────────────────────
@dp.message(F.photo)
async def handle_photo(message: types.Message) -> None:
    if not allowed(message.from_user.id):
        return
    status = await message.answer("👀 Lendo o texto da imagem (OCR)…")
    try:
        # photo[-1] = maior resolução disponível, melhor para OCR.
        buffer = await bot.download(message.photo[-1].file_id)
        text = await extract.from_image(buffer.read())
    except extract.ExtractionError as exc:
        await status.edit_text(f"⚠️ {exc}")
        return
    except Exception as exc:                       # noqa: BLE001
        logger.error("Falha no OCR da foto: %s", exc)
        await status.edit_text("⚠️ Não consegui processar essa imagem.")
        return

    await status.delete()
    await process(message, text, "imagem")


@dp.message(F.document)
async def handle_document(message: types.Message) -> None:
    if not allowed(message.from_user.id):
        return

    document = message.document
    kind = extract.classify(document.file_name or "", document.mime_type or "")
    if kind == "unsupported":
        await message.answer(
            "Formato não suportado. Mande <b>texto</b>, <b>foto</b>, <b>PDF</b>, "
            "<code>.txt</code> ou <code>.md</code>."
        )
        return
    if document.file_size and document.file_size > config.MAX_FILE_BYTES:
        await message.answer(
            f"Arquivo grande demais ({document.file_size // (1024 * 1024)}MB). "
            f"O limite da Bot API é {config.MAX_FILE_BYTES // (1024 * 1024)}MB."
        )
        return

    status = await message.answer("📥 Baixando o arquivo…")
    try:
        buffer = await bot.download(document.file_id)
        data = buffer.read()

        if kind == "image":
            await status.edit_text("👀 Lendo o texto da imagem (OCR)…")
            text, origin = await extract.from_image(data), "imagem"
        elif kind == "pdf":
            await status.edit_text("📖 Extraindo o texto do PDF…")
            text, pages = await asyncio.to_thread(extract.from_pdf, data)
            origin = f"PDF de {pages} página(s)"
        else:
            text, origin = extract.from_text_file(data), "arquivo"
    except extract.ExtractionError as exc:
        await status.edit_text(f"⚠️ {exc}")
        return
    except Exception as exc:                       # noqa: BLE001
        logger.error("Falha ao processar documento: %s", exc)
        await status.edit_text("⚠️ Não consegui processar esse arquivo.")
        return

    await status.delete()
    await process(message, text, origin)


@dp.message(F.text)
async def handle_text(message: types.Message) -> None:
    if not allowed(message.from_user.id):
        return
    text = (message.text or "").strip()
    if not text:
        return
    if text.startswith("/"):
        await message.answer("Comando desconhecido. Veja /ajuda.")
        return
    await process(message, text, "texto")


@dp.message(F.caption)
async def handle_caption(message: types.Message) -> None:
    """Mídia não suportada mas com legenda: trata a legenda como texto."""
    if not allowed(message.from_user.id):
        return
    await process(message, message.caption.strip(), "texto")


# ── Boot ────────────────────────────────────────────────────────────────────
async def main() -> None:
    config.TMP_DIR.mkdir(parents=True, exist_ok=True)
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)

    logger.info(
        "LumoTranslate subindo · ollama=%s texto=%s visão=%s · alvo padrão=%s · acesso=%s",
        config.OLLAMA_URL,
        config.OLLAMA_TEXT_MODEL,
        config.OLLAMA_VISION_MODEL,
        config.DEFAULT_TARGET_LANG,
        config.ALLOWED_USER_IDS or "aberto",
    )

    await bot.set_my_commands([
        BotCommand(command="start", description="Iniciar"),
        BotCommand(command="idioma", description="Idioma-alvo da tradução"),
        BotCommand(command="voz", description="Voz feminina ou masculina"),
        BotCommand(command="velocidade", description="Lento, médio ou rápido"),
        BotCommand(command="indice", description="Seções do documento"),
        BotCommand(command="tudo", description="Ler o documento inteiro"),
        BotCommand(command="original", description="Ver o texto original"),
        BotCommand(command="config", description="Suas preferências"),
        BotCommand(command="ajuda", description="Como usar"),
    ])
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
