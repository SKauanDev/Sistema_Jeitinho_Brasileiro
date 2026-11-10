import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Clock3,
  Copy,
  LoaderCircle,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { API_URL } from "../services/admin-api";
import { orderRequestHeaders } from "../services/realtime";

type PixState = {
  orderId: string;
  displayNumber: string;
  total: number;
  paymentStatus: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  expiresAt: string;
  pixCopyPaste: string;
  checkoutUrl?: string | null;
  qrCodeBase64?: string;
  pixKey?: string | null;
  message?: string;
  orderStatus?: string;
  cancellationReason?: string;
};
const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function PixPaymentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [payment, setPayment] = useState<PixState | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState(false);
  const load = useCallback(async () => {
    if (!id) return;
    try {
      const response = await fetch(`${API_URL}/payments/mercado-pago/orders/${id}`, { headers: orderRequestHeaders(id) });
      const data = (await response.json()) as PixState;
      if (!response.ok)
        throw new Error(
          data.message ?? "Não foi possível consultar o pagamento.",
        );
      setPayment(data);
      if (data.paymentStatus === "APPROVED" && data.orderStatus !== "CANCELED") {
        const history = JSON.parse(
          localStorage.getItem("urfood_orders") ?? "[]",
        ) as Array<{ id: string; createdAt: string }>;
        localStorage.setItem("urfood_current_order", id);
        localStorage.setItem(
          "urfood_orders",
          JSON.stringify(
            [
              { id, createdAt: new Date().toISOString() },
              ...history.filter((item) => item.id !== id),
            ].slice(0, 20),
          ),
        );
        setTimeout(() => navigate(`/status/${id}`, { replace: true }), 900);
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Falha ao consultar o pagamento.",
      );
    }
  }, [id, navigate]);
  useEffect(() => {
    void load();
    const poll = window.setInterval(() => void load(), 4000);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [load]);
  const seconds = useMemo(
    () =>
      payment
        ? Math.max(
            0,
            Math.ceil((new Date(payment.expiresAt).getTime() - now) / 1000),
          )
        : 0,
    [payment, now],
  );
  const expired =
    payment && (payment.orderStatus === "CANCELED" || ["EXPIRED", "REJECTED"].includes(payment.paymentStatus) || (seconds <= 0 && payment.paymentStatus !== "APPROVED"));
  async function copy() {
    if (!payment?.pixCopyPaste || seconds <= 0 || expired) return;
    await navigator.clipboard.writeText(payment.pixCopyPaste);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }
  if (!payment && !error)
    return (
      <main className="pix-payment-page">
        <section className="pix-payment-card pix-loading">
          <LoaderCircle className="spinner" />
          <h1>Gerando seu PIX...</h1>
        </section>
      </main>
    );
  if (error || !payment)
    return (
      <main className="pix-payment-page">
        <section className="pix-payment-card">
          <XCircle className="pix-error-icon" />
          <h1>Pagamento indisponível</h1>
          <p>{error}</p>
          <a href="/cardapio">Voltar ao cardápio</a>
        </section>
      </main>
    );
  if (expired)
    return (
      <main className="pix-payment-page">
        <section className="pix-payment-card">
          <XCircle className="pix-error-icon" />
          <span>PAGAMENTO ENCERRADO</span>
          <h1>{payment.cancellationReason || "Cancelado por falta de pagamento"}</h1>
          <p>
            O pedido #{payment.displayNumber} foi cancelado automaticamente e
            não entrou na fila da loja.
          </p>
          <a href="/cardapio">Fazer um novo pedido</a>
        </section>
      </main>
    );
  return (
    <main className="pix-payment-page">
      <section className="pix-payment-card">
        <header>
          <ShieldCheck />
          <div>
            <span>AMBIENTE SEGURO</span>
            <h1>Pague com PIX</h1>
          </div>
        </header>
        {payment.paymentStatus === "APPROVED" ? (
          <div className="pix-approved">
            <Check />
            <h2>Pagamento confirmado!</h2>
            <p>Abrindo o acompanhamento do pedido...</p>
          </div>
        ) : (
          <>
            <div className="pix-order-summary">
              <span>Pedido #{payment.displayNumber}</span>
              <strong>{money(payment.total)}</strong>
            </div>
            <div className={`pix-timer ${seconds < 60 ? "ending" : ""}`}>
              <Clock3 />
              <span>
                <small>Tempo para pagar</small>
                <strong>
                  {String(Math.floor(seconds / 60)).padStart(2, "0")}:
                  {String(seconds % 60).padStart(2, "0")}
                </strong>
              </span>
            </div>
            {payment.checkoutUrl ? (
              <>
                <p>Conclua o pagamento no ambiente seguro do Mercado Pago. O pedido será liberado somente após a confirmação.</p>
                <a className="pix-checkout-link" href={payment.checkoutUrl}>Continuar para o Mercado Pago</a>
              </>
            ) : (
              <>
                <label className="pix-copy-label">PIX Copia e Cola</label>
                {payment.qrCodeBase64 && <img className="pix-provider-qr" src={`data:image/png;base64,${payment.qrCodeBase64}`} alt="QR Code PIX do Mercado Pago" />}
                <div className="pix-copy-box">
                  <p>{payment.pixCopyPaste}</p>
                  <button onClick={() => void copy()}>
                    <Copy /> {copied ? "Copiado!" : "Copiar código"}
                  </button>
                </div>
                {payment.pixKey && <p className="pix-key">Chave cadastrada no estabelecimento: <b>{payment.pixKey}</b></p>}
              </>
            )}
            <div className="pix-waiting">
              <LoaderCircle className="spinner" />
              <span>
                <b>Aguardando confirmação do pagamento</b>
                <small>
                  A página será liberada automaticamente após a aprovação.
                </small>
              </span>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
