import { API_URL } from "./admin-api";

type SdkWindow = Window & { MercadoPago?: unknown };
let sdk: Promise<void> | undefined;
let key: { promise: Promise<string>; until: number } | undefined;

export function loadMercadoPagoSdk(): Promise<void> {
  if ((window as SdkWindow).MercadoPago) return Promise.resolve();
  if (sdk) return sdk;
  sdk = new Promise<void>((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>('script[data-mercado-pago-sdk="true"]');
    const created = !script;
    if (!script) {
      script = document.createElement("script");
      script.src = "https://sdk.mercadopago.com/js/v2";
      script.async = true;
      script.dataset.mercadoPagoSdk = "true";
    }
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => {
      script.remove(); sdk = undefined;
      reject(new Error("Não foi possível carregar o formulário seguro do Mercado Pago."));
    }, { once: true });
    if (created) document.head.appendChild(script);
  });
  return sdk;
}

export function paymentPublicKey(): Promise<string> {
  if (key && key.until > Date.now()) return key.promise;
  const promise = fetch(`${API_URL}/payments/mercado-pago/public-key`).then(async response => {
    const data = await response.json() as { publicKey?: string };
    if (!response.ok || !data.publicKey) throw new Error("Pagamento com cartão indisponível.");
    return data.publicKey;
  }).catch(error => { if (key?.promise === promise) key = undefined; throw error; });
  key = { promise, until: Date.now() + 300_000 };
  return promise;
}

export function preloadPayment(method: string) {
  if (method === "PIX") void import("../pages/PixPaymentPage").catch(() => undefined);
  if (["CREDIT_CARD", "DEBIT_CARD"].includes(method)) {
    void import("../pages/CardPaymentPage").catch(() => undefined);
    void loadMercadoPagoSdk().catch(() => undefined);
    void paymentPublicKey().catch(() => undefined);
  }
}
