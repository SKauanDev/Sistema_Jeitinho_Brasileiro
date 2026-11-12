import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  BarChart3,
  Boxes,
  CheckCircle2,
  Edit3,
  FolderPlus,
  History,
  Link2,
  LoaderCircle,
  Package,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { inventoryApi } from "../../services/inventory-api";
import { createAdminSocket } from "../../services/realtime";
import type {
  InventoryData,
  InventoryItem,
  InventoryMovement,
} from "../../types/inventory";

const quantity = (value: string | number) =>
  Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const currency = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const unitMeta: Record<
  string,
  { label: string; short: string; step: number; decimals: number }
> = {
  un: { label: "unidades", short: "un", step: 1, decimals: 0 },
  kg: { label: "quilogramas", short: "kg", step: 0.001, decimals: 3 },
  g: { label: "gramas", short: "g", step: 1, decimals: 0 },
  l: { label: "litros", short: "L", step: 0.001, decimals: 3 },
  ml: { label: "mililitros", short: "ml", step: 1, decimals: 0 },
  cx: { label: "caixas", short: "cx", step: 1, decimals: 0 },
  pct: { label: "pacotes", short: "pct", step: 1, decimals: 0 },
};
const unitOf = (unit: string) =>
  unitMeta[unit] ?? { label: unit, short: unit, step: 0.001, decimals: 3 };
const formattedStock = (value: string | number, unit: string) =>
  `${Number(value).toLocaleString("pt-BR", { maximumFractionDigits: unitOf(unit).decimals })} ${unitOf(unit).short}`;
const statusOf = (item: InventoryItem) => {
  const current = Number(item.currentStock);
  const minimum = Number(item.minimumStock);
  if (current <= 0) return "out";
  if (minimum > 0 && current <= minimum * 0.5) return "critical";
  if (minimum > 0 && current <= minimum) return "low";
  return "ok";
};
const shortageOf = (item: InventoryItem) =>
  Math.max(Number(item.minimumStock) - Number(item.currentStock), 0);
const levelOf = (item: InventoryItem) =>
  Number(item.minimumStock) > 0
    ? Math.min(
        (Number(item.currentStock) / Number(item.minimumStock)) * 100,
        100,
      )
    : 100;

