import { useSearchParams } from "react-router-dom";
import "./inventory.css";
import { useEffect, useMemo, useRef, useState } from "react";
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
type StockSection =
  "overview" | "items" | "restock" | "movements" | "categories";
const stockSections = [
  { id: "overview", label: "Visão geral", icon: BarChart3 },
  { id: "items", label: "Itens", icon: Package },
  { id: "restock", label: "Reposição", icon: ArrowDownToLine },
  { id: "movements", label: "Movimentações", icon: History },
  { id: "categories", label: "Categorias", icon: Boxes },
] as const;
const stockStatusLabel = (item: InventoryItem) =>
  ({
    ok: "Normal",
    low: "Estoque baixo",
    critical: "Crítico",
    out: "Sem estoque",
  })[statusOf(item)];

export function InventoryModule() {
  const [params, setParams] = useSearchParams();
  const section: StockSection = stockSections.some(
    (tab) => tab.id === params.get("secao"),
  )
    ? (params.get("secao") as StockSection)
    : "overview";
  const [data, setData] = useState<InventoryData | null>(null);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [recentMovements, setRecentMovements] = useState<InventoryMovement[]>(
    [],
  );
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [selectedCategory, setSelectedCategory] = useState("");
  const [movementType, setMovementType] = useState("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteIds, setDeleteIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [itemDialog, setItemDialog] = useState<InventoryItem | "new" | null>(
    null,
  );
  const [movementItem, setMovementItem] = useState<InventoryItem | null>(null);
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);
  const [categoryDialog, setCategoryDialog] = useState(false),
    [categoryName, setCategoryName] = useState("");
  const [deleteCategory, setDeleteCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true),
    [refreshing, setRefreshing] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const loadSequence = useRef(0);
  const load = async () => {
    const sequence = ++loadSequence.current;
    setRefreshing(true);
    try {
      const [inventory, recent] = await Promise.all([
        inventoryApi.list(),
        inventoryApi.movements(),
      ]);
      if (sequence !== loadSequence.current) return;
      setData(inventory);
      setRecentMovements(recent);
      setSelectedIds((ids) =>
        ids.filter((id) => inventory.items.some((item) => item.id === id)),
      );
    } catch (reason) {
      if (sequence === loadSequence.current)
        setError((reason as Error).message || "Falha ao carregar estoque.");
    } finally {
      if (sequence === loadSequence.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };
  useEffect(() => {
    void load();
    const socket = createAdminSocket();
    const refresh = () => void load();
    socket.on("order:new", refresh);
    socket.on("order:updated", refresh);
    return () => {
      socket.disconnect();
    };
  }, []);
  useEffect(() => {
    setSelectedIds([]);
    setPage(1);
  }, [section, query, filter, selectedCategory]);
  const allItems = data?.items ?? [];
  const categoryNames = [
    ...new Set([
      ...(data?.categories ?? []).map((category) => category.name),
      ...allItems.map((item) => item.category),
    ]),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const alerts = allItems.filter((item) => statusOf(item) !== "ok");
  const priorityItems = [...alerts].sort(
    (a, b) =>
      ({ out: 0, critical: 1, low: 2, ok: 3 })[statusOf(a)] -
        { out: 0, critical: 1, low: 2, ok: 3 }[statusOf(b)] ||
      a.name.localeCompare(b.name, "pt-BR"),
  );
  const items = useMemo(
    () =>
      (data?.items ?? [])
        .filter(
          (item) =>
            (!selectedCategory || item.category === selectedCategory) &&
            `${item.name} ${item.category}`
              .toLocaleLowerCase("pt-BR")
              .includes(query.toLocaleLowerCase("pt-BR")) &&
            (filter === "all" || statusOf(item) === filter) &&
            (section !== "restock" || statusOf(item) !== "ok"),
        )
        .sort((a, b) =>
          section === "restock"
            ? { out: 0, critical: 1, low: 2, ok: 3 }[statusOf(a)] -
                { out: 0, critical: 1, low: 2, ok: 3 }[statusOf(b)] ||
              a.name.localeCompare(b.name, "pt-BR")
            : a.name.localeCompare(b.name, "pt-BR"),
        ),
    [data, query, filter, selectedCategory, section],
  );
  const pageCount = Math.max(1, Math.ceil(items.length / 25)),
    currentPage = Math.min(page, pageCount),
    visibleItems = items.slice((currentPage - 1) * 25, currentPage * 25);
  const allSelected =
    items.length > 0 && items.every((item) => selectedIds.includes(item.id));
  const filteredMovements = recentMovements.filter(
    (movement) =>
      (movementType === "all" || movement.type === movementType) &&
      `${movement.item?.name ?? ""} ${movement.reason} ${movement.createdBy ?? ""}`
        .toLocaleLowerCase("pt-BR")
        .includes(query.toLocaleLowerCase("pt-BR")),
  );
  function navigateSection(next: StockSection, category = "", status = "all") {
    setQuery("");
    setFilter(status);
    setSelectedCategory(category);
    setMovementType("all");
    setSelectedIds([]);
    setPage(1);
    setParams((current) => {
      const nextParams = new URLSearchParams(current);
      nextParams.set("secao", next);
      return nextParams;
    });
  }
  async function openHistory(item: InventoryItem) {
    setError("");
    try {
      const result = await inventoryApi.movements(item.id);
      setMovements(result);
      setHistoryItem(item);
    } catch (reason) {
      setError((reason as Error).message);
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
    <div className="admin-module stock-workspace">
      <div className="module-title">
        <div>
          <span>OPERAÇÃO</span>
          <h1>Estoque</h1>
          <p>Saiba o que tem, o que precisa comprar e o que entrou ou saiu.</p>
        </div>
        <div className="stock-title-actions">
          <button
            className="secondary-admin"
            disabled={refreshing}
            onClick={() => {
              setError("");
              void load();
            }}
            aria-label="Atualizar estoque"
          >
            <RefreshCw size={17} className={refreshing ? "spinner" : ""} />{" "}
            Atualizar
          </button>
          <button
            className="primary-admin"
            onClick={() => setItemDialog("new")}
          >
            <Plus size={18} /> Novo item
          </button>
        </div>
      </div>
      {error && (
        <div className="admin-inline-error" role="alert">
          <AlertCircle />
          {error}
          <button aria-label="Fechar aviso" onClick={() => setError("")}>
            <X />
          </button>
        </div>
      )}
      <nav className="stock-navigation" aria-label="Seções do estoque">
        {stockSections.map((tab) => (
          <button
            key={tab.id}
            aria-current={section === tab.id ? "page" : undefined}
            onClick={() => navigateSection(tab.id)}
          >
            <tab.icon size={18} />
            {tab.label}
            {tab.id === "restock" && alerts.length > 0 && (
              <b>{alerts.length}</b>
            )}
          </button>
        ))}
      </nav>
      {section === "overview" && (
        <>
          <div className="stock-metrics">
            <button onClick={() => navigateSection("items")}>
              <Package />
              <span>
                Itens em estoque<strong>{allItems.length}</strong>
                <small>Ver todos os cadastros</small>
              </span>
            </button>
            <button
              className="stock-metric-alert"
              onClick={() => navigateSection("restock")}
            >
              <AlertTriangle />
              <span>
                Precisam de reposição<strong>{alerts.length}</strong>
                <small>Conferir lista de compras</small>
              </span>
            </button>
            <button onClick={() => navigateSection("restock", "", "out")}>
              <AlertCircle />
              <span>
                Sem estoque
                <strong>
                  {allItems.filter((item) => statusOf(item) === "out").length}
                </strong>
                <small>Prioridade para a operação</small>
              </span>
            </button>
            <article>
              <Wallet />
              <span>
                Valor em estoque
                <strong>{currency(data?.summary.totalValue ?? 0)}</strong>
                <small>Saldo × custo de cada item</small>
              </span>
            </article>
          </div>
          <div className="stock-overview-grid">
            <section className="panel stock-overview-panel">
              <header>
                <div>
                  <h2>O que precisa de atenção</h2>
                  <p>Comece pelos itens que podem faltar na operação.</p>
                </div>
                <button onClick={() => navigateSection("restock")}>
                  Ver reposição
                </button>
              </header>
              <div className="stock-attention-list">
                {priorityItems.slice(0, 5).map((item) => (
                  <button key={item.id} onClick={() => setMovementItem(item)}>
                    <span>
                      <strong>{item.name}</strong>
                      <small>
                        {item.category} · {stockStatusLabel(item)}
                      </small>
                    </span>
                    <b>
                      {formattedStock(item.currentStock, item.unit)}
                      <small>
                        {shortageOf(item) > 0
                          ? `Repor ${formattedStock(shortageOf(item), item.unit)}`
                          : "Defina um mínimo"}
                      </small>
                    </b>
                    <Plus size={18} />
                  </button>
                ))}
                {!priorityItems.length && (
                  <div className="stock-empty">
                    <CheckCircle2 />
                    <h3>Estoque em dia</h3>
                    <p>Nenhum item está abaixo do nível configurado.</p>
                  </div>
                )}
              </div>
            </section>
            <section className="panel stock-overview-panel">
              <header>
                <div>
                  <h2>Últimas movimentações</h2>
                  <p>Entradas, saídas e ajustes mais recentes.</p>
                </div>
                <button onClick={() => navigateSection("movements")}>
                  Ver histórico
                </button>
              </header>
              <div className="stock-recent-list">
                {recentMovements.slice(0, 5).map((movement) => (
                  <article key={movement.id}>
                    <i>
                      {movement.type === "IN" ? (
                        <ArrowDownToLine />
                      ) : movement.type === "OUT" ? (
                        <ArrowUpFromLine />
                      ) : (
                        <SlidersHorizontal />
                      )}
                    </i>
                    <span>
                      <strong>
                        {movement.item?.name ?? "Item do estoque"}
                      </strong>
                      <small>{movement.reason}</small>
                    </span>
                    <b>
                      {movement.type === "OUT"
                        ? "−"
                        : movement.type === "IN"
                          ? "+"
                          : "="}{" "}
                      {quantity(movement.quantity)}{" "}
                      {movement.item ? unitOf(movement.item.unit).short : ""}
                      <small>
                        {new Date(movement.createdAt).toLocaleDateString(
                          "pt-BR",
                        )}
                      </small>
                    </b>
                  </article>
                ))}
                {!recentMovements.length && (
                  <div className="stock-empty">
                    <History />
                    <h3>Nenhuma movimentação</h3>
                    <p>As entradas e saídas aparecerão aqui.</p>
                  </div>
                )}
              </div>
            </section>
          </div>
          <div className="stock-setup-note">
            <Link2 size={18} />
            <p>
              <b>
                {allItems.filter((item) => item.productId).length} itens
                vinculados ao cardápio
              </b>{" "}
              têm baixa automática por pedido.{" "}
              {allItems.filter((item) => Number(item.minimumStock) <= 0).length}{" "}
              itens ainda precisam de um estoque mínimo para orientar a
              reposição.
            </p>
            <button onClick={() => navigateSection("items")}>
              Conferir itens
            </button>
          </div>
        </>
      )}
      {(section === "items" || section === "restock") && (
        <section className="panel stock-items-panel">
          <header className="stock-section-heading">
            <div>
              <h2>
                {section === "restock"
                  ? "Lista de reposição"
                  : "Itens do estoque"}
              </h2>
              <p>
                {section === "restock"
                  ? "Ordenados por urgência. A sugestão completa o estoque mínimo cadastrado."
                  : "Consulte saldos, registre entradas e mantenha os cadastros organizados."}
              </p>
            </div>
            <span>
              {items.length} {items.length === 1 ? "item" : "itens"}
            </span>
          </header>
          <div className="stock-filters">
            <label className="stock-search">
              <Search size={17} />
              <input
                aria-label="Buscar item do estoque"
                placeholder="Buscar item ou categoria"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <label>
              <span>Categoria</span>
              <select
                aria-label="Categoria do estoque"
                value={selectedCategory}
                onChange={(event) => setSelectedCategory(event.target.value)}
              >
                <option value="">Todas as categorias</option>
                {categoryNames.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Situação</span>
              <select
                aria-label="Situação do estoque"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                <option value="all">Todas as situações</option>
                {section !== "restock" && <option value="ok">Normal</option>}
                <option value="low">Estoque baixo</option>
                <option value="critical">Crítico</option>
                <option value="out">Sem estoque</option>
              </select>
            </label>
          </div>
          <div
            className={`stock-selection-bar ${selectedIds.length ? "has-selection" : ""}`}
          >
            <label>
              <input
                type="checkbox"
                aria-label="Selecionar todos os itens filtrados"
                checked={allSelected}
                disabled={!items.length || saving}
                ref={(element) => {
                  if (element)
                    element.indeterminate =
                      selectedIds.length > 0 && !allSelected;
                }}
                onChange={(event) =>
                  setSelectedIds(
                    event.target.checked ? items.map((item) => item.id) : [],
                  )
                }
              />
              <span>
                {selectedIds.length
                  ? `${selectedIds.length} selecionado(s)`
                  : "Selecionar todos os resultados"}
              </span>
            </label>
            {selectedIds.length > 0 ? (
              <div>
                <button disabled={saving} onClick={() => setSelectedIds([])}>
                  Limpar seleção
                </button>
                <button
                  className="stock-delete-action"
                  disabled={saving}
                  onClick={() => {
                    setError("");
                    setDeleteIds(selectedIds);
                  }}
                >
                  <Trash2 size={16} /> Excluir selecionados
                </button>
              </div>
            ) : (
              <small>A seleção inclui todas as páginas do filtro atual.</small>
            )}
          </div>
          <div className="stock-table-scroll">
            <table className="stock-table">
              <thead>
                <tr>
                  <th>
                    <span className="sr-only">Seleção</span>
                  </th>
                  <th>Item</th>
                  <th>Saldo / mínimo</th>
                  <th>
                    {section === "restock"
                      ? "Reposição sugerida"
                      : "Custo unitário"}
                  </th>
                  <th>Situação</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item) => (
                  <tr
                    key={item.id}
                    className={selectedIds.includes(item.id) ? "selected" : ""}
                  >
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Selecionar ${item.name}`}
                        checked={selectedIds.includes(item.id)}
                        disabled={saving}
                        onChange={(event) =>
                          setSelectedIds((ids) =>
                            event.target.checked
                              ? [...ids, item.id]
                              : ids.filter((id) => id !== item.id),
                          )
                        }
                      />
                    </td>
                    <td>
                      <strong>{item.name}</strong>
                      <small>
                        {item.category}
                        {item.productId ? " · Vinculado ao cardápio" : ""}
                      </small>
                    </td>
                    <td>
                      <strong>
                        {formattedStock(item.currentStock, item.unit)}
                      </strong>
                      <small>
                        Mínimo: {formattedStock(item.minimumStock, item.unit)}
                      </small>
                    </td>
                    <td>
                      {section === "restock" ? (
                        <>
                          <strong>
                            {shortageOf(item) > 0
                              ? formattedStock(shortageOf(item), item.unit)
                              : "Conferir mínimo"}
                          </strong>
                          <small>
                            {shortageOf(item) > 0
                              ? `${currency(shortageOf(item) * Number(item.unitCost))} estimados`
                              : "Ajuste o limite do item"}
                          </small>
                        </>
                      ) : (
                        <>
                          {currency(Number(item.unitCost))}
                          <small>por {unitOf(item.unit).short}</small>
                        </>
                      )}
                    </td>
                    <td>
                      <span className={`stock-pill stock-${statusOf(item)}`}>
                        {stockStatusLabel(item)}
                      </span>
                    </td>
                    <td>
                      <div className="stock-row-actions">
                        <button
                          title="Registrar entrada, saída ou ajuste"
                          aria-label={`Movimentar ${item.name}`}
                          onClick={() => setMovementItem(item)}
                        >
                          <ArrowDownToLine size={17} />
                        </button>
                        <button
                          title="Editar cadastro"
                          aria-label={`Editar ${item.name}`}
                          onClick={() => setItemDialog(item)}
                        >
                          <Edit3 size={17} />
                        </button>
                        <button
                          title="Ver histórico"
                          aria-label={`Histórico de ${item.name}`}
                          onClick={() => void openHistory(item)}
                        >
                          <History size={17} />
                        </button>
                        <button
                          className="stock-delete-action"
                          title="Excluir item"
                          aria-label={`Excluir ${item.name}`}
                          disabled={saving}
                          onClick={() => {
                            setError("");
                            setDeleteIds([item.id]);
                          }}
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!items.length && (
            <div className="stock-empty">
              <Package />
              <h3>
                {section === "restock"
                  ? "Nenhum item para repor neste filtro"
                  : "Nenhum item encontrado"}
              </h3>
              <p>
                {query || selectedCategory || filter !== "all"
                  ? "Altere os filtros para consultar outros itens."
                  : "Cadastre um item para começar o controle."}
              </p>
            </div>
          )}
          {items.length > 0 && (
            <footer className="stock-pagination">
              <small>
                {(currentPage - 1) * 25 + 1}–
                {Math.min(currentPage * 25, items.length)} de {items.length}{" "}
                itens
              </small>
              <div>
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Anterior
                </button>
                <span>
                  {currentPage} / {pageCount}
                </span>
                <button
                  disabled={currentPage >= pageCount}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Próxima
                </button>
              </div>
            </footer>
          )}
        </section>
      )}
      {section === "categories" && (
        <section className="panel stock-categories-panel">
          <header className="stock-section-heading">
            <div>
              <h2>Categorias do estoque</h2>
              <p>Agrupe insumos e produtos para facilitar a conferência.</p>
            </div>
            <button
              className="secondary-admin"
              onClick={() => {
                setCategoryName("");
                setCategoryDialog(true);
              }}
            >
              <FolderPlus size={17} /> Nova categoria
            </button>
          </header>
          <div className="stock-category-grid">
            {categoryNames.map((name) => {
              const categoryItems = allItems.filter(
                  (item) => item.category === name,
                ),
                count = categoryItems.filter(
                  (item) => statusOf(item) !== "ok",
                ).length;
              return (
                <div className="stock-category-card" key={name}>
                  <button
                    className="stock-category-open"
                    onClick={() => navigateSection("items", name)}
                  >
                    <Boxes size={22} />
                    <strong>{name}</strong>
                    <small>
                      {categoryItems.length} itens ·{" "}
                      {currency(
                        categoryItems.reduce(
                          (sum, item) =>
                            sum +
                            Number(item.currentStock) * Number(item.unitCost),
                          0,
                        ),
                      )}
                    </small>
                    <span>
                      {count
                        ? `${count} precisam de reposição`
                        : "Sem alertas de estoque"}
                    </span>
                  </button>
                  <button
                    className="stock-category-delete"
                    type="button"
                    aria-label={`Excluir categoria ${name}`}
                    title="Excluir categoria"
                    onClick={() => {
                      setError("");
                      setDeleteCategory(name);
                    }}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              );
            })}
          </div>
          {!categoryNames.length && (
            <div className="stock-empty">
              <Boxes />
              <h3>Organize por categoria</h3>
              <p>Crie a primeira categoria para cadastrar os insumos.</p>
            </div>
          )}
        </section>
      )}
      {section === "movements" && (
        <section className="panel stock-movements-panel">
          <header className="stock-section-heading">
            <div>
              <h2>Movimentações do estoque</h2>
              <p>
                Últimos 200 registros. Para o histórico de um item, use o ícone
                de histórico em Itens.
              </p>
            </div>
          </header>
          <div className="stock-filters">
            <label className="stock-search">
              <Search size={17} />
              <input
                aria-label="Buscar movimentação"
                placeholder="Buscar item, motivo ou responsável"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <label>
              <span>Tipo</span>
              <select
                aria-label="Tipo de movimentação"
                value={movementType}
                onChange={(event) => setMovementType(event.target.value)}
              >
                <option value="all">Todos os tipos</option>
                <option value="IN">Entradas</option>
                <option value="OUT">Saídas</option>
                <option value="ADJUST">Ajustes</option>
              </select>
            </label>
          </div>
          <div className="stock-table-scroll">
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Item / motivo</th>
                  <th>Tipo</th>
                  <th>Quantidade</th>
                  <th>Saldo anterior → atual</th>
                  <th>Responsável</th>
                </tr>
              </thead>
              <tbody>
                {filteredMovements.map((movement) => (
                  <tr key={movement.id}>
                    <td>
                      {new Date(movement.createdAt).toLocaleString("pt-BR")}
                    </td>
                    <td>
                      <strong>
                        {movement.item?.name ?? "Item do estoque"}
                      </strong>
                      <small>{movement.reason}</small>
                      {movement.notes && <small>{movement.notes}</small>}
                    </td>
                    <td>
                      <span
                        className={`stock-movement-type ${movement.type.toLowerCase()}`}
                      >
                        {
                          { IN: "Entrada", OUT: "Saída", ADJUST: "Ajuste" }[
                            movement.type
                          ]
                        }
                      </span>
                    </td>
                    <td>
                      {quantity(movement.quantity)} {movement.item?.unit}
                    </td>
                    <td>
                      {quantity(movement.previousStock)} →{" "}
                      {quantity(movement.resultingStock)}
                    </td>
                    <td>{movement.createdBy ?? "Sistema"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!filteredMovements.length && (
            <div className="stock-empty">
              <History />
              <h3>Nenhuma movimentação encontrada</h3>
              <p>As entradas, saídas e ajustes aparecerão aqui.</p>
            </div>
          )}
        </section>
      )}
      {categoryDialog && (
        <Dialog
          title="Nova categoria"
          onClose={() => !saving && setCategoryDialog(false)}
        >
          <form
            className="inventory-form"
            onSubmit={async (event) => {
              event.preventDefault();
              setSaving(true);
              setError("");
              try {
                await inventoryApi.createCategory(categoryName.trim());
                setCategoryDialog(false);
                await load();
              } catch (reason) {
                setError((reason as Error).message);
              } finally {
                setSaving(false);
              }
            }}
          >
            <label>
              Nome da categoria
              <input
                autoFocus
                required
                minLength={2}
                maxLength={120}
                value={categoryName}
                onChange={(event) => setCategoryName(event.target.value)}
                placeholder="Ex.: Queijos e frios"
              />
            </label>
            <footer>
              <button
                type="button"
                disabled={saving}
                onClick={() => setCategoryDialog(false)}
              >
                Cancelar
              </button>
              <button
                className="primary-admin"
                disabled={saving || categoryName.trim().length < 2}
              >
                Criar categoria
              </button>
            </footer>
          </form>
        </Dialog>
      )}
      {deleteCategory !== null && (
        <Dialog
          title={`Excluir categoria ${deleteCategory}`}
          onClose={() => !saving && setDeleteCategory(null)}
        >
          <div className="stock-delete-confirm">
            {error && <p role="alert">{error}</p>}
            <p>
              Excluir a categoria <strong>{deleteCategory}</strong> e todos os
              itens de estoque que pertencem a ela?
            </p>
            <ul>
              {allItems
                .filter((item) => item.category === deleteCategory)
                .map((item) => (
                  <li key={item.id}>{item.name}</li>
                ))}
            </ul>
            <p>
              Os itens desta categoria, inclusive os ocultos, serão removidos
              juntos. O histórico de movimentações e os produtos do cardápio
              serão preservados.
            </p>
            <footer>
              <button
                className="secondary-admin"
                disabled={saving}
                onClick={() => setDeleteCategory(null)}
              >
                Cancelar
              </button>
              <button
                className="stock-confirm-delete"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  setError("");
                  try {
                    await inventoryApi.removeCategory(deleteCategory);
                    if (selectedCategory === deleteCategory)
                      setSelectedCategory("");
                    setDeleteCategory(null);
                    await load();
                  } catch (reason) {
                    setError((reason as Error).message);
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? (
                  <LoaderCircle size={17} className="spinner" />
                ) : (
                  <Trash2 size={17} />
                )}{" "}
                Excluir categoria e itens
              </button>
            </footer>
          </div>
        </Dialog>
      )}
      {deleteIds.length > 0 && (
        <Dialog
          title={
            deleteIds.length === 1
              ? "Excluir item do estoque"
              : `Excluir ${deleteIds.length} itens do estoque`
          }
          onClose={() => !saving && setDeleteIds([])}
        >
          <div className="stock-delete-confirm">
            {error && <p role="alert">{error}</p>}
            <p>Confira os itens que serão removidos do estoque:</p>
            <ul>
              {deleteIds.map((id) => (
                <li key={id}>
                  {allItems.find((item) => item.id === id)?.name ??
                    "Item removido"}
                </li>
              ))}
            </ul>
            <p>
              O histórico de movimentações e os produtos do cardápio serão
              preservados. Itens vinculados deixarão de controlar o saldo das
              próximas vendas.
            </p>
            {deleteIds.length > 1000 && (
              <p role="alert">Selecione até 1.000 itens por exclusão.</p>
            )}
            <footer>
              <button
                className="secondary-admin"
                disabled={saving}
                onClick={() => setDeleteIds([])}
              >
                Cancelar
              </button>
              <button
                className="stock-confirm-delete"
                disabled={saving || deleteIds.length > 1000}
                onClick={async () => {
                  setSaving(true);
                  setError("");
                  try {
                    await inventoryApi.removeItems(deleteIds);
                    setDeleteIds([]);
                    setSelectedIds([]);
                    await load();
                  } catch (reason) {
                    setError((reason as Error).message);
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? (
                  <LoaderCircle size={17} className="spinner" />
                ) : (
                  <Trash2 size={17} />
                )}{" "}
                {saving
                  ? "Excluindo..."
                  : `Excluir ${deleteIds.length === 1 ? "item" : `${deleteIds.length} itens`}`}
              </button>
            </footer>
          </div>
        </Dialog>
      )}
      {itemDialog && (
        <ItemDialog
          item={itemDialog === "new" ? null : itemDialog}
          categories={categoryNames}
          defaultCategory={selectedCategory}
          saving={saving}
          onClose={() => setItemDialog(null)}
          onSave={async (input) => {
            setSaving(true);
            setError("");
            try {
              if (itemDialog === "new") await inventoryApi.createItem(input);
              else await inventoryApi.updateItem(itemDialog.id, input);
              setItemDialog(null);
              await load();
            } catch (reason) {
              setError((reason as Error).message);
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
            setError("");
            try {
              await inventoryApi.move(movementItem.id, input);
              setMovementItem(null);
              await load();
            } catch (reason) {
              setError((reason as Error).message);
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
            <option value="" disabled>
              Selecione uma categoria
            </option>
            {categories.map((category) => (
              <option value={category} key={category}>
                {category}
              </option>
            ))}
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
          <div className="currency-input">
            <span>R$</span>
            <input
              min="0"
              step="0.01"
              type="number"
              value={form.unitCost || ""}
              placeholder="0,00"
              onChange={(event) =>
                setForm({ ...form, unitCost: Number(event.target.value) })
              }
            />
          </div>
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
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current
      ?.querySelector<HTMLElement>("button, input, select, textarea")
      ?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <div
      className="inventory-dialog-overlay"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="inventory-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
          if (event.key === "Tab") {
            const controls = Array.from(
              dialogRef.current?.querySelectorAll<HTMLElement>(
                "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)",
              ) ?? [],
            );
            const first = controls[0],
              last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <header>
          <h2>{title}</h2>
          <button type="button" aria-label="Fechar janela" onClick={onClose}>
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
