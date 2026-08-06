# LBSTTSAPP — LumoTranslate

Bot do Telegram da suite **LifeBusinessSuit** que recebe texto, foto ou PDF,
detecta o idioma, traduz para o idioma preferido do usuário e devolve a leitura
em voz alta.

<p align="center">
  <a href="https://skillicons.dev">
    <img src="https://skillicons.dev/icons?i=python,docker,linux,git" />
  </a>
</p>

> Migrado de `/mnt/docker-services/server/telegram-bots/awlsrv_tts_bot`.
> É o **mesmo bot do Telegram** (mesmo token) — mudou de casa e ganhou OCR,
> PDF, idioma-alvo configurável, controle de velocidade e navegação por seções.

---

## Funcionalidades

| | |
|---|---|
| **Entrada** | Texto em qualquer idioma · Foto (OCR pelo modelo de visão) · PDF com camada de texto · `.txt`, `.md`, `.csv`, `.srt` |
| **Detecção** | Idioma identificado automaticamente pelo Ollama; se já estiver no idioma-alvo, pula a tradução |
| **Tradução** | 12 idiomas-alvo, por usuário (padrão pt-BR). Preserva parágrafos, títulos e listas |
| **Leitura** | Vozes neurais (edge-tts), feminina/masculina, velocidade lento/médio/rápido |
| **Estrutura** | Anuncia "Título:", "Lista com N itens: Item 1…", "Citação:" **no idioma-alvo** |
| **Navegação** | ⏮ anterior · 🔁 repetir · ⏭ próxima · 📚 índice · ▶️ ler tudo · `/secao N` |

Pausar é o botão de pause do próprio player de áudio do Telegram — o bot não
reimplementa isso.

## Comandos

```
/start        Iniciar
/idioma       Idioma-alvo da tradução e da leitura
/voz          Voz feminina ou masculina
/velocidade   Lento (-25%), médio (+0%) ou rápido (+30%)
/indice       Seções do documento aberto
/secao N      Pula para a seção N
/tudo         Lê o documento inteiro num áudio só
/original     Mostra o texto antes da tradução
/config       Suas preferências atuais
/ajuda        Ajuda completa
```

## Idiomas-alvo

pt-BR · pt-PT · en-US · en-GB · es-ES · es-MX · fr-FR · de-DE · it-IT · ja-JP ·
zh-CN · ru-RU

Cada um com voz feminina e masculina. Os `ShortName` do edge-tts estão em
[`apps/bot/src/languages.py`](apps/bot/src/languages.py) e foram conferidos
contra `edge_tts.list_voices()` — voz inexistente só falha em runtime, então
confira lá antes de acrescentar.

## Estrutura

```
LBSTTSAPP/
├── docker-compose.yml        # serviço lbs_ttsapp_bot na awl_network
├── .env / .env.example       # token e padrões (infra comum em ../shared.env)
├── data/                     # preferências persistidas (volume, fora do git)
└── apps/bot/
    ├── Dockerfile
    ├── requirements.txt
    └── src/
        ├── main.py           # handlers do Telegram e pipeline
        ├── config.py         # leitura do ambiente
        ├── languages.py      # catálogo de idiomas, vozes e velocidades
        ├── ai.py             # Ollama: detecção, tradução em lote, OCR
        ├── extract.py        # imagem / PDF / arquivo de texto -> string
        ├── reader.py         # seções do documento e texto falado
        ├── tts.py            # edge-tts com rate e chunking
        └── state.py          # preferências e sessão de leitura
```

## Configuração

O compose carrega **duas camadas**, nessa ordem (a segunda vence):

1. `../shared.env` — infra comum da suite: `OLLAMA_URL`, `OLLAMA_TEXT_MODEL`,
   `OLLAMA_KEEP_ALIVE`.
2. `.env` deste app — token do Telegram, modelo de visão, padrões e limites.
   Veja [`.env.example`](.env.example).

`OLLAMA_MODEL` (o modelo de **visão**, usado no OCR) fica de propósito fora do
`shared.env`: o nome colide entre apps — no MailAPP é o modelo de texto, aqui e
no MoneyAPP é o de visão.

`ALLOWED_USER_IDS` vazio deixa o bot **aberto para qualquer pessoa**. Em
produção mantenha a lista preenchida.

## Deploy

Pelo script da suite (descobre este projeto sozinho):

```bash
/mnt/docker-services/LifeBusinessSuit/deploy/redeploy.sh LBSTTSAPP
```

Ou direto:

```bash
docker compose --env-file ../shared.env --env-file .env up -d --build
```

Logs:

```bash
docker logs -f lbs_ttsapp_bot
```

## Decisões de projeto

**Por que edge-tts embutido e não o `lbs_mailapp_tts`?**
A suite já tem um serviço TTS em `MailAPP/apps/tts-service` — extraído
justamente deste bot. Ele não é reaproveitado aqui por dois motivos: ele não
expõe controle de `rate` (velocidade é requisito deste app) e depender de um
container do MailAPP faria este bot cair junto com aquele app. O `split_text`
de `tts.py` é o mesmo código, com o crédito no docstring.

**Por que a tradução vai em lote com marcadores `<<<n>>>`?**
Um PDF vira dezenas de seções, e um round-trip por seção num modelo 7B levaria
minutos. As seções vão agrupadas em blocos de ~3000 chars com marcadores; se o
modelo devolver fora do formato, `ai.py` cai para tradução individual — mais
lenta, mas nunca perde nem desalinha texto.

**Por que PDF escaneado não funciona?**
`extract.py` lê a camada de texto com `pypdf`. Rasterizar página a página e
mandar cada uma para o modelo de visão é lento e impreciso em documento longo.
Quando não há camada de texto, o bot avisa e sugere mandar a página como foto,
que cai no caminho de OCR — que funciona bem para uma página por vez.

**Onde ficam as preferências?**
Em `data/prefs.json` (volume do compose), não no Postgres. Este app não tem
backend nem LoginHub, e o que se guarda é um punhado de chaves por usuário —
um banco aqui seria dependência sem contrapartida. A *sessão de leitura* (o
documento aberto) é só em memória de propósito: não faz sentido sobreviver a
restart.
