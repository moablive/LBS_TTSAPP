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
/mnt/nvme2tb/docker-services/LifeBusinessSuit/deploy/redeploy.sh LBSTTSAPP
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

## 🔥 Hot reload (modo dev)

Em produção o front é build estático servido por nginx e o backend roda o
código compilado — editar arquivo não muda nada até republicar. Para
desenvolver existe o `docker-compose.dev.yml`, que **não** é usado por
`docker compose up -d` sozinho nem pelo `redeploy.sh`:

```bash
docker compose --env-file ../shared.env --env-file .env \
  -f docker-compose.yml -f docker-compose.dev.yml up
```

Editou no host, o container reage: `tsx watch` reinicia o backend em ~1 s, e o
Vite troca o módulo no navegador sem recarregar a página.

| Serviço | Onde responde em dev |
|---|---|
| Frontend (Vite) | `http://<host>:5181` |
| Backend (direto) | `http://<host>:5081` |

### O que o override troca

- **Estágio da imagem**: em vez da imagem final (nginx / runtime enxuto), sobe o
  estágio `deps`, que tem as dependências instaladas e **não** tem o código — o
  código vem do bind mount.
- **Comando**: `pnpm ... dev` no lugar do `nginx`/`pnpm start`.
- **Volumes**: a raiz do repositório vai para dentro do container, e cada
  `node_modules` ganha um **volume anônimo** que o protege. Sem isso o
  `node_modules` do host cobriria o do container — e o do host foi resolvido
  para outra plataforma, então o Vite morre no boot. **Workspace novo em
  `apps/` ou `packages/` exige linha nova na âncora `x-hot-reload`.**
- **Imagem com nome próprio** (sufixo `-dev`): sem isso o compose reaproveita a
  imagem de produção já tagueada com o mesmo nome, ignora o `target:` e o
  container sobe com o nginx, morrendo em `pnpm: not found`.
- **Proxy `/api`**: em produção quem encaminha é o nginx; em dev ele sai do
  caminho e quem assume é o próprio Vite, via `DEV_API_TARGET`.

> **Este app não é workspace pnpm.** Cada serviço tem Dockerfile, `npm install`
> e contexto de build próprios, então o bind mount é por serviço e basta um
> volume anônimo em cada. O **bot fica de fora**: é Python, sem watcher — o
> código está montado, mas quem aplica a mudança é `docker restart
> lbs_ttsapp_bot`.

### Quando ainda é preciso rebuildar

O hot reload cobre **código**. Mudança em `package.json` (dependências),
`Dockerfile`, `.env` ou no próprio compose exige recriar:

```bash
docker compose ... down -v && docker compose ... up -d --build
```

O `-v` não é opcional: `--build` reconstrói a imagem, mas o **volume anônimo
sobrevive com o `node_modules` antigo** e continua sendo montado por cima.

---

## 🏷️ Versionamento e aviso de nova versão

Toda publicação incrementa a versão e a mostra no app. Serve para duas coisas:
saber de fora qual build está no ar, e avisar quem está com o app aberto que
saiu build novo — quem instala na tela inicial fica semanas sem recarregar de
verdade, rodando código antigo sem saber.

### O fluxo

```
VERSION (0.0.1)                       ← fonte da verdade, versionada no git
   │  node scripts/bump-version.mjs
   ▼
0.0.2 + APP_BUILD_DATE
   │
   └─▶ .env  (APP_VERSION, APP_BUILD_DATE)   ← lido pelo --env-file do deploy
              │
              ├─▶ backend  APP_VERSION       → GET /health
              └─▶ frontend VITE_APP_VERSION  → build-arg, congelado no bundle
                             │
                             ▼
                   useVersionCheck compara os dois
                             │  divergiu?
                             ▼
                   UpdateBanner: "Nova versão disponível"
```

### Comandos

| Comando | Efeito |
|---|---|
| `node scripts/bump-version.mjs` | `0.0.1` → `0.0.2` (patch) |
| `node scripts/bump-version.mjs --minor` | `0.0.9` → `0.1.0` |
| `node scripts/bump-version.mjs --major` | `0.1.4` → `1.0.0` |
| `node scripts/bump-version.mjs --set 2.5.0` | define manualmente |

O `VERSION` é a fonte da verdade e é versionado; o `.env` é espelho gerado —
**não edite `APP_VERSION` à mão.** Depois do bump, republique normalmente
(`redeploy.sh`, que já roda com `--build`): é o rebuild que carrega a versão
nova para dentro do bundle do front.

### Onde aparece

| Onde | O quê |
|---|---|
| `GET /health` | `{ version, buildDate }` — público, é o que o front consulta |
| Canto inferior direito | badge `v0.0.2`; o *tooltip* mostra a data do build |
| Banner, quando diverge | "Nova versão disponível" com **Depois** / **Atualizar agora** |

### Como funciona por dentro

- `apps/frontend/src/composables/useVersionCheck.ts` pergunta ao `/health` a
  cada 5 min (só com a aba visível) e ao voltar o foco para o app — que é o
  momento mais provável de haver deploy esperando. Usa `fetch` puro: o cliente
  HTTP do app derruba a sessão em qualquer 401, e uma checagem de fundo não pode
  ter esse poder.
- **O aviso é uma sugestão, não um reload automático.** Recarregar sozinho
  jogaria fora formulário meio preenchido; quem decide é o usuário.
- O `nginx.conf` do front encaminha `/health` ao backend de propósito. Sem essa
  `location`, o caminho cairia no *SPA fallback* e devolveria o `index.html` —
  JSON esperado, HTML recebido, e o banner nunca apareceria.
