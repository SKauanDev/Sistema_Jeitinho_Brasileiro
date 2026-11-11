import { PizzaFlavorPicker } from "./components/PizzaFlavorPicker";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Beer, Bike, BottleWine, CakeSlice, Check, ChevronLeft, ChevronRight, Cigarette, Clock3, Coffee, CupSoda,
  Hamburger, IceCreamBowl, Menu, Minus, PackageOpen, Pizza, Plus, Popsicle, Search, Sandwich,
  ShoppingBag, Sparkles, Star, Tag, UserRound, UtensilsCrossed, Wine, X,
} from "lucide-react";
import type { Extra, Product } from "./data/menu";
import { CheckoutForm } from "./features/cart/CheckoutForm";
import { catalogApi, catalogImageUrl } from "./services/catalog-api";
import { API_URL } from "./services/admin-api";
import type { PublicCoupon } from "./types/promotion";
import { FoodImage } from "./components/FoodImage";
import { orderRequestHeaders } from "./services/realtime";

import { configuredPizzaPrice, flavorAlreadyChosen, isPizzaFlavor, productPrice, type PizzaSelection } from "./utils/pizza";
import type { PizzaSize } from "./types/catalog";
type CartItem = Product & { size?: PizzaSize; quantity: number; selectedExtras: Extra[]; pizzaSelections: PizzaSelection[]; notes: string };