export function InventoryModule() {
  const [removingIds, setRemovingIds] = useState<string[]>([]);
  const [data, setData] = useState<InventoryData | null>(null);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [recentMovements, setRecentMovements] = useState<InventoryMovement[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [itemDialog, setItemDialog] = useState<InventoryItem | "new" | null>(
    null,
  );
  const [movementItem, setMovementItem] = useState<InventoryItem | null>(null);
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [summaryDialog, setSummaryDialog] = useState<"all" | "restock" | "out" | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const load = async () => {
    setError("");
    try {
      const [inventory, recent] = await Promise.all([inventoryApi.list(), inventoryApi.movements()]);
      setData(inventory);
      setRecentMovements(recent);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Falha ao carregar estoque.",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    const socket = createAdminSocket();
    const refresh = () => void load();
    socket.on("order:new", refresh);
    socket.on("order:updated", refresh);
    return () => { socket.off("order:new", refresh); socket.off("order:updated", refresh); socket.disconnect(); };
  }, []);
  const items = useMemo(
    () =>
      (data?.items ?? []).filter(
        (item) =>
          !!selectedCategory &&
          item.category === selectedCategory &&
          `${item.name} ${item.category}`
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          (filter === "all" || statusOf(item) === filter),
      ),
    [data, query, filter, selectedCategory],
  );
  const allItems = data?.items ?? [];
  const normalItems = allItems.filter((item) => statusOf(item) === "ok");
  const alertItems = allItems.filter((item) => statusOf(item) !== "ok");
  const linkedItems = allItems.filter((item) => item.productId);
  const configuredItems = allItems.filter((item) => Number(item.minimumStock) > 0);
  const healthScore = allItems.length ? Math.round((normalItems.length / allItems.length) * 100) : 100;
  const priorityItems = [...alertItems].sort((a, b) => {
    const weight = { out: 0, critical: 1, low: 2, ok: 3 };
    return weight[statusOf(a)] - weight[statusOf(b)] || shortageOf(b) - shortageOf(a);
  }).slice(0, 5);
  async function openHistory(item: InventoryItem) {
    setHistoryItem(item);
    try {
      setMovements(await inventoryApi.movements(item.id));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Falha ao carregar histórico.",
      );
    }
  }
  if (loading)
    return (
      <div className="admin-state">
        <LoaderCircle className="spinner" />
        <h2>Carregando estoque...</h2>
      </div>
    );
  return (
    <div className="admin-module inventory-module-pro">
      <div className="module-title">
        <div>
          <span>OPERAÇÃO</span>
          <h1>Estoque</h1>
          <p>Visão operacional, reposição e baixas automáticas integradas ao cardápio.</p>
        </div>
        <div className="inventory-title-actions">
          <button
            className="secondary-admin"
            onClick={async () => {
              const name = window.prompt("Nome da nova categoria:")?.trim();
              if (!name) return;
              try {
                await inventoryApi.createCategory(name);
                await load();
              } catch (reason) {
                setError(
                  reason instanceof Error
                    ? reason.message
                    : "Falha ao criar categoria.",
                );
              }
            }}
          >
            <FolderPlus /> Nova categoria
          </button>
          <button
            className="primary-admin"
            onClick={() => setItemDialog("new")}
          >
            <Plus /> Novo item
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
      <section className="inventory-command-bar">
        <div className="inventory-health-score">
          <i style={{ "--health": `${healthScore * 3.6}deg` } as React.CSSProperties}><span>{healthScore}%</span></i>
          <span><small>SAÚDE DO ESTOQUE</small><strong>{healthScore >= 80 ? "Operação saudável" : healthScore >= 50 ? "Atenção necessária" : "Reposição urgente"}</strong><em>{normalItems.length} de {allItems.length} itens em nível normal</em></span>
        </div>
        <div className="inventory-command-stat"><Link2 /><span><small>INTEGRADOS AO CARDÁPIO</small><strong>{linkedItems.length} produtos</strong><em>Baixa automática por pedido</em></span></div>
        <div className="inventory-command-stat"><BarChart3 /><span><small>LIMITES CONFIGURADOS</small><strong>{configuredItems.length} de {allItems.length}</strong><em>{allItems.length - configuredItems.length} aguardam limite mínimo</em></span></div>
        <button title="Atualizar dados" onClick={() => void load()}><RefreshCw /> Atualizar</button>
      </section>
      <div className="inventory-summary">
        <button type="button" onClick={() => setSummaryDialog("all")}>
          <Package />
          <div>
            <span>Itens cadastrados</span>
            <strong>{data?.summary.items ?? 0}</strong>
          </div>
        </button>
        <button type="button" className={(data?.items ?? []).some((item) => Number(item.currentStock) <= Number(item.minimumStock)) ? "has-alert" : ""} onClick={() => setSummaryDialog("restock")}>
          <AlertTriangle />
          <div>
            <span>Precisam de reposição</span>
            <strong>
              {
                (data?.items ?? []).filter((item) => statusOf(item) !== "ok")
                  .length
              }{" "}
              itens
            </strong>
          </div>
        </button>
        <button type="button" className={(data?.items ?? []).some((item) => Number(item.currentStock) <= 0) ? "has-alert" : ""} onClick={() => setSummaryDialog("out")}>
          <AlertCircle />
          <div>
            <span>Sem estoque</span>
            <strong>
              {
                (data?.items ?? []).filter((item) => statusOf(item) === "out")
                  .length
              }{" "}
              itens
            </strong>
          </div>
        </button>
        <article>
          <Wallet />
          <div>
            <span>Valor estimado</span>
            <strong>{currency(data?.summary.totalValue ?? 0)}</strong>
          </div>
        </article>
      </div>
      <section className="inventory-master-filter">
        <div><span>CONTROLE OPERACIONAL</span><h2>Localize e analise seus itens</h2></div>
        <label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome ou categoria" /></label>
        <label><SlidersHorizontal /><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">Todas as situações</option><option value="ok">Estoque normal</option><option value="low">Estoque baixo</option><option value="critical">Crítico</option><option value="out">Sem estoque</option></select></label>
      </section>
      <section className="inventory-categories">
        <header>
          <div>
            <span>CATEGORIAS</span>
            <h2>Organização do estoque</h2>
          </div>
          {selectedCategory && (
            <button onClick={() => setSelectedCategory("")}>
              Ver categorias
            </button>
          )}
        </header>
        <div>
          {(data?.categories ?? []).map((category) => {
            const categoryItems = (data?.items ?? []).filter(
              (item) => item.category === category.name,
            );
            const alerts = categoryItems.filter(
              (item) => statusOf(item) !== "ok",
            ).length;
            const categoryValue = categoryItems.reduce((sum, item) => sum + Number(item.currentStock) * Number(item.unitCost), 0);
            const categoryHealth = categoryItems.length ? Math.round((categoryItems.length - alerts) / categoryItems.length * 100) : 100;
            return (
              <button
                className={selectedCategory === category.name ? "active" : ""}
                key={category.id}
                onClick={() => setSelectedCategory(category.name)}
              >
                <i>
                  <Boxes />
                </i>
                <span>
                  <strong>{category.name}</strong>
                  <small>
                    {categoryItems.length}{" "}
                    {categoryItems.length === 1 ? "item" : "itens"}
                  </small>
                  <em>{currency(categoryValue)}</em>
                </span>
                {alerts > 0 && (
                  <b>
                    {alerts} alerta{alerts > 1 ? "s" : ""}
                  </b>
                )}
                <span className="category-health"><i><b style={{ width: `${categoryHealth}%` }} /></i><small>{categoryHealth}% normal</small></span>
              </button>
            );
          })}
        </div>
      </section>
      {selectedCategory && (
        <article className="panel inventory-category-items">
          <header>
            <div>
              <h2>{selectedCategory}</h2>
              <p>Posição atual, criticidade e última alteração dos itens</p>
            </div>
            <div className="inventory-category-kpis"><span><b>{items.length}</b> exibidos</span><span className="warning"><b>{items.filter(item => statusOf(item) !== "ok").length}</b> alertas</span><span><b>{currency(items.reduce((sum,item) => sum + Number(item.currentStock) * Number(item.unitCost),0))}</b> em estoque</span></div>
          </header>
          <div className="category-item-head">
            <span>Item</span>
            <span>Saldo</span>
            <span>Mínimo</span>
            <span>Situação</span>
            <span>Última edição</span>
            <span>Ações</span>
          </div>
          {items.map((item) => (
            <div className={`category-item-row ${Number(item.currentStock) <= Number(item.minimumStock) ? "stock-alert-row" : ""}`} key={item.id}>
              <span>
                <strong>{item.name}</strong>
                <small>
                  {currency(Number(item.unitCost))} / {unitOf(item.unit).short}
                </small>
                {item.productId && <em className="catalog-linked"><Link2 /> Cardápio</em>}
              </span>
              <b>{formattedStock(item.currentStock, item.unit)}</b>
              <span>{formattedStock(item.minimumStock, item.unit)}</span>
              <span><i className={`stock-pill stock-${statusOf(item)}`}>{statusOf(item) === "out" ? "Sem estoque" : statusOf(item) === "critical" ? "Crítico" : statusOf(item) === "low" ? "Estoque baixo" : "Normal"}</i></span>
              <time>{new Date(item.updatedAt).toLocaleString("pt-BR")}</time>
              <span className="inventory-actions">
                <button
                  title="Editar / repor mercadoria"
                  onClick={() => setMovementItem(item)}
                >
                  <Edit3 />
                </button>
                <button
                  title="Editar cadastro"
                  onClick={() => setItemDialog(item)}
                >
                  <SlidersHorizontal />
                </button>
                <button
                  title="Histórico"
                  onClick={() => void openHistory(item)}
                >
                  <History />
                </button>
                <button
                  className="delete"
                  title="Excluir item"
                  aria-label={`Excluir ${item.name}`}
                  disabled={removingIds.includes(item.id)}
                  onClick={async () => {
                    if (!window.confirm(`Excluir ${item.name} do estoque?`))
                      return;
                    setError("");
                    setRemovingIds(current => [...current, item.id]);
                    try {
                      await inventoryApi.removeItem(item.id);
                      await load();
                    } catch (reason) {
                      setError(
                        reason instanceof Error
                          ? reason.message
                          : "Falha ao excluir item.",
                      );
                    } finally {
                      setRemovingIds(current => current.filter(id => id !== item.id));
                    }
                  }}
                >
                  {removingIds.includes(item.id) ? <LoaderCircle className="spinner" /> : <Trash2 />}
                </button>
              </span>
            </div>
          ))}
          {!items.length && (
            <div className="inventory-empty">
              <Package />
              <h3>Nenhum item nesta categoria</h3>
              <p>Cadastre um item e vincule-o a {selectedCategory}.</p>
            </div>
          )}
        </article>
      )}
      <article className="panel inventory-panel">
        <header>
          <div>
            <h2>Posição atual</h2>
            <p>Limites e necessidades de compra por unidade de medida</p>
          </div>
          <div className="inventory-tools">
            <label>
              <Search />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar item"
              />
            </label>
            <label className="inventory-filter">
              <SlidersHorizontal />
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                <option value="all">Todos</option>
                <option value="ok">Normal</option>
                <option value="low">Estoque baixo</option>
                <option value="critical">Crítico</option>
                <option value="out">Sem estoque</option>
              </select>
            </label>
          </div>
        </header>
        <div className="inventory-real-table">
          <div className="inventory-real-head">
            <span>Item</span>
            <span>Categoria</span>
            <span>Saldo</span>
            <span>Mínimo</span>
            <span>Nível / reposição</span>
            <span>Situação</span>
            <span>Ações</span>
          </div>
          {items.map((item) => {
            const status = statusOf(item);
            const shortage = shortageOf(item);
            const minimum = Number(item.minimumStock);
            return (
              <div key={item.id}>
                <span>
                  <strong>{item.name}</strong>
                  <small>
                    {currency(Number(item.unitCost))} /{" "}
                    {unitOf(item.unit).short}
                  </small>
                </span>
                <span>{item.category}</span>
                <span>
                  <strong>
                    {formattedStock(item.currentStock, item.unit)}
                  </strong>
                </span>
                <span>{formattedStock(item.minimumStock, item.unit)}</span>
                <span className="stock-level">
                  <i>
                    <b
                      className={`stock-level-${status}`}
                      style={{ width: `${levelOf(item)}%` }}
                    />
                  </i>
                  <small>
                    {shortage > 0
                      ? `Faltam ${formattedStock(shortage, item.unit)}`
                      : minimum > 0
                        ? `${formattedStock(Number(item.currentStock) - minimum, item.unit)} acima do mínimo`
                        : "Sem limite definido"}
                  </small>
                </span>
                <span>
                  <i className={`stock-pill stock-${status}`}>
                    {status === "out"
                      ? "Sem estoque"
                      : status === "critical"
                        ? "Crítico"
                        : status === "low"
                          ? "Estoque baixo"
                          : "Normal"}
                  </i>
                </span>
                <span className="inventory-actions">
                  <button
                    title="Movimentar"
                    onClick={() => setMovementItem(item)}
                  >
                    <ArrowDownToLine />
                  </button>
                  <button
                    title="Histórico"
                    onClick={() => void openHistory(item)}
                  >
                    <History />
                  </button>
                  <button title="Editar" onClick={() => setItemDialog(item)}>
                    <Edit3 />
                  </button>
                </span>
              </div>
            );
          })}
        </div>
        {!items.length && (
          <div className="inventory-empty">
            <Package />
            <h3>Nenhum item encontrado</h3>
            <p>Cadastre o primeiro insumo para começar o controle.</p>
          </div>
        )}
      </article>
      <section className="inventory-intelligence-grid">
        <article className="panel inventory-priority-panel"><header><div><span>PLANO DE AÇÃO</span><h2>Reposição prioritária</h2><p>Itens ordenados pelo maior risco operacional</p></div><AlertTriangle /></header><div>{priorityItems.length ? priorityItems.map(item => <button key={item.id} onClick={() => setMovementItem(item)}><i className={`priority-${statusOf(item)}`}><Package /></i><span><strong>{item.name}</strong><small>{item.category} · mínimo {formattedStock(item.minimumStock,item.unit)}</small></span><b>{formattedStock(item.currentStock,item.unit)}<small>{shortageOf(item) > 0 ? `faltam ${formattedStock(shortageOf(item),item.unit)}` : "defina o limite"}</small></b><Plus /></button>) : <div className="inventory-success-state"><CheckCircle2 /><strong>Estoque saudável</strong><span>Nenhum item exige reposição agora.</span></div>}</div></article>
        <article className="panel inventory-activity-panel"><header><div><span>RASTREABILIDADE</span><h2>Movimentações recentes</h2><p>Últimas entradas, saídas e ajustes realizados</p></div><History /></header><div>{recentMovements.slice(0,6).map(movement => <article key={movement.id}><i className={movement.type.toLowerCase()}>{movement.type === "IN" ? <ArrowDownToLine /> : movement.type === "OUT" ? <ArrowUpFromLine /> : <SlidersHorizontal />}</i><span><strong>{movement.item?.name ?? "Item do estoque"}</strong><small>{movement.reason} · {new Date(movement.createdAt).toLocaleString("pt-BR")}</small></span><b className={movement.type === "OUT" ? "negative" : movement.type === "IN" ? "positive" : ""}>{movement.type === "OUT" ? "−" : movement.type === "IN" ? "+" : "="} {quantity(movement.quantity)} {movement.item ? unitOf(movement.item.unit).short : ""}</b></article>)}{!recentMovements.length && <div className="inventory-success-state"><History /><strong>Sem movimentações</strong><span>As operações aparecerão aqui.</span></div>}</div></article>
      </section>
      {summaryDialog && <StockSummaryDialog mode={summaryDialog} items={(data?.items ?? []).filter((item) => summaryDialog === "all" ? true : summaryDialog === "out" ? Number(item.currentStock) <= 0 : Number(item.currentStock) <= Number(item.minimumStock))} onClose={() => setSummaryDialog(null)} onEdit={(item) => { setSummaryDialog(null); setMovementItem(item); }} />}
      {itemDialog && (
        <ItemDialog
          item={itemDialog === "new" ? null : itemDialog}
          categories={(data?.categories ?? []).map((category) => category.name)}
          defaultCategory={selectedCategory}
          saving={saving}
          onClose={() => setItemDialog(null)}
          onSave={async (input) => {
            setSaving(true);
            try {
              if (itemDialog === "new") await inventoryApi.createItem(input);
              else await inventoryApi.updateItem(itemDialog.id, input);
              setItemDialog(null);
              await load();
            } catch (reason) {
              setError(
                reason instanceof Error
                  ? reason.message
                  : "Falha ao salvar item.",
              );
            } finally {
              setSaving(false);
            }
          }}
        />
      )}
      {movementItem && (
        <MovementDialog
          item={movementItem}
          saving={saving}
          onClose={() => setMovementItem(null)}
          onSave={async (input) => {
            setSaving(true);
            try {
              await inventoryApi.move(movementItem.id, input);
              setMovementItem(null);
              await load();
            } catch (reason) {
              setError(
                reason instanceof Error
                  ? reason.message
                  : "Falha ao movimentar estoque.",
              );
            } finally {
              setSaving(false);
            }
          }}
        />
      )}
      {historyItem && (
        <HistoryDrawer
          item={historyItem}
          movements={movements}
          onClose={() => setHistoryItem(null)}
        />
      )}
    </div>
  );
}

