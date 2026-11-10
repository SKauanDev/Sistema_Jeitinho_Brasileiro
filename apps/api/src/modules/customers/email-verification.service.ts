import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { Model, Transaction } from "sequelize";
import { env } from "../../config/env.js";

export function normalizeEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Informe um e-mail válido.");
  return email;
}
export function codeHash(accountId: string, purpose: string, code: string) {
  return createHmac("sha256", env.jwtSecret).update(`${accountId}:${purpose}:${code}`).digest("hex");
}
export function codeMatches(accountId: string, purpose: string, code: string, digest: string) {
  if (!/^\d{6}$/.test(code) || !/^[a-f0-9]{64}$/.test(digest)) return false;
  return timingSafeEqual(Buffer.from(codeHash(accountId, purpose, code), "hex"), Buffer.from(digest, "hex"));
}
export async function sendEmailCode(account: Model, email: string, purpose: "VERIFY" | "RESET", transaction: Transaction) {
  if (!env.resendApiKey || !env.emailFrom) throw new Error("Envio de e-mail indisponível. Configure RESEND_API_KEY e EMAIL_FROM.");
  const last = account.getDataValue("emailCodeSentAt");
  if (last && Date.now() - new Date(last).getTime() < 60000) throw new Error("Aguarde 60 segundos antes de solicitar outro código.");
  const code = String(randomInt(0, 1000000)).padStart(6, "0");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${env.resendApiKey}`, "Content-Type": "application/json", "User-Agent": "UrFood/0.1" },
    body: JSON.stringify({ from: env.emailFrom, to: [email], subject: purpose === "RESET" ? "UrFood — recuperação de senha" : "UrFood — confirme seu e-mail", text: `Seu código é ${code}. Ele vale por 10 minutos e só pode ser usado uma vez. Não compartilhe este código. Se você não solicitou, ignore esta mensagem.`, html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px"><h2 style="color:#255034">UrFood</h2><p>${purpose === "RESET" ? "Recupere sua senha" : "Confirme seu e-mail"} usando este código:</p><p style="font-size:32px;letter-spacing:6px;font-weight:bold">${code}</p><p>Válido por 10 minutos. Não compartilhe este código.</p><small>Se você não solicitou, ignore esta mensagem.</small></div>` }),
  });
  if (!response.ok) throw new Error("Não foi possível enviar o e-mail. Verifique a configuração ou tente mais tarde.");
  await account.update({ pendingEmail: purpose === "VERIFY" ? email : null, emailCodeHash: codeHash(String(account.getDataValue("id")), purpose, code), emailCodePurpose: purpose, emailCodeExpiresAt: new Date(Date.now() + 600000), emailCodeSentAt: new Date(), emailCodeAttempts: 0 }, { transaction });
}
// O chamador mantém bloqueio transacional da conta e confirma mesmo tentativas inválidas.
export async function consumeEmailCode(account: Model, purpose: "VERIFY" | "RESET", code: string, transaction: Transaction) {
  const attempts = Number(account.getDataValue("emailCodeAttempts"));
  const expires = account.getDataValue("emailCodeExpiresAt");
  if (account.getDataValue("emailCodePurpose") !== purpose || !expires || new Date(expires).getTime() <= Date.now() || attempts >= 5) return false;
  await account.update({ emailCodeAttempts: attempts + 1 }, { transaction });
  if (!codeMatches(String(account.getDataValue("id")), purpose, code, String(account.getDataValue("emailCodeHash")))) return false;
  await account.update({ emailCodeHash: null, emailCodePurpose: null, emailCodeExpiresAt: null }, { transaction });
  return true;
}
const limits = new Map<string, { count: number; until: number }>();
export function allowEmailAttempt(key: string, maximum: number) {
  const now = Date.now();
  for (const [entry, value] of limits) if (value.until <= now) limits.delete(entry);
  const bucket = limits.get(key) ?? { count: 0, until: now + 3600000 };
  if (bucket.count >= maximum) return false;
  bucket.count++; limits.set(key, bucket); return true;
}
