<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import QRCode from 'qrcode';
import { Send } from 'lucide-vue-next';
import { api } from '../services/http';

/**
 * Vínculo híbrido do Telegram: o PC autentica, o chat só recebe o vínculo.
 *
 * POR QUE ISTO SUBSTITUI O `ALLOWED_USER_IDS`
 *
 * O bot decidia quem entra por uma lista de IDs do Telegram no `.env`. Funciona,
 * mas o controle de acesso ficava fora do LoginHUB: quem sai da organização
 * mantinha o bot até alguém lembrar de editar o arquivo e reiniciar o container.
 *
 * Aqui a autenticação já aconteceu: quem vê este botão tem sessão do LoginHUB,
 * com 2FA cumprido. O que atravessa o chat é um passe de uso único, válido por
 * 10 minutos, que não abre nada além de gravar o vínculo — e desligar a conta no
 * hub passa a desligar o bot junto.
 */
const API_BASE = '/api/v1/telegram';

const telegramId = ref<string | null>(null);
const deepLink = ref<string | null>(null);
const qrDataUrl = ref('');
const carregando = ref(false);
const erro = ref('');
const segundosRestantes = ref(0);

let cronometro: ReturnType<typeof setInterval> | null = null;

onMounted(async () => {
  try {
    const { data } = await api.get(`${API_BASE}/link`);
    telegramId.value = data.telegramId;
  } catch {
    /* silencioso: o card ainda oferece o botao de vincular */
  }
});

onBeforeUnmount(pararCronometro);

function pararCronometro() {
  if (cronometro) clearInterval(cronometro);
  cronometro = null;
}

/**
 * O passe expira sozinho no servidor; o contador aqui é só honestidade visual.
 * Sem ele o QR fica na tela parecendo válido e a pessoa descobre que venceu
 * quando o bot recusa — que é o pior momento para descobrir.
 */
function iniciarCronometro(segundos: number) {
  pararCronometro();
  segundosRestantes.value = segundos;
  cronometro = setInterval(() => {
    segundosRestantes.value -= 1;
    if (segundosRestantes.value <= 0) {
      pararCronometro();
      deepLink.value = null;
      qrDataUrl.value = '';
    }
  }, 1000);
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

async function gerarLink() {
  if (carregando.value) return;
  carregando.value = true;
  erro.value = '';
  try {
    const { data } = await api.post(`${API_BASE}/link-token`);
    deepLink.value = data.deepLink;
    // QR desenhado no navegador: o passe não vai para gerador de terceiro.
    try {
      qrDataUrl.value = await QRCode.toDataURL(data.deepLink, {
        width: 180,
        margin: 1,
        color: { dark: '#020617', light: '#ffffff' },
      });
    } catch {
      qrDataUrl.value = '';
    }
    iniciarCronometro(data.expiresIn);
  } catch (e) {
    erro.value = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      ?? 'Não foi possível gerar o link. Tente de novo.';
  } finally {
    carregando.value = false;
  }
}

async function desvincular() {
  try {
    await api.delete(`${API_BASE}/link`);
    telegramId.value = null;
    deepLink.value = null;
    qrDataUrl.value = '';
    pararCronometro();
  } catch (e) {
    erro.value = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      ?? 'Não foi possível desvincular.';
  }
}
</script>

<template>
  <div class="bg-slate-900 border border-slate-800 rounded-2xl p-5">
    <div class="flex items-center gap-2 mb-1">
      <Send class="w-4 h-4 text-sky-400" />
      <h3 class="text-sm font-semibold text-white">Bot do Telegram</h3>
    </div>

    <!-- Já vinculado -->
    <template v-if="telegramId">
      <p class="text-xs text-slate-400 mb-3">
        Vinculado ao chat <code class="font-mono">{{ telegramId }}</code>.
      </p>
      <button
        type="button"
        class="text-xs px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 transition-colors"
        @click="desvincular"
      >
        Desvincular
      </button>
    </template>

    <!-- Ainda não vinculado -->
    <template v-else>
      <p class="text-xs text-slate-400 mb-3">
        Você já está autenticado aqui. Gere um link e abra no Telegram — não precisa
        digitar senha nem código no chat.
      </p>

      <button
        v-if="!deepLink"
        type="button"
        :disabled="carregando"
        class="text-xs px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white font-medium transition-colors"
        @click="gerarLink"
      >
        {{ carregando ? 'Gerando...' : 'Vincular Telegram' }}
      </button>

      <div v-else class="space-y-3 max-w-[220px]">
        <div v-if="qrDataUrl" class="flex justify-center">
          <img :src="qrDataUrl" alt="QR Code para abrir o bot no Telegram" class="rounded-xl bg-white p-2" />
        </div>

        <a
          :href="deepLink"
          target="_blank"
          rel="noopener"
          class="block text-center text-xs px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium transition-colors"
        >
          Abrir no Telegram
        </a>

        <p class="text-[11px] text-slate-500 text-center">
          Uso único · expira em {{ mmss(segundosRestantes) }}
        </p>

        <button
          type="button"
          class="w-full text-[11px] text-slate-500 hover:text-sky-400 transition-colors"
          @click="gerarLink"
        >
          Gerar outro link
        </button>
      </div>
    </template>

    <p v-if="erro" class="text-xs text-rose-400 mt-2">{{ erro }}</p>
  </div>
</template>
