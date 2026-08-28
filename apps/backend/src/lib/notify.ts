import { criarClienteNotify } from './lbsNotify.js';

/**
 * Instancia unica do cliente do LBS Notify para o backend do LBSTTSAPP.
 *
 * Enquanto `TTS_NOTIFY_USE_CENTRAL` for `false`, `notify.ativo()` devolve
 * `false` e nenhuma chamada sai — este app nunca teve Web Push proprio, entao
 * aqui nao ha caminho legado para preservar: ou vai pelo Notify, ou nao vai.
 */
export const notify = criarClienteNotify({
  baseUrl: process.env.LBS_NOTIFY_URL ?? 'http://lbs_notify_api:3000',
  app: 'tts',
  key: process.env.LBS_NOTIFY_KEY,
  enabled: /^(1|true|yes|on)$/i.test((process.env.TTS_NOTIFY_USE_CENTRAL ?? '').trim()),
});

/**
 * Abaixo deste tempo o processamento nao gera notificacao.
 *
 * Notificar um trabalho de 3 segundos e ruido: a pessoa esta olhando para a
 * tela quando ele termina. O aviso so ajuda quando a traducao demorou o
 * bastante para ela ter trocado de aba — que e o caso de PDF grande passando
 * pelo Ollama.
 */
export const TTS_NOTIFY_MIN_MS = Number(process.env.TTS_NOTIFY_MIN_MS ?? 20_000);
