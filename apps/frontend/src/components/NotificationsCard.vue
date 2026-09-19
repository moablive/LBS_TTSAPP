<script setup lang="ts">
import { Bell, BellOff } from 'lucide-vue-next';
import { usePush } from '../composables/usePush';

/**
 * Liga/desliga Web Push neste aparelho.
 *
 * POR QUE ESTE COMPONENTE NASCEU EM 19/09/2026
 *
 * O `usePush` ja existia neste app e NENHUM componente o chamava — ou seja, o
 * codigo estava la e nao havia botao nenhum na interface. Somado a central de
 * notificacao que nunca entregou nada, o resultado pratico era um app sem
 * qualquer forma de avisar o usuario.
 *
 * Fica ao lado do card do Telegram de proposito: sao os dois canais de aviso
 * do app, e a pessoa escolhe por onde quer ser chamada quando a traducao longa
 * terminar.
 */
const { isSupported, permission, isSubscribed, isBusy, error, enable, disable } = usePush();

async function alternar() {
  if (isSubscribed.value) await disable();
  else await enable();
}
</script>

<template>
  <div class="bg-slate-900 border border-slate-800 rounded-2xl p-5">
    <div class="flex items-center gap-2 mb-1">
      <Bell v-if="isSubscribed" class="w-4 h-4 text-sky-400" />
      <BellOff v-else class="w-4 h-4 text-slate-500" />
      <h3 class="text-sm font-semibold text-white">Notificações neste aparelho</h3>
    </div>

    <!-- Navegador sem suporte. Só este caso esconde o botão: falta de
         configuração do servidor vira erro visível ao clicar, não silêncio. -->
    <template v-if="!isSupported">
      <p class="text-xs text-slate-400">
        Este navegador não suporta notificações. No iPhone é preciso adicionar o
        app à Tela de Início primeiro.
      </p>
    </template>

    <!-- Permissão negada no navegador: o botão não resolve, só as configurações
         do site resolvem — dizer isso evita o clique que não faz nada. -->
    <template v-else-if="permission === 'denied'">
      <p class="text-xs text-amber-400/90">
        As notificações estão bloqueadas nas configurações do navegador para este
        site. Libere por lá e recarregue a página.
      </p>
    </template>

    <template v-else>
      <p class="text-xs text-slate-400 mb-3">
        {{
          isSubscribed
            ? 'Você recebe um aviso quando uma tradução longa termina, mesmo com o app fechado.'
            : 'Receba um aviso quando uma tradução longa terminar, mesmo com o app fechado.'
        }}
      </p>

      <button
        type="button"
        :disabled="isBusy"
        class="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-60"
        :class="isSubscribed
          ? 'bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700'
          : 'bg-sky-600 hover:bg-sky-500 text-white'"
        @click="alternar"
      >
        {{ isBusy ? 'Aguarde...' : isSubscribed ? 'Desativar' : 'Ativar notificações' }}
      </button>

      <p v-if="error" class="text-xs text-red-400 mt-2">{{ error }}</p>
    </template>
  </div>
</template>
