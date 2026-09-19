import pg from "pg";

/**
 * Pool unico do processo.
 *
 * Antes o `telegram.routes.ts` criava o proprio `new Pool(...)`. Com a chegada
 * das rotas de push seriam dois pools para o MESMO banco, cada um com o limite
 * padrao de 10 conexoes — vinte conexoes ociosas por container, multiplicado
 * pelos containers da suite. Pool e caro e feito para ser compartilhado.
 *
 * Sem ORM, como o resto do app: sao tres tabelas.
 */
const { Pool } = pg;

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
