import { useEffect, useState } from "react";
import {
  BarChart3,
  Bell,
  Boxes,
  ClipboardList,
  ExternalLink,
  FileBarChart,
  LogOut,
  Menu,
  Settings,
  Store,
  Tags,
  Users,
  UserRoundCog,
  UtensilsCrossed,
  WalletCards,
  X,
} from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useOrderAlerts } from "../features/admin/useOrderAlerts";
import { adminApi } from "../services/admin-api";
import { adminHome, getCurrentUser, logout } from "../services/auth";

const navigation: Array<{ path: string; label: string; icon: typeof BarChart3; orders?: boolean; adminOnly?: boolean }> = [
  { path: "/admin/dashboard", label: "Dashboard", icon: BarChart3 },
  { path: "/pedidos", label: "Pedidos", icon: ClipboardList, orders: true },
  { path: "/admin/cardapio", label: "Cardápio", icon: UtensilsCrossed },
  { path: "/estoque", label: "Estoque", icon: Boxes },
  { path: "/clientes", label: "Clientes", icon: Users },
  { path: "/financeiro", label: "Financeiro", icon: WalletCards },
  { path: "/promocoes", label: "Cupons e promoções", icon: Tags },
  { path: "/relatorios", label: "Relatórios", icon: FileBarChart },
  { path: "/configuracoes", label: "Configurações", icon: Settings },
  { path: "/usuarios", label: "Usuários", icon: UserRoundCog, adminOnly: true },
];

export function AdminPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { newOrders, soundReady, enableSound } = useOrderAlerts();
  const [store, setStore] = useState<{
    isOpen: boolean;
    configuredOpen: boolean;
    storeName: string;
  } | null>(null);
  const [changingStore, setChangingStore] = useState(false);
  const location = useLocation();
  const user = getCurrentUser();
  const kitchen = user?.role === "KITCHEN";
  const current =
    navigation.find((item) => location.pathname === item.path) ?? navigation[0];

  useEffect(() => {
    const refreshStore = () => {
      if (kitchen) void adminApi.orderStore().then(store => setStore({ ...store, isOpen: false, configuredOpen: false })).catch(() => undefined);
      else void adminApi.store().then(setStore).catch(() => undefined);
    };
    refreshStore();
    const timer = window.setInterval(refreshStore, 15_000);
    return () => window.clearInterval(timer);
  }, [kitchen]);

  function signOut() {
    logout();
    window.location.href = "/";
  }
  async function toggleStore() {
    if (
      !store ||
      !window.confirm(
        `Deseja realmente ${store.configuredOpen ? "fechar manualmente" : "reativar conforme os horários"} a loja?`,
      )
    )
      return;
    setChangingStore(true);
    try {
      setStore(await adminApi.updateStoreStatus(!store.configuredOpen));
    } finally {
      setChangingStore(false);
    }
  }

  return (
    <div className="admin-shell">
      <aside id="admin-sidebar" className={`admin-sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <header>
          <a href={adminHome()}>
            <img src="/images/logo.png" alt="Pizzaria Jeitinho Brasileiro" />
          </a>
          <button onClick={() => setSidebarOpen(false)} aria-label="Fechar menu">
            <X />
          </button>
        </header>
        <nav aria-label="Menu principal">
          <small>MENU PRINCIPAL</small>
          {navigation.filter(item => kitchen ? item.orders : !item.adminOnly || user?.role === "ADMIN").map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                to={item.path}
                className={({ isActive }) => (isActive ? "active" : "")}
                key={item.path}
                aria-label={item.label}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon />
                <span className="sidebar-label">{item.label}</span>
                {item.orders && newOrders > 0 && <b>{newOrders}</b>}
              </NavLink>
            );
          })}
          {!kitchen && <a
            className="sidebar-menu-preview"
            href="/cardapio"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setSidebarOpen(false)}
          >
            <Store />
            <span className="sidebar-label">Ver cardápio</span>
            <ExternalLink />
          </a>}
        </nav>
        <footer>
          <div className="admin-user-avatar">
            {user?.name?.charAt(0) ?? "D"}
          </div>
          <span>
            <strong>{user?.name ?? "Administrador"}</strong>
            <small>{kitchen ? "Cozinha" : user?.role ?? "ADMIN"}</small>
          </span>
          <button onClick={signOut} title="Sair">
            <LogOut />
          </button>
        </footer>
      </aside>
      <section className="admin-main">
        <header className="admin-topbar">
          <button
            className="sidebar-trigger"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menu"
            aria-controls="admin-sidebar"
            aria-expanded={sidebarOpen}
          >
            <Menu />
          </button>
          <div className="admin-breadcrumb">
            <span>{store?.storeName ?? "Jeitinho Brasileiro"}</span>
            <b>/</b>
            <strong>{current.label}</strong>
          </div>
          <div className="admin-actions">
            {!kitchen && <button
              className={`store-status-button ${store?.isOpen ? "open" : "closed"}`}
              disabled={!store || changingStore}
              onClick={toggleStore}
            >
              <i />
              {store?.isOpen ? "Loja aberta" : "Loja fechada"}
            </button>}
            {!kitchen && <a
              className="menu-preview-link"
              href="/cardapio"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Store /> Ver cardápio <ExternalLink />
            </a>}
            <button className="notification-button notification-sound" title={soundReady ? "Testar som de novo pedido" : "Ativar som de novos pedidos"} onClick={() => void enableSound()} aria-label={soundReady ? "Testar som de novo pedido" : "Ativar som de novos pedidos"}>
              <Bell /><span>{soundReady ? "Som ativo" : "Ativar som"}</span>
              {newOrders > 0 && <i>{newOrders}</i>}
            </button>
            <div className="top-avatar">{user?.name?.charAt(0) ?? "D"}</div>
          </div>
        </header>
        {!soundReady && <div className="order-sound-banner" role="status"><Bell /><span>Ative o som para ouvir quando chegar um pedido.</span><button onClick={() => void enableSound()}>Ativar e testar som</button></div>}
        <main>
          <Outlet />
        </main>
      </section>
      {sidebarOpen && (
        <button
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-label="Fechar menu"
        />
      )}
    </div>
  );
}
