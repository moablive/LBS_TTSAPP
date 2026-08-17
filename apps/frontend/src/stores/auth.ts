import { defineStore } from 'pinia';
import { authApi } from '@loginhub/api-client';

// @ts-ignore
const LOGINHUB_APP_ID = String(Number(import.meta.env.VITE_LOGINHUB_APP_ID) || 13);
// @ts-ignore
const LOGINHUB_API = import.meta.env.VITE_LOGINHUB_API_URL || 'http://localhost:3000/api';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('awl_token') || null,
    requirePasswordChange: localStorage.getItem('requirePasswordChange') === 'true',
  }),
  getters: {
    isAuthenticated: (state) => !!state.token,
  },
  actions: {
    async login(payload: { email: string; password?: string; access_token?: string }) {
      if (payload.access_token) {
        localStorage.setItem('awl_token', payload.access_token);
        this.token = payload.access_token;
        return;
      }
      
      const result = await authApi.login(payload.email, payload.password || '', LOGINHUB_APP_ID);
      
      this.token = localStorage.getItem('awl_token');
      this.requirePasswordChange = !!result.requirePasswordChange;
      localStorage.setItem('requirePasswordChange', String(this.requirePasswordChange));
    },
    
    async refreshToken(): Promise<boolean> {
      const res = await authApi.refresh();
      if (res) {
        this.token = res.token;
        return true;
      }
      return false;
    },
    
    logout() {
      authApi.logout();
      this.token = null;
      this.requirePasswordChange = false;
      localStorage.removeItem('requirePasswordChange');
    },

    async setupPassword(token: string, novaSenha: string) {
      const res = await fetch(`${LOGINHUB_API}/auth/setup-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, novaSenha })
      });
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erro ao redefinir senha');
      }
      return true;
    }
  }
});
