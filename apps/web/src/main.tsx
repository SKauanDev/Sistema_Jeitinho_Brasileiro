import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { LoginPage } from "./pages/LoginPage";
import { adminHome, getCurrentUser } from "./services/auth";
import { TableScanner } from "./components/TableScanner";
import "./styles.css";
import "./admin.css";
import "./pizza.css";
import "./theme.css";

const App = lazy(() => import("./App"));
const TableMenuPage = lazy(() => import("./pages/TableMenuPage").then(module => ({ default: module.TableMenuPage })));
const TableScanPage = lazy(() => import("./pages/TableScanPage").then(module => ({ default: module.TableScanPage })));
const TablesModule = lazy(() => import("./features/admin/TablesModule").then(module => ({ default: module.TablesModule })));
const AdminPage = lazy(() => import("./pages/AdminPage").then(module => ({ default: module.AdminPage })));
const OrderStatusPage = lazy(() => import("./pages/OrderStatusPage").then(module => ({ default: module.OrderStatusPage })));
const MyOrdersPage = lazy(() => import("./pages/MyOrdersPage").then(module => ({ default: module.MyOrdersPage })));
const CustomerProfilePage = lazy(() => import("./pages/CustomerProfilePage").then(module => ({ default: module.CustomerProfilePage })));
const PixPaymentPage = lazy(() => import("./pages/PixPaymentPage").then(module => ({ default: module.PixPaymentPage })));
const CardPaymentPage = lazy(() => import("./pages/CardPaymentPage").then(module => ({ default: module.CardPaymentPage })));
const DashboardModule = lazy(() => import("./features/admin/DashboardModule").then(module => ({ default: module.DashboardModule })));
const OrdersKanbanModule = lazy(() => import("./features/admin/OrdersKanbanModule").then(module => ({ default: module.OrdersKanbanModule })));
const CatalogModule = lazy(() => import("./features/admin/CatalogModule").then(module => ({ default: module.CatalogModule })));
const InventoryModule = lazy(() => import("./features/admin/InventoryModule").then(module => ({ default: module.InventoryModule })));
const CustomersModule = lazy(() => import("./features/admin/CustomersModule").then(module => ({ default: module.CustomersModule })));
const FinanceModule = lazy(() => import("./features/admin/FinanceModule").then(module => ({ default: module.FinanceModule })));
const PromotionsModule = lazy(() => import("./features/admin/PromotionsModule").then(module => ({ default: module.PromotionsModule })));
const ReportsModule = lazy(() => import("./features/admin/ReportsModule").then(module => ({ default: module.ReportsModule })));
const SettingsModule = lazy(() => import("./features/admin/SettingsModule").then(module => ({ default: module.SettingsModule })));
const UsersModule = lazy(() => import("./features/admin/UsersModule").then(module => ({ default: module.UsersModule })));

function ProtectedAdmin() {
  const location = useLocation();
  if (localStorage.getItem("urfood_token") && getCurrentUser()?.role === "KITCHEN" && location.pathname !== "/pedidos") return <Navigate to="/pedidos" replace />;
  return localStorage.getItem("urfood_token")
    ? <Outlet />
    : <Navigate to="/" replace />;
}

function AdminOnly() {
  return getCurrentUser()?.role === "ADMIN" ? <Outlet /> : <Navigate to={adminHome()} replace />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={<div role="status" style={{ padding: "2rem", textAlign: "center" }}>Carregando...</div>}>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/cardapio" element={<App />} />
        <Route path="/mesa/:key" element={<TableMenuPage />} />
        <Route path="/comanda" element={<TableScanPage />} />
        <Route path="/status/:id" element={<OrderStatusPage />} />
        <Route path="/pagamento/pix/:id" element={<PixPaymentPage />} />
        <Route path="/pagamento/cartao/:id" element={<CardPaymentPage />} />
        <Route path="/meus-pedidos" element={<MyOrdersPage />} />
        <Route path="/perfil" element={<CustomerProfilePage />} />
        <Route element={<ProtectedAdmin />}>
          <Route element={<AdminPage />}>
            <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="/admin/dashboard" element={<DashboardModule />} />
            <Route path="/pedidos" element={<OrdersKanbanModule />} />
            <Route path="/mesas" element={<TablesModule />} />
            <Route path="/admin/cardapio" element={<CatalogModule />} />
            <Route path="/estoque" element={<InventoryModule />} />
            <Route path="/clientes" element={<CustomersModule />} />
            <Route path="/financeiro" element={<FinanceModule />} />
            <Route path="/promocoes" element={<PromotionsModule />} />
            <Route path="/relatorios" element={<ReportsModule />} />
            <Route path="/configuracoes" element={<SettingsModule />} />
            <Route element={<AdminOnly />}><Route path="/usuarios" element={<UsersModule />} /></Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <TableScanner />
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
);
