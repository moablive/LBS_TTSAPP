<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import { Play, Pause, SkipBack, SkipForward, List, Download, Loader2, Volume2, Globe2 } from 'lucide-vue-next';
import { SectionItem, TranslationResult } from '../types';
import { fetchSectionTtsAudio } from '../services/api';

const props = defineProps<{
  result: TranslationResult;
  gender: string;
  speed: string;
}>();

const currentIndex = ref(0);
const isPlaying = ref(false);
const loadingAudio = ref(false);
const showIndex = ref(false);
const audioUrl = ref<string | null>(null);
const audioElement = ref<HTMLAudioElement | null>(null);

const currentSection = computed<SectionItem | undefined>(() => props.result.sections[currentIndex.value]);

watch(currentIndex, () => {
  if (isPlaying.value) {
    playCurrentSection();
  }
});

async function playCurrentSection() {
  if (!currentSection.value) return;

  if (audioElement.value) {
    audioElement.value.pause();
  }

  loadingAudio.value = true;
  try {
    const blob = await fetchSectionTtsAudio(
      currentSection.value.spokenText,
      props.result.voice,
      props.speed
    );

    if (audioUrl.value) {
      URL.revokeObjectURL(audioUrl.value);
    }

    audioUrl.value = URL.createObjectURL(blob);
    
    if (!audioElement.value) {
      audioElement.value = new Audio();
      audioElement.value.onended = () => {
        if (currentIndex.value < props.result.sections.length - 1) {
          currentIndex.value++;
        } else {
          isPlaying.value = false;
        }
      };
    }

    audioElement.value.src = audioUrl.value;
    await audioElement.value.play();
    isPlaying.value = true;
  } catch (err) {
    console.error("Erro ao carregar áudio:", err);
    isPlaying.value = false;
  } finally {
    loadingAudio.value = false;
  }
}

function togglePlay() {
  if (isPlaying.value && audioElement.value) {
    audioElement.value.pause();
    isPlaying.value = false;
  } else {
    playCurrentSection();
  }
}

function nextSection() {
  if (currentIndex.value < props.result.sections.length - 1) {
    currentIndex.value++;
  }
}

function prevSection() {
  if (currentIndex.value > 0) {
    currentIndex.value--;
  }
}

function selectSection(idx: number) {
  currentIndex.value = idx;
  showIndex.value = false;
  playCurrentSection();
}

function downloadCurrentAudio() {
  if (audioUrl.value) {
    const a = document.createElement('a');
    a.href = audioUrl.value;
    a.download = `lbsttsapp_secao_${currentIndex.value + 1}.mp3`;
    a.click();
  }
}

onUnmounted(() => {
  if (audioElement.value) {
    audioElement.value.pause();
  }
  if (audioUrl.value) {
    URL.revokeObjectURL(audioUrl.value);
  }
});
</script>

