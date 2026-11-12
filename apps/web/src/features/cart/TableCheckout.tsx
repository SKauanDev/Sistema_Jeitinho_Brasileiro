import { useState } from "react";
import { API_URL } from "../../services/admin-api";
import type { CheckoutItem } from "./CheckoutForm";
export type TableContext = { key: string; sessionId: string; number: number };
export function TableCheckout({ table, items, subtotal, onBack, onComplete }: { table: TableContext; items: CheckoutItem[]; subtotal: number; onBack: () => void; onComplete: () => void }) {
  const [notes, setNotes] = useState(""), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  return <form className="checkout-form" onSubmit={async event => {
    event.preventDefault(); setLoading(true); setError("");
    try {
      const response = await fetch(`${API_URL}/orders`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ table: { key: table.key, sessionId: table.sessionId }, items, notes }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Não foi possível enviar.");
      onComplete();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao enviar."); } finally { setLoading(false); }
  }}><button type="button" onClick={onBack}>Voltar ao carrinho</button><h2>Pedido para a mesa {table.number}</h2><p>O consumo será adicionado à comanda. O pagamento é feito com a equipe ao fechar a conta.</p><label>Observações<textarea maxLength={500} placeholder="Algum detalhe para a equipe?" value={notes} onChange={event => setNotes(event.target.value)} /></label>{error && <p role="alert">{error}</p>}<p><strong>Total deste pedido: {subtotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong></p><button className="place-order" disabled={loading}>{loading ? "Enviando..." : "Enviar para a cozinha"}</button></form>;
}
