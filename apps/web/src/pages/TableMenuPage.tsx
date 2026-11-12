import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import App from "../App";
import { API_URL } from "../services/admin-api";
import { ORDER_STATUS_LABEL, type OrderStatus } from "../types/admin";
import { TABLE_ACCESS_DENIED, clearTableAccess, saveTableAccess, tableAccessHeaders } from "../services/table-access";
import { ScanTableButton } from "../components/TableScanner";
type Summary = { number: number; sessionId: string | null; total: number; orders: Array<{ id: string; displayNumber: string; status: OrderStatus; total: string; notes?: string; items: Array<{ id: string; productName: string; quantity: number; selectedOptions: Array<{ optionName: string; optionGroupName: string }> }> }> };
export function TableMenuPage() {
  const { key } = useParams();
  return <TableMenuContent key={key} tableKey={key ?? ""} />;
}
function TableMenuContent({ tableKey: key }: { tableKey: string }) {
  const [summary, setSummary] = useState<Summary | null>(null), [error, setError] = useState(""), [notice, setNotice] = useState(""), [opening, setOpening] = useState(false);
  const load = useCallback(async () => {
    const headers = tableAccessHeaders(key);
    if (!headers["X-Table-Access"]) { setSummary(null); throw new Error(TABLE_ACCESS_DENIED); }
    const response = await fetch(`${API_URL}/tables/${encodeURIComponent(key ?? "")}`, { headers });
    const data = await response.json();
    if (!response.ok) { if (response.status === 403) { clearTableAccess(key); setSummary(null); } throw new Error(data.message ?? "Mesa indisponível."); }
    if (data.accessToken) saveTableAccess(key, data.accessToken);
    setSummary(data); setError("");
  }, [key]);
  useEffect(() => {
    const refresh = () => { void load().catch(reason => setError(reason.message)); };
    const authorized = (event: Event) => { if ((event as CustomEvent<string>).detail === key) refresh(); };
    refresh();
    window.addEventListener("urfood:table-authorized", authorized);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 15000);
    return () => { window.clearInterval(timer); window.removeEventListener("urfood:table-authorized", authorized); };
  }, [key, load]);
  return <div className="table-menu-page"><header className="table-session-header"><img src="/images/logo.webp" alt="Jeitinho Brasileiro" /><div><h1>{summary ? `Mesa ${summary.number}` : "Comanda da mesa"}</h1><p>{summary?.sessionId ? `Consumo: ${summary.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · ${summary.orders.filter(order => order.status !== "CANCELED").length} pedido(s)` : "Use o leitor do sistema para acessar sua mesa."}</p></div><ScanTableButton /></header>{error && <p className="table-notice" role="alert">{error}</p>}{notice && <p className="table-notice" role="status">{notice}</p>}
    {summary && !summary.sessionId && <section className="table-welcome"><h2>Sua mesa, seu pedido</h2><p>Ao abrir, os pedidos ficam vinculados ao número desta mesa. O fechamento da conta é feito com a equipe.</p><button disabled={opening} onClick={async () => { setOpening(true); setError(""); try { const response = await fetch(`${API_URL}/tables/${key}/open`, { method: "POST", headers: tableAccessHeaders(key) }); const data = await response.json(); if (!response.ok) { if (response.status === 403) { clearTableAccess(key); setSummary(null); } throw new Error(data.message); } if (data.accessToken) saveTableAccess(key, data.accessToken); setSummary(data); setNotice(""); } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao abrir."); } finally { setOpening(false); } }}>{opening ? "Abrindo..." : "Abrir comanda"}</button></section>}
    {summary?.sessionId && summary.orders.length > 0 && <details className="table-consumption"><summary>Ver consumo da mesa</summary>{summary.orders.map(order => <article key={order.id}><b>#{order.displayNumber} · {ORDER_STATUS_LABEL[order.status]} · {Number(order.total).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</b>{order.items.map(item => <p key={item.id}><strong>{item.quantity}× {item.productName}</strong>{item.selectedOptions?.map((option, i) => <small key={i}>{option.optionGroupName}: {option.optionName}</small>)}</p>)}{order.notes && <p>Observações: {order.notes}</p>}</article>)}</details>}
    {summary?.sessionId && key && <App key={summary.sessionId} table={{ key, sessionId: summary.sessionId, number: summary.number }} onTableOrder={() => { setNotice("Pedido enviado para a cozinha!"); void load().catch(reason => setError(reason.message)); }} />}
  </div>;
}
