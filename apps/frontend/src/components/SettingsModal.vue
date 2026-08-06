<script setup lang="ts">
import { X, Globe, UserCheck, Gauge } from 'lucide-vue-next';
import { Language, SpeedOption } from '../types';

defineProps<{
  open: boolean;
  languages: Language[];
  speeds: SpeedOption[];
  targetLang: string;
  gender: string;
  speed: string;
}>();

defineEmits<{
  (e: 'close'): void;
  (e: 'update:targetLang', val: string): void;
  (e: 'update:gender', val: string): void;
  (e: 'update:speed', val: string): void;
}>();
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
    <div class="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-slate-800 pb-4">
        <h2 class="text-lg font-bold text-white flex items-center gap-2">
          <Globe class="w-5 h-5 text-sky-400" />
          <span>Preferências de Tradução & Voz</span>
        </h2>
        <button @click="$emit('close')" class="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800">
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Target Language -->
      <div class="space-y-2">
        <label class="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
          <Globe class="w-4 h-4 text-sky-400" />
          <span>Idioma-alvo da Tradução e Leitura</span>
        </label>
        <div class="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
          <button
            v-for="lang in languages"
            :key="lang.code"
            @click="$emit('update:targetLang', lang.code)"
            :class="[
              'flex items-center gap-2.5 p-2.5 rounded-xl border text-left text-xs font-medium transition-all',
              targetLang === lang.code
                ? 'border-sky-500 bg-sky-500/10 text-sky-400 font-semibold'
                : 'border-slate-800 hover:border-slate-700 bg-slate-950/40 text-slate-300'
            ]"
          >
            <span class="text-base">{{ lang.flag }}</span>
            <span class="truncate">{{ lang.name }}</span>
          </button>
        </div>
      </div>

      <!-- Gender -->
      <div class="space-y-2">
        <label class="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
          <UserCheck class="w-4 h-4 text-sky-400" />
          <span>Gênero da Voz Neural</span>
        </label>
        <div class="grid grid-cols-2 gap-3">
          <button
            @click="$emit('update:gender', 'female')"
            :class="[
              'py-2.5 px-4 rounded-xl border text-xs font-semibold transition-all flex items-center justify-center gap-2',
              gender === 'female'
                ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                : 'border-slate-800 hover:border-slate-700 bg-slate-950/40 text-slate-400'
            ]"
          >
            <span>👩 Feminina</span>
          </button>
          <button
            @click="$emit('update:gender', 'male')"
            :class="[
              'py-2.5 px-4 rounded-xl border text-xs font-semibold transition-all flex items-center justify-center gap-2',
              gender === 'male'
                ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                : 'border-slate-800 hover:border-slate-700 bg-slate-950/40 text-slate-400'
            ]"
          >
            <span>👨 Masculina</span>
          </button>
        </div>
      </div>

      <!-- Speed -->
      <div class="space-y-2">
        <label class="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
          <Gauge class="w-4 h-4 text-sky-400" />
          <span>Velocidade de Fala</span>
        </label>
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="sp in speeds"
            :key="sp.key"
            @click="$emit('update:speed', sp.key)"
            :class="[
              'py-2.5 px-3 rounded-xl border text-xs font-semibold transition-all text-center',
              speed === sp.key
                ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                : 'border-slate-800 hover:border-slate-700 bg-slate-950/40 text-slate-400'
            ]"
          >
            <span>{{ sp.label }}</span>
          </button>
        </div>
      </div>

      <!-- Footer -->
      <div class="pt-2">
        <button
          @click="$emit('close')"
          class="w-full bg-slate-800 hover:bg-slate-700 text-white font-medium py-2.5 rounded-xl transition-colors text-sm"
        >
          Salvar & Concluir
        </button>
      </div>
    </div>
  </div>
</template>
