import { FormEvent, useEffect, useState } from "react";
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
  const digits = value.replace(/\D/g, "").slice(0, 11);
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
  const [type, setType] = useState<"DELIVERY" | "PICKUP">("DELIVERY");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [phone, setPhone] = useState(() => {
    try {
      return formatPhone(
        (
          JSON.parse(localStorage.getItem("urfood_customer") ?? "null") as {
            phone?: string;
          } | null
        )?.phone ?? "",
      );
    } catch {
      return "";
    }
  });
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
  const [cep, setCep] = useState("");
  const [cepLoading, setCepLoading] = useState(false);
  const [cepMessage, setCepMessage] = useState("");
  const [address, setAddress] = useState({
    street: "",
    neighborhood: "",
    city: "",
    state: "",
  });
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
    void fetch(`${API_URL}/delivery/config`)
      .then(async (response) => {
        const result = (await response.json()) as DeliveryConfig & {
          message?: string;
        };
        if (!response.ok)
          throw new Error(
            result.message ?? "Falha ao carregar as regras da loja.",
          );
        setConfig(result);
        if (!result.allowDelivery && result.allowPickup) setType("PICKUP");
        const first: PaymentMethod | undefined = result.payments.cash
          ? "CASH"
          : result.payments.cardOnDelivery
            ? "CREDIT_CARD"
            : result.payments.pix
              ? "PIX"
              : manual ? "RECEIVED_ONLINE" : undefined;
        if (first) setPaymentMethod(first);
      })
      .catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Falha ao carregar as regras da loja.",
        ),
      );
  }, []);

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
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 8) {
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
      if (!response.ok || data.erro) throw new Error("CEP não encontrado.");
      setAddress({
        street: data.logradouro ?? "",
        neighborhood: data.bairro ?? "",
        city: data.localidade ?? "",
        state: data.uf ?? "",
      });
      setCepMessage("Endereço localizado automaticamente.");
    } catch (reason) {
      setCepMessage(
        reason instanceof Error
          ? reason.message
          : "Não foi possível consultar o CEP.",
      );
    } finally {
      setCepLoading(false);
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
        headers: { "Content-Type": "application/json", ...(manual ? { Authorization: `Bearer ${localStorage.getItem("urfood_token")}` } : {}) },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as {
        id?: string;
        trackingToken?: string;
        paymentPath?: string | null;
        message?: string;
      };
      if (!response.ok || !data.id)
        throw new Error(data.message ?? "Não foi possível enviar o pedido.");
      if (data.trackingToken) rememberTrackingToken(data.id, data.trackingToken);
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
            onChange={(event) => setPhone(formatPhone(event.target.value))}
            minLength={14}
            maxLength={15}
            placeholder="(00) 00000-0000"
          />
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
                onChange={(event) =>
                  setAddress((current) => ({
                    ...current,
                    street: event.target.value,
                  }))
                }
                placeholder="Nome da rua"
              />
            </label>
            <label className="field-number">
              Número
              <input name="number" required placeholder="Nº" />
            </label>
            <label>
              Bairro
              <input
                name="neighborhood"
                required
                value={address.neighborhood}
                onChange={(event) =>
                  setAddress((current) => ({
                    ...current,
                    neighborhood: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Cidade
              <input
                name="city"
                required
                autoComplete="address-level2"
                value={address.city}
                onChange={(event) =>
                  setAddress((current) => ({
                    ...current,
                    city: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field-state">
              UF
              <input
                name="state"
                required
                autoComplete="address-level1"
                value={address.state}
                onChange={(event) =>
                  setAddress((current) => ({
                    ...current,
                    state: event.target.value.toUpperCase().slice(0, 2),
                  }))
                }
                maxLength={2}
                placeholder="SP"
              />
            </label>
            <label className="field-grow">
              Complemento
              <input
                name="complement"
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
