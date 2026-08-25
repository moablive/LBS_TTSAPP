<script setup lang="ts">
import { onMounted, ref } from 'vue';
import QRCode from 'qrcode';
import { useAuthStore } from '../stores/auth';
import type { TwoFactorSetupData } from '../lib/hubAuthClient';

/**
 * Enrolamento de 2FA, dentro do proprio app.
 *
 * Antes, `require2FASetup` mandava a pessoa para `loginhub.../enrolar-2fa` com
 * o passe na query string. Duas consequencias, as duas vistas em producao:
 *
 *  1. O convite passava a depender do build do painel do hub. Um navegador com
 *     o service worker antigo do hub em cache nao conhecia aquela rota, caia no
 *     `<Route path="*">` e ia parar no LOGIN DO HUB — com a conta ainda sem 2FA.
 *  2. O passe ficava no historico do navegador e no log de acesso, porque query
 *     string e registrada em todo lugar por onde a URL passa.
 *
 * O QR e desenhado NO NAVEGADOR a partir da URI `otpauth://` que o hub devolve
 * — nenhum gerador de terceiro ve o segredo — e a chave em texto continua como
 * alternativa para quem prefere digitar.
 */
const props = defineProps<{ setupToken: string }>();
const emit = defineEmits<{ (e: 'concluido'): void }>();

const auth = useAuthStore();

const dados = ref<TwoFactorSetupData | null>(null);
const qrDataUrl = ref('');
const codigo = ref('');
const backupCodes = ref<string[] | null>(null);
const carregando = ref(false);
const copiado = ref(false);
const erro = ref('');

onMounted(async () => {
  carregando.value = true;
  try {
    dados.value = await auth.iniciarEnrolamento(props.setupToken);
    // Falhar o QR nao pode travar o enrolamento: a chave manual resolve.
    try {
      qrDataUrl.value = await QRCode.toDataURL(dados.value.otpauthUri, {
        width: 200,
        margin: 1,
        color: { dark: '#020617', light: '#ffffff' },
      });
    } catch {
      qrDataUrl.value = '';
    }
  } catch (e) {
    erro.value = traduzir(e);
  } finally {
    carregando.value = false;
  }
});

function traduzir(e: unknown): string {
  const cod = (e as { code?: string })?.code;
  if (cod === 'CODIGO_INVALIDO') return 'Código inválido. Confira o relógio do celular e tente o próximo.';
  if (cod === 'MUITAS_TENTATIVAS') return (e as Error).message;
  if (cod === 'TOKEN_EXPIRADO' || cod === 'TOKEN_NAO_E_SESSAO' || cod === 'TOKEN_INVALIDO')
    return 'A janela de configuração expirou. Entre de novo para gerar outro código.';
  if (cod === 'REDE') return 'Sem conexão com o servidor de login.';
  return (e as Error)?.message || 'Não foi possível configurar a verificação em duas etapas.';
}

async function confirmar() {
  if (carregando.value) return;
  carregando.value = true;
  erro.value = '';
  try {
    const r = await auth.confirmarEnrolamento(codigo.value.trim(), props.setupToken);
    backupCodes.value = r.backupCodes;
  } catch (e) {
    erro.value = traduzir(e);
  } finally {
    carregando.value = false;
  }
}

function copiar() {
  if (!backupCodes.value) return;
  void navigator.clipboard.writeText(backupCodes.value.join('\n'));
  copiado.value = true;
}
</script>

