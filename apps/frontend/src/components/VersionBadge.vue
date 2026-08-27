<script setup lang="ts">
import { computed } from 'vue';

// Injetadas pelo docker-compose como build-arg, a partir do APP_VERSION do .env
// (arquivo VERSION + scripts/bump-version.mjs).
const version = import.meta.env.VITE_APP_VERSION || '0.0.0';
const buildDate = import.meta.env.VITE_APP_BUILD_DATE || '';

const title = computed(() => {
  if (!buildDate) return `LBSTTSAPP v${version}`;
  const d = new Date(buildDate);
  const stamp = Number.isNaN(d.getTime())
    ? buildDate
    : d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  return `LBSTTSAPP v${version} — build de ${stamp}`;
});
</script>

<template>
  <span
    class="fixed bottom-2 right-2 z-[9999] select-none rounded-md bg-slate-900/70 px-2 py-0.5
           font-mono text-[11px] leading-none text-slate-300 backdrop-blur-sm
           pointer-events-auto cursor-default"
    :title="title"
  >
    v{{ version }}
  </span>
</template>
