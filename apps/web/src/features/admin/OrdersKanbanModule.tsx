import { ManualOrderDialog } from "./ManualOrderDialog";
import { getCurrentUser } from "../../services/auth";
import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Bike,
  Check,
  ChefHat,
  Clock3,
  MapPin,
  MoreHorizontal,
  PackageCheck,
  Phone,
  Printer,
  RefreshCw,
  ShoppingBag,
  Store,
  X,
  XCircle,
} from "lucide-react";
import { createAdminSocket } from "../../services/realtime";
import { adminApi } from "../../services/admin-api";
import {
  ORDER_STATUS,
  ORDER_STATUS_LABEL,
  type Order,
  type OrderStatus,
} from "../../types/admin";
import { printProfessionalThermalReceipt } from "./thermal-receipt";

const columns: Array<{ status: OrderStatus; title: string }> = [
  { status: ORDER_STATUS.NEW, title: "Novos" },
  { status: ORDER_STATUS.CONFIRMED, title: "Confirmados" },
  { status: ORDER_STATUS.PREPARING, title: "Em preparo" },
  { status: ORDER_STATUS.READY, title: "Prontos" },
  { status: ORDER_STATUS.OUT_FOR_DELIVERY, title: "Em entrega" },
  { status: ORDER_STATUS.COMPLETED, title: "Finalizados" },
  { status: ORDER_STATUS.CANCELED, title: "Cancelados" },
];
const nextStatus: Partial<Record<OrderStatus, OrderStatus>> = {
  NEW: "CONFIRMED",
  CONFIRMED: "PREPARING",
  PREPARING: "READY",
  READY: "OUT_FOR_DELIVERY",
  OUT_FOR_DELIVERY: "COMPLETED",
};
const currency = (value: string | number) =>
  Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function OrdersKanbanModule() {
  const [manualOpen, setManualOpen] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [averageMinutes, setAverageMinutes] = useState(30);
  const alerted = useRef(new Set<string>());
  const boardRef = useRef<HTMLDivElement>(null);
  const edgeScrollFrame = useRef<number | null>(null);
  const edgeDirection = useRef(0);

  function stopEdgeScroll() {
    edgeDirection.current = 0;
    if (edgeScrollFrame.current !== null)
      cancelAnimationFrame(edgeScrollFrame.current);
    edgeScrollFrame.current = null;
  }
  function startEdgeScroll(direction: number) {
    if (edgeDirection.current === direction && edgeScrollFrame.current !== null)
      return;
    stopEdgeScroll();
    edgeDirection.current = direction;
    const move = () => {
      if (!edgeDirection.current || !boardRef.current) return;
      boardRef.current.scrollLeft += edgeDirection.current * 7;
      edgeScrollFrame.current = requestAnimationFrame(move);
    };
    edgeScrollFrame.current = requestAnimationFrame(move);
  }
  function handleBoardPointer(event: MouseEvent) {
    const board = document.querySelector<HTMLDivElement>(
      ".kanban-board.operational",
    );
    if (!board) return;
    boardRef.current = board;
    const bounds = board.getBoundingClientRect();
    if (event.clientY < bounds.top || event.clientY > bounds.bottom) {
      stopEdgeScroll();
      return;
    }
    const edge = Math.min(110, bounds.width * 0.16);
    if (event.clientX <= bounds.left + edge) startEdgeScroll(-1);
    else if (event.clientX >= bounds.right - edge) startEdgeScroll(1);
    else stopEdgeScroll();
  }

  useEffect(() => {
    document.addEventListener("mousemove", handleBoardPointer);
    document.addEventListener("mouseleave", stopEdgeScroll);
    return () => {
      document.removeEventListener("mousemove", handleBoardPointer);
      document.removeEventListener("mouseleave", stopEdgeScroll);
      stopEdgeScroll();
    };
  }, []);

  useEffect(() => {
    void Promise.all([adminApi.orders(), adminApi.orderStore()])
      .then(([items, store]) => {
        setOrders(items);
        setAverageMinutes(store.averagePreparationMinutes);
        items.forEach((item) => alerted.current.add(item.id));
        const requestedId = new URLSearchParams(window.location.search).get(
          "pedido",
        );
        if (requestedId)
          setSelected(items.find((item) => item.id === requestedId) ?? null);
      })
      .catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Falha ao carregar pedidos.",
        ),
      )
      .finally(() => setLoading(false));
    const socket = createAdminSocket();
    const refresh = () => {
      void adminApi.orders().then(items => {
        setOrders(items);
        setSelected(current => current ? items.find(item => item.id === current.id) ?? null : null);
      }).catch(() => undefined);
    };
    socket.on("connect", () => { setRealtimeConnected(true); refresh(); });
    socket.on("disconnect", () => setRealtimeConnected(false));
    socket.on("connect_error", () => setRealtimeConnected(false));
    socket.on("order:new", (raw: Order) => {
      if (alerted.current.has(raw.id)) return;
      alerted.current.add(raw.id);
      setNotice(`Novo pedido #${raw.displayNumber} recebido`);
      void adminApi.orders().then(setOrders);
      if ("Notification" in window && Notification.permission === "granted")
        new Notification("Novo pedido", {
          body: `Pedido #${raw.displayNumber} recebido.`,
        });
    });
    socket.on("order:updated", () => {
      void adminApi.orders().then((items) => {
        setOrders(items);
        setSelected((current) =>
          current
            ? (items.find((item) => item.id === current.id) ?? null)
            : null,
        );
      });
    });
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    const refreshTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 60_000);
    window.addEventListener("focus", refresh);
    const receivedOrders = (event: Event) => {
      const items = (event as CustomEvent<Order[]>).detail;
      setOrders(items);
      setSelected(current => current ? items.find(item => item.id === current.id) ?? null : null);
    };
    window.addEventListener("urfood:orders-refreshed", receivedOrders);
    return () => {
      socket.disconnect();
      window.clearInterval(timer);
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("urfood:orders-refreshed", receivedOrders);
      stopEdgeScroll();
    };
  }, []);

  async function changeStatus(order: Order, status: OrderStatus) {
    let reason: string | undefined;
    if (status === "CANCELED") {
      reason = window.prompt("Informe o motivo do cancelamento:")?.trim();
      if (!reason) return;
    }
    setError("");
    try {
      const updated = await adminApi.updateOrderStatus(
        order.id,
        status,
        reason,
      );
      setOrders((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setSelected((current) =>
        current?.id === updated.id ? updated : current,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Falha ao atualizar o pedido.",
      );
    }
  }

  if (loading)
    return (
      <div className="admin-state">
        <RefreshCw className="spinner" />
        <h2>Carregando central de pedidos...</h2>
      </div>
    );
  return (
    <div className="admin-module kanban-module">
      {manualOpen && <ManualOrderDialog onClose={() => setManualOpen(false)} onCreated={() => { setManualOpen(false); void adminApi.orders().then(setOrders); setNotice("Pedido manual registrado"); }} />}
      <div className="module-title">
        <div>
          <span>TEMPO REAL</span>
          <h1>Central de pedidos</h1>
          <p>Confirme e avance os pedidos com poucos cliques.</p>
        </div>
        {getCurrentUser()?.role !== "KITCHEN" && <button className="catalog-primary" onClick={() => setManualOpen(true)}>+ Adicionar pedido manual</button>}
        <div className="live-indicator">
          <i /> {realtimeConnected ? "Conectado em tempo real" : "Tempo real desconectado"}
        </div>
      </div>
      {notice && (
        <button className="new-order-toast" onClick={() => setNotice("")}>
          <ShoppingBag />
          <span>{notice}</span>
          <X />
        </button>
      )}
      {error && (
        <div className="admin-inline-error">
          <AlertCircle />
          {error}
          <button onClick={() => setError("")}>
            <X />
          </button>
        </div>
      )}
      <div className="kanban-board operational">
        {columns.map((column) => {
          const items = orders.filter(
            (order) => order.status === column.status && (column.status === "CANCELED" || ["APPROVED", "NOT_REQUIRED"].includes(order.paymentStatus ?? "NOT_REQUIRED")),
          );
          return (
            <section
              className={`kanban-column column-${column.status.toLowerCase()}`}
              key={column.status}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                const order = orders.find(
                  (item) => item.id === event.dataTransfer.getData("order-id"),
                );
                if (order) void changeStatus(order, column.status);
              }}
            >
              <header>
                <div>
                  <i className="stage-dot" />
                  <h2>{column.title}</h2>
                </div>
                <span>{items.length}</span>
              </header>
              <div className="kanban-list">
                {items.length ? (
                  items.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      now={now}
                      averageMinutes={averageMinutes}
                      onOpen={() => setSelected(order)}
                      onAdvance={() =>
                        nextStatus[order.status] &&
                        void changeStatus(order, order.tableNumber && order.status === "READY" ? "COMPLETED" : nextStatus[order.status]!)
                      }
                    />
                  ))
                ) : (
                  <div className="empty-column">Nenhum pedido</div>
                )}
              </div>
            </section>
          );
        })}
      </div>
      {orders.some(order => !["CANCELED", "COMPLETED"].includes(order.status) && !["APPROVED", "NOT_REQUIRED"].includes(order.paymentStatus ?? "NOT_REQUIRED")) && <section className="pending-payment-orders">
        <header><h2>Aguardando pagamento</h2><p>Pedidos registrados, ainda não liberados para preparo.</p></header>
        <div>{orders.filter(order => !["CANCELED", "COMPLETED"].includes(order.status) && !["APPROVED", "NOT_REQUIRED"].includes(order.paymentStatus ?? "NOT_REQUIRED")).map(order => <article key={order.id}><button onClick={() => setSelected(order)}><strong>#{order.displayNumber} · {order.customerName}</strong><span>{order.items?.map(item => `${item.quantity}× ${item.productName}`).join(" · ")}</span><small>{order.paymentStatus === "REJECTED" ? "Pagamento recusado" : order.paymentStatus === "EXPIRED" ? "Pagamento expirado" : "Pagamento pendente"} · {currency(order.total)}</small></button><button onClick={() => void changeStatus(order, "CANCELED")} aria-label={`Cancelar pedido ${order.displayNumber}`}><XCircle /> Cancelar</button></article>)}</div>
      </section>}
      {selected && (
        <OrderDetails
          order={selected}
          onClose={() => setSelected(null)}
          onChangeStatus={(status) => void changeStatus(selected, status)}
        />
      )}
    </div>
  );
}