<template>
  <div class="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-6">
    <!-- Códigos de recuperação: única vez que aparecem. -->
    <template v-if="backupCodes">
      <div class="text-center">
        <div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 mb-4">
          <svg class="w-7 h-7 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h1 class="text-2xl font-extrabold text-white">Verificação ativada</h1>
      </div>

      <div class="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
        <strong class="block text-white">Guarde estes códigos agora.</strong>
        <span class="text-slate-400">
          Eles não voltam a ser exibidos e são a sua única entrada se você perder o celular.
          Cada um serve uma vez só.
        </span>
      </div>

      <ul class="grid grid-cols-2 gap-2">
        <li
          v-for="c in backupCodes"
          :key="c"
          class="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-center font-mono text-sm text-white"
        >
          {{ c }}
        </li>
      </ul>

      <button
        type="button"
        class="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-slate-700 transition-all"
        @click="copiar"
      >
        {{ copiado ? 'Copiado' : 'Copiar todos' }}
      </button>

      <button
        type="button"
        class="w-full bg-sky-600 hover:bg-sky-500 text-white rounded-xl px-4 py-3 text-sm font-semibold transition-all"
        @click="emit('concluido')"
      >
        Continuar para o LBSTTSAPP
      </button>

      <p class="text-xs text-slate-500 text-center">
        Suas outras sessões foram encerradas. Você vai precisar entrar de novo nos outros dispositivos.
      </p>
    </template>

    <!-- Enrolamento -->
    <template v-else>
      <div class="text-center">
        <div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-sky-500/15 border border-sky-500/30 mb-4">
          <svg class="w-7 h-7 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2.5"
              d="M9 12.75L11.25 15 15 9.75M21 12c0 4.97-3.79 9.16-8.66 9.93a1.5 1.5 0 01-.68 0C6.79 21.16 3 16.97 3 12V6.24a1.5 1.5 0 01.98-1.4l7.5-2.73a1.5 1.5 0 011.04 0l7.5 2.73a1.5 1.5 0 01.98 1.4V12z"
            />
          </svg>
        </div>
        <h1 class="text-2xl font-extrabold text-white">Verificação em duas etapas</h1>
        <p class="text-slate-400 mt-2 text-sm">Obrigatória nesta conta. Tenha o celular à mão.</p>
      </div>

      <div v-if="carregando && !dados" class="flex justify-center py-8">
        <div class="w-7 h-7 rounded-full border-2 border-slate-700 border-t-sky-500 animate-spin"></div>
      </div>

      <template v-else-if="dados">
        <ol class="list-decimal space-y-1 pl-5 text-sm text-slate-400">
          <li>Abra o Google Authenticator, Authy, 1Password ou Microsoft Authenticator.</li>
          <li>{{ qrDataUrl ? 'Escaneie o QR abaixo (ou informe a chave manualmente).' : 'Adicione uma conta e informe a chave abaixo.' }}</li>
          <li>Digite o código de 6 dígitos que o app mostrar.</li>
        </ol>

        <div v-if="qrDataUrl" class="flex justify-center">
          <img :src="qrDataUrl" alt="QR Code para o aplicativo autenticador" class="rounded-xl bg-white p-3" />
        </div>

        <div class="rounded-xl border border-slate-700 bg-slate-800 p-3">
          <p class="text-[11px] uppercase tracking-wider text-slate-500">Conta</p>
          <p class="text-sm text-white break-all">{{ dados.label }}</p>
          <p class="text-[11px] uppercase tracking-wider text-slate-500 mt-2">Chave</p>
          <code class="block break-all font-mono text-sm text-white">{{ dados.secret }}</code>
          <a :href="dados.otpauthUri" class="mt-2 inline-block text-xs text-sky-400 hover:underline">
            Estou no celular — abrir no autenticador
          </a>
        </div>

        <form class="space-y-4" @submit.prevent="confirmar">
          <input
            v-model="codigo"
            type="text"
            required
            autocomplete="one-time-code"
            inputmode="numeric"
            maxlength="6"
            placeholder="000000"
            class="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-center tracking-[0.4em] text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
          />

          <p
            v-if="erro"
            class="bg-rose-500/10 border border-rose-500/30 p-3 rounded-xl text-rose-300 text-sm"
          >
            {{ erro }}
          </p>

          <button
            type="submit"
            :disabled="carregando || codigo.trim().length !== 6"
            class="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white rounded-xl px-4 py-3 text-sm font-semibold transition-all"
          >
            {{ carregando ? 'Ativando...' : 'Ativar' }}
          </button>
        </form>
      </template>

      <p
        v-else-if="erro"
        class="bg-rose-500/10 border border-rose-500/30 p-3 rounded-xl text-rose-300 text-sm"
      >
        {{ erro }}
      </p>
    </template>
  </div>
</template>
