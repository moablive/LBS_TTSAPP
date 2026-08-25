import { Request, Response, NextFunction } from 'express';
import { verifyHubToken, HubAuthError, bearerDoRequest } from '../lib/hubAuthServer.js';

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

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
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
    (req as any).user = verifyHubToken(token, hubConfig);
    return next();
  } catch (err) {
    const e = err as HubAuthError;
    if (e instanceof HubAuthError) {
      return res.status(e.status).json({ error: e.code, message: e.message });
    }
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
};
