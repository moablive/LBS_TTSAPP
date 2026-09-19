import { ref } from 'vue';
import { api } from '../services/http';

/**
 * Ativacao de Web Push neste aparelho.
 *
 * Ate 19/09/2026 este app dependia SO do LBS Notify, a central de push da
 * suite — sem tabela `push_subscriptions`, sem rota e sem par VAPID. Como a
 * central nunca entregou nada (faltava a borda publica no tunel), era o unico
 * app da suite incapaz de avisar o usuario, e o composable se declarava
 * `isSupported: false` para esconder isso.
 *
 * Hoje o app tem Web Push proprio e a central nao existe mais. O app so se
 * declara sem suporte quando o NAVEGADOR nao suporta — nunca por falta de
 * configuracao nossa.
 */

const API_BASE = '/api/v1/push';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * A inscricao foi criada com esta chave publica?
 *
 * `applicationServerKey` volta como ArrayBuffer cru; a comparacao e feita na
 * forma base64url, que e como a chave chega da API.
 */
function mesmaChave(sub: PushSubscription, publicKey: string): boolean {
  const bruto = sub.options?.applicationServerKey;
  if (!bruto) return false;
  const bytes = new Uint8Array(bruto as ArrayBuffer);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const atual = window.btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return atual === publicKey.replace(/=+$/, '');
}

export function usePush() {
  const isSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  const permission = ref<NotificationPermission | 'unsupported'>(
    isSupported ? Notification.permission : 'unsupported'
  );
  const isSubscribed = ref(false);
  const isBusy = ref(false);
  const error = ref<string | null>(null);

  async function refresh() {
    if (!isSupported) return;
    permission.value = Notification.permission;
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      isSubscribed.value = Boolean(sub);
    } catch {
      isSubscribed.value = false;
    }
  }

  async function enable(): Promise<boolean> {
    if (!isSupported) return false;
    isBusy.value = true;
    error.value = null;
    try {
      const perm = await Notification.requestPermission();
      permission.value = perm;
      if (perm !== 'granted') {
        error.value = 'Permissão de notificação negada pelo navegador.';
        return false;
      }

      const reg = await navigator.serviceWorker.ready;

      const publicKey = (await api.get<{ publicKey: string }>(`${API_BASE}/public-key`)).data.publicKey;

      let sub = await reg.pushManager.getSubscription();
      // Uma inscrição existente pode ter sido criada com OUTRO par VAPID —
      // aparelho inscrito antes de uma troca de chave, ou pela extinta central.
      // Ela nunca voltaria a receber, e o sintoma seria "ativei e não chega
      // nada", sem erro nenhum. Por isso a chave é conferida e a inscrição
      // divergente é refeita.
      if (sub && !mesmaChave(sub, publicKey)) {
        await sub.unsubscribe().catch(() => {});
        sub = null;
      }

      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        });
      }

      await api.post(`${API_BASE}/subscribe`, sub.toJSON());

      isSubscribed.value = true;
      return true;
    } catch (err: any) {
      console.error('Erro ao ativar push:', err);
      error.value =
        err?.response?.status === 503
          ? 'Notificações não estão configuradas neste servidor.'
          : 'Não foi possível ativar as notificações neste aparelho.';
      return false;
    } finally {
      isBusy.value = false;
    }
  }

  async function disable() {
    if (!isSupported) return;
    isBusy.value = true;
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await api.post(`${API_BASE}/unsubscribe`, { endpoint: sub.endpoint }).catch(() => {});
        await sub.unsubscribe();
      }
      isSubscribed.value = false;
    } finally {
      isBusy.value = false;
    }
  }

  void refresh();

  return { isSupported, permission, isSubscribed, isBusy, error, refresh, enable, disable };
}
