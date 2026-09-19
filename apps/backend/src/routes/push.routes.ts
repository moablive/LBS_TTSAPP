import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { pool } from "../lib/db.js";
import { enviarPushParaEndpoint, pushConfigured } from "../lib/push.js";

/**
 * Inscricao e cancelamento de Web Push.
 *
 * POR QUE ISTO EXISTE
 *
 * Ate 19/09/2026 este era o unico app da suite sem push proprio: o desenho
 * original mandava tudo pelo LBS Notify, a central. So que a central nunca
 * entregou uma notificacao — faltava a borda publica no tunel — e foi
 * descontinuada. Notes, Todo e Money seguiram funcionando o tempo todo pelo
 * caminho proprio; o TTS, que nao tinha, ficou sem nada.
 *
 * As rotas espelham as dos outros tres apps de proposito — mesmo contrato,
 * mesmos nomes — para o `usePush` do frontend ser o mesmo codigo em todos.
 */

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const unsubscribeSchema = z.object({ endpoint: z.string().url() });

export const pushRouter = Router();

/**
 * Sem par VAPID nao ha o que registrar. 503 e nao 500: e configuracao ausente,
 * nao defeito — e e isso que a interface mostra como "nao configurado neste
 * servidor", em vez de uma ativacao que morreria no servidor de push.
 */
pushRouter.use((_req, res, next) => {
  if (!pushConfigured) return res.status(503).json({ error: "push_not_configured" });
  next();
});

pushRouter.get("/public-key", (_req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

pushRouter.post("/subscribe", async (req, res) => {
  const parsed = subscribeSchema.parse(req.body);
  const userId = String((req as any).user?.sub);

  // O navegador reemite o MESMO endpoint ao reinscrever; o upsert impede linha
  // duplicada, que na pratica vira a mesma notificacao chegando duas vezes.
  await pool.query(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint)
     DO UPDATE SET user_id = EXCLUDED.user_id,
                   p256dh  = EXCLUDED.p256dh,
                   auth    = EXCLUDED.auth`,
    [crypto.randomUUID(), userId, parsed.endpoint, parsed.keys.p256dh, parsed.keys.auth],
  );

  // Push de confirmacao: a pessoa ve na hora que funcionou naquele aparelho.
  // Falhar aqui NAO invalida a inscricao — ela ja esta gravada, e o unico
  // prejuizo e nao ver o aviso de boas-vindas.
  try {
    await enviarPushParaEndpoint(
      { endpoint: parsed.endpoint, keys: parsed.keys },
      { title: "LBSTTSAPP", body: "🔔 Notificações ativadas neste aparelho!" },
    );
  } catch (err) {
    console.error("Falha ao enviar push de confirmacao:", err);
  }

  res.status(201).json({ ok: true });
});

pushRouter.post("/unsubscribe", async (req, res) => {
  const parsed = unsubscribeSchema.parse(req.body);
  const userId = String((req as any).user?.sub);

  // O `user_id` no WHERE nao e redundante: sem ele, qualquer sessao valida
  // poderia descadastrar o aparelho de outra pessoa sabendo o endpoint.
  await pool.query(
    "DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2",
    [parsed.endpoint, userId],
  );

  res.status(204).send();
});