function StockSummaryDialog({ mode, items, onClose, onEdit }: { mode: "all" | "restock" | "out"; items: InventoryItem[]; onClose: () => void; onEdit: (item: InventoryItem) => void }) {
  const titles = { all: "Itens cadastrados", restock: "Itens para reposição", out: "Itens sem estoque" };
  return <div className="inventory-dialog-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="inventory-dialog stock-summary-dialog"><header><div><span>ESTOQUE</span><h2>{titles[mode]}</h2><p>{items.length} {items.length === 1 ? "item encontrado" : "itens encontrados"}</p></div><button onClick={onClose}><X /></button></header><div className="stock-summary-scroll">{items.length ? items.map((item) => { const alert = Number(item.currentStock) <= Number(item.minimumStock); return <article className={alert ? "stock-alert-row" : ""} key={item.id}><i><Package /></i><span><strong>{item.name}</strong><small>{item.category} · mínimo {formattedStock(item.minimumStock,item.unit)}</small><em>Atualizado em {new Date(item.updatedAt).toLocaleString("pt-BR")}</em></span><b>{formattedStock(item.currentStock,item.unit)}</b><button onClick={() => onEdit(item)}><Edit3 /> Repor</button></article>; }) : <div className="inventory-empty"><Package /><h3>Nenhum item nesta situação</h3></div>}</div></section></div>;
}

