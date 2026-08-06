"""
Preferências e sessão de leitura por usuário.

Preferências vão para disco (data/prefs.json, volume do compose) porque perder
o idioma-alvo a cada redeploy é irritante. A sessão de leitura fica só em
memória: é o "documento aberto agora", não faz sentido sobreviver a restart.
"""
import json
import logging
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Dict, List, Optional

from . import config
from .reader import Section

logger = logging.getLogger(__name__)


@dataclass
class Prefs:
    target_lang: str = config.DEFAULT_TARGET_LANG
    gender: str = config.DEFAULT_GENDER
    speed: str = config.DEFAULT_SPEED


@dataclass
class Session:
    """Último documento processado — a base de /indice, /tudo e da navegação."""
    sections: List[Section] = field(default_factory=list)
    index: int = 0
    source_iso: str = "unknown"
    target_lang: str = config.DEFAULT_TARGET_LANG
    translated: bool = False
    original: str = ""
    origin: str = "texto"          # texto | imagem | pdf | arquivo

    @property
    def total(self) -> int:
        return len(self.sections)

    def current(self) -> Optional[Section]:
        if 0 <= self.index < self.total:
            return self.sections[self.index]
        return None

    def move(self, delta: int) -> bool:
        """Move o cursor; False se já está na ponta (o chamador avisa)."""
        target = self.index + delta
        if 0 <= target < self.total:
            self.index = target
            return True
        return False

    def full_text(self) -> str:
        return "\n\n".join(s.text for s in self.sections)


class Store:
    def __init__(self) -> None:
        self._prefs: Dict[int, Prefs] = {}
        self._sessions: Dict[int, Session] = {}
        self._path: Path = config.DATA_DIR / "prefs.json"
        self._load()

    # ── Preferências ────────────────────────────────────────────────────────
    def prefs(self, user_id: int) -> Prefs:
        return self._prefs.setdefault(user_id, Prefs())

    def update(self, user_id: int, **changes) -> Prefs:
        prefs = self.prefs(user_id)
        for key, value in changes.items():
            if hasattr(prefs, key):
                setattr(prefs, key, value)
        self._save()
        return prefs

    def _load(self) -> None:
        if not self._path.exists():
            return
        try:
            raw = json.loads(self._path.read_text(encoding="utf-8"))
            for user_id, data in raw.items():
                self._prefs[int(user_id)] = Prefs(**data)
            logger.info("Preferências carregadas: %d usuário(s)", len(self._prefs))
        except Exception as exc:                   # noqa: BLE001
            # Arquivo corrompido não pode impedir o bot de subir — recomeça vazio.
            logger.warning("Não consegui ler %s (%s) — começando com padrões", self._path, exc)

    def _save(self) -> None:
        try:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            payload = {str(uid): asdict(p) for uid, p in self._prefs.items()}
            tmp = self._path.with_suffix(".json.tmp")
            tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
            tmp.replace(self._path)                # troca atômica
        except Exception as exc:                   # noqa: BLE001
            logger.warning("Falha ao salvar preferências: %s", exc)

    # ── Sessão ──────────────────────────────────────────────────────────────
    def session(self, user_id: int) -> Optional[Session]:
        return self._sessions.get(user_id)

    def set_session(self, user_id: int, session: Session) -> Session:
        self._sessions[user_id] = session
        return session


store = Store()
