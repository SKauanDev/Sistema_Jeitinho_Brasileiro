import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { X, Printer, RefreshCw } from "lucide-react";
import { authFetch } from "../../services/admin-api";
import { ScanTableButton } from "../../components/TableScanner";
type Table = { id: string; key: string; number: number; sessionId: string | null; total: number; orders: Array<{ id: string; displayNumber: string; status: string; total: string; notes?: string; items: Array<{ id: string; productName: string; quantity: number; selectedOptions: Array<{ optionName: string; optionGroupName: string }> }> }> };
const money = (value: number | string) => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
function TableIcon() {
  return <svg className="table-symbol" viewBox="0 0 128 96" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M38 7h12c1 9-1 15-6 15s-7-6-6-15Zm4 18h4v6h-4ZM78 7h12c1 9-1 15-6 15s-7-6-6-15Zm4 18h4v6h-4Z" />
    <path d="M28 35h72v7H28Zm0 11h72v7c-6 0-7 5-12 5s-7-5-12-5-7 5-12 5-7-5-12-5-7 5-12 5-7-5-12-5Z" />
    <path d="M48 59h7l-2 32h-8Zm25 0h7l3 32H73ZM57 72h14v5H57Z" />
    <g fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 36 4 34h24l5 20M13 70 9 90m110-54-4 34H91l-5 20m29-20 4 20" />
    </g>
  </svg>;
}
export function TablesModule() {
  const [tables, setTables] = useState<Table[]>([]), [count, setCount] = useState(40), [error, setError] = useState(""), [selected, setSelected] = useState<Table | null>(null), [busy, setBusy] = useState(false);
  async function load() { const data = await authFetch<{ count: number; tables: Table[] }>("/admin/tables"); setTables(data.tables); setCount(data.count); setSelected(current => { if (!current) return null; const updated = data.tables.find(table => table.id === current.id); return updated?.sessionId === current.sessionId ? updated : null; }); }
  useEffect(() => { void load().catch(reason => setError(reason.message)); const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load().catch(() => undefined); }, 15000); return () => window.clearInterval(timer); }, []);
  async function printQrs() {
    const popup = window.open("", "qrs-mesas", "width=1000,height=800");
    if (!popup) { setError("Permita pop-ups para imprimir os QR codes."); return; }
    popup.document.write("<p>Preparando QR codes...</p>");
    try {
      const cards = await Promise.all(tables.map(async table => `<article><h2>Mesa ${table.number}</h2><img src="${await QRCode.toDataURL(`${window.location.origin}/mesa/${table.key}`, { width: 300, margin: 2 })}" alt="QR da mesa ${table.number}"><strong>Escaneie e faça seu pedido</strong><p>Jeitinho Brasileiro</p></article>`));
      popup.document.open(); popup.document.write(`<!doctype html><html lang="pt-BR"><meta charset="UTF-8"><title>QR codes das mesas</title><style>@page{size:A4;margin:10mm}body{font:16px Arial;display:grid;grid-template-columns:repeat(3,1fr);gap:12px}article{border:1px dashed #666;text-align:center;padding:12px;break-inside:avoid}img{display:block;width:100%;max-width:190px;margin:auto}h2{margin:0}p{margin:6px}</style><body>${cards.join("")}<script>window.onload=()=>window.print()<\/script></body></html>`); popup.document.close();
    } catch { popup.close(); setError("Não foi possível preparar os QR codes."); }
  }
  return <div className="admin-module"><div className="module-title"><div><span>ATENDIMENTO NO SALÃO</span><h1>Mesas e comandas</h1><p>Consumo por mesa, fechamento e QR codes.</p></div><div className="table-title-actions"><ScanTableButton /><button onClick={() => void printQrs()}><Printer size={18} /> Imprimir QR codes</button></div></div>{error && <p role="alert" className="admin-inline-error">{error}</p>}
    <form className="table-count-form panel" onSubmit={async event => { event.preventDefault(); setBusy(true); setError(""); try { await authFetch("/admin/tables/count", { method: "PUT", body: JSON.stringify({ count }) }); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao salvar."); } finally { setBusy(false); } }}><label>Quantidade de mesas<input type="number" required min={1} max={300} value={count} onChange={event => setCount(Number(event.target.value))} /></label><button disabled={busy}>Salvar quantidade</button><button type="button" aria-label="Atualizar mesas" onClick={() => void load().catch(reason => setError(reason.message))}><RefreshCw size={18} /></button><small>Mesas excedentes ficam ocultas. Contas abertas precisam ser fechadas antes.</small></form>
    <div className="table-status-legend" aria-label="Disponibilidade das mesas"><span><i /> Livre · {tables.filter(table => !table.sessionId).length}</span><span className="occupied"><i /> Em uso · {tables.filter(table => table.sessionId).length}</span></div>
    <div className="tables-grid">{tables.map(table => <button type="button" key={table.id} className={`table-card ${table.sessionId ? "occupied" : ""}`} aria-label={`Mesa ${table.number}, ${table.sessionId ? `em uso, ${money(table.total)}` : "livre"}`} onClick={() => setSelected(table)}><TableIcon /><span className="table-number-label">Mesa {table.number}</span><span className="table-status"><i />{table.sessionId ? "Em uso" : "Livre"}</span>{table.sessionId && <b className="table-amount">{money(table.total)}</b>}</button>)}</div>
    {selected && <TableDialog table={selected} onClose={() => setSelected(null)} onClosed={() => { setSelected(null); void load().catch(reason => setError(reason.message)); }} />}
  </div>;
}
function TableDialog({ table, onClose, onClosed }: { table: Table; onClose: () => void; onClosed: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [qr, setQr] = useState(""), [notes, setNotes] = useState(""), [paymentMethod, setPaymentMethod] = useState("CASH"), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const url = `${window.location.origin}/mesa/${table.key}`;
  useEffect(() => { ref.current?.showModal(); void QRCode.toDataURL(url, { width: 240, margin: 2 }).then(setQr).catch(() => setError("Falha ao gerar QR.")); }, [url]);
  return <dialog ref={ref} className="refinement-dialog table-detail-dialog" onCancel={onClose}><header><h2>Mesa {table.number} · {table.sessionId ? money(table.total) : "Livre"}</h2><button aria-label="Fechar" onClick={onClose}><X /></button></header><details><summary>QR e link da mesa</summary>{qr && <img width={180} height={180} src={qr} alt={`QR da mesa ${table.number}`} />}<p><ScanTableButton /></p></details>{error && <p role="alert">{error}</p>}
    {table.orders.map(order => <article className="table-order" key={order.id}><b>Pedido #{order.displayNumber} · {order.status === "CANCELED" ? "Cancelado" : money(order.total)}</b>{order.items.map(item => <p key={item.id}><strong>{item.quantity}× {item.productName}</strong>{item.selectedOptions.map((option, i) => <small key={i}>{option.optionGroupName}: {option.optionName}</small>)}</p>)}{order.notes && <p><b>Observações:</b> {order.notes}</p>}</article>)}
    {table.sessionId && <form onSubmit={async event => { event.preventDefault(); if (!window.confirm(`Confirmar recebimento de ${money(table.total)} e liberar a mesa ${table.number}?`)) return; setBusy(true); setError(""); try { await authFetch(`/admin/tables/${table.id}/close`, { method: "POST", body: JSON.stringify({ sessionId: table.sessionId, expectedTotal: table.total, paymentMethod, notes }) }); onClosed(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao fechar."); } finally { setBusy(false); } }}><label>Pagamento recebido<select value={paymentMethod} onChange={event => setPaymentMethod(event.target.value)}><option value="CASH">Dinheiro</option><option value="PIX">Pix recebido</option><option value="ONLINE">Cartão na maquininha</option><option value="RECEIVED_ONLINE">Pagamento online recebido</option></select></label><label>Anotações da comanda<textarea maxLength={500} value={notes} onChange={event => setNotes(event.target.value)} /></label><footer><button disabled={busy}>{busy ? "Fechando..." : "Receber e fechar comanda"}</button></footer></form>}
  </dialog>;
}