function ItemDialog({
  item,
  categories,
  defaultCategory,
  saving,
  onClose,
  onSave,
}: {
  item: InventoryItem | null;
  categories: string[];
  defaultCategory: string;
  saving: boolean;
  onClose: () => void;
  onSave: (input: {
    name: string;
    category: string;
    unit: string;
    currentStock: number;
    minimumStock: number;
    unitCost: number;
  }) => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: item?.name ?? "",
    category: item?.category ?? (defaultCategory || categories[0] || ""),
    unit: item?.unit ?? "un",
    currentStock: Number(item?.currentStock ?? 0),
    minimumStock: Number(item?.minimumStock ?? 0),
    unitCost: Number(item?.unitCost ?? 0),
  });
  const unit = unitOf(form.unit);
  return (
    <Dialog
      title={item ? "Editar item" : "Novo item de estoque"}
      onClose={onClose}
    >
      <form
        className="inventory-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave(form);
        }}
      >
        <label>
          Nome
          <input
            required
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </label>
        <label>
          Categoria
          <select
            required
            value={form.category}
            onChange={(event) =>
              setForm({ ...form, category: event.target.value })
            }
          >
            <option value="" disabled>Selecione uma categoria</option>
            {categories.map((category) => <option value={category} key={category}>{category}</option>)}
          </select>
        </label>
        <label>
          Unidade de controle
          <select
            value={form.unit}
            onChange={(event) => setForm({ ...form, unit: event.target.value })}
          >
            <option value="un">Unidade (un)</option>
            <option value="kg">Quilograma (kg)</option>
            <option value="g">Grama (g)</option>
            <option value="l">Litro (L)</option>
            <option value="ml">Mililitro (ml)</option>
            <option value="cx">Caixa (cx)</option>
            <option value="pct">Pacote (pct)</option>
          </select>
        </label>
        {!item && (
          <label>
            Saldo inicial ({unit.short})
            <input
              min="0"
              step={unit.step}
              type="number"
              value={form.currentStock || ""}
              placeholder={`Ex.: 10 ${unit.short}`}
              onChange={(event) =>
                setForm({ ...form, currentStock: Number(event.target.value) })
              }
            />
          </label>
        )}
        <label>
          Limite mínimo ({unit.short})
          <input
            min="0"
            step={unit.step}
            type="number"
            value={form.minimumStock || ""}
            placeholder={`Ex.: 5 ${unit.short}`}
            onChange={(event) =>
              setForm({ ...form, minimumStock: Number(event.target.value) })
            }
          />
          <small>O item entra em alerta quando atingir este limite.</small>
        </label>
        <label>
          Custo por {unit.label}
          <div className="currency-input"><span>R$</span><input min="0" step="0.01" type="number" value={form.unitCost || ""} placeholder="0,00" onChange={(event) => setForm({ ...form, unitCost: Number(event.target.value) })} /></div>
        </label>
        <footer>
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="save" disabled={saving}>
            {saving && <LoaderCircle className="spinner" />} Salvar
          </button>
        </footer>
      </form>
    </Dialog>
  );
}

