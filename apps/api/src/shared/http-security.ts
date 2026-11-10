import type { ErrorRequestHandler, RequestHandler } from "express";

export const securityHeaders: RequestHandler = (_request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  next();
};

export function createRateLimit(limit: number, windowMs: number, now = Date.now): RequestHandler {
  const buckets = new Map<string, { count: number; expires: number }>();
  return (request, response, next) => {
    if (request.method !== "POST") { next(); return; }
    const time = now();
    for (const [key, bucket] of buckets) if (bucket.expires <= time) buckets.delete(key);
    const key = request.ip ?? request.socket.remoteAddress ?? "unknown";
    let bucket = buckets.get(key);
    if (!bucket) {
      if (buckets.size >= 10000) { response.status(429).json({ message: "Muitas solicitações. Tente novamente mais tarde." }); return; }
      bucket = { count: 0, expires: time + windowMs }; buckets.set(key, bucket);
    }
    if (++bucket.count > limit) {
      response.setHeader("Retry-After", String(Math.max(1, Math.ceil((bucket.expires - time) / 1000))));
      response.status(429).json({ message: "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente." }); return;
    }
    next();
  };
}

export const apiErrorHandler: ErrorRequestHandler = (error, _request, response, next) => {
  if (response.headersSent) { next(error); return; }
  const status = error?.type === "entity.too.large" ? 413 : error instanceof SyntaxError && (error as { status?: number }).status === 400 ? 400 : 500;
  if (status === 500) console.error("Erro interno da API:", error instanceof Error ? error.name : "UnknownError");
  response.status(status).json({ message: status === 413 ? "Requisição muito grande." : status === 400 ? "JSON inválido." : "Não foi possível concluir a operação." });
};
