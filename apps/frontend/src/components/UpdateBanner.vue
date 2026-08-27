<script setup lang="ts">
import { ref, computed } from 'vue';
import { useVersionCheck } from '../composables/useVersionCheck';

// Aviso de build novo. O sinal vem da comparação entre a versão congelada neste
// bundle e a que o /health do backend devolve — ver useVersionCheck.
const { versaoNova, atualizar } = useVersionCheck();

// Dispensar vale só para a versão dispensada e só nesta aba: se sair outro
// deploy depois, o aviso volta.
const dispensada = ref<string | null>(null);
const visivel = computed(() => Boolean(versaoNova.value) && dispensada.value !== versaoNova.value);

// Trava o botão durante o update()+reload, que leva um instante.
const aplicando = ref(false);
async function aplicar() {
  if (aplicando.value) return;
  aplicando.value = true;
  try {
    await atualizar();
  } finally {
    aplicando.value = false;
  }
}

// Rebuild sem bump muda só a data: aí a versão no ar é a mesma string e citá-la
// no texto confundiria ("a v0.0.3 já está no ar" para quem está na v0.0.3).
const versaoAtual = import.meta.env.VITE_APP_VERSION || '';
const descricao = computed(() =>
  versaoNova.value && versaoNova.value !== versaoAtual
    ? `A v${versaoNova.value} já está no ar. Atualize para carregar a versão mais recente.`
    : 'Um build mais recente está no ar. Atualize para carregá-lo.',
);
</script>

<template>
  <Transition
    enter-active-class="transition duration-300 ease-out"
    enter-from-class="translate-y-4 opacity-0"
    leave-active-class="transition duration-200 ease-in"
    leave-to-class="translate-y-4 opacity-0"
  >
    <div
      v-if="visivel"
      role="status"
      aria-live="polite"
      class="fixed inset-x-2 bottom-10 z-[10000] rounded-lg border border-brand-500/40 bg-slate-900/95
             p-3 text-slate-100 shadow-xl backdrop-blur-sm
             sm:left-auto sm:right-2 sm:bottom-9 sm:w-80"
    >
      <div class="flex items-start gap-2">
        <span class="mt-1.5 h-2 w-2 shrink-0 animate-pulse rounded-full bg-brand-500" />
        <div class="min-w-0">
          <p class="text-sm font-semibold leading-snug">Nova versão disponível</p>
          <p class="mt-0.5 text-xs leading-snug text-slate-400">{{ descricao }}</p>
        </div>
      </div>

      <div class="mt-3 flex justify-end gap-2">
        <button
          type="button"
          :disabled="aplicando"
          class="rounded-md px-3 py-1.5 text-xs font-medium text-slate-300 transition
                 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-50"
          @click="dispensada = versaoNova"
        >
          Depois
        </button>
        <button
          type="button"
          :disabled="aplicando"
          class="rounded-md bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white transition
                 hover:bg-brand-600 disabled:cursor-wait disabled:opacity-70"
          @click="aplicar"
        >
          {{ aplicando ? 'Atualizando…' : 'Atualizar agora' }}
        </button>
      </div>
    </div>
  </Transition>
</template>
