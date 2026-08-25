import { Request, Response, NextFunction } from 'express';
import { verifyHubToken, HubAuthError, bearerDoRequest, criarVerificadorDeRevogacao } from '../lib/hubAuthServer.js';

/**
 * Guarda de sessão do LoginHUB.
 *
 * Os fallbacks anteriores (`process.env.JWT_SECRET || 'secret_local'` e
 * `Number(process.env.APP_ID) || 13`) faziam o serviço subir e "funcionar" com
 * um segredo público e um tenant chutado. Agora a config vai crua para o
 * `verifyHubToken`, que recusa a requisição com 500 quando falta qualquer uma
 * das duas — falhar alto é melhor que aceitar token forjado em silêncio.
 */
const hubConfig = {
  secret: process.env.JWT_SECRET,
  appId: process.env.APP_ID,
};

/**
 * Revogacao de sessao. Ativar o 2FA (ou um reset administrativo) carimba um
 * piso no hub a partir do qual so valem tokens novos — e o `verifyHubToken`,
 * que e local de proposito, nao enxerga isso. Sem este verificador um token
 * emitido antes do corte seguia aceito aqui por ate 24 h.
 *
 * Cache curto por usuario: o piso muda rarissimo, entao nao ha ida a rede por
 * requisicao. Falha ABERTA se o hub nao responder — ver o kit.
 */
const revogacao = criarVerificadorDeRevogacao({
  baseUrl: process.env.LOGINHUB_API_URL ?? 'http://server_loginhub_backend:3000/api',
});

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const token = bearerDoRequest(req);
  if (!token) {
    return res.status(401).json({ error: 'Token ausente ou mal formatado' });
  }

  try {
    // Além da assinatura e do tenant, `verifyHubToken` recusa os passes de
    // etapa única do hub (`action: '2fa-challenge' | '2fa-setup' |
    // 'setup-password'`). O `jwt.verify` cru aceitava os três: o passe de
    // enrolamento se obtém só com a senha e carrega `sub`, `email`, `app_id` e
    // `role`, então valia como sessão aqui — o segundo fator não protegia nada
    // desta API.
    const sessao = verifyHubToken(token, hubConfig);
    if (await revogacao.revogada(token, sessao)) {
      return res.status(401).json({
        error: 'SESSAO_REVOGADA',
        message: 'Sua sessao foi encerrada. Entre novamente.',
      });
    }
    (req as any).user = sessao;
    return next();
  } catch (err) {
    const e = err as HubAuthError;
    if (e instanceof HubAuthError) {
      return res.status(e.status).json({ error: e.code, message: e.message });
    }
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
};
