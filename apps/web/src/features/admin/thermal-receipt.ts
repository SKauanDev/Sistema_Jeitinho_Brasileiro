import { adminApi } from "../../services/admin-api";
import {
  ORDER_STATUS_LABEL,
  type Order,
  type OrderItem,
} from "../../types/admin";

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

const normalizedLabel = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

function receiptItemDetails(item: OrderItem) {
  const specs: Array<{ rank: number; name: string }> = [];
  const styles: string[] = [];
  const flavors = new Map<string, string[]>();
  const borders: string[] = [];
  const other: string[] = [];
  for (const option of item.selectedOptions ?? []) {
    const group = normalizedLabel(option.optionGroupName);
    const price = Number(option.priceDelta)
      ? ` · R$ ${money(option.priceDelta)}`
      : "";
    if (/^borda(?:\s|[·:-]|$)/.test(group)) {
      borders.push(`<small class="item-border">Borda: ${safe(option.optionName)}${price}</small>`);
      continue;
    }
    if (group === "estilo da massa") {
      styles.push(`${safe(option.optionName)}${price}`);
      continue;
    }
    if (["tamanho", "massa e tamanho"].includes(group)) {
      const combined =
        group === "massa e tamanho"
          ? /^(.*?)\s*[·-]?\s*\b(GG|G|M|P)\s*$/i.exec(option.optionName)
          : null;
      if (combined?.[1]?.trim())
        styles.push(
          safe(
            combined[1]
              .trim()
              .replace(/[·-]\s*$/, "")
              .trim(),
          ),
        );
      specs.push({
        rank: group === "tamanho" ? 0 : 1,
        name: `${safe(combined?.[2] ?? option.optionName)}${price}`,
      });
      continue;
    }
    const pizza = /^pizza\s+(\d+)\s*[·:-]\s*(.+)$/.exec(group);
    const description = pizza?.[2] ?? group;
    const half = /^(?:[12]\s*[ªºa°]?\s*|primeira\s+|segunda\s+)metade$/.test(
      description,
    );
    if (half || (pizza && description === "sabor inteiro")) {
      const key = pizza?.[1] ?? "1";
      const entries = flavors.get(key) ?? [];
      entries.push(`${half ? "1/2 " : ""}${safe(option.optionName)}${price}`);
      flavors.set(key, entries);
      continue;
    }
    other.push(
      `<small>+ ${safe(option.optionGroupName)}: ${safe(option.optionName)}${price}</small>`,
    );
  }
  const specification = specs
    .sort((a, b) => a.rank - b.rank)
    .map((spec) => spec.name)
    .join(" · ");
  const configuredPizza =
    !!specification || styles.length > 0 || flavors.size > 0;
  return {
    heading: `${item.quantity}x ${configuredPizza ? specification || "Pizza" : safe(item.productName)}`,
    flavors: [...flavors]
      .map(
        ([number, entries]) =>
          `<small class="item-flavors">${flavors.size > 1 ? `Pizza ${safe(number)}: ` : ""}${entries.join(" · ")}</small>`,
      )
      .join(""),
    borders: borders.join(""),
    options: other.join(""),
    name: configuredPizza
      ? `<small class="item-name">${safe(item.productName)}${styles.length ? ` - <strong>estilo: ${styles.join(" · ")}</strong>` : ""}</small>`
      : "",
  };
}