function OrderCard({
  order,
  now,
  averageMinutes,
  onOpen,
  onAdvance,
}: {
  order: Order;
  now: number;
  averageMinutes: number;
  onOpen: () => void;
  onAdvance: () => void;
}) {
  const minutes = Math.max(
    0,
    Math.floor((now - new Date(order.createdAt).getTime()) / 60_000),
  );
  const severity =
    minutes > averageMinutes
      ? "late"
      : minutes > averageMinutes / 2
        ? "warning"
        : "normal";
  return (
    <article
      draggable
      onDragStart={(event) => event.dataTransfer.setData("order-id", order.id)}
      className={`order-card ${severity}`}
    >
      <header>
        <strong>#{order.displayNumber}</strong>
        <span>
          <Clock3 />{" "}
          {new Date(order.createdAt).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        <button onClick={onOpen}>
          <MoreHorizontal />
        </button>
      </header>
      <button className="order-card-body" onClick={onOpen}>
        <h3>{order.customerName}</h3>
        {order.status === "CANCELED" && <p>{order.cancellationReason || "Pedido cancelado"}</p>}
        <p>
          {order.items
            ?.map((item) => `${item.quantity}x ${item.productName}`)
            .join(" · ") || "Carregando itens..."}
        </p>
        <div className="order-meta">
          <span>
            {order.fulfillmentType === "DELIVERY" ? (
              <>
                <Bike /> Delivery
              </>
            ) : (
              <>
                <Store /> {order.tableNumber ? `Mesa ${order.tableNumber}` : "Retirada"}
              </>
            )}
          </span>
          <b>{currency(order.total)}</b>
        </div>
      </button>
      <footer>
        <span>
          <Clock3 /> há {minutes} min
        </span>
        {nextStatus[order.status] && (
          <button onClick={onAdvance}>
            <Check /> Avançar
          </button>
        )}
      </footer>
    </article>
  );
}

function OrderDetails({
  order,
  onClose,
  onChangeStatus,
}: {
  order: Order;
  onClose: () => void;
  onChangeStatus: (status: OrderStatus) => void;
}) {
  return (
    <div
      className="order-detail-overlay"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <aside className="order-detail">
        <header>
          <div>
            <span>PEDIDO #{order.displayNumber}</span>
            <h2>{ORDER_STATUS_LABEL[order.status]}</h2>
          </div>
          <button onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="order-detail-scroll">
          <section>
            <h3>Cliente</h3>
            <p>
              <strong>{order.customerName}</strong>
            </p>
            <a href={`tel:${order.customerPhone}`}>
              <Phone /> {order.customerPhone}
            </a>
          </section>
          {order.fulfillmentType === "DELIVERY" && (
            <section>
              <h3>Endereço de entrega</h3>
              <p>
                <MapPin /> {order.street}, {order.number}
                {order.complement ? ` · ${order.complement}` : ""}
                <br />
                {order.neighborhood} · {order.city}/{order.state}
              </p>
            </section>
          )}
          <section>
            <h3>Produtos</h3>
            {order.items?.map((item) => (
              <div className="detail-item" key={item.id}>
                <b>{item.quantity}x</b>
                <span>
                  <strong>{item.productName}</strong>
                  {item.selectedOptions?.map((option) => (
                    <small key={option.id}>
                      • {option.optionGroupName}: {option.optionName}
                    </small>
                  ))}
                  {item.notes && <em>“{item.notes}”</em>}
                </span>
                <b>{currency(item.lineTotal)}</b>
              </div>
            ))}
          </section>
          {order.notes && (
            <section>
              <h3>Observação</h3>
              <p>{order.notes}</p>
            </section>
          )}
          <section className="detail-financial">
            <h3>Financeiro</h3>
            <div>
              <span>Subtotal</span>
              <b>{currency(order.subtotal)}</b>
            </div>
            {Number(order.digitalSecurityFee) > 0 && <div><span>Taxa LGPD</span><b>{currency(order.digitalSecurityFee ?? 0)}</b></div>}
            <div>
              <span>Taxa de entrega</span>
              <b>{currency(order.deliveryFee)}</b>
            </div>
            <div>
              <span>Forma de pagamento</span>
              <b>{paymentLabel(order.paymentMethod)}</b>
            </div>
            <div><span>Status do pagamento</span><b>{order.paymentStatus === "APPROVED" ? "Confirmado" : order.paymentStatus === "PENDING" ? "Aguardando pagamento" : order.paymentStatus === "REJECTED" ? "Recusado" : order.paymentStatus === "EXPIRED" ? "Expirado" : "Pagamento na entrega/retirada"}</b></div>
            <div className="total">
              <span>Total</span>
              <b>{currency(order.total)}</b>
            </div>
          </section>
        </div>
        <footer>
          <button onClick={() => void printProfessionalThermalReceipt(order)}>
            <Printer /> Imprimir cupom
          </button>
          {!["COMPLETED", "CANCELED"].includes(order.status) && (
            <button
              className="cancel-order"
              onClick={() => onChangeStatus("CANCELED")}
            >
              <XCircle /> Cancelar
            </button>
          )}
          {nextStatus[order.status] && ["APPROVED", "NOT_REQUIRED"].includes(order.paymentStatus ?? "NOT_REQUIRED") && (
            <button
              className="advance-order"
              onClick={() => onChangeStatus(order.tableNumber && order.status === "READY" ? "COMPLETED" : nextStatus[order.status]!)}
            >
              <PackageCheck /> {ORDER_STATUS_LABEL[order.tableNumber && order.status === "READY" ? "COMPLETED" : nextStatus[order.status]!]}
            </button>
          )}
        </footer>
      </aside>
    </div>
  );
}

const paymentLabels: Record<string, string> = {
  PIX: "PIX",
  CASH: "Dinheiro",
  CREDIT_CARD: "Cartão de crédito",
  DEBIT_CARD: "Cartão de débito",
  ONLINE: "Cartão na entrega",
  RECEIVED_ONLINE: "Pagamento online recebido",
};
const paymentLabel = (method?: Order["paymentMethod"]) =>
  paymentLabels[method ?? ""] ?? "Não informado";
const receiptMoney = (value: string | number | undefined) =>
  Number(value ?? 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const escapeReceipt = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ]!,
  );

