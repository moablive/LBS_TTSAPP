import { defineStore } from 'pinia';
import { createHubAuth } from '../lib/hubAuthClient';

// @ts-ignore
const LOGINHUB_API = import.meta.env.VITE_LOGINHUB_API_URL || 'http://localhost:3000/api';
// @ts-ignore
const LOGINHUB_APP_ID = String(Number(import.meta.env.VITE_LOGINHUB_APP_ID) || 13);
/** Painel do LoginHUB — é lá que mora a tela de enrolamento de 2FA (com o QR). */
// @ts-ignore
const LOGINHUB_UI = import.meta.env.VITE_LOGINHUB_UI_URL || 'https://loginhub.astralwavelabel.com';

const hub = createHubAuth({
  baseUrl: LOGINHUB_API,
  appId: LOGINHUB_APP_ID,
  tokenKey: 'awl_token',
});

const urlEnrolamento = (setupToken: string) =>
  `${LOGINHUB_UI}/enrolar-2fa?token=${encodeURIComponent(setupToken)}` +
  `&retorno=${encodeURIComponent(window.location.origin)}`;

/**
 * Sessão do LoginHUB.
 *
 * Antes este store importava `@loginhub/api-client` — que aqui resolve para uma
 * fork congelada dentro do repositório do DashBoard, de antes do 2FA. Pior: o
 * retorno do `login` era ignorado e o token era lido do storage logo em
 * seguida. Nos desfechos de 2FA o cliente não gravava nada (o usuário ficava
 * "deslogado" sem erro nenhum) ou gravava o passe de enrolamento de 10 minutos
 * como se fosse sessão — e o resto da API recusa esse token.
 *
 * Agora usa o auth-kit (`lib/hubAuthClient.ts`), fonte sincronizada a partir do
 * LoginHUB e idêntica em todos os apps.
 */
export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: hub.getToken(),
    /**
     * Desafio pendente: a senha conferiu, mas a conta exige o código do
     * autenticador e a sessão ainda NÃO existe.
     */
    challengeToken: null as string | null,
  }),
  getters: {
    isAuthenticated: (state) => !!state.token,
    aguardandoSegundoFator: (state) => state.challengeToken !== null,
  },
  actions: {
    /**
     * Devolve a etapa alcançada:
     *   'sessao'  — autenticado, pode navegar
     *   '2fa'     — pedir o código e chamar `verificarSegundoFator`
     *   'enrolar' — redirecionar para `url` (tela de QR do hub)
     */
    async login(payload: { email: string; password?: string; access_token?: string }) {
      // Entrada por token na query (callback do hub): já é sessão pronta.
      if (payload.access_token) {
        hub.salvarSessao({ token: payload.access_token, expiresIn: 86400 });
        this.token = payload.access_token;
        return { etapa: 'sessao' as const };
      }

      this.challengeToken = null;
      const r = await hub.login(payload.email, payload.password || '');

      if (r.status === 'desafio') {
        this.challengeToken = r.challengeToken;
        return { etapa: '2fa' as const };
      }
      if (r.status === 'enrolar') {
        // O passe de 10 min só abre as rotas de enrolamento. A tela com o QR é
        // a do hub — nenhum app cliente reimplementa.
        return { etapa: 'enrolar' as const, url: urlEnrolamento(r.setupToken) };
      }

      this.token = r.session.token;
      return { etapa: 'sessao' as const };
    },

    /** Fecha o login pendente com o código do autenticador (ou de recuperação). */
    async verificarSegundoFator(codigo: string, usarBackup = false) {
      if (!this.challengeToken) throw new Error('sem_desafio');
      const sessao = usarBackup
        ? await hub.twoFactor.verifyBackup(this.challengeToken, codigo)
        : await hub.twoFactor.verify(this.challengeToken, codigo);
      this.challengeToken = null;
      this.token = sessao.token;
    },

    /**
     * Define a senha pelo magic link (convite ou reset).
     *
     * A versão anterior só checava `res.ok` e descartava o corpo — perdia os
     * dois desfechos que não são sessão.
     */
    async setupPassword(magicLinkToken: string, novaSenha: string) {
      const r = await hub.setupPassword(magicLinkToken, novaSenha);

      if (r.status === 'desafio') {
        // Conta que JÁ tem autenticador (típico de reset): a senha nova sozinha
        // não abre sessão, senão o reset seria atalho para pular o 2FA.
        this.challengeToken = r.challengeToken;
        return { etapa: '2fa' as const };
      }
      if (r.status === 'enrolar') {
        return { etapa: 'enrolar' as const, url: urlEnrolamento(r.setupToken) };
      }

      this.token = r.session.token;
      return { etapa: 'sessao' as const };
    },

    async refreshToken(): Promise<boolean> {
      const novo = await hub.refresh();
      if (!novo) return false;
      this.token = novo;
      return true;
    },

    logout() {
      hub.logout();
      this.token = null;
      this.challengeToken = null;
      window.location.href = '/login';
    },
  },
});
