"""
Estrutura do documento: quebra o texto em seções navegáveis e monta a versão
falada de cada uma, anunciando o que é (título, lista, citação, código).

O anúncio sai no idioma-alvo, não em português: quem escolheu ler em japonês
não quer ouvir "Título:" no meio da frase. Fallback para inglês.
"""
import re
from dataclasses import dataclass, field
from typing import List

HEADING = "heading"
PARAGRAPH = "paragraph"
LIST = "list"
QUOTE = "quote"
CODE = "code"

ICONS = {HEADING: "📌", PARAGRAPH: "¶", LIST: "•", QUOTE: "❝", CODE: "⌨"}

# Anúncios de estrutura por ISO. {n} = quantidade.
ANNOUNCE = {
    "pt": {"heading": "Título", "list": "Lista com {n} itens", "item": "Item", "quote": "Citação", "code": "Bloco de código com {n} linhas"},
    "en": {"heading": "Heading", "list": "List with {n} items", "item": "Item", "quote": "Quote", "code": "Code block with {n} lines"},
    "es": {"heading": "Título", "list": "Lista con {n} elementos", "item": "Elemento", "quote": "Cita", "code": "Bloque de código con {n} líneas"},
    "fr": {"heading": "Titre", "list": "Liste de {n} éléments", "item": "Élément", "quote": "Citation", "code": "Bloc de code de {n} lignes"},
    "de": {"heading": "Überschrift", "list": "Liste mit {n} Einträgen", "item": "Eintrag", "quote": "Zitat", "code": "Codeblock mit {n} Zeilen"},
    "it": {"heading": "Titolo", "list": "Elenco con {n} voci", "item": "Voce", "quote": "Citazione", "code": "Blocco di codice con {n} righe"},
    "ja": {"heading": "見出し", "list": "{n}項目のリスト", "item": "項目", "quote": "引用", "code": "{n}行のコードブロック"},
    "zh": {"heading": "标题", "list": "包含{n}项的列表", "item": "第", "quote": "引用", "code": "{n}行代码块"},
    "ru": {"heading": "Заголовок", "list": "Список из {n} пунктов", "item": "Пункт", "quote": "Цитата", "code": "Блок кода из {n} строк"},
}

MD_HEADING = re.compile(r"^(#{1,6})\s+(.*\S)\s*$")
BULLET = re.compile(r"^\s*(?:[-*•·–]|\d{1,3}[.)])\s+(.+)$")
QUOTE_LINE = re.compile(r"^\s*>\s?(.*)$")
FENCE = re.compile(r"^\s*```")
# Linha decorativa de e-mail/PDF ("-----", "=====", "***"): não vira seção.
DECORATIVE = re.compile(r"^[\s\-=_*~#•.]+$")
HAS_SPEAKABLE = re.compile(r"\w", re.UNICODE)


@dataclass
class Section:
    kind: str
    text: str                              # texto exibido (sem os anúncios)
    items: List[str] = field(default_factory=list)  # só para LIST
    level: int = 0                         # só para HEADING (1..6)

    @property
    def preview(self) -> str:
        # Lista já tem o "•" no ICONS do índice — repetir aqui vira "• • item".
        source = "; ".join(self.items) if self.kind == LIST else self.text
        flat = " ".join(source.split())
        return flat if len(flat) <= 60 else flat[:57] + "…"


def _looks_like_heading(line: str) -> bool:
    """Título sem marcação markdown: linha curta, isolada, sem pontuação final.

    Conservador de propósito — classificar parágrafo como título faz o leitor
    anunciar "Título:" no meio do texto, que incomoda mais do que perder um.
    """
    stripped = line.strip()
    if not (3 <= len(stripped) <= 80) or "\n" in stripped:
        return False
    if stripped[-1] in ".!?,;:":
        return False
    words = stripped.split()
    if len(words) > 12:
        return False
    letters = [c for c in stripped if c.isalpha()]
    if letters and all(c.isupper() for c in letters):
        return True
    return bool(re.match(r"^\d+(\.\d+)*[.)]?\s+\S", stripped))


