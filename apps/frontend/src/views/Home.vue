<script setup lang="ts">
import { ref, onMounted } from 'vue';
import Navbar from '../components/Navbar.vue';
import FileUploader from '../components/FileUploader.vue';
import SettingsModal from '../components/SettingsModal.vue';
import AudioPlayer from '../components/AudioPlayer.vue';
import { fetchLanguages, processTranslation } from '../services/api';
import { Language, SpeedOption, TranslationResult } from '../types';
import { AlertCircle, RotateCcw } from 'lucide-vue-next';

const languages = ref<Language[]>([]);
const speeds = ref<SpeedOption[]>([]);
const targetLang = ref('pt-BR');
const gender = ref('female');
const speed = ref('medium');

const isSettingsOpen = ref(false);
const loading = ref(false);
const errorMessage = ref<string | null>(null);
const translationResult = ref<TranslationResult | null>(null);

onMounted(async () => {
  try {
    const data = await fetchLanguages();
    languages.value = data.languages;
    speeds.value = data.speeds;
  } catch (err) {
    console.error("Falha ao carregar lista de idiomas:", err);
  }
});

async function handleProcess(payload: { file?: File; text?: string }) {
  loading.value = true;
  errorMessage.value = null;

  try {
    const result = await processTranslation({
      file: payload.file,
      text: payload.text,
      targetLang: targetLang.value,
      gender: gender.value,
      speed: speed.value,
    });
    translationResult.value = result;
  } catch (err: any) {
    errorMessage.value = err.message || "Ocorreu um erro ao traduzir e gerar áudio.";
  } finally {
    loading.value = false;
  }
}

function resetApp() {
  translationResult.value = null;
  errorMessage.value = null;
}
</script>

<template>
  <div class="min-h-screen flex flex-col bg-slate-950 text-slate-100">
    <Navbar @open-settings="isSettingsOpen = true" />

    <main class="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <!-- Error Alert -->
      <div v-if="errorMessage" class="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 flex items-center justify-between text-rose-300 max-w-3xl mx-auto text-sm">
        <div class="flex items-center gap-3">
          <AlertCircle class="w-5 h-5 text-rose-400 shrink-0" />
          <span>{{ errorMessage }}</span>
        </div>
        <button @click="errorMessage = null" class="text-xs underline hover:text-white">Fechar</button>
      </div>

      <!-- File Uploader (when no result is present) -->
      <div v-if="!translationResult">
        <div class="text-center max-w-2xl mx-auto mb-8 space-y-2">
          <h2 class="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Tradução e Leitura Neural
          </h2>
          <p class="text-sm text-slate-400">
            Envie fotos (OCR), PDFs ou textos para traduzir para 12 idiomas e ouvir com vozes neurais de alta fidelidade no seu desktop ou mobile.
          </p>
        </div>

        <FileUploader :loading="loading" @process="handleProcess" />
      </div>

      <!-- Result & Audio Player View -->
      <div v-else class="space-y-6">
        <div class="flex items-center justify-between max-w-4xl mx-auto">
          <h3 class="text-lg font-bold text-white">Resultado da Leitura</h3>
          <button
            @click="resetApp"
            class="flex items-center gap-1.5 text-xs font-semibold text-sky-400 hover:text-sky-300 bg-slate-900 border border-slate-800 hover:border-slate-700 px-3 py-1.5 rounded-xl transition-all"
          >
            <RotateCcw class="w-3.5 h-3.5" />
            <span>Novo Documento</span>
          </button>
        </div>

        <AudioPlayer
          :result="translationResult"
          :gender="gender"
          :speed="speed"
        />
      </div>
    </main>

    <!-- Settings Modal -->
    <SettingsModal
      :open="isSettingsOpen"
      :languages="languages"
      :speeds="speeds"
      v-model:targetLang="targetLang"
      v-model:gender="gender"
      v-model:speed="speed"
      @close="isSettingsOpen = false"
    />
  </div>
</template>
