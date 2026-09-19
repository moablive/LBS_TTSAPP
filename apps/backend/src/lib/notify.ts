import { enviarPushParaUsuario, pushConfigured } from './push.js';

/**
 * Avisos ao usuario deste app.
 *
 * Ate 19/09/2026 havia dois caminhos, e o preferido era o LBS Notify — a
 * central de push da suite, que deduplicava por `eventId`. A central foi
 * descontinuada (nunca entregou um unico aviso: faltava a borda publica no
 * tunel), entao sobrou um caminho so, o Web Push proprio.
 */

/**
 * Abaixo deste tempo o processamento nao gera notificacao.
 *
 * Notificar um trabalho de 3 segundos e ruido: a pessoa esta olhando para a
 * tela quando ele termina. O aviso so ajuda quando a traducao demorou o
 * bastante para ela ter trocado de aba — que e o caso de PDF grande passando
 * pelo Ollama.
 */
export const TTS_NOTIFY_MIN_MS = Number(process.env.TTS_NOTIFY_MIN_MS ?? 20_000);

/** Ha canal capaz de entregar um aviso agora? */
export const podeAvisar = () => pushConfigured;

/**
 * Manda um aviso ao usuario.
 *
 * `eventId` continua no contrato mesmo sem a central: ele documenta QUAL fato
 * gerou o aviso e e o que um dia permitiria deduplicar. Hoje ninguem deduplica
 * — o `web-push` entrega o que recebe —, entao quem chama e responsavel por
 * nao emitir duas vezes o mesmo fato.
 *
 * NUNCA lanca e NUNCA e esperado com `await` pelo chamador: o emissor e o fim
 * de uma traducao que o usuario esta aguardando.
 */
export async function avisarUsuario(evento: {
  eventId: string;
  type: string;
  userId: string;
  title: string;
  body: string;
  url?: string;
}): Promise<void> {
  try {
    await enviarPushParaUsuario(evento.userId, {
      title: evento.title,
      body: evento.body,
      url: evento.url ?? '/',
    });
  } catch (err) {
    console.error('Falha ao avisar usuario:', err);
  }
}
