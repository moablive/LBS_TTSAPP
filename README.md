# LBSTTSAPP — LifeBusinessSuit Text-To-Speech App

Plataforma unificada da suite **LifeBusinessSuit** que recebe texto, foto ou PDF, detecta o idioma original, traduz para o idioma preferido do usuário e converte para fala (TTS - Text-To-Speech) com vozes neurais de alta qualidade.

O projeto agora é multiplataforma e conta com três componentes principais:
1. **Frontend (Web/PWA)**: Interface web responsiva em Vue 3.
2. **Backend (API REST)**: Serviço Node.js/Express para processamento de arquivos e áudio.
3. **Telegram Bot**: O bot tradicional que permite consumir o serviço diretamente pelo Telegram.

<p align="center">
  <a href="https://skillicons.dev">
    <img src="https://skillicons.dev/icons?i=python,nodejs,vue,docker,linux,git" />
  </a>
</p>

---

## Funcionalidades

| | |
|---|---|
| **Entrada** | Texto em qualquer idioma · Foto (OCR pelo modelo de visão) · PDF com camada de texto · `.txt`, `.md`, `.csv`, `.srt` |
| **Detecção** | Idioma identificado automaticamente pelo Ollama; se o texto já estiver no idioma-alvo, pula a etapa de tradução. |
| **Tradução** | 12 idiomas-alvo disponíveis (padrão pt-BR). Preserva parágrafos, títulos e listas. |
| **Leitura (TTS)** | Vozes neurais (edge-tts) para todos os idiomas suportados, opções de voz feminina/masculina e controle de velocidade (lento, médio, rápido). |
| **Estruturação** | Anuncia "Título:", "Lista com N itens:", "Citação:" no idioma-alvo antes da leitura do trecho. |
| **Interfaces** | Interface Web (PWA) e Bot do Telegram (`/start`, `/idioma`, `/voz`, `/velocidade`, `/secao`). |

## Estrutura do Projeto

A aplicação é dividida em três serviços isolados, orquestrados via Docker Compose:

```text
LBSTTSAPP/
├── docker-compose.yml        # Serviço completo rodando na rede awl_network
├── .env / .env.example       # Variáveis de ambiente (chaves, tokens e config)
├── data/                     # Volume persistente para os dados do bot (preferências)
└── apps/
    ├── backend/              # Node.js + Express (API de tradução, TTS e OCR)
    ├── frontend/             # Vue 3 + Tailwind CSS + Vite (Web App PWA)
    └── bot/                  # Python (Bot do Telegram)
```

### 1. Backend (`apps/backend`)
Construído com **Node.js, Express e TypeScript**. Responsável por extrair o texto dos arquivos (`multer`, `pdf-parse`), consultar os modelos de IA via **Ollama** para OCR e tradução, e gerar o áudio neural usando `edge-tts`.
- Rotas principais: `/api/v1/translate/process` e `/api/v1/translate/tts-section`.
- Roda internamente e é consumido pelo frontend web.

### 2. Frontend (`apps/frontend`)
Aplicação **Vue 3 (Composition API)** compilada via Vite e empacotada como um **PWA (Progressive Web App)**. 
- Integra-se ao LoginHub para autenticação.
- Interface amigável para envio de arquivos e reprodução de áudio seccionado.

### 3. Telegram Bot (`apps/bot`)
Bot em **Python** que escuta comandos do Telegram (ex: `/start`, `/tudo`, `/indice`).
- Permite navegação pelas seções do documento (⏮ anterior, 🔁 repetir, ⏭ próxima).
- Mantém o estado e as preferências do usuário no arquivo `data/prefs.json`.

## Configuração

O `docker-compose.yml` utiliza a rede externa `awl_network` e não sobe o banco ou o Ollama internamente, reaproveitando os serviços da suite. As variáveis de ambiente são mescladas a partir de **duas camadas** (a segunda tem prioridade):

1. `../shared.env`: Configurações globais da suite, como `OLLAMA_URL` e `OLLAMA_TEXT_MODEL`.
2. `.env` local: Token do Telegram (`TELEGRAM_BOT_TOKEN`), chaves do LoginHub (`VITE_LOGINHUB_API_URL`, `VITE_LOGINHUB_APP_ID`) e portas. Veja [`.env.example`](.env.example).

> **Atenção**: O modelo de **visão** (`OLLAMA_MODEL`), usado para OCR de imagens, fica configurado no `.env` local para não colidir com outros apps da suite que dependem de modelos estritamente de texto.

## Idiomas-alvo Suportados

pt-BR · pt-PT · en-US · en-GB · es-ES · es-MX · fr-FR · de-DE · it-IT · ja-JP · zh-CN · ru-RU

O projeto garante vozes feminina e masculina para cada idioma e velocidades de leitura personalizáveis (Lento -25%, Médio +0%, Rápido +30%).

## Deploy e Execução

Para fazer o deploy automático em ambiente integrado à suite:
```bash
/mnt/docker-services/LifeBusinessSuit/deploy/redeploy.sh LBSTTSAPP
```

Ou executando o docker compose manualmente:
```bash
docker compose --env-file ../shared.env --env-file .env up -d --build
```

Para visualizar os logs dos serviços:
```bash
# Logs do backend
docker logs -f lbs_ttsapp_backend

# Logs do frontend
docker logs -f lbs_ttsapp_frontend

# Logs do bot do telegram
docker logs -f lbs_ttsapp_bot
```

## Decisões de Arquitetura

- **Por que edge-tts embutido no Backend e Bot?** A suite possui o `MailAPP/apps/tts-service`, porém este app requer controle fino da taxa de leitura (`rate`). Para não afetar outros serviços, adotou-se implementações independentes em Python (Bot) e Node.js (Backend).
- **Tradução em lote**: PDFs são divididos em blocos com marcadores `<<<n>>>` para evitar múltiplas viagens individuais ao LLM, agilizando drasticamente o tempo total da tradução de textos longos.
- **Leitura de PDFs**: Utiliza-se `pdf-parse` (Node) e `pypdf` (Python) para ler camadas de texto direto do arquivo, sendo mais rápido do que rastreio por OCR. Páginas sem camada de texto (escaneadas) exigem envio como imagem (foto) para processamento OCR preciso.
