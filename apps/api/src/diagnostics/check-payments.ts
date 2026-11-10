import { env } from "../config/env.js";

async function read(url: string, accessToken?: string) {
  try {
    const response = await fetch(url, { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : { "ngrok-skip-browser-warning": "1" }, signal: AbortSignal.timeout(15_000) });
    const text = await response.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = null; }
    return { status: response.status, data, offlineTunnel: text.includes("ERR_NGROK_3200") };
  } catch { return { status: 0, data: null, offlineTunnel: false }; }
}

const account = env.mercadoPagoAccessToken ? await read("https://api.mercadopago.com/users/me", env.mercadoPagoAccessToken) : null;
const publicKey = env.mercadoPagoPublicKey ? await read(`https://api.mercadopago.com/v1/payment_methods?public_key=${encodeURIComponent(env.mercadoPagoPublicKey)}`) : null;
const publicApi = env.apiPublicUrl ? await read(`${env.apiPublicUrl.replace(/\/$/, "")}/health`) : null;
const report = {
  accessTokenAccepted: account?.status === 200,
  publicKeyAccepted: publicKey?.status === 200 && Array.isArray(publicKey.data),
  accountActive: account?.data?.status?.site_status === "active",
  testAccount: Array.isArray(account?.data?.tags) ? account.data.tags.includes("test_user") : null,
  webhookSecretConfigured: !!env.mercadoPagoWebhookSecret,
  publicApiReachable: publicApi?.status === 200 && publicApi.data?.status === "ok",
  publicApiStatus: publicApi?.status ?? null,
  tunnelOffline: publicApi?.offlineTunnel ?? null,
  chargeCreated: false,
};
console.log(JSON.stringify(report, null, 2));
if (!report.accessTokenAccepted || !report.publicKeyAccepted || !report.accountActive || !report.webhookSecretConfigured || !report.publicApiReachable) process.exitCode = 1;
