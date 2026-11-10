import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Bike,
  Check,
  CheckCircle2,
  ChefHat,
  Clock3,
  Home,
  LoaderCircle,
  PackageCheck,
  Store,
} from "lucide-react";
import { useParams } from "react-router-dom";
import { createCustomerSocket, orderRequestHeaders } from "../services/realtime";
import { API_URL } from "../services/admin-api";
import { type Order, type OrderStatus } from "../types/admin";
import { CustomerOrderDetails } from "../features/order-status/CustomerOrderDetails";
import { customerOrderLabel, isPaymentWaiting } from "../features/order-status/order-presentation";

type PublicOrder = Order;
const deliveryFlow: Array<{
  status: OrderStatus;
  label: string;
  icon: typeof Check;
}> = [
  { status: "NEW", label: "Pedido recebido", icon: Check },
  { status: "CONFIRMED", label: "Pedido confirmado", icon: PackageCheck },
  { status: "PREPARING", label: "Em preparação", icon: ChefHat },
  { status: "READY", label: "Pedido pronto", icon: CheckCircle2 },
  { status: "OUT_FOR_DELIVERY", label: "Saiu para entrega", icon: Bike },
  { status: "COMPLETED", label: "Pedido entregue", icon: Home },
];

export function OrderStatusPage() {
  const { id } = useParams();
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loadOrder = useCallback(async () => {
    if (!id) return;
    setError("");
    try {
      const response = await fetch(`${API_URL}/orders/${id}`, { headers: orderRequestHeaders(id) });
      const data = (await response.json()) as PublicOrder & {
        message?: string;
      };
      if (!response.ok)
        throw new Error(data.message ?? "Pedido nÃ£o encontrado.");
      setOrder(data);
      if (
        ["COMPLETED", "CANCELED"].includes(data.status) &&
        localStorage.getItem("urfood_current_order") === id
      )
        localStorage.removeItem("urfood_current_order");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "NÃ£o foi possÃ­vel acompanhar o pedido.",
      );
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => {
    void loadOrder();
  }, [loadOrder]);
  useEffect(() => {
    if (!id) return;
    const socket = createCustomerSocket(id);
    socket.on("connect", () => { socket.emit("watch:order", id); void loadOrder(); });
    socket.on("order:status", (event: { id: string }) => {
      if (event.id === id) void loadOrder();
    });
    socket.on("order:payment", (event: { id: string }) => { if (event.id === id) void loadOrder(); });
    const onFocus = () => void loadOrder();
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void loadOrder(); }, 60_000);
    return () => {
      socket.emit("unwatch:order", id);
      socket.disconnect();
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [id, loadOrder]);

  if (loading)
    return (
      <main className="status-page">
        <section className="status-state">
          <LoaderCircle className="spinner" />
          <h1>Buscando seu pedido...</h1>
        </section>
      </main>
    );
  if (error || !order)
    return (
      <main className="status-page">
        <section className="status-state status-error">
          <AlertCircle />
          <h1>NÃ£o foi possÃ­vel acompanhar</h1>
          <p>{error}</p>
          <button
            onClick={() => {
              setLoading(true);
              void loadOrder();
            }}
          >
            Tentar novamente
          </button>
          <a href="/cardapio">
            <Home /> Voltar ao cardápio
          </a>
        </section>
      </main>
    );
  const flow =
    order.fulfillmentType === "PICKUP"
      ? deliveryFlow
          .filter((step) => step.status !== "OUT_FOR_DELIVERY")
          .map((step) =>
            step.status === "COMPLETED"
              ? { ...step, label: "Pedido retirado", icon: Store }
              : step,
          )
      : deliveryFlow;
  const currentIndex = flow.findIndex((step) => step.status === order.status);
  const canceled = order.status === "CANCELED";
  return (
    <main className="status-page">
      <section className="status-panel">
        <header className="status-panel-header">
        <div className={`status-success ${canceled ? "canceled" : ""}`}>
          {canceled ? <AlertCircle /> : isPaymentWaiting(order) ? <Clock3 /> : <Check />}
        </div>
        <div className="status-panel-title">
        <span>ACOMPANHAMENTO EM TEMPO REAL</span>
        <h1>
          {canceled ? "Pedido cancelado" : customerOrderLabel(order)}
        </h1>
        <p>
          {canceled
            ? order.cancellationReason ||
              "Entre em contato com a loja para mais informaçõs."
            : "Esta página é atualizada automaticamente quando a loja avança seu pedido."}
        </p>
        </div>
        <div className="status-code">
          <small>Código do pedido</small>
          <strong>#{order.displayNumber}</strong>
        </div>
        </header>
        <div className="status-panel-layout">
        <section className="status-panel-journey">
          <h2>Trajetória do pedido</h2>
          {isPaymentWaiting(order) && <p>O acompanhamento das etapas começa após a confirmação do pagamento.</p>}
          {canceled && <p>O pedido foi cancelado e não seguirá para as próximas etapas.</p>}
        {!canceled && !isPaymentWaiting(order) && (
          <div className="status-steps">
            {flow.map((step, index) => {
              const Icon = step.icon;
              const done = index <= currentIndex;
              const active = index === currentIndex;
              return (
                <div
                  className={`${done ? "done" : ""} ${active ? "active" : ""}`}
                  key={step.status}
                >
                  <i>
                    <Icon />
                  </i>
                  <span>
                    <strong>{step.label}</strong>
                    <small>
                      {order.statusHistory?.find(event => event.status === step.status)
                        ? new Date(order.statusHistory.find(event => event.status === step.status)!.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) + " · "
                        : ""}
                      {active
                        ? "Etapa atual"
                        : done
                          ? "Concluído"
                          : "Aguardando"}
                    </small>
                  </span>
                  {active && (
                    <em>
                      <Clock3 /> atual
                    </em>
                  )}
                </div>
              );
            })}
          </div>
        )}
        </section>
        <section className="status-panel-summary" aria-label="Detalhes do pedido">
        <CustomerOrderDetails order={order} showTimeline={false} />
        </section>
        </div>
        <footer className="status-panel-footer">
        <a href="/meus-pedidos"><PackageCheck /> Meus pedidos</a>
        <a href="/cardapio">
          <Home /> Voltar ao cardápio
        </a>
        </footer>
      </section>
    </main>
  );
}