function MovementDialog({
  item,
  saving,
  onClose,
  onSave,
}: {
  item: InventoryItem;
  saving: boolean;
  onClose: () => void;
  onSave: (input: {
    type: "IN" | "OUT" | "ADJUST";
    quantity: number;
    reason: string;
    notes: string;
  }) => Promise<void>;
}) {
  const [type, setType] = useState<"IN" | "OUT" | "ADJUST">("IN");
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const unit = unitOf(item.unit);
  const projected =
    type === "IN"
      ? Number(item.currentStock) + amount
      : type === "OUT"
        ? Number(item.currentStock) - amount
        : amount;
  const invalid = amount <= 0 || projected < 0;
  return (
    <Dialog title={`Movimentar · ${item.name}`} onClose={onClose}>
      <form
        className="inventory-form movement-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!invalid) void onSave({ type, quantity: amount, reason, notes });
        }}
      >
        <div className="movement-types">
          <button
            type="button"
            className={type === "IN" ? "active" : ""}
            onClick={() => setType("IN")}
          >
            <ArrowDownToLine /> Entrada
          </button>
          <button
            type="button"
            className={type === "OUT" ? "active" : ""}
            onClick={() => setType("OUT")}
          >
            <ArrowUpFromLine /> Saída
          </button>
          <button
            type="button"
            className={type === "ADJUST" ? "active" : ""}
            onClick={() => setType("ADJUST")}
          >
            <SlidersHorizontal /> Ajuste
          </button>
        </div>
        <div className="movement-balance">
          <span>
            Saldo atual
            <strong>{formattedStock(item.currentStock, item.unit)}</strong>
          </span>
          <span>
            Saldo após movimento
            <strong
              className={projected < Number(item.minimumStock) ? "warning" : ""}
            >
              {formattedStock(Math.max(projected, 0), item.unit)}
            </strong>
          </span>
        </div>
        <label>
          {type === "ADJUST"
            ? `Novo saldo (${unit.short})`
            : `Quantidade (${unit.short})`}
          <input
            required
            min={type === "ADJUST" ? 0 : unit.step}
            step={unit.step}
            type="number"
            value={amount || ""}
            placeholder={`Ex.: ${unit.decimals ? unit.step : 1} ${unit.short}`}
            onChange={(event) => setAmount(Number(event.target.value))}
          />
          {projected < 0 && (
            <small className="field-error">
              A saída é maior que o saldo disponível.
            </small>
          )}
        </label>
        <label>
          Motivo
          <input
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Compra, perda, contagem..."
          />
        </label>
        <label className="full">
          Observação
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
        <footer>
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="save" disabled={saving || !reason || invalid}>
            {saving && <LoaderCircle className="spinner" />} Confirmar
            movimentação
          </button>
        </footer>
      </form>
    </Dialog>
  );
}