- Sem `APP_VERSION` no ambiente (dev local), a checagem se desliga sozinha: sem
  baseline, toda comparação seria falso positivo.

---

## Decisões de Arquitetura

- **Por que edge-tts embutido no Backend e Bot?** A suite possui o `MailAPP/apps/tts-service`, porém este app requer controle fino da taxa de leitura (`rate`). Para não afetar outros serviços, adotou-se implementações independentes em Python (Bot) e Node.js (Backend).
- **Tradução em lote**: PDFs são divididos em blocos com marcadores `<<<n>>>` para evitar múltiplas viagens individuais ao LLM, agilizando drasticamente o tempo total da tradução de textos longos.
- **Leitura de PDFs**: Utiliza-se `pdf-parse` (Node) e `pypdf` (Python) para ler camadas de texto direto do arquivo, sendo mais rápido do que rastreio por OCR. Páginas sem camada de texto (escaneadas) exigem envio como imagem (foto) para processamento OCR preciso.

---

## 🔔 LBS Notify — notificações pela plataforma central

Desde 27/08/2026 existe um serviço central de notificações da suite, o
[**LBS Notify**](https://github.com/moablive/LBSNotify) (containers
`lbs_notify_api` e `lbs_notify_worker`, banco `lbsnotify`). Ele substitui a
infraestrutura de Web Push que cada app carregava duplicada.

> ⚠️ **Está DESLIGADO por padrão.** Com as flags abaixo em branco/`false` — que
> é como elas nascem — o comportamento deste app é **exatamente** o de antes.
> Nada muda até você virar as chaves, e a virada é um app por vez.

### As flags

| Variável | Onde | Vazio/`false` significa |
|---|---|---|
| `VITE_LBS_NOTIFY_URL` | build do frontend | o PWA registra o aparelho no `/api/push/*` deste app |
| `LBS_NOTIFY_KEY` | backend/bot | chave de serviço deste app na central |
| `TTS_NOTIFY_USE_CENTRAL` | backend/bot | a entrega continua saindo daqui |

### Como ligar

```bash
# 1) o PWA passa a registrar o aparelho na central
#    .env:  VITE_LBS_NOTIFY_URL='https://notify.astralwavelabel.com'
bash ../deploy/redeploy.sh LBSTTSAPP
#    -> abra o app, ative as notificações, confirme que chega

# 2) a entrega passa a sair da central
#    .env:  TTS_NOTIFY_USE_CENTRAL='true'
bash ../deploy/redeploy.sh LBSTTSAPP
```

### Duas coisas que mordem

**A inscrição antiga não migra.** Uma `PushSubscription` fica amarrada à chave
pública VAPID usada no `subscribe()` do navegador. O Notify assina com **outro**
par, então as linhas de `inscrições antigas de outros apps` **não podem** ser copiadas para lá — o
servidor de push responderia `403` em todo envio. Cada aparelho se reinscreve na
primeira vez que a pessoa ativa. O `usePush` já confere a chave da inscrição
existente e a refaz quando ela é do outro caminho; sem isso o sintoma seria
"ativei e não chega nada", sem erro nenhum.

**Entre os passos 1 e 2 pode chegar em dobro.** O mesmo aparelho fica inscrito
nos dois lados por um período. É o preço do rollout gradual e some quando
os outros apps forem migrados.

### O que muda no código deste app

| Arquivo | O que faz |
|---|---|
| `apps/frontend/public/push-sw.js` | handlers de `push` e `notificationclick` |
| `apps/frontend/src/composables/usePush.ts` | ativação no aparelho |
| `apps/frontend/src/lib/lbsNotifyClient.ts` | registro do aparelho na central |
| `apps/backend/src/lib/notify.ts` | emite `tts.completed` |

**Este app nunca teve Web Push.** Não há tabela `push_subscriptions`, nem rota
`/api/push/*`, nem par VAPID próprio. Então aqui **não existe caminho legado a
preservar**: ou vai pela central, ou não vai. Com `VITE_LBS_NOTIFY_URL` vazio o
`usePush` se declara não suportado e a UI não oferece o botão, em vez de
oferecer algo que não teria onde registrar.

> Por isso este é o **melhor app para ligar primeiro**: sem caminho legado, não
> há como duplicar notificação nem quebrar algo que já funcionava.

**O service worker usa `importScripts`, não um `sw.js` próprio.** Todo, Money e
Notes escrevem o SW à mão porque não têm plugin de PWA. Aqui o
`vite-plugin-pwa` já registra um SW gerado pelo Workbox, e o `usePwaUpdate`
depende dele para acender o `UpdateBanner`. Registrar um segundo SW no mesmo
escopo faria os dois brigarem pelo controle da página — o `importScripts`
acrescenta os listeners ao SW que já existe, sem tocar no fluxo de atualização.

**`tts.completed` só sai quando demorou.** O `/process` emite o evento apenas se
o processamento passou de `TTS_NOTIFY_MIN_MS` (20 s por padrão). Avisar sobre um
trabalho de 3 segundos é ruído — a pessoa está olhando para a tela quando ele
termina. O aviso só ajuda quando a tradução demorou o bastante para ela ter
trocado de aba, que é o caso de PDF grande passando pelo Ollama.

📖 Contrato da API, decisões e operação: [`LBSNotify/README.md`](https://github.com/moablive/LBSNotify).
Sequência de corte detalhada: `LBSNotify/docs/ARCHITECTURE_DISCOVERY.md`.
