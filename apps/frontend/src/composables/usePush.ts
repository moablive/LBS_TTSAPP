import { ref } from 'vue';
import {
  notifyCentralAtivo,
  notifyPublicKey,
  notifyRegistrarWebPush,
  notifyRemoverWebPush,
} from '../lib/lbsNotifyClient';

/**
 * Ativacao de Web Push neste aparelho.
 *
 * DIFERENCA PARA OS OUTROS TRES APPS: o LBSTTSAPP nunca teve Web Push proprio —
 * nao ha tabela `push_subscriptions`, nem rota `/api/push/*`, nem par VAPID.
 * Aqui existe UM caminho so, o LBS Notify. Com `VITE_LBS_NOTIFY_URL` vazio o
 * composable se declara nao suportado e a UI nao oferece o botao, em vez de
 * oferecer algo que nao teria para onde registrar.
 */

const CHAVE_TOKEN = 'awl_token';

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

export function usePush() {
  const isSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    notifyCentralAtivo;

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
        error.value = 'Permissao de notificacao negada pelo navegador.';
        return false;
      }

      const reg = await navigator.serviceWorker.ready;
      const publicKey = await notifyPublicKey();

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        });
      }

      await notifyRegistrarWebPush(sub.toJSON(), CHAVE_TOKEN);
      isSubscribed.value = true;
      return true;
    } catch (err) {
      console.error('Erro ao ativar push:', err);
      error.value = 'Nao foi possivel ativar as notificacoes neste aparelho.';
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
        await notifyRemoverWebPush(sub.endpoint, CHAVE_TOKEN).catch(() => {});
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
