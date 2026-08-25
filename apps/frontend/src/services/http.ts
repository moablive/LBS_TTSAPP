import axios, { type InternalAxiosRequestConfig } from 'axios';
import { createHubAuth } from '../lib/hubAuthClient';

// @ts-ignore
const LOGINHUB_API = import.meta.env.VITE_LOGINHUB_API_URL || 'https://loginhub.astralwavelabel.com/api';
// @ts-ignore
const LOGINHUB_APP_ID = String(Number(import.meta.env.VITE_LOGINHUB_APP_ID) || 13);

/**
 * Instância HTTP do app.
 *
 * Antes o `api` vinha de `@loginhub/api-client`, que aqui resolvia para um
 * TARBALL do repositório do DashBoard — congelado em 12/08, de antes do 2FA, e
 * apontando para `/mnt/docker-services`, caminho que deixou de existir na
 * migração de disco. O build do container quebrava por causa disso.
 *
 * Agora o transporte é local e a renovação de sessão vai para o auth-kit, que é
 * a fonte única da conversa com o hub em todos os apps.
 */
export const api = axios.create({
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Único no módulo: o single-flight do `refresh` é estado da instância, então
 * recriar o cliente a cada 401 derrubaria a coordenação que ele existe para dar.
 */
const hub = createHubAuth({
  baseUrl: LOGINHUB_API,
  appId: LOGINHUB_APP_ID,
  tokenKey: 'awl_token',
});

api.interceptors.request.use((config) => {
  const token = hub.getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (error.response?.status !== 401 || !config || config._retry) {
      return Promise.reject(error);
    }

    config._retry = true;
    const novo = await hub.refresh();

    if (novo) {
      config.headers.Authorization = `Bearer ${novo}`;
      return api.request(config);
    }

    // Refresh recusado — inclui SESSAO_REVOGADA, quando ativar o 2FA cortou as
    // sessões anteriores. Não há o que renovar: volta para o login.
    hub.logout();
    if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);
