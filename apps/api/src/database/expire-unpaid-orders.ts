import { sequelize } from "./sequelize.js";
import { expireUnpaidOrders } from "../modules/payments/payment-timeout.service.js";

try {
  await expireUnpaidOrders();
  console.log("Pedidos online com prazo encerrado e sem pagamento confirmado foram cancelados.");
} finally { await sequelize.close(); }