export async function printProfessionalThermalReceipt(order: Order) {
  const popupWidth = Math.min(1100, window.screen.availWidth);
  const popupHeight = Math.min(1000, window.screen.availHeight);
  const popupLeft = Math.max(
    0,
    Math.round((window.screen.availWidth - popupWidth) / 2),
  );
  const popupTop = Math.max(
    0,
    Math.round((window.screen.availHeight - popupHeight) / 2),
  );
  const previewZoom = Math.max(
    1,
    Math.min(1.8, (popupWidth - 64) / ((76 * 96) / 25.4)),
  );
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
        : order.tableNumber
          ? `CONSUMO NA MESA ${safe(order.tableNumber)}`
          : "RETIRADA NO ESTABELECIMENTO";
    const itemCount = (order.items ?? []).reduce(
      (sum, item) => sum + Number(item.quantity),
      0,
    );
    const items = (order.items ?? [])
      .map((item) => {
        const details = receiptItemDetails(item);
        return `<article class="item">
        <div class="item-main"><b>${details.heading}</b><strong>R$ ${money(item.lineTotal)}</strong></div>
        ${details.borders}
        ${Number(item.quantity) > 1 || Number(item.unitPrice) !== Number(item.lineTotal) ? `<div class="item-unit">Unit.: R$ ${money(item.unitPrice)}</div>` : ""}
        ${details.flavors}${details.options}
        ${item.notes ? `<em>OBS: ${safe(item.notes)}</em>` : ""}
        ${details.name}
      </article>`;
      })
      .join("");
    const discount = Number(order.discountAmount ?? 0);
    const change = Number(order.changeFor ?? 0) - Number(order.total);
    printWindow.document.open();
    printWindow.document
      .write(`<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Pedido #${safe(order.displayNumber)}</title><style>
    @page { size: auto; margin: 2mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #000; }
    body { width: 76mm; margin: auto; padding: 1mm; font: 11px/1.18 Arial, sans-serif; font-weight: 700; overflow-wrap: anywhere; }
    p { margin: .6mm 0; }
    .receipt-header { display: grid; grid-template-columns: 18mm minmax(0, 1fr); gap: 2mm; align-items: start; }
    .logo { display: block; width: 18mm; height: 16mm; object-fit: contain; filter: grayscale(1) contrast(1.55); }
    .store-details { min-width: 0; text-align: right; font-size: 9px; line-height: 1.15; }
    h1 { margin: 0 0 .7mm; font-size: 12px; line-height: 1.05; }
    .order-meta { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2mm; align-items: center; padding: 1.4mm 0; margin-top: 1.5mm; border-top: 1px solid #000; border-bottom: 1px solid #000; font-size: 10px; }
    .order-meta p { margin: 0; }
    .order-meta p + p { margin-top: .5mm; }
    .order-number { text-align: right; font-size: 12px; font-weight: 900; white-space: nowrap; }
    .order-number small { display: block; font-size: 8px; letter-spacing: .4px; }
    .customer { padding: 1.6mm 0; border-bottom: 1px solid #000; }
    .customer-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 2mm; }
    .customer-name { font-size: 13px; }
    .customer-phone { font-size: 10px; white-space: nowrap; }
    .customer-address { margin: 1mm 0 0; font-size: 14px; line-height: 1.2; font-weight: 900; }
    .label { font-size: 10px; font-weight: 900; text-transform: uppercase; }
    .items-heading { display: flex; justify-content: space-between; margin: 1.4mm 0 .3mm; }
    .item { padding: 1.6mm 0; border-bottom: 1px dotted #555; break-inside: avoid; page-break-inside: avoid; }
    .item-main { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2mm; align-items: start; font-size: 11px; line-height: 1.15; }
    .item-main strong { text-align: right; white-space: nowrap; font-size: 12px; }
    .item-unit { text-align: right; font-size: 9px; margin-top: .3mm; }
    .item small, .item em { display: block; margin-top: .6mm; font-size: 11px; line-height: 1.15; font-weight: 700; }
    .item em { margin-top: 1mm; font-weight: 900; font-style: normal; }
    .item .item-flavors { font-size: 11px; font-weight: 700; }
    .item .item-name { margin-top: 1mm; font-size: 11px; font-weight: 400; }
    .item .item-name strong { font-weight: 700; }
    .item-count { padding: .4mm 0; font-size: 9px; }
    .row { display: flex; justify-content: space-between; gap: 2mm; margin: .7mm 0; }
    .row > :last-child { text-align: right; }
    .notes { padding: 1.4mm 0; border-bottom: 1px solid #000; }
    .notes p { font-size: 12px; font-weight: 900; }
    .totals { padding-top: 1.4mm; }
    .grand-total { margin-top: 1.4mm; padding-top: 1.4mm; border-top: 1px solid #000; font-size: 16px; font-weight: 900; }
    .payment { margin-top: 1.4mm; padding: 1.2mm 0; border-top: 1px solid #000; border-bottom: 1px solid #000; break-inside: avoid; page-break-inside: avoid; }
    .payment .row { margin: .5mm 0; font-size: 10px; }
    .footer { margin-top: 1.8mm; text-align: center; font-size: 8px; line-height: 1.2; }
    .receipt-header, .order-meta, .customer, .totals { break-inside: avoid; page-break-inside: avoid; }
    @media print { body { width: 100%; max-width: 76mm; margin: 0; padding: 0; } }
    @media print and (max-width: 60mm) {
      .receipt-header { grid-template-columns: 14mm minmax(0, 1fr); gap: 1mm; }
      .logo { width: 14mm; height: 13mm; }
      .store-details { font-size: 8px; } h1 { font-size: 11px; }
      .customer-heading { flex-wrap: wrap; gap: .3mm; }
      .customer-address { font-size: 13px; }
      .item-main strong { font-size: 11px; }
    }
    </style></head><body>
    <header class="receipt-header">
      <img class="logo" src="${window.location.origin}/images/logo.webp" alt="${safe(store.storeName)}">
      <div class="store-details"><h1>${safe(store.storeName)}</h1>${storeAddress ? `<p>${storeAddress}</p>` : ""}${store.phone ? `<p>WhatsApp: ${safe(store.phone)}</p>` : ""}</div>
    </header>
    <section class="order-meta">
      <div><p>${safe(new Date(order.createdAt).toLocaleString("pt-BR"))}</p><p>${order.tableNumber ? `MESA ${safe(order.tableNumber)}` : order.fulfillmentType === "DELIVERY" ? "DELIVERY" : "RETIRADA"} · ${safe(ORDER_STATUS_LABEL[order.status])}</p></div>
      <div class="order-number"><small>COMANDA</small>#${safe(order.displayNumber)}</div>
    </section>
    <section class="customer">
      <div class="customer-heading"><b class="customer-name">${safe(order.customerName)}</b>${!order.tableNumber && order.customerPhone ? `<span class="customer-phone">${safe(order.customerPhone)}</span>` : ""}</div>
      <p class="customer-address">${customerAddress}</p>
    </section>
    <section class="items"><div class="items-heading label"><span>PEDIDO</span><span>TOTAL</span></div>${items}<div class="row item-count"><span>${itemCount} ${itemCount === 1 ? "item" : "itens"}</span><b>${order.items?.length ?? 0} produtos</b></div></section>
    ${order.notes ? `<section class="notes"><div class="label">OBSERVAÇÃO GERAL</div><p>${safe(order.notes)}</p></section>` : ""}
    <section class="totals">
      <div class="row"><span>Subtotal</span><b>R$ ${money(order.subtotal)}</b></div>
      ${discount ? `<div class="row"><span>Desconto ${order.couponCode ? `(${safe(order.couponCode)})` : ""}</span><b>- R$ ${money(discount)}</b></div>` : ""}
      ${Number(order.serviceFee) ? `<div class="row"><span>SERVIÇO (10%)</span><b>R$ ${money(order.serviceFee)}</b></div>` : ""}
      ${order.courierName ? `<div class="row"><span>MOTOBOY</span><b>${safe(order.courierName)}</b></div>` : ""}
      <div class="row"><span>Taxa de entrega</span><b>R$ ${money(order.deliveryFee)}</b></div>
      <div class="row grand-total"><span>TOTAL</span><strong>R$ ${money(order.total)}</strong></div>
    </section>
    <section class="payment"><div class="row"><span>FORMA DE PAGAMENTO</span><b>${order.tableNumber && order.paymentStatus !== "APPROVED" ? "PAGAR NO FECHAMENTO DA MESA" : safe(paymentName(order.paymentMethod))}</b></div>${Number(order.changeFor) ? `<div class="row"><span>Troco para</span><b>R$ ${money(order.changeFor)}</b></div><div class="row"><span>Troco</span><b>R$ ${money(Math.max(0, change))}</b></div>` : ""}</section>
    <footer class="footer"><b>Obrigado pela preferência!</b><p>PEDIDO COMERCIAL · NÃO É DOCUMENTO FISCAL</p></footer>
    <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),400));<\/script></body></html>`);
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
      body { zoom: ${previewZoom}; margin: 16px auto; padding: 1mm; background: #fff; box-shadow: 0 3px 18px #142a1926; }
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
