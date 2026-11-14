import { FinanceOperationalDetails } from "./FinanceOperationalDetails";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  SlidersHorizontal,
  UtensilsCrossed,
  CircleDollarSign,
  LoaderCircle,
  Plus,
  ReceiptText,
  ShoppingBag,
  Ticket,
  Truck,
  X,
} from "lucide-react";
import { financeApi } from "../../services/finance-api";
import type { FinanceData } from "../../types/finance";
const dateValue = (date: Date) => {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
};
const currentMonthRange = () => {
  const today = new Date();
  return {
    start: dateValue(new Date(today.getFullYear(), today.getMonth(), 1)),
    end: dateValue(today),
  };
};
const currency = (value: number | string) =>
  Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export function FinanceModule() {
  const initialRange = currentMonthRange();
  const [startDate, setStartDate] = useState(initialRange.start);
  const [endDate, setEndDate] = useState(initialRange.end);
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState(false);
  const [customRangeOpen, setCustomRangeOpen] = useState(false);
  const requestSequence = useRef(0);
  const [saving, setSaving] = useState(false);
  function selectMonth(value: string) {
    if (!/^\d{4}-\d{2}$/.test(value)) return;
    const [year, month] = value.split("-").map(Number);
    setStartDate(`${value}-01`);
    setEndDate(value === dateValue(new Date()).slice(0, 7) ? dateValue(new Date()) : dateValue(new Date(year, month, 0)));
    setCustomRangeOpen(false);
  }
  const load = async () => {
    const sequence = ++requestSequence.current;
    if (!startDate || !endDate || startDate > endDate) { setLoading(false); setError("Selecione um intervalo de datas v\u00e1lido."); return; }
    setLoading(true);
    setError("");
    try {
      const result = await financeApi.getRange(startDate, endDate);
      if (sequence === requestSequence.current) setData(result);
    } catch (reason) {
      if (sequence === requestSequence.current) setError(
        reason instanceof Error
          ? reason.message
          : "Falha ao carregar financeiro.",
      );
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [startDate, endDate]);
  if (loading && !data)
    return (
      <div className="admin-state">
        <LoaderCircle className="spinner" />
        <h2>Carregando financeiro...</h2>
      </div>
    );
  if (!data)
    return (
      <div className="admin-state error">
        <AlertCircle />
        <h2>Financeiro indisponível</h2>
        <p>{error}</p>
      </div>
    );
  const maxChart =
    Math.max(...data.chart.flatMap((day) => [day.revenue, day.expenses]), 1) *
    1.12;
  return (
    <div className="admin-module">
      <div className="module-title">
        <div>
          <span>GESTÃO FINANCEIRA</span>
          <h1>Financeiro</h1>
          <p>Vendas concluídas e fluxo de caixa real da operação.</p>
        </div>
        <div className="finance-title-actions">
          <div className="finance-period-control">
            <label className="finance-month-picker"><CalendarDays size={16} /><span className="sr-only">Mês do financeiro</span><input aria-label="Mês do financeiro" type="month" value={startDate.slice(0, 7)} max={dateValue(new Date()).slice(0, 7)} onChange={event => selectMonth(event.target.value)} /></label>
            <button type="button" className="finance-range-toggle" aria-label="Personalizar período" aria-expanded={customRangeOpen} title="Personalizar período" onClick={() => setCustomRangeOpen(value => !value)}><SlidersHorizontal size={16} /></button>
            {customRangeOpen && <div className="finance-range-popover"><label>De<input type="date" value={startDate} max={endDate} onChange={event => setStartDate(event.target.value)} /></label><label>Até<input type="date" value={endDate} min={startDate} max={dateValue(new Date())} onChange={event => setEndDate(event.target.value)} /></label><button type="button" onClick={() => selectMonth(dateValue(new Date()).slice(0, 7))}>Mês atual</button></div>}
          </div>
          <button className="primary-admin" onClick={() => setDialog(true)}>
            <Plus /> Novo lançamento
          </button>
        </div>
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
      <div className="finance-balance">
        <div>
          <span>Saldo do período</span>
          <strong>{currency(data.cashFlow.balance)}</strong>
          <small>Entradas menos saídas registradas</small>
        </div>
        <CircleDollarSign />
      </div>
      <section className="finance-kpis">
        <article>
          <ShoppingBag />
          <span>
            <small>Faturamento</small>
            <strong>{currency(data.kpis.revenue)}</strong>
          </span>
        </article>
        <article>
          <ReceiptText />
          <span>
            <small>Pedidos concluídos</small>
            <strong>{data.kpis.paidOrders}</strong>
          </span>
        </article>
        <article>
          <Ticket />
          <span>
            <small>Ticket médio</small>
            <strong>{currency(data.kpis.averageTicket)}</strong>
          </span>
        </article>
        <article>
          <Truck />
          <span>
            <small>Taxas de entrega</small>
            <strong>{currency(data.kpis.deliveryFees)}</strong>
          </span>
        </article>
        <article>
          <Ticket />
          <span>
            <small>Descontos</small>
            <strong>{currency(data.kpis.discounts)}</strong>

          </span>
        </article>
        <article>
          <AlertCircle />
          <span>
            <small>Cancelamentos</small>
            <strong>{data.kpis.cancellations}</strong>
          </span>
        </article>
        <article><UtensilsCrossed /><span><small>Serviço do garçom</small><strong>{currency(data.kpis.serviceFees ?? 0)}</strong><em>10% nos pedidos que aceitaram</em></span></article>
        <article><ShoppingBag /><span><small>Consumo interno</small><strong>{currency(data.salesChannels?.find(channel => channel.mode === "DINE_IN")?.revenue ?? 0)}</strong><em>Pedidos das mesas</em></span></article>
      </section>
      <FinanceOperationalDetails data={data} />
      <div className="finance-dashboard-grid">
        <article className="panel finance-chart">
          <header>
            <div>
              <h2>Fluxo por dia</h2>
              <p>Receitas e saídas no período</p>
            </div>
            <div>
              <span>
                <i className="income" /> Entradas
              </span>
              <span>
                <i className="outcome" /> Saídas
              </span>
            </div>
          </header>
          {data.chart.length ? (
            <div className="finance-bars">
              {data.chart.map((day) => (
                <div
                  key={day.date}
                  title={`${currency(day.revenue)} em entradas · ${currency(day.expenses)} em saídas`}
                >
                  <span>
                    <i
                      className="income"
                      style={{
                        height: `${Math.max(2, (day.revenue / maxChart) * 100)}%`,
                      }}
                    />
                    <i
                      className="outcome"
                      style={{
                        height: `${Math.max(2, (day.expenses / maxChart) * 100)}%`,
                      }}
                    />
                  </span>
                  <small>
                    {new Date(`${day.date}T12:00:00`).toLocaleDateString(
                      "pt-BR",
                      { day: "2-digit", month: "2-digit" },
                    )}
                  </small>
                </div>
              ))}
            </div>
          ) : (
            <div className="panel-empty">
              <CalendarDays />
              <p>Sem movimentações neste período.</p>
            </div>
          )}
        </article>
        <article className="panel payment-breakdown">
          <header>
            <div>
              <h2>Formas de pagamento</h2>
              <p>Pedidos concluídos</p>
            </div>
          </header>
          {data.payments.length ? (
            <ul>
              {data.payments.map((payment) => (
                <li key={payment.method}>
                  <div>
                    <span>{payment.name}</span>
                    <b>{payment.percentage}%</b>
                  </div>
                  <i>
                    <span style={{ width: `${payment.percentage}%` }} />
                  </i>
                  <strong>{currency(payment.value)}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <div className="panel-empty">
              <ReceiptText />
              <p>Pedidos anteriores ainda não possuem forma de pagamento.</p>
            </div>
          )}
        </article>
      </div>
      <section className="finance-cashflow">
        <article>
          <ArrowUpRight />
          <span>
            <small>Entradas</small>
            <strong>{currency(data.cashFlow.income)}</strong>
            <em>
              Vendas {currency(data.cashFlow.sales)} · ajustes{" "}
              {currency(data.cashFlow.manualIncome)}
            </em>
          </span>
        </article>
        <article>
          <ArrowDownLeft />
          <span>
            <small>Saídas</small>
            <strong>{currency(data.cashFlow.expenses)}</strong>
            <em>Despesas e compras lançadas</em>
          </span>
        </article>
      </section>
      <article className="panel finance-entries">
        <header>
          <div>
            <h2>Lançamentos manuais</h2>
            <p>Despesas, compras e ajustes de caixa</p>
          </div>
        </header>
        {data.entries.length ? (
          <div>
            {data.entries.map((entry) => (
              <article key={entry.id}>
                <i
                  className={
                    entry.type === "IN" ? "income-icon" : "outcome-icon"
                  }
                >
                  {entry.type === "IN" ? <ArrowUpRight /> : <ArrowDownLeft />}
                </i>
                <span>
                  <strong>{entry.description}</strong>
                  <small>
                    {entry.category} ·{" "}
                    {new Date(`${entry.entryDate}T12:00:00`).toLocaleDateString(
                      "pt-BR",
                    )}{" "}
                    · {entry.createdBy ?? "Sistema"}
                  </small>
                </span>
                <b className={entry.type === "IN" ? "positive" : "negative"}>
                  {entry.type === "IN" ? "+" : "−"} {currency(entry.amount)}
                </b>
              </article>
            ))}
          </div>
        ) : (
          <div className="panel-empty">
            <ReceiptText />
            <p>Nenhum lançamento manual no período.</p>
          </div>
        )}
      </article>
      {dialog && (
        <EntryDialog
          saving={saving}
          onClose={() => setDialog(false)}
          onSave={async (input) => {
            setSaving(true);
            try {
              await financeApi.createEntry(input);
              setDialog(false);
              await load();
            } catch (reason) {
              setError(
                reason instanceof Error
                  ? reason.message
                  : "Falha ao salvar lançamento.",
              );
            } finally {
              setSaving(false);
            }
          }}
        />
      )}
    </div>
  );
}
function EntryDialog({
  saving,
  onClose,
  onSave,
}: {
  saving: boolean;
  onClose: () => void;
  onSave: (input: {
    type: "IN" | "OUT";
    category: string;
    description: string;
    amount: number;
    entryDate: string;
    notes: string;
  }) => Promise<void>;
}) {
  const [form, setForm] = useState({
    type: "OUT" as "IN" | "OUT",
    category: "Despesas",
    description: "",
    amount: 0,
    entryDate: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  return (
    <div
      className="inventory-dialog-overlay"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="inventory-dialog">
        <header>
          <h2>Novo lançamento</h2>
          <button onClick={onClose}>
            <X />
          </button>
        </header>
        <form
          className="inventory-form"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void onSave(form);
          }}
        >
          <label>
            Tipo
            <select
              value={form.type}
              onChange={(event) =>
                setForm({ ...form, type: event.target.value as "IN" | "OUT" })
              }
            >
              <option value="OUT">Saída</option>
              <option value="IN">Entrada</option>
            </select>
          </label>
          <label>
            Data
            <input
              required
              type="date"
              value={form.entryDate}
              onChange={(event) =>
                setForm({ ...form, entryDate: event.target.value })
              }
            />
          </label>
          <label>
            Categoria
            <input
              required
              value={form.category}
              onChange={(event) =>
                setForm({ ...form, category: event.target.value })
              }
            />
          </label>
          <label>
            Valor
            <input
              required
              min="0.01"
              step="0.01"
              type="number"
              value={form.amount}
              onChange={(event) =>
                setForm({ ...form, amount: Number(event.target.value) })
              }
            />
          </label>
          <label className="full">
            Descrição
            <input
              required
              value={form.description}
              onChange={(event) =>
                setForm({ ...form, description: event.target.value })
              }
            />
          </label>
          <label className="full">
            Observação
            <textarea
              value={form.notes}
              onChange={(event) =>
                setForm({ ...form, notes: event.target.value })
              }
            />
          </label>
          <footer>
            <button type="button" onClick={onClose}>
              Cancelar
            </button>
            <button className="save" disabled={saving}>
              {saving && <LoaderCircle className="spinner" />} Salvar lançamento
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
