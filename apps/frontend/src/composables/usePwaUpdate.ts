import { computed, ref, watch } from 'vue';
import { useRegisterSW } from 'virtual:pwa-register/vue';
import { useVersionCheck } from './useVersionCheck';

/**
 * Registra o service worker e decide quando oferecer a atualizacao.
 *
 * Existem dois sinais de "saiu build novo", e eles se completam:
 *
 *   - o service worker (`needRefresh`), que e o sinal preciso: quando ele
 *     acende, os arquivos novos JA estao baixados e trocar e instantaneo;
 *   - o `useVersionCheck`, que pergunta a versao ao /health. Chega antes,
 *     porque o SW so procura atualizacao quando alguem manda.
 *
 * Por isso o segundo empurra o primeiro: ao ver versao nova na API, pedimos
 * `registration.update()`. Sem isso um reload simples seria servido pelo
 * precache do proprio SW — ou seja, devolveria o `index.html` velho e o aviso
 * voltaria para sempre, que e o modo mais frustrante de um PWA quebrar.
 *
 * Este app e o unico da suite com precache de verdade (`generateSW`). Nos
 * outros tres o sw.js so trata push, e la o `useVersionCheck` basta sozinho.
 */

/** Teto para a espera pelo SW novo ficar pronto, com o usuario olhando. */
const LIMITE_ESPERA_MS = 8000;

async function esperar(condicao: () => boolean, limiteMs: number): Promise<boolean> {
  const fim = Date.now() + limiteMs;
  while (!condicao() && Date.now() < fim) {
    await new Promise((r) => setTimeout(r, 250));
  }
  return condicao();
}

export function usePwaUpdate() {
  const { versaoNova, atualizar: recarregar } = useVersionCheck();

  let registro: ServiceWorkerRegistration | undefined;

  const { needRefresh, updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, r) {
      registro = r;
    },
    onRegisterError(erro) {
      // Navegador sem SW, http sem TLS, storage bloqueado: o app segue
      // funcionando sem PWA, e o useVersionCheck continua cobrindo o aviso.
      console.warn('[pwa] service worker nao registrado:', erro);
    },
  });

  /** Verdadeiro assim que qualquer um dos dois sinais aparecer. */
  const precisaAtualizar = computed(() => needRefresh.value || Boolean(versaoNova.value));

  /** Trava o botao enquanto o SW novo termina de instalar. */
  const aplicando = ref(false);

  // O /health acusou deploy antes de o SW perceber: manda ele procurar agora.
  watch(versaoNova, (v) => {
    if (v && !needRefresh.value) void registro?.update();
  });

  async function aplicar() {
    if (aplicando.value) return;
    aplicando.value = true;

    try {
      if (!needRefresh.value && registro) {
        try {
          await registro.update();
        } catch {
          // Offline ou backend fora: cai no reload comum la embaixo.
        }
        await esperar(() => needRefresh.value, LIMITE_ESPERA_MS);
      }

      // Caminho bom: ativa o SW que esta esperando; ele recarrega a pagina.
      if (needRefresh.value) {
        await updateServiceWorker(true);
        return;
      }

      // Sem SW (navegador antigo, ou instalacao que falhou): reload normal.
      await recarregar();
    } finally {
      aplicando.value = false;
    }
  }

  return { precisaAtualizar, versaoNova, aplicando, aplicar };
}
