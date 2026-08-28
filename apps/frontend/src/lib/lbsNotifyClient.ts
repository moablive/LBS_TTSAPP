/**
 * Cliente da API pública do LBS Notify (registro de aparelho).
 *
 * ┌───────────────────────────────────────────────────────────────────────┐
 * │ Cópia por app. O contrato é LBSNotify/README.md, não este arquivo.      │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * `VITE_LBS_NOTIFY_URL` é a chave do rollout gradual:
 *
 *   vazio      -> o app usa as rotas `/api/push/*` dele mesmo (comportamento atual)
 *   preenchido -> o aparelho é registrado na plataforma central
 *
 * Uma `PushSubscription` fica amarrada à chave pública VAPID usada no
 * `subscribe()`. Trocar de caminho, portanto, NÃO reaproveita a inscrição que
 * já existe — o aparelho precisa se inscrever de novo com a chave do Notify.
 * É por isso que `usePush` sempre pede a chave antes de assinar.
 */

const BASE = (import.meta.env.VITE_LBS_NOTIFY_URL as string | undefined)?.replace(/\/+$/, '') ?? '';

/** `true` quando o app está apontado para a plataforma central. */
export const notifyCentralAtivo = BASE.length > 0;

/** Sessão do LoginHUB, lida da mesma chave que o auth-kit deste app usa. */
function token(chave: string): string | null {
  try {
    const t = localStorage.getItem(chave);
    // O auth-kit já guardou a string "undefined" aqui quando o `/auth/login`
    // respondeu um dos desfechos SEM sessão. `!!'undefined'` é `true`, então a
    // checagem tem que ser pelo texto, não pela truthiness.
    return t && t !== 'undefined' && t !== 'null' ? t : null;
  } catch {
    return null;
  }
}

async function chamar<T>(rota: string, init: RequestInit, chaveToken: string): Promise<T> {
  const jwt = token(chaveToken);
  if (!jwt) throw new Error('sem sessão para registrar o aparelho');

  const res = await fetch(`${BASE}${rota}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${jwt}`,
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    const corpo = await res.text().catch(() => '');
    throw new Error(`LBS Notify ${rota} -> ${res.status} ${corpo}`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/** Chave pública VAPID da central. Sem autenticação — é pública por definição. */
export async function notifyPublicKey(): Promise<string> {
  const res = await fetch(`${BASE}/v1/push/public-key`);
  if (!res.ok) throw new Error(`LBS Notify public-key -> ${res.status}`);
  const { publicKey } = (await res.json()) as { publicKey: string };
  return publicKey;
}

/** Registra (ou reativa) a subscription deste navegador. */
export function notifyRegistrarWebPush(
  sub: PushSubscriptionJSON,
  chaveToken: string,
): Promise<{ id: string }> {
  return chamar<{ id: string }>(
    '/v1/devices/webpush',
    {
      method: 'POST',
      body: JSON.stringify({
        endpoint: sub.endpoint,
        keys: sub.keys,
        userAgent: navigator.userAgent.slice(0, 500),
      }),
    },
    chaveToken,
  );
}

/** Desativa o aparelho na central. O registro não é apagado — vira histórico. */
export function notifyRemoverWebPush(endpoint: string, chaveToken: string): Promise<void> {
  return chamar<void>(
    '/v1/devices/webpush',
    { method: 'DELETE', body: JSON.stringify({ endpoint }) },
    chaveToken,
  );
}
