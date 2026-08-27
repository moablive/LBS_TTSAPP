import { ref, onMounted, onUnmounted } from 'vue';

/**
 * Descobre que o build no ar deixou de ser o que esta aba carregou.
 *
 * Quem instala o app na tela inicial fica semanas sem recarregar de verdade —
 * o redeploy sobe a versão nova e o celular continua com o bundle antigo até
 * alguém fechar a aba. Em vez de adivinhar, comparamos a versão que o Vite
 * congelou neste bundle (`VITE_APP_VERSION`) com a que o backend devolve no
 * /health: as duas nascem do mesmo `APP_VERSION` do scripts/bump-version.mjs,
 * então divergirem significa deploy novo.
 *
 * O aviso é uma sugestão, não um reload automático: recarregar sozinho jogaria
 * fora formulário meio preenchido. Quem decide é o usuário, no banner.
 *
 * `fetch` puro, sem cliente HTTP e sem header custom: o interceptor do
 * api-client derruba a sessão em qualquer 401, e uma checagem de fundo não pode
 * ter esse poder; header custom viraria preflight à toa.
 */

/**
 * Mesma origem: o nginx do próprio front encaminha /health ao backend (ver
 * apps/frontend/nginx.conf). Em `vite dev` não há nginx — aí vale a base da API,
 * quando ela estiver configurada.
 */
const base = import.meta.env.VITE_API_BASE_URL || '';
const HEALTH_URL = base ? `${base.replace(/\/api\/?$/, '')}/health` : '/health';

/** De quanto em quanto tempo perguntar, com a aba aberta e visível. */
const INTERVALO_MS = 5 * 60 * 1000;

/** Piso entre duas checagens — segura o vai-e-volta de foco no celular. */
const INTERVALO_MINIMO_MS = 60 * 1000;

/** Backend fora do ar não pode deixar a promise pendurada para sempre. */
const TIMEOUT_MS = 8000;

/**
 * Versão para a qual esta aba já recarregou. Se o reload não resolveu — deploy
 * parcial, em que o backend subiu com versão nova e o front ficou na antiga — o
 * aviso não pode voltar a cada checagem. `sessionStorage` porque a marca
 * precisa sobreviver ao reload e morrer com a aba.
 */
const CHAVE_TENTATIVA = 'lbstts_update_recarregado_para';

interface Health {
  version?: string;
  buildDate?: string | null;
}

const versaoLocal = import.meta.env.VITE_APP_VERSION || '';
const buildDateLocal = import.meta.env.VITE_APP_BUILD_DATE || '';

/**
 * Sem versão injetada (dev local, build sem APP_VERSION) a comparação só
 * produziria falso positivo contra a versão real do backend.
 */
const temBaseline = Boolean(versaoLocal) && versaoLocal !== '0.0.0';

function ehDeployNovo(health: Health): boolean {
  if (health.version && health.version !== versaoLocal) return true;
  // Rebuild sem bump mantém a versão e muda a data. Só compara se os dois lados
  // tiverem data — senão um .env sem APP_BUILD_DATE acusaria sempre.
  if (buildDateLocal && health.buildDate && health.buildDate !== buildDateLocal) return true;
  return false;
}

// Navegador com storage bloqueado (aba privada, cookies negados) lança aqui.
// Perder a marca só custa um aviso repetido; quebrar a checagem custa mais.
function jaTentou(versao: string): boolean {
  try {
    return sessionStorage.getItem(CHAVE_TENTATIVA) === versao;
  } catch {
    return false;
  }
}

function marcarTentativa(versao: string) {
  try {
    sessionStorage.setItem(CHAVE_TENTATIVA, versao);
  } catch {
    /* segue sem a marca */
  }
}

export function useVersionCheck() {
  /** Versão que está no ar, preenchida só quando difere desta aba. */
  const versaoNova = ref<string | null>(null);

  let timer: ReturnType<typeof setInterval> | undefined;
  let ultimaChecagem = 0;

  async function checar() {
    // Achou uma vez, achou: o banner já está na tela, parar de perguntar.
    if (versaoNova.value) return;
    if (document.visibilityState !== 'visible') return;

    const agora = Date.now();
    if (agora - ultimaChecagem < INTERVALO_MINIMO_MS) return;
    ultimaChecagem = agora;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(HEALTH_URL, { cache: 'no-store', signal: controller.signal });
      if (!res.ok) return;

      const health = (await res.json()) as Health;
      if (!ehDeployNovo(health)) return;

      const versao = health.version || '';
      if (jaTentou(versao)) return;

      versaoNova.value = versao;
      parar();
    } catch {
      // Offline, backend fora, timeout: silêncio. Tenta no próximo ciclo.
    } finally {
      clearTimeout(timeout);
    }
  }

  // Voltar para o app é o momento mais provável de ter deploy novo esperando —
  // e é aí que o celular reativa a aba congelada.
  function aoVoltar() {
    if (document.visibilityState === 'visible') void checar();
  }

  function parar() {
    if (timer) clearInterval(timer);
    timer = undefined;
    document.removeEventListener('visibilitychange', aoVoltar);
  }

  /**
   * Reload de verdade. Aqui o service worker é de precache (`generateSW` +
   * `registerType: 'autoUpdate'`), então um reload seco poderia ser respondido
   * pelo próprio precache — o mesmo build de novo, e o aviso voltando para
   * sempre. O `update()` força o SW novo a instalar; como o modo é autoUpdate,
   * ele assume o controle e a página recarrega com o build novo.
   */
  async function atualizar() {
    if (versaoNova.value) marcarTentativa(versaoNova.value);
    try {
      const registro = await navigator.serviceWorker?.getRegistration();
      await registro?.update();
    } catch {
      /* sem SW, ou bloqueado: segue para o reload */
    }
    window.location.reload();
  }

  onMounted(() => {
    if (!temBaseline) return;
    void checar();
    timer = setInterval(() => void checar(), INTERVALO_MS);
    document.addEventListener('visibilitychange', aoVoltar);
  });

  onUnmounted(parar);

  return { versaoNova, atualizar };
}
