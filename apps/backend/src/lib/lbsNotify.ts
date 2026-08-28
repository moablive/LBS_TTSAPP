/**
 * Cliente da API interna do LBS Notify.
 *
 * ┌───────────────────────────────────────────────────────────────────────┐
 * │ Cópia por app. A fonte de referência é LBSNotify/README.md — o formato  │
 * │ do evento é o contrato, não este arquivo.                              │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * POR QUE ISTO EXISTE
 *
 * Antes, cada bot mandava o Web Push do próprio processo, com `web-push` e a
 * chave VAPID do app. Isso significava: fila nenhuma (um provedor lento
 * segurava o cron inteiro), idempotência nenhuma (restart no meio reenviava
 * tudo) e uma chave por app para operar. O Notify centraliza os três.
 *
 * A CHAMADA NUNCA PODE DERRUBAR QUEM CHAMOU. O emissor típico é um cron de
 * lembrete; se o Notify estiver fora do ar, o Telegram tem que sair do mesmo
 * jeito. Por isso toda função aqui devolve `boolean` e engole o erro no log.
 */

/** Evento no formato que `POST /internal/v1/events` espera. */
export interface EventoNotify {
  /**
   * Id ESTÁVEL do evento — é o contrato de idempotência.
   *
   * Derive do fato (`<app>:<tipo>:<entidade>:<instante>`), nunca de
   * `randomUUID()`: um id novo a cada execução faz o cron notificar a pessoa
   * de novo a cada restart, que é exatamente o que isto existe para impedir.
   */
  eventId: string;
  type: string;
  /** `loginhub_id` do destinatário. */
  userId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** ISO 8601. Ausente = assim que o worker pegar. */
  scheduledFor?: string;
  /** Colapsa eventos equivalentes ainda pendentes. Não use em lembrete individual. */
  dedupeKey?: string;
}

export interface ConfigNotify {
  /** Base da API, ex. `http://lbs_notify_api:3000`. */
  baseUrl: string;
  /** Nome do app no Notify: 'todo' | 'money' | 'notes' | 'tts'. */
  app: string;
  /** `LBS_NOTIFY_KEY_<APP>` do .env do Notify. */
  key: string | undefined;
  /** Feature flag do rollout. `false` = caminho legado, nada é enviado. */
  enabled: boolean;
  /** Timeout da chamada. O emissor é um cron; não pode ficar pendurado. */
  timeoutMs?: number;
}

export function criarClienteNotify(config: ConfigNotify) {
  const base = config.baseUrl.replace(/\/+$/, '');
  const timeout = config.timeoutMs ?? 5_000;

  /** `true` quando a integração está ligada E configurada. */
  const ativo = (): boolean => config.enabled && Boolean(config.key);

  async function chamar(rota: string, corpo: unknown): Promise<boolean> {
    if (!ativo()) return false;

    // AbortController e não só o timeout do fetch: sem isto, um Notify que
    // aceita a conexão e nunca responde trava o cron até o socket cair.
    const controle = new AbortController();
    const alarme = setTimeout(() => controle.abort(), timeout);

    try {
      const res = await fetch(`${base}${rota}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-lbs-app': config.app,
          'x-lbs-key': config.key!,
        },
        body: JSON.stringify(corpo),
        signal: controle.signal,
      });

      if (!res.ok) {
        console.error(`[lbs-notify] ${rota} respondeu ${res.status}: ${await res.text()}`);
        return false;
      }
      return true;
    } catch (err) {
      console.error(`[lbs-notify] falha ao chamar ${rota}:`, (err as Error).message);
      return false;
    } finally {
      clearTimeout(alarme);
    }
  }

  return {
    ativo,

    /** Enfileira um evento. Devolve `false` (sem lançar) se não deu. */
    emitir: (evento: EventoNotify): Promise<boolean> => chamar('/internal/v1/events', evento),

    /**
     * Enfileira em lote. Preferível no cron: uma requisição para N usuários em
     * vez de N requisições, e um evento inválido não derruba os outros.
     */
    emitirLote: (eventos: EventoNotify[]): Promise<boolean> =>
      eventos.length === 0
        ? Promise.resolve(true)
        : chamar('/internal/v1/events/batch', { events: eventos }),
  };
}

export type ClienteNotify = ReturnType<typeof criarClienteNotify>;
