import express from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import pino from "pino";
import dotenv from "dotenv";
import "express-async-errors";
import { translateRouter } from "./routes/translate.routes.js";
import { telegramRouter, telegramBotRouter, requireBotKey } from "./routes/telegram.routes.js";

dotenv.config();

const logger = pino({ name: "lbs-ttsapp-backend" });
const app = express();
const PORT = process.env.PORT || 3000;

const httpLogger = typeof pinoHttp === "function" ? pinoHttp : (pinoHttp as any).default || pinoHttp;

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));
app.use(httpLogger({ logger }));

// Health Check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    app: "LBSTTSAPP Backend",
    // Versão do build, injetada pelo docker-compose a partir do arquivo VERSION.
    // O front compara com a que ficou congelada no bundle dele — ver
    // frontend/src/composables/useVersionCheck.ts.
    version: process.env.APP_VERSION || "0.0.0",
    buildDate: process.env.APP_BUILD_DATE || null,
    timestamp: new Date().toISOString(),
  });
});

import { authMiddleware } from "./middlewares/auth.middleware.js";

// API Routes
app.use("/api/v1/translate", authMiddleware, translateRouter);

// Vinculo hibrido do Telegram. `/telegram` exige sessao do hub; `/bot` e a
// unica rota de servico, chamada pelo proprio bot com a chave compartilhada.
app.use("/api/v1/telegram", authMiddleware, telegramRouter);
app.use("/api/v1/bot", requireBotKey, telegramBotRouter);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ error: err.message || "Internal Server Error" });
});

app.listen(PORT, () => {
  logger.info(`▶ LBSTTSAPP Backend rodando na porta ${PORT}`);
});
