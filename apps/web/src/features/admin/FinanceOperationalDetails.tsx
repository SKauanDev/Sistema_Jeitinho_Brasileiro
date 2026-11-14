import { useState } from "react";
import { Bike, UtensilsCrossed, ShoppingBag } from "lucide-react";
import type { FinanceData } from "../../types/finance";
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export function FinanceOperationalDetails({ data }: { data: FinanceData }) {
  const [metric, setMetric] = useState<"revenue" | "ordersCount">("revenue");
  const composition = data.composition;
  if (!composition) return null;
  const channels = data.salesChannels ?? [], couriers = data.courierFees ?? [];
  const max = Math.max(...channels.map(channel => channel[metric]), 1);
  const metricTotal = channels.reduce((sum, channel) => sum + channel[metric], 0);
  return <div className="finance-operational-grid">
    <section className="panel finance-composition"><header><h2>Composição do faturamento</h2><p>Taxas já incluídas no total das vendas concluídas.</p></header>
      <dl><div><dt>Produtos</dt><dd>{money(composition.grossSales)}</dd></div><div><dt>Descontos</dt><dd>− {money(composition.discounts)}</dd></div><div><dt>Produtos líquidos</dt><dd>{money(composition.netSales)}</dd></div><div><dt>Taxas de entrega</dt><dd>{money(composition.deliveryFees)}</dd></div><div className="service-fee-row"><dt>Serviço do garçom · 10%<small>{composition.serviceOrders} pedido(s) com serviço · base {money(composition.serviceBase)}</small></dt><dd>{money(composition.serviceFees)}</dd></div><div><dt>Taxa digital</dt><dd>{money(composition.digitalFees)}</dd></div><div className="composition-total"><dt>Faturamento total</dt><dd>{money(composition.total)}</dd></div></dl>
      <p className="finance-formula">Produtos − descontos + entrega + serviço + taxa digital.</p>
    </section>
    <section className="panel finance-channel-panel"><header><div><h2>Entrega × consumo interno</h2><p>Retiradas aparecem separadas para manter a comparação.</p></div></header>
      <div className="finance-metric-switch" aria-label="Comparar por"><button type="button" aria-pressed={metric === "revenue"} onClick={() => setMetric("revenue")}>Faturamento</button><button type="button" aria-pressed={metric === "ordersCount"} onClick={() => setMetric("ordersCount")}>Pedidos</button></div>
      <div className="finance-channel-bars" role="img" aria-label={`Comparação por ${metric === "revenue" ? "faturamento" : "pedidos"}: ${channels.map(channel => `${channel.name}: ${metric === "revenue" ? money(channel.revenue) : channel.ordersCount}`).join(", ")}`}>
        {channels.map(channel => { const Icon = channel.mode === "DELIVERY" ? Bike : channel.mode === "DINE_IN" ? UtensilsCrossed : ShoppingBag; const share = metricTotal ? Math.round(channel[metric] / metricTotal * 1000) / 10 : 0; return <div key={channel.mode} className={`channel-${channel.mode.toLowerCase()}`}><div><span><Icon size={17} />{channel.name}</span><b>{metric === "revenue" ? money(channel.revenue) : `${channel.ordersCount} pedido(s)`}</b></div><div className="channel-track"><i style={{ width: `${channel[metric] / max * 100}%` }} /></div><small>{channel.ordersCount} pedido(s) · {share}% do período</small></div>; })}
      </div>
    </section>
    <section className="panel finance-courier-breakdown"><header><div><h2>Taxas de entrega por motoboy</h2><p>Soma das taxas das entregas vinculadas a cada responsável.</p></div><strong>{money(composition.deliveryFees)}<small>Total de taxas</small></strong></header>
      <div className="courier-fee-table"><table><thead><tr><th>Motoboy</th><th>Entregas</th><th>Taxas de entrega</th><th>Participação</th></tr></thead><tbody>{couriers.map((courier, index) => <tr key={courier.id ?? `${courier.name}-${index}`}><td><b>{courier.name}</b>{courier.id && !courier.registered && <small>Cadastro excluído · histórico preservado</small>}{courier.registered && !courier.active && <small>Inativo</small>}</td><td>{courier.ordersCount}</td><td>{money(courier.deliveryFees)}</td><td>{courier.percentage}%</td></tr>)}{!couriers.length && <tr><td colSpan={4}>Nenhuma entrega ou motoboy registrado neste período.</td></tr>}</tbody><tfoot><tr><th>Total</th><td>{couriers.reduce((sum, courier) => sum + courier.ordersCount, 0)}</td><td>{money(composition.deliveryFees)}</td><td>{composition.deliveryFees ? "100%" : "0%"}</td></tr></tfoot></table></div>
    </section>
  </div>;
}
