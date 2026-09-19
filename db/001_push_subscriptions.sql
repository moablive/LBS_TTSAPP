-- Inscricoes de Web Push deste aparelho -> este usuario do LoginHUB.
--
-- POR QUE ESTE ARQUIVO EXISTE
--
-- As duas tabelas anteriores do LBSTTSAPP (`user_settings` e
-- `telegram_link_tokens`) foram criadas a mao direto no Postgres: o repositorio
-- nao guardava o DDL de nenhuma delas, entao recriar o banco do zero era
-- adivinhacao. A partir daqui o DDL entra versionado.
--
-- Idempotente de proposito — rodar de novo num banco que ja tem a tabela nao
-- pode falhar, porque nao ha ferramenta de migracao aqui para controlar o que
-- ja rodou.
--
--   docker exec -i server_db_postgres psql -U admin_root -d lbsttsapp < db/001_push_subscriptions.sql

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          varchar(36)  PRIMARY KEY,
  -- loginhub_id de quem inscreveu. varchar(50) e nao integer para bater com os
  -- outros tres apps da suite, que guardam o mesmo id como texto.
  user_id     varchar(50)  NOT NULL,
  -- UNIQUE: o navegador reemite a MESMA URL de endpoint quando o app pede
  -- inscricao de novo. Sem a restricao, cada reabertura do app criaria uma
  -- linha nova e a pessoa receberia a mesma notificacao varias vezes.
  endpoint    text         NOT NULL UNIQUE,
  p256dh      text         NOT NULL,
  auth        text         NOT NULL,
  created_at  timestamptz  NOT NULL DEFAULT now()
);

-- O envio sempre parte de "todas as inscricoes deste usuario".
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
  ON push_subscriptions (user_id);