function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="inventory-dialog-overlay"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="inventory-dialog">
        <header>
          <h2>{title}</h2>
          <button onClick={onClose}>
            <X />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
function HistoryDrawer({
  item,
  movements,
  onClose,
}: {
  item: InventoryItem;
  movements: InventoryMovement[];
  onClose: () => void;
}) {
  return (
    <div className="order-detail-overlay">
      <aside className="order-detail inventory-history">
        <header>
          <div>
            <span>HISTÓRICO</span>
            <h2>{item.name}</h2>
          </div>
          <button onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="order-detail-scroll">
          {movements.length ? (
            movements.map((movement) => (
              <article key={movement.id}>
                <i className={movement.type.toLowerCase()}>
                  {movement.type === "IN" ? (
                    <ArrowDownToLine />
                  ) : movement.type === "OUT" ? (
                    <ArrowUpFromLine />
                  ) : (
                    <SlidersHorizontal />
                  )}
                </i>
                <span>
                  <strong>{movement.reason}</strong>
                  <small>
                    {new Date(movement.createdAt).toLocaleString("pt-BR")} ·{" "}
                    {movement.createdBy ?? "Sistema"}
                  </small>
                  <em>
                    {quantity(movement.previousStock)} →{" "}
                    {quantity(movement.resultingStock)} {item.unit}
                  </em>
                  {movement.notes && <p>{movement.notes}</p>}
                </span>
                <b>
                  {movement.type === "IN"
                    ? "+"
                    : movement.type === "OUT"
                      ? "−"
                      : ""}
                  {quantity(Math.abs(Number(movement.quantity)))}
                </b>
              </article>
            ))
          ) : (
            <div className="panel-empty">
              <History />
              <p>Nenhuma movimentação registrada.</p>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
