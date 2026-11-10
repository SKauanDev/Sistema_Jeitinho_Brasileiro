import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Bike,
  CheckCircle2,
  Clock3,
  RefreshCw,
  ShoppingBag,
  Store,
  Ticket,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";
import { adminApi } from "../../services/admin-api";
import type { DashboardData } from "../../types/admin";
import { ORDER_STATUS_LABEL } from "../../types/admin";

const periods = [
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "month", label: "Este mês" },
  { value: "previous_month", label: "Mês anterior" },
  { value: "custom", label: "Personalizado" },
];
const currency = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const paymentNames: Record<string, string> = {
  PIX: "PIX",
  CASH: "Dinheiro",
  CREDIT_CARD: "Crédito",
  DEBIT_CARD: "Débito",
  ONLINE: "Cartão na entrega",
};

export function DashboardModule() {
  const [period, setPeriod] = useState("today");
  const [data, setData] = useState<DashboardData | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const [customStart, setCustomStart] = useState(today);
  const [customEnd, setCustomEnd] = useState(today);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    if (period === "custom" && (!customStart || !customEnd)) return;
    setLoading(true);
    setError("");
    void adminApi
      .dashboard(
        period,
        period === "custom" ? customStart : undefined,
        period === "custom" ? customEnd : undefined,
      )
      .then(setData)
      .catch((reason) =>
        setError(
          reason instanceof Error ? reason.message : "Falha ao carregar.",
        ),
      )
      .finally(() => setLoading(false));
  }, [period, customStart, customEnd, reloadKey]);
  if (loading)
    return (
      <div className="admin-state">
        <RefreshCw className="spinner" />
        <h2>Carregando indicadores...</h2>
      </div>
    );
  if (error || !data)
    return (
      <div className="admin-state error">
        <AlertCircle />
        <h2>Não foi possível carregar o Dashboard</h2>
        <p>{error}</p>
        <button onClick={() => setReloadKey((value) => value + 1)}>
          Tentar novamente
        </button>
      </div>
    );
  const maxRevenue =
    Math.max(...data.chart.map((point) => point.revenue), 1) * 1.15;
  const maxOrders =
    Math.max(...data.chart.map((point) => point.orders), 1) * 1.15;
  const polyline = data.chart
    .map(
      (point, index) =>
        `${data.chart.length === 1 ? 50 : 2 + (index / (data.chart.length - 1)) * 96},${88 - (point.revenue / maxRevenue) * 64}`,
    )
    .join(" ");
  const ordersPolyline = data.chart
    .map(
      (point, index) =>
        `${data.chart.length === 1 ? 50 : 2 + (index / (data.chart.length - 1)) * 96},${88 - (point.orders / maxOrders) * 64}`,
    )
    .join(" ");
  return (
    <div className="admin-module dashboard-analytics">
      <div className="module-title">
        <div>
          <span>VISÃO GERAL</span>
          <h1>Dashboard</h1>
          <p>Resultados calculados a partir dos pedidos registrados.</p>
        </div>
        <div className="period-controls">
          <select
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
          >
            {periods.map((item) => (
              <option value={item.value} key={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          {period === "custom" && (
            <>
              <input
                aria-label="Data inicial"
                type="date"
                value={customStart}
                max={customEnd}
                onChange={(event) => setCustomStart(event.target.value)}
              />
              <input
                aria-label="Data final"
                type="date"
                value={customEnd}
                min={customStart}
                onChange={(event) => setCustomEnd(event.target.value)}
              />
            </>
          )}
        </div>
      </div>
      <div className="metric-grid">
        <Metric
          icon={<Wallet />}
          tone="metric-orange"
          label="Faturamento"
          value={currency(data.kpis.revenue)}
          trend={data.kpis.revenueTrend}
        />
        <Metric
          icon={<ShoppingBag />}
          tone="metric-dark"
          label="Pedidos"
          value={String(data.kpis.orders)}
          trend={data.kpis.ordersTrend}
        />
        <Metric
          icon={<Ticket />}
          tone="metric-green"
          label="Ticket médio"
          value={currency(data.kpis.averageTicket)}
        />
        <Metric
          icon={<Clock3 />}
          tone="metric-purple"
          label="Em andamento"
          value={String(data.kpis.inProgress)}
          attention={data.kpis.inProgress > 0}
        />
      </div>
      <div className="secondary-grid">
        <Secondary
          icon={<CheckCircle2 />}
          label="Concluí­dos"
          value={data.secondary.completed}
        />
        <Secondary
          icon={<XCircle />}
          label="Cancelados"
          value={data.secondary.canceled}
        />
        <Secondary
          icon={<Bike />}
          label="Delivery"
          value={data.secondary.delivery}
        />
        <Secondary
          icon={<Store />}
          label="Retirada"
          value={data.secondary.pickup}
        />
        <Secondary
          icon={<Users />}
          label="Clientes novos"
          value={data.secondary.newCustomers}
        />
        <Secondary
          icon={<Users />}
          label="Clientes recorrentes"
          value={data.secondary.returningCustomers}
        />
      </div>
      <div className="dashboard-grid">
        <article className="panel real-chart">
          <header>
            <div>
              <h2>Faturamento</h2>
              <p>
                <i className="chart-key revenue" /> Receita{" "}
                <i className="chart-key orders" /> Pedidos
              </p>
            </div>
            <span>{currency(data.kpis.revenue)}</span>
          </header>
          {data.chart.length ? (
            <div className="revenue-chart">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#6F0801" stopOpacity=".3" />
                    <stop offset="1" stopColor="#6F0801" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <polygon
                  points={`0,100 ${polyline} 100,100`}
                  fill="url(#revenue-fill)"
                />
                <polyline
                  points={polyline}
                  fill="none"
                  stroke="#6F0801"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
                <polyline
                  points={ordersPolyline}
                  fill="none"
                  stroke="#3d648e"
                  strokeWidth="1.35"
                  strokeDasharray="3 4"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
                {data.chart.map((point, index) => (
                  <ellipse
                    key={point.date}
                    cx={
                      data.chart.length === 1
                        ? 50
                        : 2 + (index / (data.chart.length - 1)) * 96
                    }
                    cy={88 - (point.revenue / maxRevenue) * 64}
                    rx="0.62"
                    ry="1.55"
                    fill="#fff"
                    stroke="#6F0801"
                    strokeWidth="1.25"
                    vectorEffect="non-scaling-stroke"
                  >
                    <title>
                      {new Date(`${point.date}T12:00:00`).toLocaleDateString(
                        "pt-BR",
                      )}{" "}
                      · {currency(point.revenue)} · {point.orders} pedidos ·
                      ticket médio{" "}
                      {currency(
                        point.orders ? point.revenue / point.orders : 0,
                      )}
                    </title>
                  </ellipse>
                ))}
              </svg>
              <div>
                {data.chart.map((point) => (
                  <span key={point.date}>
                    {new Date(`${point.date}T12:00:00`).toLocaleDateString(
                      "pt-BR",
                      { day: "2-digit", month: "2-digit" },
                    )}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <Empty text="Ainda não há faturamento concluído neste período." />
          )}
        </article>
        <article className="panel product-ranking">
          <header>
            <div>
              <h2>Produtos mais vendidos</h2>
              <p>Somente pedidos concluídos</p>
            </div>
          </header>
          {data.products.length ? (
            <ol>
              {data.products.map((product) => (
                <li key={product.productName}>
                  <b>{product.productName}</b>
                  <span>{product.quantity} vendas</span>
                  <strong>{currency(product.revenue)}</strong>
                </li>
              ))}
            </ol>
          ) : (
            <Empty text="Nenhuma venda concluída no período." />
          )}
        </article>
      </div>
      <div className="dashboard-breakdowns">
        <article className="panel">
          <header>
            <div>
              <h2>Formas de pagamento</h2>
              <p>Valor e participação no período</p>
            </div>
          </header>
          {data.paymentMethods.length ? (
            <ul>
              {data.paymentMethods.map((item) => (
                <li key={item.name}>
                  <span>{item.name}</span>
                  <b>
                    {currency(item.value)} · {item.percentage}%
                  </b>
                </li>
              ))}
            </ul>
          ) : (
            <Empty text="Os pedidos atuais ainda não registram forma de pagamento." />
          )}
        </article>
        <article className="panel">
          <header>
            <div>
              <h2>Categorias mais vendidas</h2>
              <p>Categorias associadas aos itens vendidos</p>
            </div>
          </header>
          {data.categories.length ? (
            <ul>
              {data.categories.map((item) => (
                <li key={item.name}>
                  <span>{item.name}</span>
                  <b>
                    {currency(item.value)} · {item.percentage}%
                  </b>
                </li>
              ))}
            </ul>
          ) : (
            <Empty text="Os itens atuais são snapshots e ainda não guardam a categoria da venda." />
          )}
        </article>
      </div>
      <article className="panel recent-orders">
        <header>
          <div>
            <h2>Pedidos recentes</h2>
            <p>Últimas movimentações reais da loja</p>
          </div>
          <a href="/pedidos">Ver todos</a>
        </header>
        {data.recentOrders.length ? (
          <div className="admin-table">
            <div className="table-head dashboard-order-row">
              <span>Pedido</span>
              <span>Cliente</span>
              <span>Horário</span>
              <span>Tipo</span>
              <span>Pagamento</span>
              <span>Total</span>
              <span>Status</span>
              <span />
            </div>
            {data.recentOrders.map((order) => (
              <div className="table-row dashboard-order-row" key={order.id}>
                <span>#{order.displayNumber}</span>
                <span>{order.customerName}</span>
                <span>
                  {new Date(order.createdAt).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span>
                  {order.fulfillmentType === "DELIVERY"
                    ? "Delivery"
                    : "Retirada"}
                </span>
                <span>Não informado</span>
                <span>{currency(Number(order.total))}</span>
                <span
                  className={`order-status status-${order.status.toLowerCase()}`}
                >
                  {ORDER_STATUS_LABEL[order.status]}
                </span>
                <a
                  className="view-order-link"
                  href={`/pedidos?pedido=${order.id}`}
                >
                  Ver pedido
                </a>
              </div>
            ))}
          </div>
        ) : (
          <Empty text="Nenhum pedido registrado." />
        )}
      </article>
    </div>
  );
}

function Metric({
  icon,
  tone,
  label,
  value,
  trend,
  attention,
}: {
  icon: React.ReactNode;
  tone: string;
  label: string;
  value: string;
  trend?: number;
  attention?: boolean;
}) {
  const TrendIcon =
    trend !== undefined && trend < 0 ? ArrowDownRight : ArrowUpRight;
  return (
    <article className={attention ? "metric-attention" : ""}>
      <i className={tone}>{icon}</i>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {trend !== undefined && (
          <small className={trend >= 0 ? "positive" : "negative"}>
            <TrendIcon /> {trend >= 0 ? "+" : ""}
            {trend}% <em>vs. perí­odo anterior</em>
          </small>
        )}
      </div>
    </article>
  );
}
function Secondary({
  icon,
  label,
  value,
  unavailable,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  unavailable?: boolean;
}) {
  return (
    <article>
      {icon}
      <span>
        <small>{label}</small>
        <strong>{unavailable ? "â€”" : value}</strong>
      </span>
      {unavailable && <em>Dados de clientes ainda não estruturados</em>}
    </article>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="panel-empty">
      <AlertCircle />
      <p>{text}</p>
    </div>
  );
}
