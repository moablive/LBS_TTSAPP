import { Router } from "express";
import crypto from "node:crypto";
import pg from "pg";

/**
 * Identidade central e vínculo híbrido do Telegram.
 *
 * POR QUE ISTO EXISTE
 *
 * O bot decidia quem entra por `ALLOWED_USER_IDS`, uma lista de IDs do Telegram
 * no `.env`. Funciona, mas o controle de acesso fica fora do LoginHUB: quem sai
 * da organização mantém o bot até alguém lembrar de editar o arquivo e
 * reiniciar o container. O hub existe justamente para isso não depender de
 * memória humana — desligar a conta lá tem de desligar tudo.
 *
 * Agora vale o mesmo desenho dos outros apps: a pessoa entra no app pelo PC,
 * com 2FA, e de lá emite um passe de uso único; o deep link abre o bot com o
 * passe no `/start`, e o bot o troca pelo vínculo `telegram_id → loginhub_id`.
 *
 * O que atravessa o chat é só o passe — 10 minutos, uso único, e guardado como
 * SHA-256: vazamento do banco não entrega passe utilizável.
 *
 * Pool próprio, sem ORM, de propósito: este app não tinha banco nenhum até
 * aqui, e trazer um ORM inteiro para duas tabelas seria peso sem retorno.
 */
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/** Janela curta: o passe atravessa um canal que guarda histórico. */
const TTL_MINUTOS = 10;

const hash = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

/** `@` opcional no env — o deep link não aceita a arroba. */
const usuarioDoBot = () => (process.env.TELEGRAM_BOT_USERNAME ?? "").replace(/^@/, "");

/** Rotas de sessão: quem chama já passou pelo `authMiddleware`. */
export const telegramRouter = Router();

telegramRouter.get("/link", async (req, res) => {
  const loginhubId = Number((req as any).user?.sub);
  const r = await pool.query("SELECT telegram_id FROM user_settings WHERE loginhub_id = $1", [loginhubId]);
  res.json({ telegramId: r.rows[0]?.telegram_id ?? null, bot: usuarioDoBot() || null });
});

/**
 * Emite o passe e devolve o deep link pronto.
 *
 * Os passes anteriores desta conta que ainda não foram usados são apagados:
 * dois QR válidos ao mesmo tempo é convite a vincular o aparelho errado, e quem
 * pede um passe novo está dizendo que o anterior não serviu.
 */
telegramRouter.post("/link-token", async (req, res) => {
  const bot = usuarioDoBot();
  if (!bot) {
    return res.status(500).json({
      error: "CONFIG_AUSENTE",
      message: "TELEGRAM_BOT_USERNAME nao esta configurado neste servico.",
    });
  }

  const loginhubId = Number((req as any).user?.sub);

  await pool.query(
    "DELETE FROM telegram_link_tokens WHERE loginhub_id = $1 AND usado_em IS NULL",
    [loginhubId],
  );

  // 32 bytes do CSPRNG. `base64url` porque o payload do /start do Telegram só
  // aceita [A-Za-z0-9_-] e no maximo 64 caracteres.
  const passe = crypto.randomBytes(32).toString("base64url");
  const expiraEm = new Date(Date.now() + TTL_MINUTOS * 60_000);

  await pool.query(
    "INSERT INTO telegram_link_tokens (token_hash, loginhub_id, expira_em) VALUES ($1, $2, $3)",
    [hash(passe), loginhubId, expiraEm],
  );

  res.json({
    deepLink: `https://t.me/${bot}?start=${passe}`,
    bot,
    expiresIn: TTL_MINUTOS * 60,
    expiraEm: expiraEm.toISOString(),
  });
});

/** Desfaz o vínculo. O bot volta a não reconhecer aquele Telegram. */
telegramRouter.delete("/link", async (req, res) => {
  const loginhubId = Number((req as any).user?.sub);
  await pool.query("UPDATE user_settings SET telegram_id = NULL WHERE loginhub_id = $1", [loginhubId]);
  res.json({ telegramId: null });
});

