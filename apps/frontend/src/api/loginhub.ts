/// <reference types="vite/client" />
import axios, { type InternalAxiosRequestConfig, type AxiosRequestHeaders } from 'axios';

// ==========================================
// TYPES
// ==========================================
export interface User {
  id: string;
  nome: string;
  email: string;
  role: string;
  app_id: string | null;
  status: string;
}

export interface App {
  id: string;
  nome: string;
  status: string;
}

export interface LoginResponse {
  token: string;
  expiresIn: number;
  requirePasswordChange: boolean;
  usuario: User;
  app: App | null;
}

export interface AuthResult {
  redirect: string;
}

// ==========================================
// API INSTANCE CONFIGURATION
// ==========================================
export const api = axios.create({
  baseURL: import.meta.env.VITE_LOGINHUB_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (!config.headers) {
      config.headers = {} as AxiosRequestHeaders;
    }

    const token = localStorage.getItem('awl_token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }

    return config;
  },
  (error: any) => Promise.reject(error)
);

// ==========================================
// REFRESH TOKEN HELPER
// ==========================================
let refreshInFlight: Promise<string | null> | null = null;

const performRefresh = async (): Promise<string | null> => {
  const currentToken = localStorage.getItem('awl_token');
  if (!currentToken) return null;

  try {
    const baseURL = import.meta.env.VITE_LOGINHUB_API_URL;
    const { data } = await axios.post<LoginResponse>(
      `${baseURL}/auth/refresh`,
      {},
      { headers: { 'Authorization': `Bearer ${currentToken}` } },
    );

    localStorage.setItem('awl_token', data.token);
    if (data.usuario) localStorage.setItem('awl_user', JSON.stringify(data.usuario));
    if (data.app) localStorage.setItem('awl_app', JSON.stringify(data.app));
    return data.token;
  } catch {
    return null;
  }
};

api.interceptors.response.use(
  (response: any) => response,
  async (error: any) => {
    const config = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const status = error.response?.status;

    const isAuthEndpoint = config?.url?.includes('/auth/refresh') || config?.url?.includes('/auth/login') || config?.url?.includes('/auth/setup-password');
    if (status === 401 && config && !config._retry && !isAuthEndpoint) {
      config._retry = true;

      if (!refreshInFlight) {
        refreshInFlight = performRefresh().finally(() => {
          refreshInFlight = null;
        });
      }
      const newToken = await refreshInFlight;

      if (newToken) {
        if (!config.headers) config.headers = {} as AxiosRequestHeaders;
        config.headers['Authorization'] = `Bearer ${newToken}`;
        return api.request(config);
      }

      if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
        console.warn('Sessão expirada. Redirecionando...');
        localStorage.removeItem('awl_token');
        localStorage.removeItem('awl_user');
        localStorage.removeItem('awl_app');
        window.location.href = '/login';
      }
    }

    if (error.response) {
      if (status === 403) {
        console.error('⛔ Acesso negado: Nível de permissão insuficiente.');
      }
      if (status && status >= 500) {
        console.error('🔥 Erro interno do servidor. Tente novamente mais tarde.');
      }
    } else {
      console.error('🚨 Erro de conexão: Verifique sua internet ou se o backend está online.');
    }

    return Promise.reject(error);
  }
);

// ==========================================
// AUTHENTICATION API
// ==========================================
export const authApi = {
  login: async (email: string, password: string, appId?: string): Promise<AuthResult> => {
    localStorage.removeItem('awl_token');
    localStorage.removeItem('awl_user');
    localStorage.removeItem('awl_app');

    const payload: { email: string; password: string; app_id?: string } = { email, password };
    if (appId) payload.app_id = appId;

    const { data } = await api.post<LoginResponse>('/auth/login', payload);

    localStorage.setItem('awl_token', data.token);
    localStorage.setItem('awl_user', JSON.stringify(data.usuario));

    if (data.app) {
        localStorage.setItem('awl_app', JSON.stringify(data.app));
    }

    return { redirect: '/dashboard' };
  },

  logout: () => {
    localStorage.removeItem('awl_token');
    localStorage.removeItem('awl_user');
    localStorage.removeItem('awl_app');
    window.location.href = '/login';
  },

  changePassword: async (novaSenha: string): Promise<{ message: string }> => {
    const { data } = await api.post<{ message: string }>('/auth/change-password', { novaSenha });
    return data;
  },

  setupPassword: async (token: string, novaSenha: string): Promise<{ message: string }> => {
    // Use a raw axios call (no session-token interceptor) to avoid injecting a stale
    // localStorage session token. LoginHUB expects { token, novaSenha } in the body — no Auth header.
    const baseURL = import.meta.env.VITE_LOGINHUB_API_URL;
    const { data } = await axios.post<{ message: string }>(
      `${baseURL}/auth/setup-password`,
      { token, novaSenha },
      { headers: { 'Content-Type': 'application/json' } },
    );
    return data;
  },

  refresh: async (): Promise<LoginResponse | null> => {
    const newToken = await performRefresh();
    if (!newToken) return null;
    return {
      token: newToken,
      expiresIn: 86400,
      requirePasswordChange: false,
      usuario: JSON.parse(localStorage.getItem('awl_user') || 'null'),
      app: JSON.parse(localStorage.getItem('awl_app') || 'null'),
    };
  },

  isAuthenticated: (): boolean => {
    return !!localStorage.getItem('awl_token');
  },

  getUser: (): User | null => {
    const userStr = localStorage.getItem('awl_user');
    if (!userStr) return null;
    try {
      return JSON.parse(userStr) as User;
    } catch {
      return null;
    }
  },

  getRole: (): string | null => {
    const user = authApi.getUser();
    return user?.role || null;
  }
};
