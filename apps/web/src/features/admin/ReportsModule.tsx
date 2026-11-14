import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  FileText,
  LoaderCircle,
  Search,
  ShoppingBag,
  Ticket,
  TrendingUp,
  Truck,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { reportApi } from "../../services/report-api";
import { ORDER_STATUS_LABEL } from "../../types/admin";
import type { ReportData, ReportFilters } from "../../types/report";

const currency = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const payment: Record<string, string> = {
  PIX: "PIX",
  CASH: "Dinheiro",
  CREDIT_CARD: "Crédito",
  DEBIT_CARD: "Débito",
  ONLINE: "Online",
  RECEIVED_ONLINE: "Pagamento online recebido",
};
const periodLabels: Record<string, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  month: "Este mês",
  previous_month: "Mês anterior",
  custom: "Personalizado",
};

export function ReportsModule() {
  const today = new Date().toISOString().slice(0, 10);
  const [filters, setFilters] = useState<ReportFilters | null>(null);
  const [data, setData] = useState<ReportData | null>(null);
  const [period, setPeriod] = useState("month");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [categoryId, setCategoryId] = useState("");
  const [productId, setProductId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const products = useMemo(
    () =>
      filters?.products.filter(
        (product) => !categoryId || product.categoryId === categoryId,
      ) ?? [],
    [filters, categoryId],
  );
  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ period });
      if (period === "custom") {
        params.set("start", start);
        params.set("end", end);
      }
      if (categoryId) params.set("categoryId", categoryId);
      if (productId) params.set("productId", productId);
      if (paymentMethod) params.set("paymentMethod", paymentMethod);
      setData(await reportApi.generate(params));
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Falha ao gerar relatório.",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void reportApi
      .filters()
      .then(setFilters)
      .catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Falha ao carregar filtros.",
        ),
      );
  }, []);
  useEffect(() => {
    void load();
  }, [period, start, end, categoryId, productId, paymentMethod]);
  const filterDescription = [
    periodLabels[period],
    filters?.categories.find((item) => item.id === categoryId)?.name,
    filters?.products.find((item) => item.id === productId)?.name,
    filters?.paymentMethods.find((item) => item.id === paymentMethod)?.name,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="admin-module reports-analytics">
      <div className="module-title">
        <div>
          <span>BUSINESS INTELLIGENCE</span>
          <h1>Central de relatórios</h1>
          <p>Visão executiva de vendas, produtos, clientes e perdas.</p>
        </div>
        <button
          className="primary-admin pdf-export"
          disabled={!data}
          onClick={() => window.print()}
        >
          <FileText /> Gerar PDF
        </button>
      </div>
      {error && (
        <div className="admin-inline-error">
          <AlertCircle />
          {error}
          <button onClick={() => setError("")}>
            <X />
          </button>
        </div>
      )}
      <section className="report-filters">
        <label>
          Período
          <select
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
          >
            <option value="today">Hoje</option>
            <option value="yesterday">Ontem</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="month">Este mês</option>
            <option value="previous_month">Mês anterior</option>
            <option value="custom">Personalizado</option>
          </select>
        </label>
        {period === "custom" && (
          <>
            <label>
              De
              <input
                type="date"
                value={start}
                max={end}
                onChange={(event) => setStart(event.target.value)}
              />
            </label>
            <label>
              Até
              <input
                type="date"
                value={end}
                min={start}
                onChange={(event) => setEnd(event.target.value)}
              />
            </label>
          </>
        )}
        <label>
          Categoria
          <select
            value={categoryId}
            onChange={(event) => {
              setCategoryId(event.target.value);
              setProductId("");
            }}
          >
            <option value="">Todas</option>
            {filters?.categories.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Produto
          <select
            value={productId}
            onChange={(event) => setProductId(event.target.value)}
          >
            <option value="">Todos</option>
            {products.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Pagamento
          <select
            value={paymentMethod}
            onChange={(event) => setPaymentMethod(event.target.value)}
          >
            <option value="">Todos</option>
            {filters?.paymentMethods.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      </section>
      {loading ? (
        <div className="admin-state report-loading">
          <LoaderCircle className="spinner" />
          <h2>Consolidando indicadores...</h2>
        </div>
      ) : (
        data && (
          <ReportDashboard data={data} filterDescription={filterDescription} />
        )
      )}
    </div>
  );
}

function ReportDashboard({
  data,
  filterDescription,
}: {
  data: ReportData;
  filterDescription: string;
}) {
  const completed = data.orders.filter((order) => order.status === "COMPLETED");
  const timelineMap = new Map<
    string,
    { date: string; revenue: number; orders: number }
  >();
  const paymentMap = new Map<string, number>();
  completed.forEach((order) => {
    const date = order.createdAt.slice(0, 10);
    const day = timelineMap.get(date) ?? { date, revenue: 0, orders: 0 };
    day.revenue += order.total;
    day.orders += 1;
    timelineMap.set(date, day);
    const name = payment[order.paymentMethod ?? ""] ?? "Não informado";
    paymentMap.set(name, (paymentMap.get(name) ?? 0) + order.total);
  });
  const timeline = [...timelineMap.values()].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const maxRevenue =
    Math.max(...timeline.map((item) => item.revenue), 1) * 1.15;
  const line = timeline
    .map(
      (item, index) =>
        `${timeline.length === 1 ? 50 : 2 + (index / (timeline.length - 1)) * 96},${88 - (item.revenue / maxRevenue) * 64}`,
    )
    .join(" ");
  const paymentRows = [...paymentMap].sort((a, b) => b[1] - a[1]);
  const topShare = data.sales.revenue
    ? ((data.topProducts[0]?.revenue ?? 0) / data.sales.revenue) * 100
    : 0;
  return (
    <>
      <section className="report-executive-head">
        <div>
          <small>RESULTADO CONSOLIDADO</small>
          <strong>{currency(data.sales.revenue)}</strong>
          <span>{filterDescription}</span>
        </div>
        <TrendingUp />
      </section>
      <section className="report-kpis power-kpis">
        <Kpi
          icon={<ShoppingBag />}
          label="Pedidos concluídos"
          value={String(data.sales.orders)}
          detail={`${data.sales.delivery} delivery · ${data.sales.pickup} retirada`}
        />
        <Kpi
          icon={<Ticket />}
          label="Ticket médio"
          value={currency(data.sales.averageTicket)}
          detail="Por pedido concluído"
        />
        <Kpi
          icon={<Truck />}
          label="Participação delivery"
          value={`${data.sales.orders ? Math.round((data.sales.delivery / data.sales.orders) * 100) : 0}%`}
          detail={`${data.sales.delivery} pedidos`}
        />
        <Kpi
          icon={<XCircle />}
          label="Perdas por cancelamento"
          value={currency(data.cancellations.lostValue)}
          detail={`${data.cancellations.count} cancelamentos`}
        />
      </section>
      <div className="power-main-grid">
        <article className="panel report-timeline">
          <header>
            <div>
              <h2>Evolução do faturamento</h2>
              <p>Receita concluída por dia</p>
            </div>
            <BarChart3 />
          </header>
          {timeline.length ? (
            <div>
              <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="report-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#6F0801" stopOpacity=".24" />
                    <stop offset="1" stopColor="#6F0801" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <polygon
                  points={`0,100 ${line} 100,100`}
                  fill="url(#report-area)"
                />
                <polyline
                  points={line}
                  fill="none"
                  stroke="#6F0801"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
                {timeline.map((item, index) => (
                  <ellipse
                    key={item.date}
                    cx={
                      timeline.length === 1
                        ? 50
                        : 2 + (index / (timeline.length - 1)) * 96
                    }
                    cy={88 - (item.revenue / maxRevenue) * 64}
                    rx="0.62"
                    ry="1.55"
                    fill="#fff"
                    stroke="#6F0801"
                    strokeWidth="1.25"
                    vectorEffect="non-scaling-stroke"
                  >
                    <title>
                      {new Date(`${item.date}T12:00:00`).toLocaleDateString(
                        "pt-BR",
                      )}{" "}
                      · {currency(item.revenue)} · {item.orders} pedidos
                    </title>
                  </ellipse>
                ))}
              </svg>
              <footer>
                {timeline.map((item) => (
                  <span key={item.date}>
                    {new Date(`${item.date}T12:00:00`).toLocaleDateString(
                      "pt-BR",
                      { day: "2-digit", month: "2-digit" },
                    )}
                  </span>
                ))}
              </footer>
            </div>
          ) : (
            <Empty />
          )}
        </article>
        <article className="panel report-channel">
          <header>
            <div>
              <h2>Canais de venda</h2>
              <p>Delivery versus retirada</p>
            </div>
          </header>
          <div
            className="channel-donut"
            style={{
              background: `conic-gradient(#6F0801 0 ${data.sales.orders ? (data.sales.delivery / data.sales.orders) * 100 : 0}%, #302b27 0)`,
            }}
          >
            <span>
              <strong>{data.sales.orders}</strong>
              <small>pedidos</small>
            </span>
          </div>
          <ul>
            <li>
              <i className="delivery" /> Delivery <b>{data.sales.delivery}</b>
            </li>
            <li>
              <i className="pickup" /> Retirada <b>{data.sales.pickup}</b>
            </li>
          </ul>
        </article>
        <article className="panel report-payment">
          <header>
            <div>
              <h2>Formas de pagamento</h2>
              <p>Participação no faturamento</p>
            </div>
          </header>
          {paymentRows.length ? (
            <ul>
              {paymentRows.map(([name, value]) => (
                <li key={name}>
                  <div>
                    <span>{name}</span>
                    <b>{currency(value)}</b>
                  </div>
                  <i>
                    <span
                      style={{
                        width: `${data.sales.revenue ? (value / data.sales.revenue) * 100 : 0}%`,
                      }}
                    />
                  </i>
                  <small>
                    {data.sales.revenue
                      ? ((value / data.sales.revenue) * 100).toFixed(1)
                      : 0}
                    %
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <Empty />
          )}
        </article>
        <article className="panel report-highlight">
          <header>
            <div>
              <h2>Produto líder</h2>
              <p>Maior contribuição no período</p>
            </div>
          </header>
          {data.topProducts[0] ? (
            <div>
              <span>01</span>
              <strong>{data.topProducts[0].name}</strong>
              <b>{currency(data.topProducts[0].revenue)}</b>
              <i>
                <span style={{ width: `${topShare}%` }} />
              </i>
              <small>
                {data.topProducts[0].quantity} unidades · {topShare.toFixed(1)}%
                da receita
              </small>
            </div>
          ) : (
            <Empty />
          )}
        </article>
      </div>
      <div className="report-grid">
        <Ranking
          title="Produtos mais vendidos"
          icon={<ArrowUpRight />}
          items={data.topProducts}
        />
        <article className="panel report-customers">
          <header>
            <div>
              <h2>Clientes de maior valor</h2>
              <p>Ranking por valor total</p>
            </div>
            <Users />
          </header>
          {data.topCustomers.length ? (
            <ol>
              {data.topCustomers.map((customer, index) => (
                <li key={customer.phone}>
                  <i>{index + 1}</i>
                  <span>
                    <strong>{customer.name}</strong>
                    <small>
                      {customer.orders} pedidos · {customer.phone}
                    </small>
                  </span>
                  <b>{currency(customer.totalSpent)}</b>
                </li>
              ))}
            </ol>
          ) : (
            <Empty />
          )}
        </article>
        <article className="panel report-cancellations">
          <header>
            <div>
              <h2>Motivos de cancelamento</h2>
              <p>Ocorrências e impacto financeiro</p>
            </div>
            <XCircle />
          </header>
          {data.cancellations.reasons.length ? (
            <ul>
              {data.cancellations.reasons.map((reason) => (
                <li key={reason.reason}>
                  <span>
                    {reason.reason}
                    <small>{reason.count} ocorrências</small>
                  </span>
                  <b>{currency(reason.lostValue)}</b>
                </li>
              ))}
            </ul>
          ) : (
            <Empty />
          )}
        </article>
        <Ranking
          title="Produtos com menor saída"
          icon={<ArrowDownRight />}
          items={data.bottomProducts}
        />
      </div>
      <OrdersTable data={data} />
      <PrintableReport
        data={data}
        filterDescription={filterDescription}
        timeline={timeline}
        paymentRows={paymentRows}
      />
    </>
  );
}

function Kpi({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article>
      {icon}
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
        <em>{detail}</em>
      </span>
    </article>
  );
}
function Ranking({
  title,
  icon,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  items: ReportData["topProducts"];
}) {
  return (
    <article className="panel report-ranking">
      <header>
        <div>
          <h2>{title}</h2>
          <p>Quantidade e faturamento</p>
        </div>
        {icon}
      </header>
      {items.length ? (
        <ol>
          {items.slice(0, 5).map((item, index) => (
            <li key={item.id}>
              <i>{index + 1}</i>
              <span>
                <strong>{item.name}</strong>
                <small>{item.quantity} unidades</small>
              </span>
              <b>{currency(item.revenue)}</b>
            </li>
          ))}
        </ol>
      ) : (
        <Empty />
      )}
    </article>
  );
}
function Empty() {
  return (
    <div className="report-empty">
      <Search />
      <span>Sem dados no período.</span>
    </div>
  );
}
function OrdersTable({ data }: { data: ReportData }) {
  return (
    <article className="panel report-orders">
      <header>
        <div>
          <h2>Detalhamento de pedidos</h2>
          <p>{data.orders.length} registros no recorte atual</p>
        </div>
      </header>
      {data.orders.length ? (
        <div className="report-order-table">
          <div>
            <span>Pedido</span>
            <span>Data</span>
            <span>Cliente</span>
            <span>Tipo</span>
            <span>Pagamento</span>
            <span>Total</span>
            <span>Status</span>
          </div>
          {data.orders.map((order) => (
            <div key={order.id}>
              <span>#{order.displayNumber}</span>
              <span>
                {new Date(order.createdAt).toLocaleDateString("pt-BR")}
              </span>
              <span>{order.customerName}</span>
              <span>
                {order.fulfillmentType === "DELIVERY" ? "Delivery" : "Retirada"}
              </span>
              <span>
                {payment[order.paymentMethod ?? ""] ?? "Não informado"}
              </span>
              <span>{currency(order.total)}</span>
              <span
                className={`order-status status-${order.status.toLowerCase()}`}
              >
                {ORDER_STATUS_LABEL[order.status]}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <Empty />
      )}
    </article>
  );
}
function PrintableReport({
  data,
  filterDescription,
  timeline,
  paymentRows,
}: {
  data: ReportData;
  filterDescription: string;
  timeline: Array<{ date: string; revenue: number; orders: number }>;
  paymentRows: Array<[string, number]>;
}) {
  return (
    <section className="report-print-sheet">
      <header>
        <img src="/images/borda-dourada.png" alt="UrFood" />
        <div>
          <span>RELATÓRIO EXECUTIVO</span>
          <h1>Desempenho comercial</h1>
          <p>{filterDescription}</p>
        </div>
        <small>
          Gerado em
          <br />
          <b>{new Date().toLocaleString("pt-BR")}</b>
        </small>
      </header>
      <div className="print-kpis">
        <div>
          <span>Faturamento</span>
          <b>{currency(data.sales.revenue)}</b>
        </div>
        <div>
          <span>Pedidos</span>
          <b>{data.sales.orders}</b>
        </div>
        <div>
          <span>Ticket médio</span>
          <b>{currency(data.sales.averageTicket)}</b>
        </div>
        <div>
          <span>Cancelamentos</span>
          <b>{currency(data.cancellations.lostValue)}</b>
        </div>
      </div>
      <section>
        <h2>Resumo da operação</h2>
        <div className="print-summary">
          <p>
            <span>Delivery</span>
            <b>{data.sales.delivery} pedidos</b>
          </p>
          <p>
            <span>Retirada</span>
            <b>{data.sales.pickup} pedidos</b>
          </p>
          <p>
            <span>Dias com venda</span>
            <b>{timeline.length}</b>
          </p>
          <p>
            <span>Clientes no ranking</span>
            <b>{data.topCustomers.length}</b>
          </p>
        </div>
      </section>
      <div className="print-columns">
        <section>
          <h2>Produtos mais vendidos</h2>
          {data.topProducts.slice(0, 8).map((item, index) => (
            <p key={item.id}>
              <i>{index + 1}</i>
              <span>
                {item.name}
                <small>{item.quantity} unidades</small>
              </span>
              <b>{currency(item.revenue)}</b>
            </p>
          ))}
        </section>
        <section>
          <h2>Formas de pagamento</h2>
          {paymentRows.map(([name, value]) => (
            <p key={name}>
              <span>{name}</span>
              <b>{currency(value)}</b>
            </p>
          ))}
          <h2 className="print-subtitle">Clientes de maior valor</h2>
          {data.topCustomers.slice(0, 5).map((customer) => (
            <p key={customer.phone}>
              <span>
                {customer.name}
                <small>{customer.orders} pedidos</small>
              </span>
              <b>{currency(customer.totalSpent)}</b>
            </p>
          ))}
        </section>
      </div>
      <section className="print-orders">
        <h2>Pedidos do período</h2>
        <table>
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Data</th>
              <th>Cliente</th>
              <th>Pagamento</th>
              <th>Total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.orders.map((order) => (
              <tr key={order.id}>
                <td>#{order.displayNumber}</td>
                <td>{new Date(order.createdAt).toLocaleDateString("pt-BR")}</td>
                <td>{order.customerName}</td>
                <td>{payment[order.paymentMethod ?? ""] ?? "Não informado"}</td>
                <td>{currency(order.total)}</td>
                <td>{ORDER_STATUS_LABEL[order.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <footer>
        UrFood · Relatório gerado automaticamente a partir dos dados
        operacionais
      </footer>
    </section>
  );
}