function categoryIcon(category: string) {
  const name = category.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (name.includes("destaque") || name.includes("promoc")) return Sparkles;
  if (name.includes("combo")) return PackageOpen;
  if (name.includes("pizza")) return Pizza;
  if (name.includes("hamburg") || name.includes("burger") || name.includes("lanche")) return Hamburger;
  if (name.includes("refrigerante") || name.includes("refri") || name.includes("suco") || name.includes("bebida")) return CupSoda;
  if (name.includes("cerveja") || name.includes("chopp")) return Beer;
  if (name.includes("vinho")) return name.includes("garrafa") ? BottleWine : Wine;
  if (name.includes("cafe")) return Coffee;
  if (name.includes("sorvete") || name.includes("acai")) return IceCreamBowl;
  if (name.includes("picole")) return Popsicle;
  if (name.includes("sobremesa") || name.includes("bolo") || name.includes("doce")) return CakeSlice;
  if (name.includes("tabac") || name.includes("cigar")) return Cigarette;
  if (name.includes("porcao") || name.includes("petisco")) return Sandwich;
  return UtensilsCrossed;
}

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function App() {
  const [categories, setCategories] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [notes, setNotes] = useState("");
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("");
  const [mobileCategory, setMobileCategory] = useState<string | null>(null);
  const [selected, setSelected] = useState<Product | null>(null);
  const [selectedExtras, setSelectedExtras] = useState<Extra[]>([]);
  const [pizzaSelections, setPizzaSelections] = useState<PizzaSelection[]>([]);
  const [activePizzaSlot, setActivePizzaSlot] = useState(0);
  const [activePizzaHalf, setActivePizzaHalf] = useState<"left" | "right">("left");
  const [selectedSize, setSelectedSize] = useState<PizzaSize | undefined>();
  const [flavorNotice, setFlavorNotice] = useState("");
  const [flavorPickerOpen, setFlavorPickerOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(() => localStorage.getItem("urfood_customer_token") ? localStorage.getItem("urfood_current_order") : null);
  const [customerName, setCustomerName] = useState(() => { if (!localStorage.getItem("urfood_customer_token")) return ""; try { return (JSON.parse(localStorage.getItem("urfood_customer") ?? "null") as { name?: string } | null)?.name ?? ""; } catch { return ""; } });
  const [coupons, setCoupons] = useState<PublicCoupon[]>([]);
  const [minimumOrder, setMinimumOrder] = useState(10);
  const [couponPopupOpen, setCouponPopupOpen] = useState(false);
  const [claimedCouponCode, setClaimedCouponCode] = useState(() => localStorage.getItem("urfood_customer_token") ? localStorage.getItem("urfood_claimed_coupon") ?? "" : "");
  const [usedCouponCodes, setUsedCouponCodes] = useState<string[]>(() => { if (!localStorage.getItem("urfood_customer_token")) return []; try { return JSON.parse(localStorage.getItem("urfood_used_coupons") ?? "[]") as string[]; } catch { return []; } });
  const categoryListRef = useRef<HTMLDivElement>(null);
  const categoryScrollFrame = useRef<number | null>(null);
  const categoryScrollDirection = useRef(0);
  const pizzaFlavors = useMemo(() => products.filter(isPizzaFlavor), [products]);

  function stopCategoryAutoScroll() {
    categoryScrollDirection.current = 0;
    if (categoryScrollFrame.current !== null) window.cancelAnimationFrame(categoryScrollFrame.current);
    categoryScrollFrame.current = null;
  }

  function startCategoryAutoScroll(direction: -1 | 1, intensity: number) {
    categoryScrollDirection.current = direction * Math.max(.35, intensity);
    if (categoryScrollFrame.current !== null) return;
    const move = () => {
      const list = categoryListRef.current;
      if (!list || !categoryScrollDirection.current) { categoryScrollFrame.current = null; return; }
      list.scrollLeft += categoryScrollDirection.current * 5;
      categoryScrollFrame.current = window.requestAnimationFrame(move);
    };
    categoryScrollFrame.current = window.requestAnimationFrame(move);
  }

  function handleCategoryPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType && event.pointerType !== "mouse") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const edge = Math.min(90, bounds.width * .18);
    const fromLeft = event.clientX - bounds.left;
    const fromRight = bounds.right - event.clientX;
    if (fromLeft < edge) startCategoryAutoScroll(-1, 1 - fromLeft / edge);
    else if (fromRight < edge) startCategoryAutoScroll(1, 1 - fromRight / edge);
    else stopCategoryAutoScroll();
  }

  useEffect(() => {
    void catalogApi.public().then((catalog) => {
      const names = catalog.map((category) => category.name);
      const mapped = catalog.flatMap((category) => category.products.map((product) => ({
        id: product.id, category: category.name, name: product.name, description: product.description ?? "",
        price: product.sizes?.length ? Math.min(...product.sizes.map(entry => entry.price)) : Number(product.promotionalPrice ?? product.price), image: catalogImageUrl(product.imageUrl), popular: product.featured,
        sizes: product.sizes ?? [],
        pizzaSlots: product.pizzaSlots || (/pizza/i.test(category.name) ? 1 : undefined),
        extras: product.optionGroups?.flatMap((group) => group.options.filter((option) => option.active).map((option) => ({ id: option.id, name: option.name, price: Number(option.priceDelta) }))),
      })));
      setCategories(names); setProducts(mapped); setActiveCategory((current) => current && names.includes(current) ? current : names[0] ?? "");
    }).catch((reason) => setCatalogError(reason instanceof Error ? reason.message : "Não foi possível carregar o cardápio.")).finally(() => setCatalogLoading(false));
  }, []);

  useEffect(() => { void catalogApi.publicCoupons().then(setCoupons).catch(() => setCoupons([])); }, []);

  useEffect(() => {
    void fetch(`${API_URL}/delivery/config`).then(async (response) => {
      if (!response.ok) return;
      const config = await response.json() as { minimumOrder?: number };
      if (Number.isFinite(config.minimumOrder) && Number(config.minimumOrder) >= 0) setMinimumOrder(Number(config.minimumOrder));
    }).catch(() => undefined);
  }, []);

  useEffect(() => () => stopCategoryAutoScroll(), []);

  useEffect(() => { const token = localStorage.getItem("urfood_customer_token"); if (!token) return; void fetch(`${API_URL}/customers/session`, { headers: { Authorization: `Bearer ${token}` } }).then(async (response) => { if (!response.ok) return; const customer = await response.json() as { usedCouponCodes?: string[]; claimedCouponCode?: string | null }; const used = customer.usedCouponCodes ?? []; setUsedCouponCodes(used); localStorage.setItem("urfood_used_coupons", JSON.stringify(used)); if (!customer.claimedCouponCode) { setClaimedCouponCode(""); localStorage.removeItem("urfood_claimed_coupon"); } }).catch(() => undefined); }, []);

  useEffect(() => {
    const syncSession = () => { const token = localStorage.getItem("urfood_customer_token"); if (!token) { setCustomerName(""); setClaimedCouponCode(""); setCurrentOrderId(null); return; } try { const customer = JSON.parse(localStorage.getItem("urfood_customer") ?? "null") as { name?: string } | null; setCustomerName(customer?.name ?? ""); setClaimedCouponCode(localStorage.getItem("urfood_claimed_coupon") ?? ""); setCurrentOrderId(localStorage.getItem("urfood_current_order")); } catch { setCustomerName(""); } };
    window.addEventListener("storage", syncSession); window.addEventListener("urfood:customer-session", syncSession); return () => { window.removeEventListener("storage", syncSession); window.removeEventListener("urfood:customer-session", syncSession); };
  }, []);

  async function redeemCoupon(coupon: PublicCoupon) {
    const token = localStorage.getItem("urfood_customer_token"); if (!token) { window.location.href = "/perfil"; return; }
    const response = await fetch(`${API_URL}/customers/coupons/${coupon.id}/redeem`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }); const data = await response.json() as { code?: string; message?: string }; if (!response.ok || !data.code) { window.alert(data.message ?? "Não foi possível resgatar o cupom."); return; }
    localStorage.setItem("urfood_claimed_coupon", data.code); setClaimedCouponCode(data.code);
  }

  useEffect(() => {
    if (!currentOrderId) return;
    let active = true;
    const checkOrder = async () => { try { const response = await fetch(`${API_URL}/orders/${currentOrderId}`, { headers: orderRequestHeaders(currentOrderId) }); const order = await response.json() as { status?: string }; if (active && ["COMPLETED","CANCELED"].includes(order.status ?? "")) { localStorage.removeItem("urfood_current_order"); setCurrentOrderId(null); } } catch { /* Tenta novamente na próxima verificação. */ } };
    void checkOrder(); const timer = window.setInterval(() => void checkOrder(), 20_000); return () => { active = false; window.clearInterval(timer); };
  }, [currentOrderId]);

  const visibleProducts = useMemo(() => products.filter((product) => {
    const matchesSearch = `${product.name} ${product.description}`.toLowerCase().includes(query.toLowerCase());
    return matchesSearch && (activeCategory === "Destaques" ? product.popular : product.category === activeCategory);
  }), [products, query, activeCategory]);

  const itemCount = cart.reduce((total, item) => total + item.quantity, 0);
  const cartTotal = cart.reduce((total, item) => {
    const extras = item.selectedExtras.reduce((sum, extra) => sum + extra.price, 0);
    return total + (item.price + extras) * item.quantity;
  }, 0);

  function openProduct(product: Product) {
    setSelected(product);
    setFlavorPickerOpen(false);
    setSelectedSize(undefined);
    setFlavorNotice("");
    setSelectedExtras([]);
    setPizzaSelections(Array.from({ length: product.pizzaSlots ?? 0 }, () => ({ mode: "whole", leftId: isPizzaFlavor(product) ? product.id : undefined })));
    setNotes("");
    setActivePizzaSlot(0);
    setActivePizzaHalf("left");
    setQuantity(1);
  }

  function toggleExtra(extra: Extra) {
    setSelectedExtras((current) => current.some((item) => item.id === extra.id)
      ? current.filter((item) => item.id !== extra.id)
      : [...current, extra]);
  }

  function addToCart() {
    if (!selected || !canAddProduct) return;
    setCart((current) => [...current, { ...selected, price: selectedUnitPrice, size: selectedSize, quantity, selectedExtras, pizzaSelections, notes: notes.trim() }]);
    setSelected(null);
  }

  function updatePizzaSelection(update: Partial<PizzaSelection>) {
    setFlavorNotice("");
    setPizzaSelections((current) => current.map((selection, index) => index === activePizzaSlot ? { ...selection, ...update } : selection));
  }

  function showFlavorChoices() {
    if (!window.matchMedia("(max-width: 760px)").matches) return;
    setFlavorNotice("");
    if (selected?.sizes?.length && !selectedSize) { setFlavorNotice("Escolha o tamanho antes do sabor."); return; }
    setFlavorPickerOpen(true);
  }

  function choosePizzaFlavor(flavorId: string) {
    const selection = pizzaSelections[activePizzaSlot];
    if (!selection) return;
    if (flavorAlreadyChosen(selection, flavorId)) { setFlavorNotice("Esse sabor já foi escolhido"); return; }
    setFlavorNotice("");
    if (selection.mode === "whole" || activePizzaHalf === "left") {
      updatePizzaSelection({ leftId: flavorId });
      if (selection.mode === "half") setActivePizzaHalf("right");
    } else {
      updatePizzaSelection({ rightId: flavorId });
    }
    setFlavorPickerOpen(false);
  }

  const availableFlavors = pizzaFlavors.filter(flavor => selectedSize ? flavor.sizes?.some(entry => entry.size === selectedSize) : !selected?.sizes?.length && (!selected || !isPizzaFlavor(selected) || !flavor.sizes?.length));
  const selectedUnitPrice = selected ? configuredPizzaPrice(selected, selectedSize, pizzaSelections, pizzaFlavors) : 0;
  const modalTotal = selected
    ? (selectedUnitPrice + selectedExtras.reduce((sum, extra) => sum + extra.price, 0)) * quantity
    : 0;
  const canAddProduct = !!selected && (!selected.sizes?.length || !!selectedSize) && (!selected.pizzaSlots || pizzaSelections.every(pizza => pizza.leftId && availableFlavors.some(flavor => flavor.id === pizza.leftId) && (pizza.mode === "whole" || (pizza.rightId && pizza.rightId !== pizza.leftId && availableFlavors.some(flavor => flavor.id === pizza.rightId)))));
  const activePizza = pizzaSelections[activePizzaSlot];
  const flavorName = (id?: string) => pizzaFlavors.find((flavor) => flavor.id === id)?.name ?? "Escolher";
  const checkoutItems = cart.map((item) => ({
    productId: item.id,
    size: item.size,
    pizzaSelections: item.pizzaSelections,
    productName: item.name,
    quantity: item.quantity,
    unitPrice: item.price,
    notes: item.notes,
    options: [
      ...(item.size ? [{ name: item.size, group: "Tamanho", price: 0 }] : []),
      ...item.selectedExtras.map((extra) => ({ optionId: extra.id, name: extra.name, group: "Adicionais", price: extra.price })),
      ...item.pizzaSelections.flatMap((pizza, index) => pizza.mode === "half"
        ? [{ name: flavorName(pizza.leftId), group: `Pizza ${index + 1} · 1ª metade`, price: 0 }, { name: flavorName(pizza.rightId), group: `Pizza ${index + 1} · 2ª metade`, price: 0 }]
        : [{ name: flavorName(pizza.leftId), group: `Pizza ${index + 1} · sabor inteiro`, price: 0 }]),
    ],
  }));
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Pizzaria Jeitinho Brasileiro">
          <img src="/images/logo.png" alt="Pizzaria Jeitinho Brasileiro" />
        </a>
        <nav className={mobileMenuOpen ? "mobile-nav-open" : ""}>
          <span className="minimum-order-badge" title="Pedido mínimo base; algumas regiões podem ter valor diferente"><Bike size={18} aria-hidden="true" /><span>Pedido mínimo: <strong>{money(minimumOrder)}</strong></span></span>
          <a href={currentOrderId ? `/status/${currentOrderId}` : "/meus-pedidos"} className="order-track-link"><Clock3 size={18} /> Acompanhar pedido{currentOrderId && <span className="order-live-dot" />}</a>
          <a href="/meus-pedidos"><ShoppingBag size={18} /> Meus pedidos</a>
          <a href="/perfil"><UserRound size={18} /> {customerName ? `Olá, ${customerName.split(" ")[0]}` : "Entrar"}</a>
        </nav>
        <button className="mobile-menu" onClick={() => setMobileMenuOpen((open) => !open)} aria-label={mobileMenuOpen ? "Fechar menu" : "Abrir menu"} aria-expanded={mobileMenuOpen}>{mobileMenuOpen ? <X /> : <Menu />}</button>
      </header>
      {mobileMenuOpen && <button className="mobile-nav-backdrop" onClick={() => setMobileMenuOpen(false)} aria-label="Fechar menu" />}

      <main id="top">
        <section className="hero">
          <div className="hero-shade" />
          <div className="hero-copy">
            <p>PIZZARIA JEITINHO BRASILEIRO</p>
            <h1>Mais que tradição,<br />o respeito à verdadeira pizza.</h1>
            <span className="hero-subtitle">+50 sabores de pizza, massas, sanduíches, porções e refeições.</span>
            <a className="hero-cta" href="#cardapio">Escolher minha pizza <ChevronRight size={18} /></a>
          </div>
        </section>

        <section className="store-seal" aria-label="Pizzaria Jeitinho Brasileiro">
          <img src="/images/logo.png" alt="Logo Pizzaria Jeitinho Brasileiro" />
        </section>

        <section className="catalog" id="cardapio">
          {catalogLoading && <div className="catalog-api-state"><Clock3 className="spinner" /><h2>Carregando cardápio...</h2></div>}
          {catalogError && <div className="catalog-api-state error"><X /><h2>Cardápio indisponível</h2><p>{catalogError}</p><button onClick={() => window.location.reload()}>Tentar novamente</button></div>}
          {!catalogLoading && !catalogError && <>
          <div className={`mobile-category-home ${mobileCategory ? "category-selected" : ""}`}>
            <div className="mobile-category-heading"><span>EXPLORE O CARDÁPIO</span><h2>O que deseja hoje?</h2></div>
            {!!coupons.length && <button className={`mobile-coupon-claim ${claimedCouponCode ? "claimed" : ""}`} onClick={() => setCouponPopupOpen(true)}><Tag /><span><strong>{claimedCouponCode ? "Cupom resgatado" : "Cupom disponível"}</strong><small>{claimedCouponCode ? claimedCouponCode : "Toque para resgatar seu desconto"}</small></span></button>}
            <div className="mobile-category-grid">
              {categories.map((category) => {
                const Icon = categoryIcon(category);
                const count = category === "Destaques"
                  ? products.filter((product) => product.popular).length
                  : products.filter((product) => product.category === category).length;
                return <button key={category} onClick={() => { setActiveCategory(category); setMobileCategory(category); }}>
                  <i><Icon /></i><strong>{category}</strong><span>{count} {count === 1 ? "item" : "itens"}</span><ChevronRight />
                </button>;
              })}
            </div>
          </div>

          <div className="catalog-tools">
            <div className="category-list" ref={categoryListRef} onPointerMove={handleCategoryPointerMove} onPointerLeave={stopCategoryAutoScroll}>
              {categories.map((category) => (
                <button key={category} className={category === activeCategory ? "active" : ""} onClick={(event) => {
                  setActiveCategory(category);
                  event.currentTarget.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
                }}>
                  {category}
                </button>
              ))}
            </div>
            <label className="search"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar no cardápio" /></label>
            {!!coupons.length && <button className={`coupon-claim ${claimedCouponCode ? "claimed" : ""}`} onClick={() => setCouponPopupOpen(true)}><Tag /><span>{claimedCouponCode ? `Resgatado: ${claimedCouponCode}` : "Resgatar cupom"}</span></button>}
          </div>

          <div className={`catalog-results ${mobileCategory ? "mobile-open" : ""}`}>
            <button className="mobile-category-back" onClick={() => setMobileCategory(null)}><ChevronLeft /> Todas as categorias</button>
            <div className="section-heading">
              <div><span>ESCOLHIDOS PARA VOCÊ</span><h2>{activeCategory}</h2></div>
              <p>{visibleProducts.length} {visibleProducts.length === 1 ? "item" : "itens"}</p>
            </div>

            <div className="product-grid" key={activeCategory}>
              {visibleProducts.map((product) => (
                <button className="product-card" key={product.id} onClick={() => openProduct(product)}>
                  <div className="product-image"><FoodImage src={product.image} alt={product.name} />{product.popular && <span>Mais pedido</span>}</div>
                  <div className="product-copy">
                    <h3>{product.name}</h3>
                    <p>{product.description}</p>
                    <div><strong>{product.sizes?.length ? "A partir de " : ""}{money(product.price)}</strong><span>Adicionar <Plus size={16} /></span></div>
                  </div>
                </button>
              ))}
            </div>
            {visibleProducts.length === 0 && <div className="empty"><Search /><h3>Nenhum item encontrado</h3><p>Tente buscar outro nome ou categoria.</p></div>}
          </div>
          </>}
        </section>
      </main>

      <button className="cart-fab" onClick={() => { setCheckingOut(false); setCartOpen(true); }} aria-label="Abrir carrinho">
        <ShoppingBag />{itemCount > 0 && <span>{itemCount}</span>}
      </button>

      {couponPopupOpen && <div className="overlay coupon-overlay" onMouseDown={(event) => event.target === event.currentTarget && setCouponPopupOpen(false)}><section className="coupon-popup"><button className="close" onClick={() => setCouponPopupOpen(false)}><X /></button><i><Tag /></i><span>OFERTAS DISPONÍVEIS</span><h2>{claimedCouponCode ? "Cupom resgatado" : "Escolha seu cupom"}</h2><p>{claimedCouponCode ? "Este cupom está vinculado à sua conta e será aplicado no pedido." : "Cada oferta pode ser usada uma única vez por cliente."}</p><div>{coupons.map((coupon) => { const value = coupon.discountType === "PERCENTAGE" ? `${Number(coupon.discountValue)}% OFF` : `${money(Number(coupon.discountValue))} OFF`; const claimed = claimedCouponCode === coupon.code; const used = usedCouponCodes.includes(coupon.code.toUpperCase()); return <article className={used ? "claimed coupon-expired" : claimed ? "claimed" : ""} key={coupon.id}><div><strong>{value}</strong><code>{coupon.code}</code></div><p>{coupon.description || `Válido em pedidos a partir de ${money(Number(coupon.minimumOrder))}.`}</p><small>{used ? "Oferta já utilizada nesta conta" : `Pedido mínimo: ${money(Number(coupon.minimumOrder))} · até ${new Date(coupon.expiresAt).toLocaleDateString("pt-BR")}`}</small><button disabled={used || !!claimedCouponCode} onClick={() => { if (!used && !claimedCouponCode) void redeemCoupon(coupon); }}>{used ? "Expirado" : claimed ? <><Check /> Resgatado</> : claimedCouponCode ? "Outro cupom já resgatado" : localStorage.getItem("urfood_customer_token") ? "Resgatar cupom" : "Entrar para resgatar"}</button></article>; })}</div></section></div>}

      {selected && (
        <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}>
          <article className="product-modal">
            <button className="close" onClick={() => setSelected(null)} aria-label="Fechar"><X /></button>
            <div className="modal-image"><FoodImage src={selected.image} alt={selected.name} /></div>
            <div className="modal-content">
              {selected.popular && <span className="eyebrow"><Star size={14} /> FAVORITO DA CASA</span>}
              <h2>{selected.name}</h2>
              <p className="modal-description">{selected.description}</p>
              <strong className="modal-price">{money(selectedUnitPrice)}</strong>
              {!!selected.sizes?.length && <fieldset className="pizza-size-picker"><legend>Escolha o tamanho</legend><div>{selected.sizes.map(entry => <label key={entry.size} className={selectedSize === entry.size ? "selected" : ""}><input type="radio" name="pizza-size" value={entry.size} checked={selectedSize === entry.size} onChange={() => { setSelectedSize(entry.size); setFlavorNotice(""); setPizzaSelections(current => current.map(pizza => ({ ...pizza, leftId: pizzaFlavors.find(flavor => flavor.id === pizza.leftId)?.sizes?.some(size => size.size === entry.size) ? pizza.leftId : undefined, rightId: pizzaFlavors.find(flavor => flavor.id === pizza.rightId)?.sizes?.some(size => size.size === entry.size) ? pizza.rightId : undefined }))); }} /><span><b>{entry.size}</b><small>{money(entry.price)}</small></span></label>)}</div></fieldset>}
              {!!selected.pizzaSlots && activePizza && <section className="pizza-customizer">
                <header><div><h3>Monte {selected.pizzaSlots > 1 ? "suas pizzas" : "sua pizza"}</h3><span>Uma inteira ou duas metades. Você escolhe.</span></div><b>Obrigatório</b></header>
                {selected.pizzaSlots > 1 && <div className="pizza-slot-tabs">{pizzaSelections.map((_, index) => <button key={index} className={activePizzaSlot === index ? "active" : ""} onClick={() => { setActivePizzaSlot(index); setActivePizzaHalf("left"); }}>Pizza {index + 1}</button>)}</div>}
                <div className="pizza-mode"><button className={activePizza.mode === "whole" ? "active" : ""} onClick={() => { updatePizzaSelection({ mode: "whole", rightId: undefined }); setActivePizzaHalf("left"); }}>Sabor inteiro</button><button className={activePizza.mode === "half" ? "active" : ""} onClick={() => { updatePizzaSelection({ mode: "half" }); setActivePizzaHalf("left"); }}>Meio a meio</button></div>
                {activePizza.mode === "half" && <p className="pizza-size-hint">No meio a meio, vale o maior preço entre os sabores.</p>}
                <div className="pizza-stage"><div className={`pizza-choice ${activePizza.mode}`}>
                  <div className="pizza-texture pizza-texture-left"><FoodImage src={pizzaFlavors.find((flavor) => flavor.id === activePizza.leftId)?.image || selected.image} alt="" /></div>
                  {activePizza.mode === "half" && <div className="pizza-texture pizza-texture-right"><FoodImage src={pizzaFlavors.find((flavor) => flavor.id === activePizza.rightId)?.image || selected.image} alt="" /></div>}
                  <button className={`pizza-half pizza-left ${activePizzaHalf === "left" ? "active" : ""}`} onClick={() => { setActivePizzaHalf("left"); showFlavorChoices(); }}><span>{activePizza.mode === "whole" ? "Pizza inteira" : "1ª metade"}</span><strong>{flavorName(activePizza.leftId)}</strong></button>
                  {activePizza.mode === "half" && <button className={`pizza-half pizza-right ${activePizzaHalf === "right" ? "active" : ""}`} onClick={() => { setActivePizzaHalf("right"); showFlavorChoices(); }}><span>2ª metade</span><strong>{flavorName(activePizza.rightId)}</strong></button>}
                </div>
                </div>
                <p className="pizza-selection-summary" aria-live="polite">{activePizza.mode === "whole" ? flavorName(activePizza.leftId) : `${flavorName(activePizza.leftId)} + ${flavorName(activePizza.rightId)}`}<small>Toque na pizza para escolher cada metade.</small></p>
                <div className="mobile-flavor-selectors">{(activePizza.mode === "half" ? ["left", "right"] as const : ["left"] as const).map(half => <button type="button" key={half} disabled={!!selected.sizes?.length && !selectedSize} onClick={() => { setActivePizzaHalf(half); showFlavorChoices(); }}><span>{activePizza.mode === "whole" ? "Sabor da pizza" : half === "left" ? "1ª metade" : "2ª metade"}</span><strong>{flavorName(half === "left" ? activePizza.leftId : activePizza.rightId)}</strong><ChevronRight size={17} /></button>)}</div>
                <p className="pizza-flavor-notice" role="status" aria-live="polite">{flavorNotice}</p>
                {!!selected.sizes?.length && !selectedSize && <p className="pizza-size-hint">Escolha um tamanho para ver os sabores disponíveis.</p>}
                <div className="pizza-flavors"><span>Selecione o sabor da {activePizza.mode === "whole" ? "pizza" : activePizzaHalf === "left" ? "1ª metade" : "2ª metade"}</span>{availableFlavors.map((flavor) => { const chosen = (activePizzaHalf === "right" && activePizza.mode === "half" ? activePizza.rightId : activePizza.leftId) === flavor.id; return <button key={flavor.id} className={chosen ? "chosen" : ""} aria-pressed={chosen} onClick={() => choosePizzaFlavor(flavor.id)}><FoodImage src={flavor.image} alt="" /><div><strong>{flavor.name}</strong><small>{flavor.description}</small>{selected && isPizzaFlavor(selected) && <small className="flavor-price">{money(productPrice(flavor, selectedSize))}</small>}</div>{chosen && <Check />}</button>; })}</div>
              </section>}
              {!!selected.extras?.length && <div className="extras">
                <div><h3>Deixe do seu jeito</h3><span>Escolha quantos quiser</span></div>
                {selected.extras.map((extra) => {
                  const checked = selectedExtras.some((item) => item.id === extra.id);
                  return <button key={extra.id} onClick={() => toggleExtra(extra)} className={checked ? "checked" : ""}>
                    <i>{checked && <Check size={15} />}</i><span>{extra.name}</span><strong>+ {money(extra.price)}</strong>
                  </button>;
                })}
              </div>}
              <label className="notes">Alguma observação?<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ex.: sem cebola, pizza bem assada..." maxLength={160} /></label>
              <div className="modal-action">
                <div className="quantity"><button onClick={() => setQuantity(Math.max(1, quantity - 1))}><Minus /></button><strong>{quantity}</strong><button onClick={() => setQuantity(quantity + 1)}><Plus /></button></div>
                <button className="add-button" disabled={!canAddProduct} onClick={addToCart}><span>{canAddProduct ? "Adicionar" : selected.sizes?.length && !selectedSize ? "Escolha o tamanho" : "Escolha os sabores"}</span><strong>{money(modalTotal)}</strong></button>
              </div>
            </div>
          </article>
        </div>
      )}

      {flavorPickerOpen && selected && activePizza && <PizzaFlavorPicker
        title={activePizza.mode === "whole" ? "Escolha o sabor" : activePizzaHalf === "left" ? "Escolha a 1ª metade" : "Escolha a 2ª metade"}
        flavors={availableFlavors.filter(flavor => activePizza.mode !== "half" || flavor.id !== (activePizzaHalf === "left" ? activePizza.rightId : activePizza.leftId))}
        selectedId={activePizzaHalf === "right" && activePizza.mode === "half" ? activePizza.rightId : activePizza.leftId}
        size={selectedSize} showPrices={isPizzaFlavor(selected)} notice={flavorNotice}
        onChoose={choosePizzaFlavor} onClose={() => { setFlavorPickerOpen(false); setFlavorNotice(""); }} />}

      {cartOpen && <div className="overlay drawer-overlay" onMouseDown={(event) => event.target === event.currentTarget && setCartOpen(false)}>
        <aside className="cart-drawer">
          <header><div><span>{checkingOut ? "ENTREGA" : "SEU PEDIDO"}</span><h2>{checkingOut ? "Finalizar pedido" : "Carrinho"}</h2></div><button className="close" onClick={() => setCartOpen(false)}><X /></button></header>
          <div className="cart-body">
            {checkingOut ? <CheckoutForm subtotal={cartTotal} items={checkoutItems} initialCouponCode={claimedCouponCode} onBack={() => setCheckingOut(false)} onComplete={(orderId, paymentPath) => { if (!paymentPath) { const history = JSON.parse(localStorage.getItem("urfood_orders") ?? "[]") as Array<{ id: string; createdAt: string }>; localStorage.setItem("urfood_current_order", orderId); localStorage.setItem("urfood_orders", JSON.stringify([{ id: orderId, createdAt: new Date().toISOString() }, ...history.filter((order) => order.id !== orderId)].slice(0, 20))); } if (claimedCouponCode) { const used = [...new Set([...usedCouponCodes, claimedCouponCode.toUpperCase()])]; localStorage.setItem("urfood_used_coupons", JSON.stringify(used)); setUsedCouponCodes(used); } localStorage.removeItem("urfood_claimed_coupon"); setClaimedCouponCode(""); setCart([]); window.location.href = paymentPath ? `/pagamento/${paymentPath}/${orderId}` : `/status/${orderId}`; }} /> : <>
            {cart.length === 0 ? <div className="empty-cart"><ShoppingBag /><h3>Seu carrinho está vazio</h3><p>Escolha algo delicioso no cardápio.</p></div> : cart.map((item, index) => (
              <div className="cart-line" key={`${item.id}-${index}`}><FoodImage src={item.image} alt="" /><div><h3>{item.quantity}x {item.name}{item.size ? ` (${item.size})` : ""}</h3><p>{item.pizzaSelections.length ? item.pizzaSelections.map((pizza, pizzaIndex) => `Pizza ${pizzaIndex + 1}: ${flavorName(pizza.leftId)}${pizza.mode === "half" ? ` / ${flavorName(pizza.rightId)}` : ""}`).join(" · ") : item.selectedExtras.map((extra) => extra.name).join(", ") || "Sem adicionais"}</p><strong>{money((item.price + item.selectedExtras.reduce((sum, extra) => sum + extra.price, 0)) * item.quantity)}</strong></div><button onClick={() => setCart((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={17} /></button></div>
            ))}
            </>}
          </div>
          {!checkingOut && cart.length > 0 && <footer><div><span>Subtotal</span><strong>{money(cartTotal)}</strong></div><button onClick={() => setCheckingOut(true)}>Continuar pedido <ChevronRight /></button></footer>}
        </aside>
      </div>}
    </div>
  );
}
