import { FormEvent, useEffect, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  Clock3,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LogOut,
  Phone,
  ShoppingBag,
  UserRound,
  Wallet,
} from "lucide-react";
import { API_URL } from "../services/admin-api";
import type { CustomerDetails } from "../types/customer";
import { customerOrderLabel } from "../features/order-status/order-presentation";
import { registrationProof } from "../services/realtime";

type LoginMode = "login" | "register" | "reset";
type AuthResponse = {
  token?: string;
  customer?: CustomerDetails & { claimedCouponCode?: string | null };
  code?: string;
  message?: string;
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

export function CustomerProfilePage() {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mode, setMode] = useState<LoginMode>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [profile, setProfile] = useState<CustomerDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  function saveSession(data: AuthResponse) {
    if (!data.token || !data.customer)
      throw new Error(data.message ?? "Resposta de autenticação inválida.");
    localStorage.setItem("urfood_customer_token", data.token);
    localStorage.setItem(
      "urfood_customer",
      JSON.stringify({ name: data.customer.name, phone: data.customer.phone }),
    );
    localStorage.setItem(
      "urfood_customer_profile",
      JSON.stringify(data.customer),
    );
    localStorage.setItem(
      "urfood_used_coupons",
      JSON.stringify(data.customer.usedCouponCodes ?? []),
    );
    if (data.customer.claimedCouponCode)
      localStorage.setItem(
        "urfood_claimed_coupon",
        data.customer.claimedCouponCode,
      );
    else localStorage.removeItem("urfood_claimed_coupon");
    const activeOrder = data.customer.orders.find(
      (order) => !["COMPLETED", "CANCELED"].includes(order.status),
    );
    if (activeOrder)
      localStorage.setItem("urfood_current_order", activeOrder.id);
    else localStorage.removeItem("urfood_current_order");
    setProfile(data.customer);
    window.dispatchEvent(new Event("urfood:customer-session"));
  }
  async function submit() {
    if (mode !== "login" && password !== confirmPassword) {
      setError("As senhas não são iguais.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const endpoint =
        mode === "login"
          ? "login"
          : mode === "register"
            ? "register"
            : "reset-password";
      const response = await fetch(`${API_URL}/customers/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password, ...(mode === "register" ? registrationProof() : {}) }),
      });
      const data = (await response.json()) as AuthResponse;
      if (!response.ok) {
        if (data.code === "ACCOUNT_SETUP_REQUIRED") setMode("register");
        throw new Error(data.message ?? "Não foi possível entrar.");
      }
      saveSession(data);
      setPassword("");
      setConfirmPassword("");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Não foi possível entrar.",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const token = localStorage.getItem("urfood_customer_token");
    if (!token) return;
    setLoading(true);
    fetch(`${API_URL}/customers/session`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        const data = (await response.json()) as CustomerDetails & {
          claimedCouponCode?: string | null;
          message?: string;
        };
        if (!response.ok) throw new Error(data.message);
        setProfile(data);
        localStorage.setItem(
          "urfood_customer",
          JSON.stringify({ name: data.name, phone: data.phone }),
        );
        if (data.claimedCouponCode)
          localStorage.setItem("urfood_claimed_coupon", data.claimedCouponCode);
        else localStorage.removeItem("urfood_claimed_coupon");
        const activeOrder = data.orders.find(
          (order) => !["COMPLETED", "CANCELED"].includes(order.status),
        );
        if (activeOrder)
          localStorage.setItem("urfood_current_order", activeOrder.id);
        else localStorage.removeItem("urfood_current_order");
        window.dispatchEvent(new Event("urfood:customer-session"));
      })
      .catch(() => logout())
      .finally(() => setLoading(false));
  }, []);
  function logout() {
    [
      "urfood_customer_token",
      "urfood_customer",
      "urfood_customer_profile",
      "urfood_claimed_coupon",
      "urfood_current_order",
      "urfood_orders",
      "urfood_tracking_tokens",
    ].forEach((key) => localStorage.removeItem(key));
    setProfile(null);
    setPhone("");
    setPassword("");
    setConfirmPassword("");
    setMode("login");
    window.dispatchEvent(new Event("urfood:customer-session"));
  }
  if (!profile)
    return (
      <main className="customer-profile-page">
        <section className="customer-login-card">
          <a href="/cardapio">
            <ArrowLeft />
            Voltar ao cardápio
          </a>
          <div className="customer-login-icon">
            {mode === "login" ? <UserRound /> : <KeyRound />}
          </div>
          <span>ÁREA DO CLIENTE</span>
          <h1>
            {mode === "login"
              ? "Entre no seu perfil"
              : mode === "register"
                ? "Crie sua senha"
                : "Cadastre uma nova senha"}
          </h1>
          <p>
            {mode === "login"
              ? "Acesse seus pedidos e cupons usando telefone e senha."
              : mode === "register"
                ? "No primeiro acesso, escolha uma senha para proteger seu histórico."
                : "Informe o telefone dos seus pedidos e defina sua nova senha."}
          </p>
          <form
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void submit();
            }}
          >
            <label>
              Telefone
              <div>
                <Phone />
                <input
                  autoFocus
                  required
                  inputMode="tel"
                  minLength={14}
                  maxLength={15}
                  value={phone}
                  onChange={(event) =>
                    setPhone(formatPhone(event.target.value))
                  }
                  placeholder="(00) 00000-0000"
                />
              </div>
            </label>
            <label>
              {mode === "reset" ? "Nova senha" : "Senha"}
              <div>
                <KeyRound />
                <input
                  required
                  minLength={6}
                  maxLength={72}
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Mínimo de 6 caracteres"
                />
                <button
                  className="password-visibility"
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label="Mostrar ou ocultar senha"
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </label>
            {mode !== "login" && (
              <label>
                Confirme a senha
                <div>
                  <KeyRound />
                  <input
                    required
                    minLength={6}
                    maxLength={72}
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Repita a senha"
                  />
                </div>
              </label>
            )}
            {error && <small className="customer-login-error">{error}</small>}
            <button disabled={loading}>
              {loading ? (
                <>
                  <LoaderCircle className="spinner" />
                  Aguarde...
                </>
              ) : mode === "login" ? (
                "Entrar no perfil"
              ) : mode === "register" ? (
                "Criar senha e entrar"
              ) : (
                "Salvar nova senha"
              )}
            </button>
          </form>
          <div className="customer-auth-links">
            {mode === "login" ? (
              <>
                <button
                  onClick={() => {
                    setMode("register");
                    setError("");
                  }}
                >
                  Primeiro acesso
                </button>
                <button
                  onClick={() => {
                    setMode("reset");
                    setError("");
                  }}
                >
                  Esqueci minha senha
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  setMode("login");
                  setError("");
                }}
              >
                Voltar para o login
              </button>
            )}
          </div>
        </section>
      </main>
    );
  return (
    <main className="customer-profile-page">
      <section className="customer-profile">
        <header>
          <a href="/cardapio">
            <ArrowLeft />
            Cardápio
          </a>
          <button onClick={logout}>
            <LogOut />
            Sair
          </button>
        </header>
        <div className="customer-profile-hero">
          <i>{profile.name.slice(0, 1).toUpperCase()}</i>
          <div>
            <span>SEU PERFIL</span>
            <h1>Olá, {profile.name.split(" ")[0]}</h1>
            <p>
              {profile.phone} · cliente desde{" "}
              {new Date(profile.customerSince).toLocaleDateString("pt-BR")}
            </p>
          </div>
        </div>
        <div className="customer-profile-kpis">
          <article>
            <ShoppingBag />
            <span>
              <small>Pedidos realizados</small>
              <strong>{profile.ordersCount}</strong>
            </span>
          </article>
          <article>
            <Wallet />
            <span>
              <small>Total em compras</small>
              <strong>{money(profile.totalSpent)}</strong>
            </span>
          </article>
          <article>
            <Clock3 />
            <span>
              <small>Ticket médio</small>
              <strong>{money(profile.averageTicket)}</strong>
            </span>
          </article>
        </div>
        <section className="customer-profile-orders">
          <header>
            <div>
              <span>HISTÓRICO</span>
              <h2>Seus pedidos</h2>
            </div>
            <b>{profile.orders.length}</b>
          </header>
          {profile.orders.map((order) => (
            <a href={`/status/${order.id}`} key={order.id}>
              <div>
                <strong>#{order.displayNumber}</strong>
                <small>
                  {new Date(order.createdAt).toLocaleString("pt-BR")}
                </small>
              </div>
              <span>
                {order.items
                  ?.map((item) => `${item.quantity}x ${item.productName}`)
                  .join(" · ")}
              </span>
              <b>{money(Number(order.total))}</b>
              <em
                className={`order-status status-${order.status.toLowerCase()}`}
              >
                {customerOrderLabel(order)}
              </em>
              <ChevronRight />
            </a>
          ))}
        </section>
      </section>
    </main>
  );
}
