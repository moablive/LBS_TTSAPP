<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useAuthStore } from '../stores/auth';
import { useRouter, useRoute } from 'vue-router';
import { LogIn, Loader2, AlertCircle } from 'lucide-vue-next';

const email = ref('');
const password = ref('');
const loading = ref(false);
const error = ref('');
const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();

onMounted(async () => {
  // Trata callback se houver token na query params (ex: OAuth LoginHub)
  if (route.query.token) {
    try {
      loading.value = true;
      await authStore.login({ email: '', access_token: route.query.token as string });
      router.push('/');
    } catch (err: any) {
      error.value = err.message || 'Erro no login via token';
    } finally {
      loading.value = false;
    }
  }
});

async function handleLogin() {
  if (!email.value || !password.value) {
    error.value = 'Preencha email e senha.';
    return;
  }
  
  loading.value = true;
  error.value = '';
  
  try {
    await authStore.login({ email: email.value, password: password.value });
    router.push('/');
  } catch (err: any) {
    error.value = err.message || 'Erro ao realizar login.';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-slate-950 px-4">
    <div class="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-6">
      
      <div class="text-center">
        <h1 class="text-3xl font-extrabold text-white">LBSTTSAPP</h1>
        <p class="text-slate-400 mt-2 text-sm">Faça login com sua conta do LoginHUB</p>
      </div>

      <div v-if="error" class="bg-rose-500/10 border border-rose-500/30 p-3 rounded-xl flex items-center gap-3 text-rose-300 text-sm">
        <AlertCircle class="w-5 h-5 shrink-0" />
        <span>{{ error }}</span>
      </div>

      <form @submit.prevent="handleLogin" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-slate-300 mb-1">Email</label>
          <input
            v-model="email"
            type="email"
            required
            class="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
            placeholder="seu@email.com"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-300 mb-1">Senha</label>
          <input
            v-model="password"
            type="password"
            required
            class="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          :disabled="loading"
          class="w-full flex items-center justify-center gap-2 bg-sky-500 hover:bg-sky-600 text-white font-semibold py-2.5 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
        >
          <Loader2 v-if="loading" class="w-5 h-5 animate-spin" />
          <LogIn v-else class="w-5 h-5" />
          <span>{{ loading ? 'Entrando...' : 'Entrar' }}</span>
        </button>
      </form>
    </div>
  </div>
</template>
