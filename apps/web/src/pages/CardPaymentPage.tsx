import { loadMercadoPagoSdk, paymentPublicKey } from "../services/payment-bootstrap";
import { usePaymentUpdates } from "../services/usePaymentUpdates";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CreditCard, LoaderCircle, LockKeyhole, ShieldCheck, XCircle } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { API_URL } from "../services/admin-api";
import { orderRequestHeaders } from "../services/realtime";

type CardState = { orderId: string; displayNumber: string; total: number; paymentStatus: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED"; orderStatus?: string; cancellationReason?: string; expiresAt: string; paymentMethod: "CREDIT_CARD" | "DEBIT_CARD"; customerName: string; message?: string };
type CardFormData = { token: string; paymentMethodId: string; issuerId?: string };
type CardForm = { getCardFormData(): CardFormData; unmount?(): void };
type MercadoPagoClient = { cardForm(config: Record<string, unknown>): CardForm };
type MercadoPagoWindow = Window & { MercadoPago?: new (key: string) => MercadoPagoClient };
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function rememberOrder(id: string) {
  const history = JSON.parse(localStorage.getItem("urfood_orders") ?? "[]") as Array<{ id: string; createdAt: string }>;
  localStorage.setItem("urfood_current_order", id);
  localStorage.setItem("urfood_orders", JSON.stringify([{ id, createdAt: new Date().toISOString() }, ...history.filter(item => item.id !== id)].slice(0, 20)));
}

export function CardPaymentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const initialRequest = useRef(true);
  const redirected = useRef<string | null>(null);
  const [order, setOrder] = useState<CardState | null>(null);
  const [publicKey, setPublicKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const remaining = order ? Math.max(0, Math.ceil((new Date(order.expiresAt).getTime() - now) / 1000)) : 0;

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const initial = initialRequest.current; initialRequest.current = false;
      const response = await fetch(`${API_URL}/payments/mercado-pago/card/orders/${id}${initial ? "?initial=1" : ""}`, { headers: orderRequestHeaders(id) });
      const data = await response.json() as CardState;
      if (!response.ok) throw new Error(data.message ?? "Pagamento não encontrado.");
      setOrder(data);
      if (data.paymentStatus === "APPROVED" && data.orderStatus !== "CANCELED" && redirected.current !== id) {
        redirected.current = id;
        rememberOrder(id);
        setTimeout(() => navigate(`/status/${id}`, { replace: true }), 200);
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível consultar o pagamento."); }
    finally { setLoading(false); }
  }, [id, navigate]);

  usePaymentUpdates(id, load);

  useEffect(() => {
    void load();
    void paymentPublicKey().then(setPublicKey).catch(() => setPublicKey(""));
    void loadMercadoPagoSdk().catch(() => undefined);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 4000);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(timer); clearInterval(clock); };
  }, [load]);

  useEffect(() => {
    if (!id || !order || !publicKey || order.paymentStatus === "APPROVED" || order.orderStatus === "CANCELED" || remaining <= 0) return;
    let disposed = false;
    let cardForm: CardForm | undefined;
    void loadMercadoPagoSdk().then(() => {
      if (disposed) return;
      const constructor = (window as MercadoPagoWindow).MercadoPago;
      if (!constructor) throw new Error("SDK de pagamentos indisponível.");
      cardForm = new constructor(publicKey).cardForm({
        amount: order.total.toFixed(2), iframe: true,
        form: {
          id: "form-checkout",
          cardNumber: { id: "form-checkout__cardNumber", placeholder: "Número do cartão" },
          expirationDate: { id: "form-checkout__expirationDate", placeholder: "MM/AA" },
          securityCode: { id: "form-checkout__securityCode", placeholder: "CVV" },
          cardholderName: { id: "form-checkout__cardholderName", placeholder: "Nome no cartão" },
          issuer: { id: "form-checkout__issuer", placeholder: "Emissor" },
          installments: { id: "form-checkout__installments", placeholder: "Parcelas" },
          identificationType: { id: "form-checkout__identificationType", placeholder: "Documento" },
          identificationNumber: { id: "form-checkout__identificationNumber", placeholder: "Número do documento" },
          cardholderEmail: { id: "form-checkout__cardholderEmail", placeholder: "E-mail" },
        },
        callbacks: {
          onFormMounted: (problem?: Error) => { if (problem && !disposed) setError(problem.message); },
          onSubmit: (event: Event) => {
            event.preventDefault();
            if (disposed || !cardForm || submitting.current || Date.now() >= new Date(order.expiresAt).getTime()) { void load(); return; }
            submitting.current = true;
            let data: CardFormData;
            try {
              data = cardForm.getCardFormData();
              if (!data.token || !data.paymentMethodId) throw new Error("Confira o número, a validade e o CVV do cartão.");
            }
            catch (reason) { submitting.current = false; setError(reason instanceof Error ? reason.message : "Confira os dados do cartão."); return; }
            setProcessing(true); setError("");
            void fetch(`${API_URL}/payments/mercado-pago/card/orders/${id}`, {
              method: "POST", headers: { "Content-Type": "application/json", ...orderRequestHeaders(id!) },
              body: JSON.stringify({ attemptId: crypto.randomUUID(), cardToken: data.token,
                paymentMethodId: data.paymentMethodId, issuerId: data.issuerId,
                installments: 1 }),
            }).then(async response => {
              const result = await response.json() as { status?: string; message?: string };
              if (!response.ok) throw new Error(result.message ?? "O cartão não pôde ser processado.");
              if (result.status === "approved") { await load(); return; }
              if (["rejected", "cancelled"].includes(result.status ?? "")) throw new Error("Pagamento recusado. Confira os dados ou tente outro cartão.");
              setError("Pagamento em análise. Aguarde a confirmação do Mercado Pago.");
            }).catch(reason => { if (!disposed) setError(reason instanceof Error ? reason.message : "Falha ao processar o cartão."); })
              .finally(() => { submitting.current = false; if (!disposed) setProcessing(false); });
          },
        },
      });
    }).catch(reason => { if (!disposed) setError(reason instanceof Error ? reason.message : "Falha ao carregar o cartão."); });
    return () => { disposed = true; cardForm?.unmount?.(); };
  // The SDK form should mount once per order/key. The countdown changes each second.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, publicKey, Boolean(order), order?.total]);

  if (loading) return <main className="card-payment-page"><section className="card-payment-shell card-payment-state"><LoaderCircle className="spinner" /><h1>Preparando pagamento seguro...</h1></section></main>;
  if (error && !order) return <main className="card-payment-page"><section className="card-payment-shell card-payment-state"><XCircle /><h1>Pagamento indisponível</h1><p>{error}</p><a href="/cardapio">Voltar ao cardápio</a></section></main>;
  if (!order) return null;
  if (order.orderStatus === "CANCELED" || order.paymentStatus === "EXPIRED" || (remaining <= 0 && order.paymentStatus !== "APPROVED")) return <main className="card-payment-page"><section className="card-payment-shell card-payment-state"><XCircle /><h1>Cancelado por falta de pagamento</h1><p>{order.cancellationReason || "O prazo de 6 minutos para pagamento terminou. Faça um novo pedido."}</p><a href="/meus-pedidos">Meus pedidos</a><a href="/cardapio">Voltar ao cardápio</a></section></main>;
  if (order.paymentStatus === "APPROVED") return <main className="card-payment-page"><section className="card-payment-shell card-payment-state approved"><Check /><h1>Pagamento aprovado!</h1><p>Abrindo o acompanhamento do pedido...</p></section></main>;
  return <main className="card-payment-page"><section className="card-payment-shell">
    <header><div className="card-brand"><CreditCard /><span><small>PAGAMENTO ONLINE</small><h1>Pagamento com cartão</h1></span></div><div className="card-secure"><LockKeyhole /> Ambiente seguro</div></header>
    <div className="card-order"><span>Pedido #{order.displayNumber}<small>{order.paymentMethod === "CREDIT_CARD" ? "Cartão de crédito" : "Cartão de débito"}</small></span><strong>{money(order.total)}</strong><span role="timer">{String(Math.floor(remaining / 60)).padStart(2, "0")}:{String(remaining % 60).padStart(2, "0")}</span></div>
    {!publicKey ? <div className="card-config-error"><XCircle /><p>Configure <b>MERCADO_PAGO_PUBLIC_KEY</b> na API e reinicie o projeto.</p></div> : <>
      <div className="card-help"><LockKeyhole size={15} /> Número e CVV são protegidos pelo Mercado Pago.</div>
      <form id="form-checkout" noValidate className={`mercado-pago-card-form${processing ? " processing" : ""}`}>
        <div className="card-visual">
          <div className="card-visual-top"><span>URFOOD <b>PAY</b></span><CreditCard size={23} aria-hidden="true" /></div>
          <label className="wide">Número do cartão<div id="form-checkout__cardNumber" className="mp-secure-field" /></label>
          <label className="wide">Nome no cartão<input id="form-checkout__cardholderName" required autoComplete="cc-name" /></label>
          <label>Validade<div id="form-checkout__expirationDate" className="mp-secure-field" /></label>
          <label>CVV<div id="form-checkout__securityCode" className="mp-secure-field" /></label>
        </div>
        <div className="card-sdk-fields" aria-hidden="true">
          <select id="form-checkout__issuer" tabIndex={-1} />
          <select id="form-checkout__installments" tabIndex={-1} />
          <select id="form-checkout__identificationType" tabIndex={-1} />
          <input id="form-checkout__identificationNumber" tabIndex={-1} />
          <input id="form-checkout__cardholderEmail" type="email" tabIndex={-1} />
        </div>
        <button id="form-checkout__submit" className="wide" type="submit" disabled={processing}>{processing ? <><LoaderCircle className="spinner" /> Processando...</> : `Pagar ${money(order.total)}`}</button>
      </form>
      {error && <div className="card-payment-error"><XCircle /> {error}</div>}
      <footer><ShieldCheck /><span><b>Pagamento processado pelo Mercado Pago</b><small>O UrFood não recebe nem armazena número ou código de segurança do cartão.</small></span></footer>
    </>}
  </section></main>;
}
