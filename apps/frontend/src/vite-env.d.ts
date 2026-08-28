/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/vue" />

/**
 * Sem este arquivo o `vue-tsc --noEmit` do build não conhece `import.meta.env`
 * — nenhum código do app usava as variáveis do Vite até o aviso de versão
 * chegar, então a falta nunca tinha aparecido.
 */
interface ImportMetaEnv {
  readonly VITE_LOGINHUB_API_URL: string;
  readonly VITE_LOGINHUB_APP_ID: string;
  /** Injetadas pelo docker-compose como build-arg (ver scripts/bump-version.mjs). */
  readonly VITE_APP_VERSION: string;
  readonly VITE_APP_BUILD_DATE: string;
  readonly VITE_API_BASE_URL: string;
  /**
   * Base da plataforma central de notificacoes. VAZIO = este app nao registra
   * aparelho em lugar nenhum (ele nunca teve Web Push proprio); preenchido, o
   * registro vai para o LBS Notify.
   */
  readonly VITE_LBS_NOTIFY_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
