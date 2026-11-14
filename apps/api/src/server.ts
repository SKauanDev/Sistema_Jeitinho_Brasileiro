import { developerCleanupRouter } from "./modules/admin/developer-cleanup.routes.js";
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
import { pizzaRulesRouter } from "./modules/catalog/pizza-rules.js";
import { diningRouter, adminDiningRouter } from "./modules/dining/dining.routes.js";
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
import { courierRouter } from "./modules/settings/courier.routes.js";
import { orderEditRouter } from "./modules/admin/order-edit.routes.js";
import { settingsRouter } from "./modules/settings/settings.routes.js";
import { purgeExpiredCatalogTrash } from "./modules/catalog/catalog-cleanup.service.js";
import { userRouter } from "./modules/users/user.routes.js";
import { syncCatalogInventory } from "./modules/inventory/catalog-inventory.service.js";
import { deliveryRouter } from "./modules/delivery/delivery.routes.js";
import { configureSocketSecurity } from "./realtime/socket-security.js";
import { apiErrorHandler, createRateLimit, securityHeaders } from "./shared/http-security.js";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", env.trustProxy);
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
const regularOrderLimit = createRateLimit(30, 10 * 60_000);
// Tables share the restaurant Wi-Fi public IP; keep room for all tables ordering.
const tableOrderLimit = createRateLimit(300, 10 * 60_000);
app.post("/orders", (request, response, next) => (request.body?.table ? tableOrderLimit : regularOrderLimit)(request, response, next));
app.use("/auth", authRouter);
app.use("/orders", orderRouter);
app.use("/pizza-rules", pizzaRulesRouter);
app.use("/tables", diningRouter);
app.use("/catalog", catalogRouter);
app.use("/coupons", publicPromotionRouter);
app.use("/customers", publicCustomerRouter);
app.use("/delivery", deliveryRouter);
app.use("/admin/cleanup", developerCleanupRouter);
app.use("/admin/order-edits", orderEditRouter);
app.use("/admin/couriers", courierRouter);
app.use("/admin", adminRouter);
app.use("/admin/tables", adminDiningRouter);
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
  httpServer.listen(env.port, env.host, () => {
    console.log(`API UrFood disponível em http://${env.host}:${env.port}`);
  });
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