<template>
  <div class="space-y-6 max-w-4xl mx-auto">
    <!-- Header Badge -->
    <div class="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl">
      <div class="flex items-center gap-3">
        <span class="text-3xl">{{ result.targetLanguage.flag }}</span>
        <div>
          <h2 class="text-base font-bold text-white flex items-center gap-2">
            <span>{{ result.targetLanguage.name }}</span>
            <span class="text-xs font-normal text-slate-400">({{ result.voice }})</span>
          </h2>
          <p class="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
            <Globe2 class="w-3.5 h-3.5 text-sky-400" />
            <span>Idioma Detectado: <strong class="text-slate-200 uppercase">{{ result.detectedLanguage }}</strong></span>
            <span>•</span>
            <span>{{ result.totalSections }} Seções</span>
          </p>
        </div>
      </div>

      <button
        @click="showIndex = !showIndex"
        class="flex items-center gap-2 text-xs font-semibold px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-400 border border-slate-700 transition-colors"
      >
        <List class="w-4 h-4" />
        <span>Índice de Seções ({{ currentIndex + 1 }}/{{ result.totalSections }})</span>
      </button>
    </div>

    <!-- Index Dropdown Modal -->
    <div v-if="showIndex" class="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-2xl max-h-64 overflow-y-auto space-y-1">
      <div
        v-for="(sec, idx) in result.sections"
        :key="idx"
        @click="selectSection(idx)"
        :class="[
          'flex items-center justify-between p-2.5 rounded-xl cursor-pointer text-xs transition-all',
          currentIndex === idx
            ? 'bg-sky-500/10 border border-sky-500/30 text-sky-400 font-semibold'
            : 'hover:bg-slate-800/80 text-slate-300'
        ]"
      >
        <div class="flex items-center gap-2 truncate pr-2">
          <span class="text-slate-500 font-mono text-[10px]">{{ idx + 1 }}.</span>
          <span class="truncate">{{ sec.preview }}</span>
        </div>
        <span class="text-[10px] text-slate-500 uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-950">{{ sec.kind }}</span>
      </div>
    </div>

    <!-- Text Viewer Card -->
    <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
      <div class="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800 pb-3">
        <span class="font-semibold text-sky-400 uppercase tracking-wider">Seção {{ currentIndex + 1 }} de {{ result.totalSections }}</span>
        <span class="uppercase font-mono bg-slate-800 px-2 py-0.5 rounded text-[10px] text-slate-300">{{ currentSection?.kind }}</span>
      </div>

      <div class="min-h-[140px] text-slate-100 text-base leading-relaxed font-sans whitespace-pre-wrap">
        {{ currentSection?.text }}
      </div>

      <div class="pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500">
        <span class="flex items-center gap-1.5">
          <Volume2 class="w-3.5 h-3.5 text-sky-400" />
          <span>Falas no áudio: <em>"{{ currentSection?.spokenText }}"</em></span>
        </span>
      </div>
    </div>

    <!-- Sticky Audio Player Bar -->
    <div class="bg-slate-900/90 backdrop-blur border border-slate-800 rounded-2xl p-4 shadow-2xl flex flex-wrap items-center justify-between gap-4">
      <!-- Nav Controls -->
      <div class="flex items-center gap-3">
        <button
          @click="prevSection"
          :disabled="currentIndex === 0"
          class="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-200 transition-colors"
          title="Seção Anterior"
        >
          <SkipBack class="w-5 h-5" />
        </button>

        <button
          @click="togglePlay"
          :disabled="loadingAudio"
          class="w-12 h-12 rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white flex items-center justify-center shadow-lg shadow-sky-500/20 active:scale-95 transition-all"
        >
          <Loader2 v-if="loadingAudio" class="w-6 h-6 animate-spin" />
          <Pause v-else-if="isPlaying" class="w-6 h-6" />
          <Play v-else class="w-6 h-6 ml-0.5" />
        </button>

        <button
          @click="nextSection"
          :disabled="currentIndex === result.sections.length - 1"
          class="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-200 transition-colors"
          title="Próxima Seção"
        >
          <SkipForward class="w-5 h-5" />
        </button>
      </div>

      <!-- Current Section Preview -->
      <div class="flex-1 min-w-[200px] text-center sm:text-left">
        <p class="text-xs font-semibold text-slate-200 truncate">{{ currentSection?.preview }}</p>
        <p class="text-[11px] text-slate-400 mt-0.5">
          <span v-if="isPlaying" class="text-emerald-400 font-medium animate-pulse">● Reproduzindo voz neural...</span>
          <span v-else>Pausado</span>
        </p>
      </div>

      <!-- Actions -->
      <div class="flex items-center gap-2">
        <button
          @click="downloadCurrentAudio"
          :disabled="!audioUrl"
          class="flex items-center gap-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 px-3 py-2 rounded-xl transition-colors"
          title="Baixar MP3 desta seção"
        >
          <Download class="w-4 h-4 text-sky-400" />
          <span>Baixar MP3</span>
        </button>
      </div>
    </div>
  </div>
</template>
