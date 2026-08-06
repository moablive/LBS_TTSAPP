<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Volume2, Settings, Download } from 'lucide-vue-next';

defineEmits(['open-settings']);

const deferredPrompt = ref<any>(null);
const isInstallable = ref(false);

onMounted(() => {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt.value = e;
    isInstallable.value = true;
  });
});

async function installPwa() {
  if (!deferredPrompt.value) return;
  deferredPrompt.value.prompt();
  const { outcome } = await deferredPrompt.value.userChoice;
  if (outcome === 'accepted') {
    isInstallable.value = false;
  }
  deferredPrompt.value = null;
}
</script>

<template>
  <header class="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-40">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
      <!-- Brand Logo -->
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
          <Volume2 class="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 class="text-lg font-bold text-white tracking-tight flex items-center gap-2">
            LumoTranslate
            <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">PWA</span>
          </h1>
          <p class="text-xs text-slate-400">Leitor & Tradutor Neural por Voz</p>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex items-center gap-3">
        <button
          v-if="isInstallable"
          @click="installPwa"
          class="flex items-center gap-2 text-xs font-medium bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white px-3.5 py-2 rounded-lg shadow-md transition-all active:scale-95"
        >
          <Download class="w-4 h-4" />
          <span>Instalar App</span>
        </button>

        <button
          @click="$emit('open-settings')"
          class="flex items-center gap-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3.5 py-2 rounded-lg transition-colors"
        >
          <Settings class="w-4 h-4 text-sky-400" />
          <span class="hidden sm:inline">Preferências</span>
        </button>
      </div>
    </div>
  </header>
</template>
