import http from "node:http";
import cors from "cors";
import express from "express";
import path from "node:path";
import { Server } from "socket.io";
import { env } from "./config/env.js";
import { allowedWebOrigins } from "./config/web-origins.js";
import "./database/models.js";
import { sequelize } from "./database/sequelize.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { orderRouter } from "./modules/orders/order.routes.js";
import { adminRouter } from "./modules/admin/admin.routes.js";
import {
  adminCatalogRouter,
  catalogRouter,
} from "./modules/catalog/catalog.routes.js";
import { inventoryRouter } from "./modules/inventory/inventory.routes.js";
import {
  customerRouter,
  publicCustomerRouter,
} from "./modules/customers/customer.routes.js";
import { financeRouter } from "./modules/finance/finance.routes.js";
import {
  promotionRouter,
  publicPromotionRouter,
} from "./modules/promotions/promotion.routes.js";
import { reportRouter } from "./modules/reports/report.routes.js";
import { settingsRouter } from "./modules/settings/settings.routes.js";
import { mercadoPagoRouter } from "./modules/payments/mercado-pago.routes.js";
import { reconcilePendingPayments } from "./modules/payments/mercado-pago.service.js";
import { purgeExpiredCatalogTrash } from "./modules/catalog/catalog-cleanup.service.js";
import { userRouter } from "./modules/users/user.routes.js";
import { syncCatalogInventory } from "./modules/inventory/catalog-inventory.service.js";
import { deliveryRouter } from "./modules/delivery/delivery.routes.js";
import { expireUnpaidOrders } from "./modules/payments/payment-timeout.service.js";
import { configureSocketSecurity } from "./realtime/socket-security.js";
import { apiErrorHandler, createRateLimit, securityHeaders } from "./shared/http-security.js";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", "loopback");
app.use(securityHeaders);
const httpServer = http.createServer(app);
const allowedSocketOrigins = new Set(allowedWebOrigins(env.webUrl, env.webAllowedOrigins, env.nodeEnv !== "production"));
const io = new Server(httpServer, {
  cors: { origin: [...allowedSocketOrigins] },
  maxHttpBufferSize: 16384,
  allowRequest: (request, callback) => callback(null, !request.headers.origin || allowedSocketOrigins.has(request.headers.origin)),
});
configureSocketSecurity(io);
app.set("io", io);

app.use(cors({ origin: [...allowedSocketOrigins] }));
app.use(express.json({ limit: "7mb" }));
app.use(
  "/uploads",
  express.static(path.resolve(process.cwd(), "uploads"), {
    maxAge: "7d",
    immutable: true,
  }),
);
app.get("/health", (_request, response) => response.json({ status: "ok" }));
const loginLimit = createRateLimit(30, 15 * 60_000);
app.use(["/auth/login", "/customers/login", "/customers/register", "/customers/reset-password"], loginLimit);
app.post("/orders", createRateLimit(30, 10 * 60_000));
app.post("/payments/mercado-pago/card/orders/:orderId", createRateLimit(10, 10 * 60_000));
app.use("/auth", authRouter);
app.use("/orders", orderRouter);
app.use("/catalog", catalogRouter);
app.use("/coupons", publicPromotionRouter);
app.use("/customers", publicCustomerRouter);
app.use("/payments/mercado-pago", mercadoPagoRouter);
app.use("/delivery", deliveryRouter);
app.use("/admin", adminRouter);
app.use("/admin/catalog", adminCatalogRouter);
app.use("/admin/inventory", inventoryRouter);
app.use("/admin/customers", customerRouter);
app.use("/admin/finance", financeRouter);
app.use("/admin/promotions", promotionRouter);
app.use("/admin/reports", reportRouter);
app.use("/admin/settings", settingsRouter);
app.use("/admin/users", userRouter);
app.use(apiErrorHandler);


async function start(): Promise<void> {
  await sequelize.authenticate();
  await syncCatalogInventory();
  await expireUnpaidOrders(io);
  httpServer.listen(env.port, () => {
    console.log(`API UrFood disponível em http://localhost:${env.port}`);
  });
  let expiring = false;
  setInterval(() => {
    if (expiring) return;
    expiring = true;
    void expireUnpaidOrders(io).catch(error => console.error("Falha ao cancelar pedidos sem pagamento:", error)).finally(() => { expiring = false; });
  }, 1000).unref();
  setInterval(() => {
    void reconcilePendingPayments(io).catch((error) =>
      console.error("Falha ao expirar cobranças PIX:", error),
    );
  }, 30_000).unref();
  void purgeExpiredCatalogTrash().catch((error) =>
    console.error("Falha ao limpar a lixeira do cardápio:", error),
  );
  setInterval(
    () => {
      void purgeExpiredCatalogTrash().catch((error) =>
        console.error("Falha ao limpar a lixeira do cardápio:", error),
      );
    },
    6 * 60 * 60_000,
  ).unref();
}

start().catch((error: unknown) => {
  console.error("Falha ao iniciar a API:", error);
  process.exit(1);
});
