import webpush from "web-push";
import { pool } from "./db.js";

/**
 * Web Push proprio do LBSTTSAPP — configuracao e envio.
 *
 * Fica em `lib/` e nao junto das rotas porque quem envia de verdade e o fim da
 * traducao longa (`lib/notify.ts`), e `lib` importando de `routes` seria camada
 * invertida.
 */

export const pushConfigured = Boolean(
  process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY,
);

if (pushConfigured) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@astralwavelabel.com",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
}

export type PayloadPush = { title: string; body: string; url?: string };

/** Envia para UM endpoint ja conhecido (usado no push de confirmacao). */
export function enviarPushParaEndpoint(
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: PayloadPush,
) {
  return webpush.sendNotification(sub, JSON.stringify({ url: "/", ...payload }));
}

/**
 * Envia para TODOS os aparelhos do usuario.
 *
 * Inscricao morta (404/410 do servidor de push) e apagada na hora: aparelho
 * trocado ou app desinstalado deixa lixo que faria todo envio seguinte gastar
 * uma requisicao para nada.
 *
 * Nunca lanca: o chamador e o fim de uma traducao que o usuario esta esperando,
 * e falha de notificacao nao pode derrubar a resposta dele.
 */
export async function enviarPushParaUsuario(
  userId: string | number,
  payload: PayloadPush,
): Promise<number> {
  if (!pushConfigured) return 0;

  try {
    const { rows } = await pool.query(
      "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1",
      [String(userId)],
    );

    let entregues = 0;
    for (const r of rows) {
      try {
        await enviarPushParaEndpoint(
          { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } },
          payload,
        );
        entregues++;
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await pool.query("DELETE FROM push_subscriptions WHERE endpoint = $1", [r.endpoint]);
        } else {
          console.error("Falha ao enviar push:", err?.statusCode, err?.body ?? err?.message);
        }
      }
    }
    return entregues;
  } catch (err) {
    console.error("Falha ao consultar inscricoes de push:", err);
    return 0;
  }
}
