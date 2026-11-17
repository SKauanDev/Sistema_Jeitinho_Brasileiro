import { customerCheckoutHeaders } from "./customer-checkout-session";
import { defaultsFromProfile, readCheckoutDefaults, rememberCheckoutDefaults } from "./checkout-defaults";
import type { CustomerDetails } from "../../types/customer";
import { FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Bike, CircleHelp, LoaderCircle, MapPin, ShieldCheck, Store, X } from "lucide-react";
import { API_URL } from "../../services/admin-api";
import { rememberTrackingToken } from "../../services/realtime";
import { formatCurrencyField, parseCurrencyField } from "../../utils/currency-field";

const DIGITAL_SECURITY_FEE = 0.99;

export type CheckoutItem = {
  ingredients?: string[];
  style?: string;
  size?: string;
  pizzaSelections?: Array<{ mode: "whole" | "half"; leftId?: string; rightId?: string; borderId?: string }>;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  notes?: string;
  options: Array<{
    optionId?: string;
    name: string;
    group: string;
    price: number;
  }>;
};
type Props = {
  manual?: boolean;
  subtotal: number;
  items: CheckoutItem[];
  initialCouponCode?: string;
  onBack: () => void;
  onComplete: (orderId: string, paymentPath: string | null) => void;
};
type PaymentMethod = "PIX" | "CASH" | "CREDIT_CARD" | "DEBIT_CARD" | "RECEIVED_ONLINE";
type DeliveryConfig = {
  isOpen: boolean;
  allowDelivery: boolean;
  allowPickup: boolean;
  fixedDeliveryFee: number | null;
  minimumOrder: number;
  averagePreparationMinutes: number;
  payments: {
    pix: boolean;
    cash: boolean;
    cardOnDelivery: boolean;
    onlineCard: boolean;
  };
};
type DeliveryQuote = {
  zoneName: string;
  fee: number;
  minimumOrder: number;
  estimatedMinutesMin: number;
  estimatedMinutesMax: number;
  eligible: boolean;
};
const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const formatPhone = (value: string) => {
  const raw = value.replace(/\D/g, "");
  const digits = ((raw.length === 12 || raw.length === 13) && raw.startsWith("55") ? raw.slice(2) : raw).slice(0,11);
  if (digits.length <= 2) return digits.replace(/^(\d{1,2})/, "($1");
  if (digits.length <= 6) return digits.replace(/^(\d{2})(\d+)/, "($1) $2");
  if (digits.length <= 10)
    return digits.replace(/^(\d{2})(\d{4})(\d+)/, "($1) $2-$3");
  return digits.replace(/^(\d{2})(\d{5})(\d+)/, "($1) $2-$3");
};
const formatCep = (value: string) =>
  value
    .replace(/\D/g, "")
    .slice(0, 8)
    .replace(/^(\d{5})(\d+)/, "$1-$2");
