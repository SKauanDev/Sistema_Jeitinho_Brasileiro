import { useEffect, useRef, useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { emptyPizzaRules, loadPizzaRules, savePizzaRules, PIZZA_STYLES, type PizzaRules, type PizzaMenu, type PizzaStyle } from "../../services/pizza-rules";
import type { SizePrice } from "../../types/catalog";
import { parseCurrencyField } from "../../utils/currency-field";

const kinds = { TRADITIONAL: "Comuns", PREMIUM: "Premium", SWEET: "Doces", MIXED: "Comum + premium" } as const;
type MenuKind = keyof typeof kinds;
function PriceField({ value, label, onChange }: { value: number | null; label: string; onChange: (value: number | null) => void }) {
  return <div className="style-money-field"><span>R$</span><input aria-label={label} inputMode="numeric" maxLength={12} placeholder="—" value={value === null ? "" : value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} onChange={event => onChange(parseCurrencyField(event.target.value))} /></div>;
}
export function PizzaRulesDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [rules, setRules] = useState<PizzaRules>(emptyPizzaRules);
  const [tab, setTab] = useState<MenuKind | "BORDERS">("TRADITIONAL");
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState("");
  useEffect(() => { dialog.current?.showModal(); void loadPizzaRules().then(setRules).catch(reason => setError(reason.message)).finally(() => setLoading(false)); }, []);
  const styled = !!rules.menus?.length;
  function updateMenu(kind: MenuKind, style: PizzaStyle, changes: Partial<PizzaMenu>) {
    setRules(current => {
      const menu: PizzaMenu = current.menus?.find(menu => menu.kind === kind && menu.style === style) ?? { kind, style, sizes: [], borderMode: "NONE", borderPrice: null, borderIds: [] };
      return { ...current, menus: [...(current.menus ?? []).filter(menu => menu.kind !== kind || menu.style !== style), { ...menu, ...changes }] };
    });
  }
  function legacySizes(key: "traditional" | "mixed", size: SizePrice["size"], price: number | null) {
    setRules(current => ({ ...current, [key]: [...current[key].filter(entry => entry.size !== size), ...(price ? [{ size, price }] : [])] }));
  }
  return <dialog ref={dialog} className="refinement-dialog pizza-pricing-dialog" onCancel={onClose} onClick={event => event.target === event.currentTarget && onClose()}><form onSubmit={async event => {
    event.preventDefault(); setSaving(true); setError("");
    try { await savePizzaRules(rules); onClose(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao salvar."); } finally { setSaving(false); }
  }}><header><div><h2>Preços, massas e bordas</h2><p>Cadastre os sabores uma vez. Os valores seguem a categoria, o estilo e o tamanho.</p></div><button type="button" aria-label="Fechar" onClick={onClose}><X /></button></header>
    {error && <p role="alert" className="pricing-alert">{error}</p>}
    {loading ? <p>Carregando...</p> : <>
      <nav className="pricing-tabs" aria-label="Tabelas de preços">{(Object.entries(kinds) as Array<[MenuKind, string]>).map(([key, label]) => <button type="button" key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}<button type="button" aria-pressed={tab === "BORDERS"} onClick={() => setTab("BORDERS")}>Recheios de borda</button></nav>
      {tab !== "BORDERS" && styled && <section className="pricing-category"><h3>Pizzas {kinds[tab].toLowerCase()}</h3>
        {tab === "MIXED" && <p>Preço próprio para duas metades comum + premium, com o mesmo estilo e tamanho. A borda segue a regra da premium.</p>}
        {tab === "SWEET" && <p>Disponíveis somente na napolitana. Meio a meio apenas entre sabores doces.</p>}
        {(Object.keys(PIZZA_STYLES) as PizzaStyle[]).filter(style => tab !== "SWEET" || style === "NAPOLITANA").map(style => {
          const menu = rules.menus?.find(menu => menu.kind === tab && menu.style === style);
          const sizes = style === "TONDA_ROMANA" ? ["P", "M", "G"] as const : ["P", "M", "G", "GG"] as const;
          const availableBorders = rules.borders.filter(border => border.active);
          return <fieldset className="style-price-card" key={style}><legend>{PIZZA_STYLES[style]}</legend>
            <div className="rule-sizes" style={{ gridTemplateColumns: `repeat(${sizes.length}, minmax(0, 1fr))` }}>{sizes.map(size => <label key={size}><span>{size}</span><PriceField label={`${kinds[tab]} ${PIZZA_STYLES[style]} ${size}`} value={menu?.sizes.find(entry => entry.size === size)?.price ?? null} onChange={price => updateMenu(tab, style, { sizes: [...(menu?.sizes ?? []).filter(entry => entry.size !== size), ...(price ? [{ size, price }] : [])] })} /></label>)}</div>
            <small>Tamanho sem preço fica indisponível. Nenhum valor será presumido.</small>
            {style === "TONDA_ROMANA" ? <p className="style-policy">Sem borda recheada · tamanhos P, M e G</p> : tab === "MIXED" ? <p className="style-policy">Borda com os recheios e o acréscimo da premium napolitana.</p> : <div className="style-border-config">
              <label className="style-border-toggle"><input type="checkbox" checked={menu?.borderMode === "PAID"} onChange={event => updateMenu(tab, style, { borderMode: event.target.checked ? "PAID" : "NONE", ...(!event.target.checked ? { borderPrice: null, borderIds: [] } : {}) })} /> Oferecer borda recheada</label>
              {menu?.borderMode === "PAID" && <><label>Acréscimo da borda<PriceField label={`Borda ${kinds[tab]} ${PIZZA_STYLES[style]}`} value={menu.borderPrice} onChange={borderPrice => updateMenu(tab, style, { borderPrice })} /></label>
                {menu.borderPrice === null && <p className="pricing-alert">Preço pendente: a borda só aparecerá para o cliente depois de definir o acréscimo.</p>}
                <p>Recheios disponíveis nesta categoria</p><div className="style-border-options">{availableBorders.map(border => <label key={border.id}><input type="checkbox" checked={menu.borderIds.includes(border.id)} onChange={event => updateMenu(tab, style, { borderIds: event.target.checked ? [...menu.borderIds, border.id] : menu.borderIds.filter(id => id !== border.id) })} /><span>{border.name}<small>{border.type === "SWEET" ? "Doce" : "Salgada"}</small></span></label>)}</div>
                {!availableBorders.length && <p className="pricing-alert">Cadastre as opções na aba “Recheios de borda” e selecione aqui quais serão oferecidas.</p>}
              </>}
            </div>}
          </fieldset>;
        })}
      </section>}
      {tab !== "BORDERS" && !styled && <section><p>Preços atuais por tamanho. A tabela por estilo será habilitada ao configurar as massas.</p>{(["traditional", "mixed"] as const).map(key => <fieldset key={key}><legend>{key === "traditional" ? "Comuns" : "Comum + premium"}</legend><div className="rule-sizes">{(["P", "M", "G", "GG"] as const).map(size => <label key={size}>{size}<PriceField label={`${key} ${size}`} value={rules[key].find(entry => entry.size === size)?.price ?? null} onChange={value => legacySizes(key, size, value)} /></label>)}</div></fieldset>)}</section>}
      {tab === "BORDERS" && <section className="pricing-border-list"><h3>Recheios de borda</h3><p>{styled ? "Cadastre os nomes dos recheios e selecione as opções em cada categoria. O acréscimo é definido na categoria, sem repetir preços por recheio." : "Escolha opcional por pizza, com acréscimo."}</p>
        {rules.borders.map((border, index) => <div className="border-rule" key={border.id}>
          <label>Recheio<input required maxLength={80} value={border.name} onChange={event => setRules(current => ({ ...current, borders: current.borders.map((row, i) => i === index ? { ...row, name: event.target.value } : row) }))} /></label>
          <label>Tipo<select value={border.type} onChange={event => setRules(current => ({ ...current, borders: current.borders.map((row, i) => i === index ? { ...row, type: event.target.value as "SAVORY" | "SWEET" } : row) }))}><option value="SAVORY">Salgada</option><option value="SWEET">Doce</option></select></label>
          {!styled && <label>Valor<PriceField label={`Preço borda ${border.name}`} value={border.price || null} onChange={price => setRules(current => ({ ...current, borders: current.borders.map((row, i) => i === index ? { ...row, price: price ?? 0 } : row) }))} /></label>}
          <button type="button" aria-label={`Excluir recheio ${border.name}`} onClick={() => setRules(current => ({ ...current, borders: current.borders.filter(row => row.id !== border.id), menus: current.menus?.map(menu => ({ ...menu, borderIds: menu.borderIds.filter(id => id !== border.id) })) }))}><Trash2 size={18} /></button>
        </div>)}<button type="button" className="add-border-filling" onClick={() => setRules(current => ({ ...current, borders: [...current.borders, { id: crypto.randomUUID(), name: "", type: "SAVORY", price: 0, active: true }] }))}><Plus size={16} /> Adicionar recheio</button>
      </section>}
      <footer><button type="button" onClick={onClose}>Cancelar</button><button disabled={saving}>{saving ? "Salvando..." : "Salvar tabela"}</button></footer>
    </>}
  </form></dialog>;
}
