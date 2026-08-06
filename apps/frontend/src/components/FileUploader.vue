<script setup lang="ts">
import { ref } from 'vue';
import { UploadCloud, FileText, Image as ImageIcon, Type, Sparkles, Loader2 } from 'lucide-vue-next';

const emit = defineEmits<{
  (e: 'process', payload: { file?: File; text?: string }): void;
}>();

defineProps<{
  loading: boolean;
}>();

const activeTab = ref<'file' | 'text'>('file');
const selectedFile = ref<File | null>(null);
const rawText = ref('');
const isDragging = ref(false);

function handleFileDrop(e: DragEvent) {
  isDragging.value = false;
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    selectedFile.value = files[0];
  }
}

function handleFileInput(e: Event) {
  const target = e.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    selectedFile.value = target.files[0];
  }
}

function submit() {
  if (activeTab.value === 'file' && selectedFile.value) {
    emit('process', { file: selectedFile.value });
  } else if (activeTab.value === 'text' && rawText.value.trim()) {
    emit('process', { text: rawText.value.trim() });
  }
}
</script>

<template>
  <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl max-w-3xl mx-auto">
    <!-- Tabs -->
    <div class="flex items-center gap-2 p-1 bg-slate-950 rounded-xl mb-6 border border-slate-800/80">
      <button
        @click="activeTab = 'file'"
        :class="[
          'flex-1 flex items-center justify-center gap-2 text-sm font-medium py-2.5 rounded-lg transition-all',
          activeTab === 'file'
            ? 'bg-slate-800 text-sky-400 shadow-sm border border-slate-700'
            : 'text-slate-400 hover:text-slate-200'
        ]"
      >
        <UploadCloud class="w-4 h-4" />
        <span>Arquivo (PDF, Foto, Texto)</span>
      </button>

      <button
        @click="activeTab = 'text'"
        :class="[
          'flex-1 flex items-center justify-center gap-2 text-sm font-medium py-2.5 rounded-lg transition-all',
          activeTab === 'text'
            ? 'bg-slate-800 text-sky-400 shadow-sm border border-slate-700'
            : 'text-slate-400 hover:text-slate-200'
        ]"
      >
        <Type class="w-4 h-4" />
        <span>Digitar / Colar Texto</span>
      </button>
    </div>

    <!-- Upload Area -->
    <div v-if="activeTab === 'file'">
      <div
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop.prevent="handleFileDrop"
        :class="[
          'border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer relative',
          isDragging
            ? 'border-sky-500 bg-sky-500/10'
            : selectedFile
            ? 'border-emerald-500/50 bg-emerald-500/5'
            : 'border-slate-700 hover:border-slate-600 bg-slate-950/50'
        ]"
      >
        <input
          type="file"
          @change="handleFileInput"
          accept=".pdf,.txt,.md,.csv,.srt,.jpg,.jpeg,.png,.webp"
          class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />

        <div v-if="!selectedFile" class="flex flex-col items-center gap-3">
          <div class="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-sky-400">
            <UploadCloud class="w-6 h-6" />
          </div>
          <div>
            <p class="text-sm font-medium text-slate-200">Arraste seu arquivo aqui ou <span class="text-sky-400 underline">clique para selecionar</span></p>
            <p class="text-xs text-slate-400 mt-1">Suporta PDF, Fotos (OCR), TXT, Markdown, CSV ou SRT (até 20MB)</p>
          </div>
          <div class="flex gap-4 mt-2 text-slate-500 text-xs">
            <span class="flex items-center gap-1"><FileText class="w-3.5 h-3.5" /> PDF / Texto</span>
            <span class="flex items-center gap-1"><ImageIcon class="w-3.5 h-3.5" /> Imagem (OCR)</span>
          </div>
        </div>

        <div v-else class="flex items-center justify-between p-3 bg-slate-800/80 rounded-lg border border-slate-700">
          <div class="flex items-center gap-3">
            <FileText class="w-6 h-6 text-sky-400" />
            <div class="text-left">
              <p class="text-sm font-medium text-slate-200 truncate max-w-xs sm:max-w-md">{{ selectedFile.name }}</p>
              <p class="text-xs text-slate-400">{{ (selectedFile.size / 1024).toFixed(1) }} KB</p>
            </div>
          </div>
          <button
            @click.stop="selectedFile = null"
            class="text-xs text-slate-400 hover:text-red-400 px-2 py-1 bg-slate-900 rounded border border-slate-700"
          >
            Remover
          </button>
        </div>
      </div>
    </div>

    <!-- Direct Text Input -->
    <div v-else class="space-y-2">
      <textarea
        v-model="rawText"
        rows="6"
        placeholder="Cole ou digite aqui o texto que deseja traduzir e ouvir em voz alta..."
        class="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500 resize-y"
      ></textarea>
      <div class="flex justify-between text-xs text-slate-500 px-1">
        <span>{{ rawText.length }} caracteres</span>
        <span>Máximo 30.000 caracteres</span>
      </div>
    </div>

    <!-- Submit Button -->
    <button
      @click="submit"
      :disabled="loading || (activeTab === 'file' && !selectedFile) || (activeTab === 'text' && !rawText.trim())"
      class="w-full mt-6 flex items-center justify-center gap-2 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl shadow-lg shadow-sky-500/20 transition-all active:scale-[0.99]"
    >
      <Loader2 v-if="loading" class="w-5 h-5 animate-spin" />
      <Sparkles v-else class="w-5 h-5" />
      <span>{{ loading ? 'Processando & Traduzindo...' : 'Traduzir e Gerar Leitura em Voz Alta' }}</span>
    </button>
  </div>
</template>
