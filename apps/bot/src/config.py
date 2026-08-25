"""
Configuração do bot — lida do ambiente.

Em produção o docker-compose injeta ../shared.env (infra comum do
LifeBusinessSuit) e depois o .env do app, nessa ordem: o do app vence.
Localmente, o load_dotenv() abaixo lê o .env da raiz do LBSTTSAPP.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

# Fora do Docker: procura o .env do app subindo a partir de apps/bot/src.
# Dentro do container o código fica em /app/src (sem esses níveis) e quem
# injeta o ambiente é o compose — daí o parents ser percorrido com cuidado.
for _parent in Path(__file__).resolve().parents:
    _candidate = _parent / ".env"
    if _candidate.is_file():
        load_dotenv(_candidate)
        break
load_dotenv()


def _unquote(value: str) -> str:
    """Tira aspas externas do valor.

    O padrão do shared.env é aspas simples em todo valor complexo. O Compose
    desfaz isso ao ler env_file, mas `docker run --env-file` e um `.env` lido
    direto não desfazem — sem isto, o token chega com as aspas grudadas e o
    aiogram rejeita com "Token is invalid!".
    """
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        return value[1:-1].strip()
    return value


def _env(*names: str, default: str = "") -> str:
    """Primeiro nome preenchido vence — permite aliases entre shared.env e .env."""
    for name in names:
        value = os.getenv(name)
        if value and value.strip():
            return _unquote(value)
    return default


def _int(*names: str, default: int) -> int:
    raw = _env(*names)
    try:
        return int(raw) if raw else default
    except ValueError:
        return default


# ── Telegram ────────────────────────────────────────────────────────────────
TOKEN = _env("TELEGRAM_BOT_TOKEN")
# Lista vazia = bot aberto. Preenchida = só esses IDs conversam com ele.
ALLOWED_USER_IDS = [
    int(x) for x in _env("ALLOWED_USER_IDS").split(",") if x.strip().lstrip("-").isdigit()
]

# ── Identidade central (LoginHUB) ───────────────────────────────────────────
# API interna do proprio backend — e ele quem guarda o vinculo telegram->hub e
# quem sabe a regra do passe de uso unico.
BACKEND_API_URL = _env("BACKEND_API_URL", default="http://lbs_ttsapp_backend:3000/api/v1").rstrip("/")
# Mesma chave do backend: e o que autoriza o bot em /api/v1/bot/*.
BOT_SERVICE_KEY = _env("BOT_SERVICE_KEY")

# ── Diretórios ──────────────────────────────────────────────────────────────
# tmp/  = áudio efêmero (apagado após enviar). data/ = preferências persistidas.
TMP_DIR = Path(_env("TMP_DIR", default="tmp"))
DATA_DIR = Path(_env("DATA_DIR", default="data"))

# ── Ollama (server_ollama na awl_network) ───────────────────────────────────
OLLAMA_URL = _env("OLLAMA_URL", "OLLAMA_BASE_URL", default="http://server_ollama:11434").rstrip("/")
# Modelo de TEXTO do ecossistema — vem do shared.env, igual em todos os apps
# (com 12GB só um modelo fica residente; compartilhar evita reload).
OLLAMA_TEXT_MODEL = _env("OLLAMA_TEXT_MODEL", default="qwen2.5vl:7b")
# Modelo de VISÃO (OCR de imagem). OLLAMA_MODEL fica de propósito FORA do
# shared.env — o nome colide entre apps —, então vem do .env deste app.
OLLAMA_VISION_MODEL = _env("OLLAMA_VISION_MODEL", "OLLAMA_MODEL", default=OLLAMA_TEXT_MODEL)
OLLAMA_KEEP_ALIVE = _env("OLLAMA_KEEP_ALIVE", default="30m")
OLLAMA_TIMEOUT = _int("OLLAMA_TIMEOUT", default=240)

# ── Padrões de usuário (sobrescritos por /idioma, /voz, /velocidade) ────────
DEFAULT_TARGET_LANG = _env("DEFAULT_TARGET_LANG", default="pt-BR")
DEFAULT_GENDER = _env("DEFAULT_GENDER", default="female")
DEFAULT_SPEED = _env("DEFAULT_SPEED", default="medium")

# ── Limites ─────────────────────────────────────────────────────────────────
# Texto acima disso é truncado antes de traduzir (protege o contexto do modelo).
MAX_INPUT_CHARS = _int("MAX_INPUT_CHARS", default=20000)
# A Bot API só deixa baixar arquivos até 20MB — não adianta aceitar mais.
MAX_FILE_BYTES = _int("MAX_FILE_MB", default=20) * 1024 * 1024
# Documento com até esse tamanho é lido inteiro de cara; acima disso o bot
# entrega seção por seção com os controles de navegação.
AUTOPLAY_MAX_CHARS = _int("AUTOPLAY_MAX_CHARS", default=1200)
