<template>
  <div class="min-h-screen bg-slate-900 flex items-center justify-center p-4">
    <!-- Enrolamento de 2FA, emendado no convite sem sair do app. -->
    <TwoFactorEnroll
      v-if="enrolarToken"
      :setup-token="enrolarToken"
      @concluido="router.push('/')"
    />

    <div v-else class="max-w-md w-full bg-slate-800 rounded-xl shadow-xl overflow-hidden">
      <div class="p-8">
        <div class="text-center mb-8">
          <h2 class="text-3xl font-bold text-white">Criar Senha</h2>
          <p class="text-slate-400 mt-2">Defina sua nova senha de acesso</p>
        </div>

        <form @submit.prevent="handleSetupPassword" class="space-y-6">
          <div>
            <label class="block text-sm font-medium text-slate-300 mb-2">
              Nova Senha
            </label>
            <input
              v-model="password"
              type="password"
              required
              class="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              placeholder="Digite sua nova senha"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-300 mb-2">
              Confirmar Senha
            </label>
            <input
              v-model="confirmPassword"
              type="password"
              required
              class="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              placeholder="Confirme a nova senha"
            />
          </div>

          <div v-if="error" class="text-red-400 text-sm text-center">
            {{ error }}
          </div>
          
          <div v-if="success" class="text-green-400 text-sm text-center">
            Senha definida com sucesso! Redirecionando...
          </div>

          <button
            type="submit"
            :disabled="loading || success"
            class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors disabled:opacity-50"
          >
            {{ loading ? 'Salvando...' : 'Salvar Nova Senha' }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import TwoFactorEnroll from '../components/TwoFactorEnroll.vue';

/** Passe de enrolamento: quando existe, o QR assume a tela. */
const enrolarToken = ref<string | null>(null);

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const password = ref('');
const confirmPassword = ref('');
const loading = ref(false);
const error = ref('');
const success = ref(false);

const token = ref('');

onMounted(() => {
  token.value = route.query.token as string;
  if (!token.value) {
    error.value = 'Token inválido ou não fornecido.';
  }
});

async function handleSetupPassword() {
  if (!token.value) {
    error.value = 'Token inválido.';
    return;
  }
  
  if (password.value !== confirmPassword.value) {
    error.value = 'As senhas não coincidem.';
    return;
  }
  
  if (password.value.length < 6) {
    error.value = 'A senha deve ter pelo menos 6 caracteres.';
    return;
  }
  
  error.value = '';
  loading.value = true;
  
  try {
    const r = await authStore.setupPassword(token.value, password.value);

    // 'enrolar': o convite exige 2FA e falta configurar. Emenda direto no QR,
    // aqui mesmo — o magic link ja morreu nesta chamada, nao da para voltar a
    // esta tela: motivo de sobra para nao atravessar origem no meio do caminho.
    if (r.etapa === 'enrolar') {
      enrolarToken.value = r.setupToken;
      return;
    }
    // '2fa': conta que JA tem autenticador (tipico de reset de senha). O hub
    // devolve desafio em vez de sessao; o login fecha a etapa.
    success.value = true;
    setTimeout(() => {
      router.push('/login');
    }, 2000);
  } catch (err: any) {
    error.value = err.message || 'Erro ao definir a senha.';
  } finally {
    loading.value = false;
  }
}
</script>
