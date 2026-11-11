import { config } from "dotenv";

// Funciona tanto ao executar pela raiz do monorepo quanto dentro de apps/api.
config({ path: [".env", "../../.env"], quiet: true });

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 3333),
  webUrl: process.env.WEB_URL ?? "http://localhost:5173",
  webAllowedOrigins: process.env.WEB_ALLOWED_ORIGINS ?? "",
  jwtSecret: required("JWT_SECRET"),
  mercadoPagoAccessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN ?? "",
  mercadoPagoPublicKey: process.env.MERCADO_PAGO_PUBLIC_KEY || process.env.VITE_MERCADO_PAGO_PUBLIC_KEY || "",
  mercadoPagoWebhookSecret: process.env.MERCADO_PAGO_WEBHOOK_SECRET ?? "",
  apiPublicUrl: process.env.API_PUBLIC_URL ?? "",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "",
  database: {
    host: required("DB_HOST", "localhost"),
    port: Number(process.env.DB_PORT ?? 3306),
    name: required("DB_NAME", "urfood"),
    user: required("DB_USER", "root"),
    password: process.env.DB_PASSWORD ?? "",
    logging: process.env.DB_LOGGING === "true",
    poolMax: Number(process.env.DB_POOL_MAX ?? 10),
    poolMin: Number(process.env.DB_POOL_MIN ?? 0),
    poolIdleMs: Number(process.env.DB_POOL_IDLE_MS ?? 60_000),
    connectTimeoutMs: Number(process.env.DB_CONNECT_TIMEOUT_MS ?? 10_000),
  },
} as const;

if (!Number.isInteger(env.database.poolMax) || env.database.poolMax < 1 ||
    !Number.isInteger(env.database.poolMin) || env.database.poolMin < 0 ||
    env.database.poolMin > env.database.poolMax ||
    !Number.isFinite(env.database.poolIdleMs) || env.database.poolIdleMs < 1 ||
    !Number.isFinite(env.database.connectTimeoutMs) || env.database.connectTimeoutMs < 1) {
  throw new Error("Configuração inválida do pool de conexões MySQL.");
}

if (env.jwtSecret === "dev-only-change-me" || env.jwtSecret.length < 32) {
  throw new Error("Configure JWT_SECRET com uma chave aleatória de pelo menos 32 caracteres.");
}
