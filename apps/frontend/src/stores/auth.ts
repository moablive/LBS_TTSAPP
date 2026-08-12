import { defineStore } from 'pinia';

// @ts-ignore
const LOGINHUB_API = import.meta.env.VITE_LOGINHUB_API_URL || 'http://localhost:3000/api';
// @ts-ignore
const LOGINHUB_APP_ID = Number(import.meta.env.VITE_LOGINHUB_APP_ID) || 13;

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('token') || null,
    requirePasswordChange: localStorage.getItem('requirePasswordChange') === 'true',
  }),
  getters: {
    isAuthenticated: (state) => !!state.token,
  },
  actions: {
    async login(payload: { email: string; password?: string; access_token?: string }) {
      const body = { ...payload, app_id: LOGINHUB_APP_ID };
      const res = await fetch(`${LOGINHUB_API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erro de autenticação');
      }

      const data = await res.json();
      
      this.token = data.token;
      this.requirePasswordChange = !!data.requirePasswordChange;

      localStorage.setItem('token', data.token);
      localStorage.setItem('requirePasswordChange', String(this.requirePasswordChange));
    },
    
    async refreshToken(): Promise<boolean> {
      if (!this.token) return false;
      try {
        const res = await fetch(`${LOGINHUB_API}/auth/refresh`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.token}` },
        });
        if (!res.ok) return false;

        const data = await res.json();
        if (!data.token) return false;

        this.token = data.token;
        localStorage.setItem('token', data.token);
        return true;
      } catch {
        return false;
      }
    },
    
    logout() {
      this.token = null;
      this.requirePasswordChange = false;
      localStorage.removeItem('token');
      localStorage.removeItem('requirePasswordChange');
      window.location.href = '/login';
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
