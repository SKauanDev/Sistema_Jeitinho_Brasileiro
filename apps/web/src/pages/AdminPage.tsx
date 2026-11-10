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
import { createAdminSocket } from "../services/realtime";
import { adminApi } from "../services/admin-api";
import { getCurrentUser, logout } from "../services/auth";

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

let notificationAudioContext: AudioContext | null = null;

function getNotificationAudioContext() {
  notificationAudioContext ??= new AudioContext();
  return notificationAudioContext;
}

function ringNotificationBell() {
  try {
    const context = getNotificationAudioContext();
    const play = () => {
      const startedAt = context.currentTime;
      [880, 1320, 1760].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, startedAt);
        gain.gain.setValueAtTime(index === 0 ? 0.2 : 0.08, startedAt);
        gain.gain.exponentialRampToValueAtTime(0.001, startedAt + 1.15);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(startedAt);
        oscillator.stop(startedAt + 1.15);
      });
    };
    if (context.state === "suspended")
      void context
        .resume()
        .then(play)
        .catch(() => undefined);
    else play();
  } catch {
    /* O navegador pode bloquear áudio antes da primeira interação. */
  }
}

export function AdminPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [newOrders, setNewOrders] = useState(0);
  const [store, setStore] = useState<{
    isOpen: boolean;
    configuredOpen: boolean;
    storeName: string;
  } | null>(null);
  const [changingStore, setChangingStore] = useState(false);
  const location = useLocation();
  const user = getCurrentUser();
  const current =
    navigation.find((item) => location.pathname === item.path) ?? navigation[0];

  useEffect(() => {
    const unlockNotificationSound = () => {
      try {
        void getNotificationAudioContext().resume();
      } catch {
        /* Áudio indisponível. */
      }
    };
    window.addEventListener("pointerdown", unlockNotificationSound, {
      once: true,
    });
    window.addEventListener("keydown", unlockNotificationSound, { once: true });
    const refreshStore = () => void adminApi.store().then(setStore).catch(() => undefined);
    const refreshVisibleStore = () => { if (document.visibilityState === "visible") refreshStore(); };
    refreshStore();
    window.addEventListener("focus", refreshStore);
    document.addEventListener("visibilitychange", refreshVisibleStore);
    const storeTimer = window.setInterval(
      refreshStore,
      15_000,
    );
    void adminApi
      .orders()
      .then((orders) =>
        setNewOrders(orders.filter((order) => order.status === "NEW").length),
      )
      .catch(() => undefined);
    const socket = createAdminSocket();
    socket.on("order:new", () => {
      ringNotificationBell();
      setNewOrders((count) => count + 1);
    });
    socket.on(
      "order:updated",
      () =>
        void adminApi
          .orders()
          .then((orders) =>
            setNewOrders(
              orders.filter((order) => order.status === "NEW").length,
            ),
          ),
    );
    return () => {
      socket.disconnect();
      window.clearInterval(storeTimer);
      window.removeEventListener("focus", refreshStore);
      document.removeEventListener("visibilitychange", refreshVisibleStore);
      window.removeEventListener("pointerdown", unlockNotificationSound);
      window.removeEventListener("keydown", unlockNotificationSound);
    };
  }, []);

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
          <a href="/admin/dashboard">
            <img src="/images/borda-dourada.png" alt="Borda Dourada" />
          </a>
          <button onClick={() => setSidebarOpen(false)} aria-label="Fechar menu">
            <X />
          </button>
        </header>
        <nav aria-label="Menu principal">
          <small>MENU PRINCIPAL</small>
          {navigation.filter(item => !item.adminOnly || user?.role === "ADMIN").map((item) => {
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
          <a
            className="sidebar-menu-preview"
            href="/cardapio"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setSidebarOpen(false)}
          >
            <Store />
            <span className="sidebar-label">Ver cardápio</span>
            <ExternalLink />
          </a>
        </nav>
        <footer>
          <div className="admin-user-avatar">
            {user?.name?.charAt(0) ?? "D"}
          </div>
          <span>
            <strong>{user?.name ?? "Administrador"}</strong>
            <small>{user?.role ?? "ADMIN"}</small>
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
            <span>{store?.storeName ?? "Borda Dourada"}</span>
            <b>/</b>
            <strong>{current.label}</strong>
          </div>
          <div className="admin-actions">
            <button
              className={`store-status-button ${store?.isOpen ? "open" : "closed"}`}
              disabled={!store || changingStore}
              onClick={toggleStore}
            >
              <i />
              {store?.isOpen ? "Loja aberta" : "Loja fechada"}
            </button>
            <a
              className="menu-preview-link"
              href="/cardapio"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Store /> Ver cardápio <ExternalLink />
            </a>
            <button className="notification-button">
              <Bell />
              {newOrders > 0 && <i>{newOrders}</i>}
            </button>
            <div className="top-avatar">{user?.name?.charAt(0) ?? "D"}</div>
          </div>
        </header>
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