def parse(text: str) -> List[Section]:
    """Texto plano -> seções. Sempre devolve ao menos uma seção se houver
    qualquer caractere falável."""
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    sections: List[Section] = []
    buf: List[str] = []
    bullets: List[str] = []
    bullet_lines: List[str] = []   # linha original, para o caso de item único
    quotes: List[str] = []
    code: List[str] = []
    in_code = False

    def emit_line(body: str) -> None:
        if body and HAS_SPEAKABLE.search(body):
            kind = HEADING if _looks_like_heading(body) else PARAGRAPH
            sections.append(Section(kind, body, level=1 if kind == HEADING else 0))

    def flush_paragraph() -> None:
        nonlocal buf
        if buf:
            body = " ".join(l.strip() for l in buf).strip()
            if len(buf) == 1:
                emit_line(body)
            elif body and HAS_SPEAKABLE.search(body):
                sections.append(Section(PARAGRAPH, body))
            buf = []

    def flush_bullets() -> None:
        nonlocal bullets, bullet_lines
        if bullets:
            # Um marcador sozinho não é lista — quase sempre é um título
            # numerado ("2. Introdução") ou um parágrafo com traço. Anunciar
            # "Lista com 1 itens" nesses casos é pior que não anunciar nada.
            if len(bullets) == 1:
                emit_line(bullet_lines[0].strip())
            else:
                sections.append(
                    Section(LIST, "\n".join(f"• {b}" for b in bullets), items=list(bullets))
                )
            bullets, bullet_lines = [], []

    def flush_quotes() -> None:
        nonlocal quotes
        if quotes:
            body = " ".join(quotes).strip()
            if body:
                sections.append(Section(QUOTE, body))
            quotes = []

    def flush_all() -> None:
        flush_paragraph()
        flush_bullets()
        flush_quotes()

    for line in lines:
        if FENCE.match(line):
            if in_code:
                if code:
                    sections.append(Section(CODE, "\n".join(code)))
                code = []
            else:
                flush_all()
            in_code = not in_code
            continue
        if in_code:
            code.append(line)
            continue

        if not line.strip() or DECORATIVE.match(line):
            flush_all()
            continue

        md = MD_HEADING.match(line)
        if md:
            flush_all()
            sections.append(Section(HEADING, md.group(2), level=len(md.group(1))))
            continue

        q = QUOTE_LINE.match(line)
        if q:
            flush_paragraph()
            flush_bullets()
            quotes.append(q.group(1).strip())
            continue
        flush_quotes()

        b = BULLET.match(line)
        if b:
            flush_paragraph()
            bullets.append(b.group(1).strip())
            bullet_lines.append(line)
            continue
        flush_bullets()

        buf.append(line)

    if in_code and code:          # cerca aberta e nunca fechada
        sections.append(Section(CODE, "\n".join(code)))
    flush_all()
    return sections


def spoken(section: Section, iso: str) -> str:
    """Texto que vai para o TTS, com o anúncio de estrutura no idioma-alvo."""
    words = ANNOUNCE.get(iso, ANNOUNCE["en"])

    if section.kind == HEADING:
        return f"{words['heading']}: {section.text}."
    if section.kind == QUOTE:
        return f"{words['quote']}: {section.text}"
    if section.kind == CODE:
        # Código não é lido: soletrar chaves e parênteses não ajuda ninguém.
        return words["code"].format(n=len(section.text.splitlines()) or 1) + "."
    if section.kind == LIST:
        header = words["list"].format(n=len(section.items))
        if iso == "zh":  # "第1项" em vez de "Item 1"
            body = " ".join(f"{words['item']}{i}项：{t}。" for i, t in enumerate(section.items, 1))
            return f"{header}。{body}"
        if iso == "ja":
            body = " ".join(f"{words['item']}{i}：{t}。" for i, t in enumerate(section.items, 1))
            return f"{header}。{body}"
        body = " ".join(f"{words['item']} {i}: {t}." for i, t in enumerate(section.items, 1))
        return f"{header}. {body}"
    return section.text


def spoken_all(sections: List[Section], iso: str) -> str:
    return "\n\n".join(spoken(s, iso) for s in sections)


def is_speakable(section: Section) -> bool:
    return bool(HAS_SPEAKABLE.search(section.text))


def outline(sections: List[Section], current: int) -> str:
    """Índice em HTML para o /indice — marca onde a leitura está."""
    rows = []
    for i, s in enumerate(sections):
        mark = "▶️" if i == current else f"{i + 1}."
        rows.append(f"{mark} {ICONS.get(s.kind, '¶')} {_esc(s.preview)}")
    return "\n".join(rows)


def _esc(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
