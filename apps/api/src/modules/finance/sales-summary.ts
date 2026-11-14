type Row = Record<string, unknown>;
const cents = (value: unknown) => Number.isFinite(Number(value)) ? Math.round(Number(value ?? 0) * 100) : 0;
const sum = (rows: Row[], field: string) => rows.reduce((total, row) => total + cents(row[field]), 0);
export function salesSummary(orders: Row[], registeredCouriers: Row[] = []) {
  const completed = orders.filter(order => order.status === "COMPLETED");
  const gross = sum(completed, "subtotal"), discounts = sum(completed, "discountAmount"), delivery = sum(completed, "deliveryFee"), service = sum(completed, "serviceFee"), digital = sum(completed, "digitalSecurityFee"), revenue = sum(completed, "total");
  const courierMap = new Map<string, { id: string | null; name: string; registered: boolean; active: boolean; ordersCount: number; deliveryFees: number }>();
  for (const courier of registeredCouriers) courierMap.set(String(courier.id), { id: String(courier.id), name: String(courier.name), registered: true, active: !!courier.active, ordersCount: 0, deliveryFees: 0 });
  const modes = [
    { mode: "DELIVERY", name: "Entrega", ordersCount: 0, revenue: 0 },
    { mode: "DINE_IN", name: "Consumo interno", ordersCount: 0, revenue: 0 },
    { mode: "PICKUP", name: "Retirada", ordersCount: 0, revenue: 0 },
  ];
  for (const order of completed) {
    const mode = order.diningSessionId || order.tableNumber ? "DINE_IN" : order.fulfillmentType === "DELIVERY" ? "DELIVERY" : "PICKUP";
    const channel = modes.find(channel => channel.mode === mode)!;
    channel.ordersCount++; channel.revenue += cents(order.total);
    if (order.fulfillmentType === "DELIVERY" || cents(order.deliveryFee) > 0) {
      const id = order.courierId ? String(order.courierId) : null;
      const key = id ?? (order.courierName ? `historical:${order.courierName}` : "unassigned");
      const courier = courierMap.get(key) ?? { id, name: String(order.courierName || "Sem motoboy definido"), registered: false, active: false, ordersCount: 0, deliveryFees: 0 };
      courier.ordersCount++; courier.deliveryFees += cents(order.deliveryFee); courierMap.set(key, courier);
    }
  }
  return {
    composition: { grossSales: gross / 100, discounts: discounts / 100, netSales: (gross - discounts) / 100, deliveryFees: delivery / 100, serviceFees: service / 100, digitalFees: digital / 100, total: revenue / 100,
      serviceOrders: completed.filter(order => cents(order.serviceFee) > 0).length,
      serviceBase: completed.filter(order => cents(order.serviceFee) > 0).reduce((base, order) => base + cents(order.subtotal) - cents(order.discountAmount), 0) / 100 },
    salesChannels: modes.map(channel => ({ ...channel, revenue: channel.revenue / 100, percentage: revenue ? Math.round(channel.revenue / revenue * 1000) / 10 : 0 })),
    courierFees: [...courierMap.values()].map(courier => ({ ...courier, deliveryFees: courier.deliveryFees / 100, percentage: delivery ? Math.round(courier.deliveryFees / delivery * 1000) / 10 : 0 }))
      .sort((a, b) => b.deliveryFees - a.deliveryFees || a.name.localeCompare(b.name, "pt-BR")),
  };
}
