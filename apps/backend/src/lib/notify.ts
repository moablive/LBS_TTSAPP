import { criarClienteNotify } from './lbsNotify.js';
import { enviarPushParaUsuario, pushConfigured } from './push.js';

/**
 * Instancia unica do cliente do LBS Notify para o backend do LBSTTSAPP.
 *
 * Enquanto `TTS_NOTIFY_USE_CENTRAL` for `false`, `notify.ativo()` devolve
 * `false` e nada sai por aqui — o caminho passa a ser o Web Push proprio.
 * Quem escolhe entre os dois e `avisarUsuario`, no fim deste arquivo.
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

/** Ha algum canal capaz de entregar um aviso agora? */
export const podeAvisar = () => notify.ativo() || pushConfigured;

/**
 * Manda um aviso ao usuario pelo canal que estiver de pe.
 *
 * A central tem precedencia quando ligada — e ela que deduplica por `eventId`
 * entre os quatro apps. Com ela desligada (o estado real desde 28/08/2026), vai
 * pelo Web Push proprio, que nao tem deduplicacao: por isso quem chama e
 * responsavel por nao emitir duas vezes o mesmo fato.
 *
 * NUNCA lanca e NUNCA e esperado com `await` pelo chamador: o emissor e o fim de
 * uma traducao que o usuario esta aguardando.
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
    if (notify.ativo()) {
      await notify.emitir({
        eventId: evento.eventId,
        type: evento.type,
        userId: evento.userId,
        title: evento.title,
        body: evento.body,
        data: { url: evento.url ?? '/' },
      });
      return;
    }
    await enviarPushParaUsuario(evento.userId, {
      title: evento.title,
      body: evento.body,
      url: evento.url ?? '/',
    });
  } catch (err) {
    console.error('Falha ao avisar usuario:', err);
  }
}