export function CheckoutForm({
  manual = false,
  subtotal,
  items,
  initialCouponCode = "",
  onBack,
  onComplete,
}: Props) {
  const [initial] = useState(()=>readCheckoutDefaults(manual));
  const touched=useRef(new Set<string>());
  const fieldEdits = useRef(new Map<string, number>());
  const autofilled = useRef<Record<string, string>>({});
  const cepRequest = useRef(0);
  const [customerLookup, setCustomerLookup] = useState("");
  const markTouched = (...keys: string[]) => keys.forEach(key => { touched.current.add(key); fieldEdits.current.set(key, (fieldEdits.current.get(key) ?? 0) + 1); });
  const [type, setType] = useState<"DELIVERY" | "PICKUP">(initial.fulfillmentType);
  const [customerName, setCustomerName] = useState(initial.name);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [phone, setPhone] = useState(()=>formatPhone(initial.phone));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [changeFor, setChangeFor] = useState("");
  const [showLgpdInfo, setShowLgpdInfo] = useState(false);
  const [couponCode, setCouponCode] = useState(initialCouponCode);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState("");
  const [coupon, setCoupon] = useState<{
    code: string;
    discount: number;
  } | null>(null);
  const [cep, setCep] = useState(()=>formatCep(initial.address.postalCode));
  const [cepLoading, setCepLoading] = useState(false);
  const [cepMessage, setCepMessage] = useState("");
  const [address, setAddress] = useState(initial.address);
  const changeAddress=(key:keyof typeof address,value:string)=>{markTouched(key);setAddress(current=>({...current,[key]:value}));};
  const changePhone = (value: string) => {
    const next = formatPhone(value);
    if (manual && next !== phone) {
      cepRequest.current++;
      setCepLoading(false); setCepMessage("");
      const previous = autofilled.current;
      setCustomerName(current => previous.name !== undefined && current === previous.name ? "" : current);
      setCep(current => previous.postalCode !== undefined && current === formatCep(previous.postalCode) ? "" : current);
      setAddress(current => Object.fromEntries(Object.entries(current).map(([key, entry]) => [key, previous[key] !== undefined && entry === previous[key] ? "" : entry])) as typeof current);
      autofilled.current = {};
      setCustomerLookup("");
    }
    markTouched("phone"); setPhone(next);
  };
  useEffect(() => {
    if (!manual) return;
    const digits = phone.replace(/\D/g, "");
    if (![10, 11].includes(digits.length)) { setCustomerLookup(""); return; }
    const controller = new AbortController();
    const revisions = new Map(fieldEdits.current);
    const unchanged = (key: string) => (fieldEdits.current.get(key) ?? 0) === (revisions.get(key) ?? 0);
    const timer = window.setTimeout(() => {
      setCustomerLookup("Buscando cliente...");
      void fetch(`${API_URL}/admin/customers/${digits}`, { headers: { Authorization: `Bearer ${localStorage.getItem("urfood_token")}` }, signal: controller.signal, cache: "no-store" }).then(async response => {
        if (controller.signal.aborted) return;
        if (response.status === 404) { setCustomerLookup("Cliente não encontrado. Preencha os dados para este pedido."); return; }
        if (!response.ok) throw new Error("Não foi possível consultar o cliente. Preencha os dados manualmente.");
        const profile = await response.json() as CustomerDetails;
        if (controller.signal.aborted) return;
        const defaults = defaultsFromProfile(profile);
        const filled: Record<string, string> = {};
        if (unchanged("name")) { setCustomerName(defaults.name); filled.name = defaults.name; }
        if (unchanged("postalCode")) { setCep(formatCep(defaults.address.postalCode)); filled.postalCode = defaults.address.postalCode; }
        const addressValues = Object.fromEntries(Object.entries(defaults.address).filter(([key]) => unchanged(key)));
        Object.assign(filled, addressValues);
        setAddress(current => ({ ...current, ...addressValues }));
        autofilled.current = filled;
        setCustomerLookup("Cliente localizado. Confira os dados preenchidos.");
      }).catch(reason => { if (!controller.signal.aborted) setCustomerLookup(reason instanceof Error ? reason.message : "Preencha os dados manualmente."); });
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [manual, phone]);
  useEffect(()=>{
    const token=localStorage.getItem("urfood_customer_token");
    if(manual||!token)return;
    const controller=new AbortController();
    void fetch(`${API_URL}/customers/session`,{headers:{Authorization:`Bearer ${token}`},signal:controller.signal}).then(async response=>{
      if(!response.ok)return;
      const profile=await response.json() as CustomerDetails;
      if(!profile || typeof profile.phone!=="string")return;
      if(controller.signal.aborted||localStorage.getItem("urfood_customer_token")!==token)return;
      localStorage.setItem("urfood_customer_profile",JSON.stringify(profile));
      localStorage.setItem("urfood_customer",JSON.stringify({name:profile.name,phone:profile.phone,address:profile.address}));
      const defaults=readCheckoutDefaults(false);
      if(!touched.current.has("name"))setCustomerName(current=>defaults.name||current);
      if(!touched.current.has("phone"))setPhone(current=>defaults.phone?formatPhone(defaults.phone):current);
      if(!touched.current.has("postalCode"))setCep(current=>defaults.address.postalCode?formatCep(defaults.address.postalCode):current);
      setAddress(current=>Object.fromEntries(Object.keys(current).map(key=>[key,touched.current.has(key)?current[key as keyof typeof current]:defaults.address[key as keyof typeof defaults.address]||current[key as keyof typeof current]])) as typeof current);
    }).catch(()=>undefined);
    return ()=>controller.abort();
  },[manual]);
  const [config, setConfig] = useState<DeliveryConfig | null>(null);
  const [quote, setQuote] = useState<DeliveryQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const deliveryFee = type === "DELIVERY" ? (quote?.fee ?? config?.fixedDeliveryFee ?? 0) : 0;
  const hasDeliveryFee = quote !== null || config?.fixedDeliveryFee !== null && config?.fixedDeliveryFee !== undefined;
  const total = Number((subtotal + DIGITAL_SECURITY_FEE + deliveryFee - (coupon?.discount ?? 0)).toFixed(2));
  const availablePayments: Array<[PaymentMethod, string]> = config
    ? [
        config.payments.pix && ["PIX", "PIX"],
        config.payments.cash && ["CASH", "Dinheiro"],
        config.payments.cardOnDelivery && ["CREDIT_CARD", "Crédito na entrega"],
        config.payments.cardOnDelivery && ["DEBIT_CARD", "Débito na entrega"],
      ].filter((item): item is [PaymentMethod, string] => Boolean(item))
    : [];
  if (manual) availablePayments.push(["RECEIVED_ONLINE", "Pagamento online já recebido"]);

  useEffect(() => {
    let active = true, fetching = false, loaded = false;
    const controller = new AbortController();
    const refresh = () => {
      if (fetching || document.visibilityState === "hidden") return;
      fetching = true;
      void fetch(`${API_URL}/delivery/config`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json()) as DeliveryConfig & {
          message?: string;
        };
        if (!response.ok)
          throw new Error(
            result.message ?? "Falha ao carregar as regras da loja.",
          );
        if (!active) return;
        loaded = true;
        setConfig(result);
        if (!result.allowDelivery && result.allowPickup) setType("PICKUP");
        const first: PaymentMethod | undefined = result.payments.cash
          ? "CASH"
          : result.payments.cardOnDelivery
            ? "CREDIT_CARD"
            : result.payments.pix
              ? "PIX"
              : manual ? "RECEIVED_ONLINE" : undefined;
        setPaymentMethod(current => {
          const valid = current === "CASH" ? result.payments.cash : current === "PIX" ? result.payments.pix : ["CREDIT_CARD", "DEBIT_CARD"].includes(current) ? result.payments.cardOnDelivery : manual;
          return valid ? current : first ?? current;
        });
      })
      .catch(reason => {
        if (active && !loaded) setError(reason instanceof Error ? reason.message : "Falha ao carregar as regras da loja.");
      }).finally(() => { fetching = false; });
    };
    refresh();
    const timer = window.setInterval(refresh, 15_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("urfood:store-settings-changed", refresh);
    return () => {
      active = false; controller.abort(); window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("urfood:store-settings-changed", refresh);
    };
  }, [manual]);

  useEffect(() => {
    const controller = new AbortController();
    setQuote(null);
    setQuoteLoading(false);
    if (type !== "DELIVERY" || !address.neighborhood.trim()) {
      setQuote(null);
      setQuoteError("");
      return;
    }
    const timer = window.setTimeout(() => {
      setQuoteLoading(true);
      setQuoteError("");
      void fetch(`${API_URL}/delivery/quote`, {
        signal: controller.signal,
        method: "POST",
        headers: { "Content-Type": "application/json", ...(localStorage.getItem("urfood_customer_token") ? { Authorization: `Bearer ${localStorage.getItem("urfood_customer_token")}` } : {}) },
        body: JSON.stringify({ neighborhood: address.neighborhood, city: address.city, state: address.state, subtotal }),
      })
        .then(async (response) => {
          const result = (await response.json()) as DeliveryQuote & {
            message?: string;
          };
          if (!response.ok)
            throw new Error(
              result.message ?? "Não foi possível calcular a entrega.",
            );
          if (!controller.signal.aborted) setQuote(result);
        })
        .catch((reason) => {
          if (controller.signal.aborted) return;
          setQuote(null);
          setQuoteError(
            reason instanceof Error
              ? reason.message
              : "Não foi possível calcular a entrega.",
          );
        })
        .finally(() => { if (!controller.signal.aborted) setQuoteLoading(false); });
    }, 450);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [address.neighborhood, address.city, address.state, subtotal, type]);

  async function lookupCep(value: string) {
    const requestId = ++cepRequest.current;
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 8) {
      setCepLoading(false);
      setCepMessage("");
      return;
    }
    setCepLoading(true);
    setCepMessage("");
    try {
      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = (await response.json()) as {
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };
      if (requestId !== cepRequest.current) return;
      if (!response.ok || data.erro) throw new Error("CEP não encontrado.");
      setAddress(current=>({...current,
        street: data.logradouro ?? "",
        neighborhood: data.bairro ?? "",
        city: data.localidade ?? "",
        state: data.uf ?? "",
        postalCode: digits,
      }));
      setCepMessage("Endereço localizado automaticamente.");
    } catch (reason) {
      if (requestId !== cepRequest.current) return;
      setCepMessage(
        reason instanceof Error
          ? reason.message
          : "Não foi possível consultar o CEP.",
      );
    } finally {
      if (requestId === cepRequest.current) setCepLoading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const field = (name: string) => {
      const control = formElement.elements.namedItem(name);
      return (control instanceof HTMLInputElement ? control.value : String(form.get(name) ?? "")).trim();
    };
    const customerName = field("name"), customerPhone = field("phone");
    if (!customerName || !customerPhone) {
      setError(`Preencha ${[!customerName && "o nome", !customerPhone && "o telefone"].filter(Boolean).join(" e ")} para confirmar o pedido.`);
      return;
    }
    if (!items.length) { setError("Seu carrinho está vazio. Volte ao cardápio e adicione os itens novamente."); return; }
    if (!availablePayments.some(([method]) => method === paymentMethod)) { setError("Selecione uma forma de pagamento disponível."); return; }
    if (!manual && !config?.isOpen) {
      setError("A loja está fechada no momento.");
      return;
    }
    if (type === "DELIVERY" && (!quote || !quote.eligible)) {
      setError(
        quoteError || `O pedido não atende às regras de entrega desta região.`,
      );
      return;
    }
    setLoading(true);
    setError("");
    const body = {
      manual,
      customerName,
      customerPhone,
      fulfillmentType: type,
      deliveryFee,
      items,
      paymentMethod,
      changeFor:
        paymentMethod === "CASH" ? Number(changeFor) || undefined : undefined,
      couponCode: coupon?.code,
      address:
        type === "DELIVERY"
          ? {
              street: field("street"),
              number: field("number"),
              neighborhood: field("neighborhood"),
              city: field("city"),
              state: field("state"),
              complement: field("complement"),
              postalCode: field("postalCode"),
            }
          : undefined,
    };
    try {
      const response = await fetch(`${API_URL}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...customerCheckoutHeaders(manual, customerPhone) },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as {
        id?: string;
        createdAt?: string;
        trackingToken?: string;
        paymentPath?: string | null;
        message?: string;
      };
      if (!response.ok || !data.id)
        throw new Error(data.message ?? "Não foi possível enviar o pedido.");
      if (data.trackingToken) rememberTrackingToken(data.id, data.trackingToken);
      rememberCheckoutDefaults({...body,createdAt:data.createdAt});
      onComplete(data.id, data.paymentPath ?? null);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Falha ao enviar o pedido.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function applyCoupon(code = couponCode) {
    if (!code.trim()) return;
    setCouponLoading(true);
    setCouponError("");
    try {
      const response = await fetch(`${API_URL}/coupons/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, subtotal, customerPhone: phone }),
      });
      const data = (await response.json()) as {
        code?: string;
        discount?: number;
        message?: string;
      };
      if (!response.ok || !data.code)
        throw new Error(data.message ?? "Cupom inválido.");
      setCouponCode(data.code);
      setCoupon({ code: data.code, discount: Number(data.discount ?? 0) });
    } catch (reason) {
      setCoupon(null);
      setCouponError(
        reason instanceof Error ? reason.message : "Cupom inválido.",
      );
    } finally {
      setCouponLoading(false);
    }
  }

  useEffect(() => {
    if (initialCouponCode) void applyCoupon(initialCouponCode);
  }, [initialCouponCode]);

  return (
    <>
    <form className="checkout-form" onSubmit={submit}>
      <button type="button" className="checkout-back" onClick={onBack}>
        <ArrowLeft /> Voltar ao carrinho
      </button>
      <div className="checkout-heading">
        <span>FINALIZAR PEDIDO</span>
        <h2>Como deseja receber?</h2>
      </div>
      {config && !config.isOpen && !manual && (
        <p className="checkout-operational-alert">
          A loja está fechada conforme o horário de funcionamento. O envio de
          pedidos será liberado na próxima abertura.
        </p>
      )}
      <div className="fulfillment-options">
        <button
          type="button"
          className={type === "DELIVERY" ? "active" : ""}
          disabled={config !== null && !config.allowDelivery}
          onClick={() => setType("DELIVERY")}
        >
          <Bike />
          <span>
            <strong>Entrega</strong>
            <small>Receba no seu endereço</small>
          </span>
        </button>
        <button
          type="button"
          className={type === "PICKUP" ? "active" : ""}
          disabled={config !== null && !config.allowPickup}
          onClick={() => setType("PICKUP")}
        >
          <Store />
          <span>
            <strong>Retirada</strong>
            <small>Busque na loja</small>
          </span>
        </button>
      </div>
      <div className="checkout-fields">
        <label>
          Nome completo
          <input
            name="name"
            required
            autoComplete="name"
            value={customerName}
            onChange={event=>{markTouched("name");setCustomerName(event.target.value);}}
            placeholder="Quem receberá o pedido?"
          />
        </label>
        <label>
          Telefone / WhatsApp
          <input
            name="phone"
            required
            autoComplete="tel"
            inputMode="tel"
            value={phone}
            onChange={event => changePhone(event.target.value)}
            minLength={14}
            maxLength={15}
            placeholder="(00) 00000-0000"
          />
          {manual && customerLookup && <small className="manual-customer-lookup" role="status" aria-live="polite">{customerLookup}</small>}
        </label>
      </div>
      {type === "DELIVERY" && (
        <section className="address-fields">
          <h3>
            <MapPin /> Endereço de entrega
          </h3>
          <div className="checkout-fields">
            <label className="field-wide cep-field">
              CEP
              <div>
                <input
                  name="postalCode"
                  required
                  autoComplete="postal-code"
                  inputMode="numeric"
                  value={cep}
                  onChange={(event) => {
                    markTouched("postalCode", "street", "neighborhood", "city", "state");
                    const formatted = formatCep(event.target.value);
                    setCep(formatted);
                    void lookupCep(formatted);
                  }}
                  placeholder="00000-000"
                />
                {cepLoading && <LoaderCircle className="spinner" />}
              </div>
              {cepMessage && (
                <small
                  className={
                    cepMessage.includes("automaticamente")
                      ? "cep-success"
                      : "cep-error"
                  }
                >
                  {cepMessage}
                </small>
              )}
            </label>
            <label className="field-grow">
              Rua
              <input
                name="street"
                required
                autoComplete="address-line1"
                value={address.street}
                onChange={event=>changeAddress("street",event.target.value)}
                placeholder="Nome da rua"
              />
            </label>
            <label className="field-number">
              Número
              <input name="number" required placeholder="Nº" value={address.number} onChange={event=>changeAddress("number",event.target.value)} />
            </label>
            <label>
              Bairro
              <input
                name="neighborhood"
                required
                value={address.neighborhood}
                onChange={event=>changeAddress("neighborhood",event.target.value)}
              />
            </label>
            <label>
              Cidade
              <input
                name="city"
                required
                autoComplete="address-level2"
                value={address.city}
                onChange={event=>changeAddress("city",event.target.value)}
              />
            </label>
            <label className="field-state">
              UF
              <input
                name="state"
                required
                autoComplete="address-level1"
                value={address.state}
                onChange={event=>changeAddress("state",event.target.value.toUpperCase().slice(0,2))}
                maxLength={2}
                placeholder="SP"
              />
            </label>
            <label className="field-grow">
              Complemento
              <input
                name="complement"
                value={address.complement}
                onChange={event=>changeAddress("complement",event.target.value)}
                autoComplete="address-line2"
                placeholder="Apto, bloco, referência..."
              />
            </label>
          </div>
          {quoteLoading && (
            <p className="delivery-quote checking">
              <LoaderCircle className="spinner" /> Calculando taxa e prazo...
            </p>
          )}
          {quoteError && <p className="delivery-quote error">{quoteError}</p>}
          {quote && (
            <p
              className={`delivery-quote ${quote.eligible ? "success" : "error"}`}
            >
              <Bike />
              <span>
                <strong>
                  {quote.zoneName} · {money(quote.fee)}
                </strong>
                <small>
                  {quote.estimatedMinutesMin}–{quote.estimatedMinutesMax} min ·
                  pedido mínimo {money(quote.minimumOrder)}
                </small>
                {!quote.eligible && (
                  <small>
                    Adicione {money(Math.max(0, quote.minimumOrder - subtotal))}{" "}
                    ao pedido para liberar a entrega.
                  </small>
                )}
              </span>
            </p>
          )}
        </section>
      )}
      <section className="checkout-coupon">
        <h3>Cupom de desconto</h3>
        <div>
          <input
            value={couponCode}
            disabled={!!coupon}
            onChange={(event) =>
              setCouponCode(event.target.value.toUpperCase())
            }
            placeholder="Digite seu cupom"
          />
          <button
            type="button"
            disabled={couponLoading}
            onClick={() =>
              coupon ? (setCoupon(null), setCouponCode("")) : void applyCoupon()
            }
          >
            {couponLoading ? "Validando..." : coupon ? "Remover" : "Aplicar"}
          </button>
        </div>
        {coupon && (
          <small>
            ✓ Cupom {coupon.code}: − {money(coupon.discount)}
          </small>
        )}
        {couponError && <small className="error">{couponError}</small>}
      </section>
      <section className="checkout-payment">
        <h3>Forma de pagamento</h3>
        <div>
          {availablePayments.map(([value, label]) => (
            <button
              type="button"
              className={paymentMethod === value ? "active" : ""}
              onClick={() => { setPaymentMethod(value); }}
              key={value}
            >
              {label}
            </button>
          ))}
        </div>
        {paymentMethod === "CASH" && (
          <label>
            Troco para quanto?
            <input
              inputMode="numeric"
              value={formatCurrencyField(changeFor)}
              onChange={(event) => setChangeFor(String(parseCurrencyField(event.target.value) ?? ""))}
              placeholder="R$ 0,00"
            />
          </label>
        )}
      </section>
      {error && <p className="checkout-error">{error}</p>}
      <div className="checkout-totals">
        <div>
          <span>Subtotal</span>
          <strong>{money(subtotal)}</strong>
        </div>
        <div className="checkout-digital-fee">
          <span className="checkout-fee-label">Taxa LGPD <button type="button" onClick={() => setShowLgpdInfo(true)} aria-label="Saiba mais sobre a taxa LGPD" title="Saiba mais sobre a taxa LGPD"><CircleHelp size={15} aria-hidden="true" /></button></span>
          <strong>{money(DIGITAL_SECURITY_FEE)}</strong>
        </div>
        {coupon && (
          <div className="coupon-discount">
            <span>Desconto</span>
            <strong>− {money(coupon.discount)}</strong>
          </div>
        )}
        <div>
          <span>{type === "DELIVERY" ? "Taxa de entrega" : "Retirada"}</span>
          <strong>{type === "PICKUP" ? "Sem taxa" : hasDeliveryFee ? money(deliveryFee) : "A calcular"}</strong>
        </div>
        <div className="checkout-total">
          <span>Total</span>
          <strong>
            {money(total)}
          </strong>
        </div>
      </div>
      <button
        className="place-order"
        disabled={
          loading ||
          !config ||
          (!manual && !config.isOpen) ||
          availablePayments.length === 0 ||
          (type === "DELIVERY" && (!quote || !quote.eligible))
        }
      >
        {loading ? (
          <>
            <LoaderCircle className="spinner" /> Enviando...
          </>
        ) : (
          `Confirmar pedido · ${money(total)}`
        )}
      </button>
    </form>
    {showLgpdInfo && createPortal(
      <div className="overlay lgpd-fee-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowLgpdInfo(false); }}>
        <section className="lgpd-fee-dialog" role="dialog" aria-modal="true" aria-labelledby="lgpd-fee-title" aria-describedby="lgpd-fee-description">
          <button type="button" className="lgpd-fee-close" onClick={() => setShowLgpdInfo(false)} aria-label="Fechar informação"><X size={18} /></button>
          <span className="lgpd-fee-icon"><ShieldCheck size={22} aria-hidden="true" /></span>
          <h3 id="lgpd-fee-title">Taxa LGPD</h3>
          <p id="lgpd-fee-description">A taxa de LGPD garante a segurança e a experiência do pedido online.</p>
          <button type="button" className="lgpd-fee-confirm" onClick={() => setShowLgpdInfo(false)}>Entendi</button>
        </section>
      </div>, (manual ? globalThis.document.querySelector(".manual-order-dialog") : null) ?? globalThis.document.body,
    )}
    </>
  );
}
