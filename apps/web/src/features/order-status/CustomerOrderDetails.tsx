import type { Order } from "../../types/admin";
import { isPaymentWaiting } from "./order-presentation";

const money = (value: string | number | undefined) => Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const stages = [{ status: "NEW", label: "Recebido" }, { status: "CONFIRMED", label: "Confirmado" }, { status: "PREPARING", label: "Em preparo" }, { status: "READY", label: "Pronto" }, { status: "OUT_FOR_DELIVERY", label: "Em entrega" }, { status: "COMPLETED", label: "Finalizado" }];

export function CustomerOrderDetails({ order, showTimeline = true }: { order: Order; showTimeline?: boolean }) {
  const waiting = isPaymentWaiting(order);
  const flow = stages.filter(stage => order.fulfillmentType === "DELIVERY" || stage.status !== "OUT_FOR_DELIVERY");
  const current = flow.findIndex(stage => stage.status === order.status);
  return <div className="customer-order-content">
    {waiting ? <div className="customer-order-payment"><strong>Pagamento ainda não confirmado</strong><p>O pedido foi registrado, mas ainda não está liberado para preparo.</p>{["PIX", "CREDIT_CARD", "DEBIT_CARD"].includes(order.paymentMethod ?? "") && order.paymentStatus !== "EXPIRED" && <a href={`/${order.paymentMethod === "PIX" ? "pix" : "cartao"}/${order.id}`}>Continuar pagamento</a>}</div> : showTimeline && order.status !== "CANCELED" && <ol className="customer-order-timeline" aria-label="Trajetória do pedido">{flow.map((stage, index) => {
      const history = order.statusHistory?.find(event => event.status === stage.status);
      return <li key={stage.status} className={index <= current ? "done" : ""} aria-current={index === current ? "step" : undefined}><i /> <span>{stage.label}{history && <small>{new Date(history.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</small>}</span></li>;
    })}</ol>}
    {order.status === "CANCELED" && <p className="customer-order-canceled">{order.cancellationReason || "Pedido cancelado."}</p>}
    <h3>O que você pediu</h3>
    <ul className="customer-order-items">{order.items?.map(item => <li key={item.id}><div><strong>{item.quantity}× {item.productName}</strong><b>{money(item.lineTotal)}</b></div>{item.selectedOptions?.length > 0 && <ul>{item.selectedOptions.map(option => <li key={option.id}>{option.optionGroupName ? `${option.optionGroupName}: ` : ""}{option.optionName}{Number(option.priceDelta) > 0 ? ` (+${money(option.priceDelta)})` : ""}</li>)}</ul>}{item.notes && <p>Observações: {item.notes}</p>}</li>)}</ul>
    {order.notes && <p>Observações do pedido: {order.notes}</p>}
    <div className="customer-order-totals"><span>Subtotal <b>{money(order.subtotal)}</b></span>{Number(order.digitalSecurityFee) > 0 && <span>Taxa LGPD <b>{money(order.digitalSecurityFee)}</b></span>}{Number(order.discountAmount) > 0 && <span>Desconto {order.couponCode} <b>− {money(order.discountAmount)}</b></span>}<span>{order.fulfillmentType === "DELIVERY" ? "Entrega" : "Retirada"}<b>{money(order.deliveryFee)}</b></span><span className="total">Total <b>{money(order.total)}</b></span></div>
    <p className="customer-order-destination">{order.fulfillmentType === "DELIVERY" ? `Entrega: ${order.street ?? ""}, ${order.number ?? ""} — ${order.neighborhood ?? ""}, ${order.city ?? ""}/${order.state ?? ""}${order.complement ? ` · ${order.complement}` : ""}` : "Retirada no estabelecimento"}</p>
  </div>;
}
