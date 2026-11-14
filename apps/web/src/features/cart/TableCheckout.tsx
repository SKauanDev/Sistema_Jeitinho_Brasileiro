import { useState } from "react";
import { ArrowLeft, ChefHat, MessageSquareText, LoaderCircle, UtensilsCrossed } from "lucide-react";
import { API_URL } from "../../services/admin-api";
import { tableAccessHeaders } from "../../services/table-access";
import type { CheckoutItem } from "./CheckoutForm";
import { PIZZA_STYLES, type PizzaStyle } from "../../services/pizza-rules";
export type TableContext = { key: string; sessionId: string; number: number };
export function TableCheckout({ serviceAccepted, onServiceAcceptedChange, table, items, subtotal, notes, onNotesChange, onBack, onComplete, loading, onLoadingChange: setLoading }: { serviceAccepted: boolean; onServiceAcceptedChange: (value: boolean) => void; table: TableContext; items: CheckoutItem[]; subtotal: number; notes: string; onNotesChange: (notes: string) => void; onBack: () => void; onComplete: () => void; loading: boolean; onLoadingChange: (loading: boolean) => void }) {
  const [error, setError] = useState("");
  const serviceFee = serviceAccepted ? Math.round(subtotal * 10) / 100 : 0;
  return <form className="checkout-form table-checkout" onSubmit={async event => {
    event.preventDefault(); if (loading) return; setLoading(true); setError("");
    try {
      const response = await fetch(`${API_URL}/orders`, { method: "POST", headers: { "Content-Type": "application/json", ...tableAccessHeaders(table.key) }, body: JSON.stringify({ table: { key: table.key, sessionId: table.sessionId }, serviceFeeAccepted: serviceAccepted, items, notes }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Não foi possível enviar.");
      onComplete();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao enviar."); } finally { setLoading(false); }
  }}><button type="button" className="table-checkout-back" onClick={onBack}><ArrowLeft size={18} /><span>Voltar ao carrinho</span></button>
    <div className="table-checkout-heading"><span><UtensilsCrossed size={16} /> Mesa {table.number}</span><h2>Confira seu pedido</h2><p>Confira os itens e deixe um recado para a cozinha, se precisar.</p></div>
    <section className="table-order-summary" aria-label="Resumo do pedido">{items.map((item, index) => <div key={`${item.productId}-${index}`}><strong>{item.quantity}× {item.productName}</strong>{item.size && <span>Tamanho {item.size}</span>}{item.style && <small>{PIZZA_STYLES[item.style as PizzaStyle]}</small>}<small>{item.options.filter(option => /^Pizza \d+/.test(option.group)).map(option => option.name).join(" / ")}</small>{item.ingredients !== undefined && <small>Ingredientes: {item.ingredients.join(", ") || "Sem ingredientes opcionais"}</small>}{item.notes && <small>Observação: {item.notes}</small>}</div>)}</section>
    <label className="table-order-notes"><span><MessageSquareText size={18} /><strong>Observações para a cozinha</strong><small>Opcional</small></span><textarea rows={4} maxLength={500} placeholder="Ex.: sem cebola, pizza bem assada ou algum cuidado no preparo..." value={notes} onChange={event => onNotesChange(event.target.value)} aria-describedby="table-notes-help" /><small id="table-notes-help">Conte apenas os detalhes deste pedido.<span>{notes.length}/500</span></small></label>
    {error && <p className="checkout-error" role="alert">{error}</p>}
    <fieldset className="waiter-service"><legend>Taxa de serviço do garçom · 10%</legend><p>Opcional. Deseja incluir neste pedido?</p>{[true, false].map(value => <label key={String(value)}><input type="checkbox" checked={serviceAccepted === value} onChange={() => onServiceAcceptedChange(value)} />{value ? "Sim" : "Não"}</label>)}</fieldset>
    <div className="table-checkout-total"><span>Serviço (10%)</span><strong>{serviceFee.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong></div>
    <div className="table-checkout-total"><span>Total deste pedido</span><strong>{(subtotal + serviceFee).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong></div><p className="table-payment-note">O valor será adicionado à comanda. Você paga com a equipe ao fechar a conta.</p>
    <button className="place-order" disabled={loading}>{loading ? <><LoaderCircle size={18} className="spinner" /> Enviando...</> : <><ChefHat size={19} /> Enviar para a cozinha</>}</button></form>;
}