function printThermalReceipt(order: Order) {
  const printWindow = window.open(
    "",
    `pedido-${order.displayNumber}`,
    "width=420,height=720",
  );
  if (!printWindow) {
    window.alert("Permita pop-ups para imprimir o cupom do pedido.");
    return;
  }
  const date = new Date(order.createdAt).toLocaleString("pt-BR");
  const address =
    order.fulfillmentType === "DELIVERY"
      ? `${escapeReceipt(order.street)}, ${escapeReceipt(order.number)}${order.complement ? ` - ${escapeReceipt(order.complement)}` : ""}<br>${escapeReceipt(order.neighborhood)} - ${escapeReceipt(order.city)}/${escapeReceipt(order.state)}${order.postalCode ? `<br>CEP ${escapeReceipt(order.postalCode)}` : ""}`
      : "RETIRADA NO BALCÃO";
  const rows = (order.items ?? [])
    .map(
      (item, index) =>
        `<div class="item"><div class="item-main"><span>${String(index + 1).padStart(2, "0")}</span><b>${item.quantity}x ${escapeReceipt(item.productName)}</b><span>${receiptMoney(item.unitPrice)}</span><strong>${receiptMoney(item.lineTotal)}</strong></div>${(item.selectedOptions ?? []).map((option) => `<small>+ ${escapeReceipt(option.optionGroupName)}: ${escapeReceipt(option.optionName)}${Number(option.priceDelta) ? ` (${receiptMoney(option.priceDelta)})` : ""}</small>`).join("")}${item.notes ? `<em>OBS: ${escapeReceipt(item.notes)}</em>` : ""}</div>`,
    )
    .join("");
  const discount = Number(order.discountAmount ?? 0);
  printWindow.document
    .write(`<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Pedido #${escapeReceipt(order.displayNumber)}</title><style>
    @page{size:80mm auto;margin:3mm}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#000;font-family:"Courier New",monospace}body{width:74mm;margin:0 auto;font-size:10px;line-height:1.25}.center{text-align:center}.logo{max-width:48mm;max-height:18mm;object-fit:contain;filter:grayscale(1) contrast(1.4)}h1{margin:2px 0;font-size:15px;line-height:1.05}p{margin:2px 0}.dash{margin:7px 0;border-top:1px dashed #000}.double{margin:7px 0;border-top:3px double #000}.order-number{font-size:20px;font-weight:900}.row{display:flex;justify-content:space-between;gap:8px}.row b:last-child,.row strong:last-child{text-align:right}.section-title{margin-bottom:4px;font-weight:900;text-transform:uppercase}.item{padding:4px 0;border-bottom:1px dotted #777}.item-main{display:grid;grid-template-columns:18px 1fr 48px 52px;gap:3px;align-items:start}.item-main span:nth-child(3),.item-main strong{text-align:right}.item small,.item em{display:block;margin:2px 0 0 21px;font-size:9px}.item em{font-weight:700;font-style:normal}.total{font-size:15px;font-weight:900}.footer{margin-top:9px;text-align:center;font-size:9px}.cut{margin-top:14px;text-align:center;letter-spacing:2px}@media print{body{width:100%}.no-print{display:none}}
  </style></head><body><header class="center"><img class="logo" src="${window.location.origin}/images/logo.png" alt="Jeitinho Brasileiro"><h1>PIZZARIA JEITINHO BRASILEIRO</h1><p>PEDIDO INTERNO · NÃO É DOCUMENTO FISCAL</p></header><div class="dash"></div><section class="center"><div>PEDIDO</div><div class="order-number">#${escapeReceipt(order.displayNumber)}</div><b>${escapeReceipt(date)}</b><p>${order.fulfillmentType === "DELIVERY" ? "DELIVERY" : "RETIRADA"} · ${escapeReceipt(ORDER_STATUS_LABEL[order.status])}</p></section><div class="double"></div><section><div class="section-title">CLIENTE</div><b>${escapeReceipt(order.customerName)}</b><p>${escapeReceipt(order.customerPhone)}</p><p>${address}</p></section><div class="dash"></div><section><div class="item-main section-title"><span>ITEM</span><span>DESCRIÇÃO</span><span>UNIT.</span><span>TOTAL</span></div>${rows}</section>${order.notes ? `<div class="dash"></div><section><b>OBSERVAÇÃO DO PEDIDO</b><p>${escapeReceipt(order.notes)}</p></section>` : ""}<div class="double"></div><section><div class="row"><span>SUBTOTAL</span><b>R$ ${receiptMoney(order.subtotal)}</b></div>${discount ? `<div class="row"><span>DESCONTO ${order.couponCode ? `(${escapeReceipt(order.couponCode)})` : ""}</span><b>- R$ ${receiptMoney(discount)}</b></div>` : ""}<div class="row"><span>TAXA DE ENTREGA</span><b>R$ ${receiptMoney(order.deliveryFee)}</b></div><div class="row total"><span>TOTAL</span><strong>R$ ${receiptMoney(order.total)}</strong></div></section><div class="dash"></div><section><div class="row"><span>FORMA DE PAGAMENTO</span><b>${escapeReceipt(paymentLabel(order.paymentMethod))}</b></div>${Number(order.changeFor) ? `<div class="row"><span>TROCO PARA</span><b>R$ ${receiptMoney(order.changeFor)}</b></div><div class="row"><span>TROCO</span><b>R$ ${receiptMoney(Number(order.changeFor) - Number(order.total))}</b></div>` : ""}</section><footer class="footer"><div class="dash"></div><b>Obrigado pela preferência!</b><p>Confira os itens antes de liberar o pedido.</p><div class="cut">- - - - - CORTE AQUI - - - - -</div></footer><script>window.addEventListener('load',()=>setTimeout(()=>{window.print();window.close()},250));<\/script></body></html>`);
  printWindow.document.close();
}
