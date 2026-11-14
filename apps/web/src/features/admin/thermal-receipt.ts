import { adminApi } from "../../services/admin-api";
import { ORDER_STATUS_LABEL, type Order } from "../../types/admin";

const paymentNames: Record<string, string> = {
  PIX: "PIX",
  CASH: "Dinheiro",
  CREDIT_CARD: "Cartão de crédito",
  DEBIT_CARD: "Cartão de débito",
  ONLINE: "Online",
  RECEIVED_ONLINE: "Pagamento online recebido",
};
const paymentName = (method?: Order["paymentMethod"]) =>
  paymentNames[method ?? ""] ?? "Não informado";
const money = (value: string | number | undefined) =>
  Number(value ?? 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const safe = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ]!,
  );

export async function printProfessionalThermalReceipt(order: Order) {
  const popupWidth = Math.min(1100, window.screen.availWidth);
  const popupHeight = Math.min(1000, window.screen.availHeight);
  const popupLeft = Math.max(0, Math.round((window.screen.availWidth - popupWidth) / 2));
  const popupTop = Math.max(0, Math.round((window.screen.availHeight - popupHeight) / 2));
  const previewZoom = Math.max(1, Math.min(1.8, (popupWidth - 64) / (76 * 96 / 25.4)));
  const printWindow = window.open(
    "",
    `pedido-${order.displayNumber}`,
    `width=${popupWidth},height=${popupHeight},left=${popupLeft},top=${popupTop},resizable=yes,scrollbars=yes`,
  );
  if (!printWindow) {
    window.alert("Permita pop-ups para imprimir o cupom do pedido.");
    return;
  }
  printWindow.document.write(
    "<!doctype html><title>Preparando cupom...</title><body style='font-family:Arial;padding:30px'>Preparando cupom térmico...</body>",
  );
  try {
    const store = await adminApi.orderStore();
    const storeAddress = [
      store.street && `${store.street}, ${store.number ?? "s/n"}`,
      store.complement,
      store.neighborhood,
      store.city && `${store.city}/${store.state ?? ""}`,
      store.postalCode && `CEP ${store.postalCode}`,
    ]
      .filter(Boolean)
      .map(safe)
      .join(" · ");
    const customerAddress =
      order.fulfillmentType === "DELIVERY"
        ? [
            `${safe(order.street)}, ${safe(order.number)}`,
            order.complement && safe(order.complement),
            safe(order.neighborhood),
            `${safe(order.city)}/${safe(order.state)}`,
            order.postalCode && `CEP ${safe(order.postalCode)}`,
          ]
            .filter(Boolean)
            .join(" · ")
        : order.tableNumber ? `CONSUMO NA MESA ${safe(order.tableNumber)}` : "RETIRADA NO ESTABELECIMENTO";
    const itemCount = (order.items ?? []).reduce(
      (sum, item) => sum + Number(item.quantity),
      0,
    );
    const items = (order.items ?? [])
      .map(
        (item, index) =>
          `<article class="item"><div class="item-row"><span>${String(index + 1).padStart(2, "0")}</span><b>${item.quantity}x ${safe(item.productName)}</b><span>R$ ${money(item.unitPrice)}</span><strong>R$ ${money(item.lineTotal)}</strong></div>${(item.selectedOptions ?? []).map((option) => `<small>+ ${safe(option.optionGroupName)}: ${safe(option.optionName)}${Number(option.priceDelta) ? ` · R$ ${money(option.priceDelta)}` : ""}</small>`).join("")}${item.notes ? `<em>OBS: ${safe(item.notes)}</em>` : ""}</article>`,
      )
      .join("");
    const discount = Number(order.discountAmount ?? 0);
    const change = Number(order.changeFor ?? 0) - Number(order.total);
    printWindow.document.open();
    printWindow.document
      .write(`<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Pedido #${safe(order.displayNumber)}</title><style>
    @page{size:80mm auto;margin:2mm}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#000}body{width:76mm;margin:auto;padding:1mm;font:12px/1.22 "Courier New",monospace}.center{text-align:center}.logo{display:block;width:40mm;height:12mm;margin:0 auto 2mm;object-fit:contain;filter:grayscale(1) contrast(1.55)}h1{margin:1mm 0;font-size:18px;line-height:1.05}p{margin:1mm 0}.muted{font-size:10px;font-weight:700}body{font-weight:700}.dash{margin:1.5mm 0;border-top:1px dashed #000}.double{margin:1.5mm 0;border-top:3px double #000}.label{font-weight:900;text-transform:uppercase}.order-number{margin:1mm 0;font-size:23px;font-weight:900;letter-spacing:1px}.row{display:flex;justify-content:space-between;gap:3mm;margin:1mm 0}.row>*:last-child{text-align:right}.item{padding:1.4mm 0;border-bottom:1px dotted #555}.item-row{display:grid;grid-template-columns:6mm 1fr 18mm 20mm;gap:1mm;align-items:start}.item-row span:nth-child(3),.item-row strong{text-align:right}.item small,.item em{display:block;margin:1mm 0 0 7mm;font-size:11px;font-weight:700}.item em{font-weight:900;font-style:normal}.grand-total{margin-top:2mm;padding-top:2mm;border-top:2px solid #000;font-size:18px;font-weight:900}.payment{padding:2mm;border:2px solid #000}.footer{text-align:center;font-size:10px}.strong{font-weight:900}@media print{body{width:100%;padding:0}}@media print and (max-width:60mm){body{font-size:10px}.item-row{grid-template-columns:5mm 1fr 15mm 17mm}.logo{width:44mm}}
    </style></head><body><header class="center"><img class="logo" src="${window.location.origin}/images/logo.png" alt="${safe(store.storeName)}"><h1>${safe(store.storeName)}</h1>${storeAddress ? `<p>${storeAddress}</p>` : ""}${store.phone ? `<p>Contato / WhatsApp: ${safe(store.phone)}</p>` : ""}<p class="muted">PEDIDO COMERCIAL · NÃO É DOCUMENTO FISCAL</p></header><div class="double"></div><section class="center"><div class="label">PEDIDO</div><div class="order-number">#${safe(order.displayNumber)}</div><b>${safe(new Date(order.createdAt).toLocaleString("pt-BR"))}</b><p>${order.tableNumber ? `MESA ${safe(order.tableNumber)}` : order.fulfillmentType === "DELIVERY" ? "DELIVERY" : "RETIRADA"} · ${safe(ORDER_STATUS_LABEL[order.status])}</p></section><div class="dash"></div><section><div class="label">CLIENTE</div><p><b>${safe(order.customerName)}</b><br>${order.tableNumber ? "" : safe(order.customerPhone)}</p><p>${customerAddress}</p></section><div class="double"></div><section><div class="item-row label"><span>Nº</span><span>DESCRIÇÃO</span><span>UNIT.</span><span>TOTAL</span></div>${items}<div class="row"><span>${itemCount} ${itemCount === 1 ? "item" : "itens"}</span><b>${order.items?.length ?? 0} produtos</b></div></section>${order.notes ? `<div class="dash"></div><section><div class="label">OBSERVAÇÃO GERAL</div><p class="strong">${safe(order.notes)}</p></section>` : ""}<div class="double"></div><section><div class="row"><span>Subtotal</span><b>R$ ${money(order.subtotal)}</b></div>${discount ? `<div class="row"><span>Desconto ${order.couponCode ? `(${safe(order.couponCode)})` : ""}</span><b>- R$ ${money(discount)}</b></div>` : ""}${Number(order.serviceFee) ? `<div class="row"><span>SERVIÇO (10%)</span><b>R$ ${money(order.serviceFee)}</b></div>` : ""}${order.courierName ? `<div class="row"><span>MOTOBOY</span><b>${safe(order.courierName)}</b></div>` : ""}<div class="row"><span>Taxa de entrega</span><b>R$ ${money(order.deliveryFee)}</b></div><div class="row grand-total"><span>TOTAL</span><strong>R$ ${money(order.total)}</strong></div></section><div class="double"></div><section class="payment"><div class="row"><span>FORMA DE PAGAMENTO</span><b>${order.tableNumber && order.paymentStatus !== "APPROVED" ? "PAGAR NO FECHAMENTO DA MESA" : safe(paymentName(order.paymentMethod))}</b></div>${Number(order.changeFor) ? `<div class="row"><span>Troco para</span><b>R$ ${money(order.changeFor)}</b></div><div class="row"><span>Troco</span><b>R$ ${money(Math.max(0, change))}</b></div>` : ""}</section><footer class="footer"><div class="dash"></div><b>Obrigado pela preferência!</b></footer><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),400));<\/script></body></html>`);
    if (Number(order.digitalSecurityFee) > 0) {
      const totalRow = printWindow.document.querySelector(".grand-total");
      const feeRow = printWindow.document.createElement("div");
      feeRow.className = "row";
      const label = printWindow.document.createElement("span");
      label.textContent = "Taxa LGPD";
      const value = printWindow.document.createElement("b");
      value.textContent = `R$ ${money(order.digitalSecurityFee)}`;
      feeRow.append(label, value);
      totalRow?.before(feeRow);
    }
    const previewStyle = printWindow.document.createElement("style");
    previewStyle.textContent = `@media screen {
      html { background: #edf1ee; }
      body { zoom: ${previewZoom}; margin: 16px auto; padding: 3mm; background: #fff; box-shadow: 0 3px 18px #142a1926; }
      .print-actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid #dde5df; font: 10px Arial, sans-serif; color: #526158; }
      .print-actions button { border: 0; border-radius: 5px; padding: 7px 10px; background: #6F0801; color: #fff; cursor: pointer; font: inherit; }
      .print-actions button:hover { background: #183c25; }
    }
    @media print { html, body { background: #fff; } body { zoom: 1; margin: 0; box-shadow: none; } .print-actions { display: none !important; } }`;
    printWindow.document.head.appendChild(previewStyle);
    const actions = printWindow.document.createElement("nav");
    actions.className = "print-actions";
    const caption = printWindow.document.createElement("span");
    caption.textContent = "Visualização ampliada · cupom térmico";
    const printButton = printWindow.document.createElement("button");
    printButton.type = "button";
    printButton.textContent = "Imprimir";
    printButton.onclick = () => printWindow.print();
    actions.append(caption, printButton);
    printWindow.document.body.prepend(actions);
    printWindow.document.close();
  } catch (error) {
    printWindow.document.body.innerHTML = `<p style="font-family:Arial;padding:25px">Não foi possível preparar o cupom: ${safe(error instanceof Error ? error.message : "erro desconhecido")}</p>`;
  }
}
