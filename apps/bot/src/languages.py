"""
Catálogo de idiomas-alvo, vozes e velocidades.

Os ShortName do edge-tts abaixo foram conferidos contra `edge_tts.list_voices()`
— não invente nomes novos sem checar lá, o edge-tts falha em runtime com voz
inexistente e o usuário só vê "erro ao gerar áudio".
"""
from dataclasses import dataclass
from typing import Dict, Optional


@dataclass(frozen=True)
class Language:
    code: str          # código do catálogo (locale), ex.: "pt-BR"
    iso: str           # ISO 639-1, o que a detecção devolve, ex.: "pt"
    name: str          # nome exibido no menu
    flag: str
    female: str        # ShortName edge-tts
    male: str

    def voice(self, gender: str) -> str:
        return self.male if gender == "male" else self.female


# Ordem = ordem do menu /idioma.
LANGUAGES: Dict[str, Language] = {
    lang.code: lang
    for lang in [
        Language("pt-BR", "pt", "Português (Brasil)", "🇧🇷", "pt-BR-FranciscaNeural", "pt-BR-AntonioNeural"),
        Language("pt-PT", "pt", "Português (Portugal)", "🇵🇹", "pt-PT-RaquelNeural", "pt-PT-DuarteNeural"),
        Language("en-US", "en", "Inglês (EUA)", "🇺🇸", "en-US-AriaNeural", "en-US-GuyNeural"),
        Language("en-GB", "en", "Inglês (Reino Unido)", "🇬🇧", "en-GB-SoniaNeural", "en-GB-RyanNeural"),
        Language("es-ES", "es", "Espanhol (Espanha)", "🇪🇸", "es-ES-ElviraNeural", "es-ES-AlvaroNeural"),
        Language("es-MX", "es", "Espanhol (México)", "🇲🇽", "es-MX-DaliaNeural", "es-MX-JorgeNeural"),
        Language("fr-FR", "fr", "Francês", "🇫🇷", "fr-FR-DeniseNeural", "fr-FR-HenriNeural"),
        Language("de-DE", "de", "Alemão", "🇩🇪", "de-DE-KatjaNeural", "de-DE-ConradNeural"),
        Language("it-IT", "it", "Italiano", "🇮🇹", "it-IT-ElsaNeural", "it-IT-DiegoNeural"),
        Language("ja-JP", "ja", "Japonês", "🇯🇵", "ja-JP-NanamiNeural", "ja-JP-KeitaNeural"),
        Language("zh-CN", "zh", "Chinês (Mandarim)", "🇨🇳", "zh-CN-XiaoxiaoNeural", "zh-CN-YunxiNeural"),
        Language("ru-RU", "ru", "Russo", "🇷🇺", "ru-RU-SvetlanaNeural", "ru-RU-DmitryNeural"),
    ]
}

GENDERS = {"female": "👩 Feminina", "male": "👨 Masculina"}

# rate do edge-tts. "+0%" (e não "0%") é o formato que a lib espera.
SPEEDS = {
    "slow": ("🐢 Lento", "-25%"),
    "medium": ("🚶 Médio", "+0%"),
    "fast": ("🐇 Rápido", "+30%"),
}

# Nome legível do idioma DETECTADO — cobre mais do que o catálogo de alvos,
# porque a entrada pode vir em qualquer idioma mesmo sem voz disponível.
ISO_NAMES = {
    "pt": "Português", "en": "Inglês", "es": "Espanhol", "fr": "Francês",
    "de": "Alemão", "it": "Italiano", "ja": "Japonês", "zh": "Chinês",
    "ru": "Russo", "ar": "Árabe", "ko": "Coreano", "nl": "Holandês",
    "pl": "Polonês", "tr": "Turco", "sv": "Sueco", "hi": "Híndi",
    "he": "Hebraico", "el": "Grego", "uk": "Ucraniano", "id": "Indonésio",
    "vi": "Vietnamita", "th": "Tailandês", "ro": "Romeno", "cs": "Tcheco",
    "da": "Dinamarquês", "fi": "Finlandês", "no": "Norueguês", "hu": "Húngaro",
}


def get(code: str) -> Language:
    """Nunca levanta: código desconhecido cai no pt-BR."""
    return LANGUAGES.get(code) or LANGUAGES["pt-BR"]


def iso_name(iso: str) -> str:
    return ISO_NAMES.get(iso, iso.upper())


def rate_for(speed: str) -> str:
    return SPEEDS.get(speed, SPEEDS["medium"])[1]


def speed_label(speed: str) -> str:
    return SPEEDS.get(speed, SPEEDS["medium"])[0]


def first_locale_for_iso(iso: str) -> Optional[Language]:
    """Primeira voz do catálogo que fala esse ISO (usada quando o texto já está
    no idioma-alvo de outro locale, ou quando não há tradução a fazer)."""
    for lang in LANGUAGES.values():
        if lang.iso == iso:
            return lang
    return None
