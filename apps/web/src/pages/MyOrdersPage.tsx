import { useEffect, useState } from "react";
import { ArrowLeft, ChevronRight, Clock3, LoaderCircle, ShoppingBag } from "lucide-react";
import { createCustomerSocket } from "../services/realtime";
import { API_URL } from "../services/admin-api";
import type { Order } from "../types/admin";
import type { CustomerDetails } from "../types/customer";
import { CustomerOrderDetails } from "../features/order-status/CustomerOrderDetails";
import { customerOrderLabel } from "../features/order-status/order-presentation";

export function MyOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [logged, setLogged] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const token = localStorage.getItem("urfood_customer_token");
    if (!token) { setLogged(false); setLoading(false); return; }
    let disposed = false;
    const socket = createCustomerSocket();
    let ids: string[] = [];
    async function refresh() {
      try {
        const response = await fetch(`${API_URL}/customers/session`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await response.json() as CustomerDetails & { message?: string };
        if (!response.ok) throw new Error(data.message ?? "Não foi possível carregar seus pedidos.");
        if (disposed) return;
        setOrders(data.orders); setError("");
        const nextIds = data.orders.filter(order => !["COMPLETED", "CANCELED"].includes(order.status)).slice(0, 50).map(order => order.id);
        ids.filter(id => !nextIds.includes(id)).forEach(id => socket.emit("unwatch:order", id));
        nextIds.filter(id => !ids.includes(id)).forEach(id => socket.emit("watch:order", id));
        ids = nextIds;
        const active = data.orders.find(order => !["COMPLETED", "CANCELED"].includes(order.status));
        if (active) localStorage.setItem("urfood_current_order", active.id);
        else localStorage.removeItem("urfood_current_order");
      } catch (reason) { if (!disposed) setError(reason instanceof Error ? reason.message : "Não foi possível atualizar seus pedidos."); }
      finally { if (!disposed) setLoading(false); }
    }
    socket.on("connect", () => { ids.forEach(id => socket.emit("watch:order", id)); void refresh(); });
    socket.on("order:status", () => void refresh());
    socket.on("order:payment", () => void refresh());
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    // Socket events update immediately; periodic reconciliation is only a safety net.
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") onFocus(); }, 60_000);
    void refresh();
    return () => { disposed = true; socket.disconnect(); window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, []);
  return <main className="orders-page"><section>
    <header><a href="/cardapio"><ArrowLeft /> Cardápio</a><div><span>SEUS PEDIDOS</span><h1>Meus pedidos</h1><p>Itens escolhidos e acompanhamento atualizado em um só lugar.</p></div></header>
    {loading ? <div className="orders-empty"><LoaderCircle className="spinner" /><h2>Atualizando pedidos...</h2></div> : !logged ? <div className="orders-empty"><ShoppingBag /><h2>Entre para visualizar</h2><p>Seus pedidos ficam disponíveis apenas dentro da sua conta.</p><a href="/perfil">Entrar no perfil</a></div> : error && !orders.length ? <div className="orders-empty"><h2>Não foi possível atualizar</h2><p>{error}</p><button onClick={() => window.location.reload()}>Tentar novamente</button></div> : !orders.length ? <div className="orders-empty"><ShoppingBag /><h2>Nenhum pedido por aqui</h2><a href="/cardapio">Explorar cardápio</a></div> : <>
      {error && <p role="alert">{error}</p>}
      <div className="customer-orders-list">{orders.map((order, index) => <details key={order.id} className={`customer-order-card ${order.status.toLowerCase()}`} open={index === 0 ? true : undefined}>
        <summary><div><strong>Pedido #{order.displayNumber}</strong><small><Clock3 /> {new Date(order.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</small></div><span>{customerOrderLabel(order)}</span><ChevronRight /></summary>
        <CustomerOrderDetails order={order} />
        <a className="customer-order-tracking" href={`/status/${order.id}`}>Abrir acompanhamento <ChevronRight /></a>
      </details>)}</div>
    </>}
  </section></main>;
}
