import express from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import pino from "pino";
import dotenv from "dotenv";
import "express-async-errors";
import { translateRouter } from "./routes/translate.routes.js";

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
  res.json({ status: "ok", app: "LBSTTSAPP Backend", timestamp: new Date().toISOString() });
});

import { authMiddleware } from "./middlewares/auth.middleware.js";

// API Routes
app.use("/api/v1/translate", authMiddleware, translateRouter);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ error: err.message || "Internal Server Error" });
});

app.listen(PORT, () => {
  logger.info(`▶ LBSTTSAPP Backend rodando na porta ${PORT}`);
});