/**
 * Rotas de serviço — o BOT chama, com a chave de serviço.
 *
 * Ficam neste arquivo, e não em outro, para o passe e o consumo ficarem lado a
 * lado: quem for mexer numa ponta enxerga a outra.
 */
export const telegramBotRouter = Router();

/** Guarda de serviço: o bot apresenta a chave compartilhada. */
export function requireBotKey(req: any, res: any, next: any) {
  const esperado = process.env.BOT_SERVICE_KEY;
  if (!esperado) {
    return res.status(500).json({ error: "CONFIG_AUSENTE", message: "BOT_SERVICE_KEY nao configurado." });
  }
  const key = req.headers["x-api-key"];
  if (typeof key !== "string" || key !== esperado) {
    return res.status(401).json({ error: "unauthorized" });
  }
  return next();
}

/** Este Telegram está vinculado? É o que substitui o `ALLOWED_USER_IDS`. */
telegramBotRouter.get("/user-by-telegram/:telegramId", async (req, res) => {
  const r = await pool.query(
    "SELECT loginhub_id FROM user_settings WHERE telegram_id = $1 LIMIT 1",
    [req.params.telegramId],
  );
  if (!r.rows[0]) return res.status(404).json({ error: "not_found" });
  res.json({ loginhubId: r.rows[0].loginhub_id });
});

telegramBotRouter.post("/consume-link-token", async (req, res) => {
  const { token, telegramId } = req.body as { token?: unknown; telegramId?: unknown };

  if (typeof token !== "string" || !token || typeof telegramId !== "string" || !telegramId) {
    return res.status(400).json({ error: "DADOS_INCOMPLETOS", message: "token e telegramId sao obrigatorios." });
  }

  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");

    // Limpeza oportunista: sem cron, sem tabela crescendo para sempre. Passe
    // vencido nao serve para nada e nao precisa de auditoria.
    await cliente.query("DELETE FROM telegram_link_tokens WHERE expira_em < now()");

    // `FOR UPDATE` resolve a corrida: dois consumos simultaneos do mesmo passe
    // serializam aqui, e o segundo encontra `usado_em` preenchido.
    const achado = await cliente.query(
      `SELECT token_hash, loginhub_id FROM telegram_link_tokens
        WHERE token_hash = $1 AND usado_em IS NULL AND expira_em > now()
        FOR UPDATE`,
      [hash(token)],
    );

    if (!achado.rows[0]) {
      await cliente.query("ROLLBACK");
      // Uma mensagem so para os tres casos (inexistente, expirado, ja usado): de
      // fora nao da para distinguir, e distinguir so ajudaria quem tenta adivinhar.
      return res.status(401).json({
        error: "PASSE_INVALIDO",
        message: "Este link de vinculo nao vale mais. Gere outro no app.",
      });
    }

    const loginhubId = achado.rows[0].loginhub_id as number;
    await cliente.query("UPDATE telegram_link_tokens SET usado_em = now() WHERE token_hash = $1", [
      achado.rows[0].token_hash,
    ]);

    // Solta o vinculo antigo deste Telegram: `telegram_id` tem UNIQUE proprio, e
    // o `ON CONFLICT (loginhub_id)` abaixo nao cobre ele. Sem isto, revincular a
    // uma conta nova do hub estoura 23505.
    await cliente.query("DELETE FROM user_settings WHERE telegram_id = $1 AND loginhub_id <> $2", [
      telegramId,
      loginhubId,
    ]);
    await cliente.query(
      `INSERT INTO user_settings (loginhub_id, telegram_id) VALUES ($1, $2)
       ON CONFLICT (loginhub_id) DO UPDATE SET telegram_id = EXCLUDED.telegram_id`,
      [loginhubId, telegramId],
    );

    await cliente.query("COMMIT");
    res.json({ loginhubId, telegramId });
  } catch (err) {
    await cliente.query("ROLLBACK");
    throw err;
  } finally {
    cliente.release();
  }
});
