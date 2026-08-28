#!/usr/bin/env node
/**
 * Incrementa a versão de build do app e propaga para o ambiente Docker.
 *
 * A versão vive no arquivo `VERSION` (fonte da verdade, versionado no git) e é
 * espelhada no `.env` como APP_VERSION, de onde o docker-compose a injeta:
 *   - backend  -> APP_VERSION       (aparece no /health)
 *   - frontend -> VITE_APP_VERSION  (build-arg; badge + aviso de update)
 *
 * O `.env` é o arquivo que o redeploy.sh do painel passa em `--env-file`, ou seja
 * é dele que sai a interpolação de `${APP_VERSION}` no compose. Escrever no
 * shared.env seria errado: a versão é de cada app, não da infra comum.
 *
 * Uso:
 *   node scripts/bump-version.mjs           # 0.0.1 -> 0.0.2  (patch, padrão)
 *   node scripts/bump-version.mjs --minor   # 0.0.9 -> 0.1.0
 *   node scripts/bump-version.mjs --major   # 0.1.4 -> 1.0.0
 *   node scripts/bump-version.mjs --set 2.5.0
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const versionFile = resolve(root, 'VERSION');
const envFiles = ['.env'].map((f) => resolve(root, f));

const args = process.argv.slice(2);
const setIdx = args.indexOf('--set');

const current = existsSync(versionFile)
  ? readFileSync(versionFile, 'utf8').trim()
  : '0.0.0';

const parse = (v) => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (!m) throw new Error(`Versão inválida em VERSION: "${v}" (esperado MAJOR.MINOR.PATCH)`);
  return m.slice(1).map(Number);
};

let next;
if (setIdx !== -1) {
  next = args[setIdx + 1];
  parse(next); // valida
} else {
  const [major, minor, patch] = parse(current);
  if (args.includes('--major')) next = `${major + 1}.0.0`;
  else if (args.includes('--minor')) next = `${major}.${minor + 1}.0`;
  else next = `${major}.${minor}.${patch + 1}`;
}

const buildDate = new Date().toISOString();

writeFileSync(versionFile, `${next}\n`);

// Espelha no .env. Reescreve a chave se já existir, senão anexa o bloco.
for (const file of envFiles) {
  if (!existsSync(file)) continue;
  let content = readFileSync(file, 'utf8');

  const upsert = (key, value) => {
    const re = new RegExp(`^${key}=.*$`, 'm');
    if (re.test(content)) content = content.replace(re, `${key}=${value}`);
    else content = `${content.replace(/\n*$/, '\n')}${key}=${value}\n`;
  };

  if (!/# VERSÃO DO BUILD/.test(content)) {
    content = `${content.replace(/\n*$/, '\n')}
# ==========================================
# VERSÃO DO BUILD (gerado por scripts/bump-version.mjs — não editar à mão)
# ==========================================
`;
  }
  upsert('APP_VERSION', next);
  upsert('APP_BUILD_DATE', buildDate);

  writeFileSync(file, content);
}

console.log(`v${current} -> v${next}  (build ${buildDate})`);
