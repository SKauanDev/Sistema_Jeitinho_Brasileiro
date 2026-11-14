export const ORDER_STATUS = {
  NEW: "NEW", CONFIRMED: "CONFIRMED", PREPARING: "PREPARING", READY: "READY",
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY", COMPLETED: "COMPLETED", CANCELED: "CANCELED",
} as const;
export type OrderStatus = typeof ORDER_STATUS[keyof typeof ORDER_STATUS];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  NEW: "Novo", CONFIRMED: "Confirmado", PREPARING: "Em preparo", READY: "Pronto",
  OUT_FOR_DELIVERY: "Em entrega", COMPLETED: "Concluído", CANCELED: "Cancelado",
};

export type OrderOption = { id: string; optionName: string; optionGroupName: string; priceDelta: string; quantity: number };
export type OrderItem = { productId?: string | null; optionsTotal?: string; id: string; productName: string; quantity: number; unitPrice: string; lineTotal: string; notes?: string; selectedOptions: OrderOption[] };
export type Order = {
  completedAt?: string | null;
  canDelete?: boolean;
  courierId?: string | null; courierName?: string | null; serviceFee?: string; serviceFeeAccepted?: boolean; customerEmail?: string; customerDocument?: string;
  tableNumber?: number | null;
  diningSessionId?: string | null;
  paymentStatus?: "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  paymentProvider?: string | null;
  id: string; displayNumber: string; status: OrderStatus; fulfillmentType: "PICKUP" | "DELIVERY";
  customerName: string; customerPhone: string; notes?: string; street?: string; number?: string;
  complement?: string; neighborhood?: string; city?: string; state?: string; postalCode?: string;
  addressReference?: string; subtotal: string; deliveryFee: string; digitalSecurityFee?: string; total: string; cancellationReason?: string;
  couponCode?: string; discountAmount?: string;
  paymentMethod?: "PIX" | "CASH" | "CREDIT_CARD" | "DEBIT_CARD" | "ONLINE" | "RECEIVED_ONLINE"; changeFor?: string;
  createdAt: string; updatedAt: string; items: OrderItem[]; statusHistory: Array<{ id: string; status: OrderStatus; createdAt: string }>;
};

export type DashboardData = {
  period: { start: string; end: string };
  kpis: { revenue: number; revenueTrend: number; orders: number; ordersTrend: number; averageTicket: number; inProgress: number };
  secondary: { completed: number; canceled: number; delivery: number; pickup: number; newCustomers: number; returningCustomers: number };
  chart: Array<{ date: string; revenue: number; orders: number }>;
  products: Array<{ productName: string; quantity: number; revenue: number }>;
  paymentMethods: Array<{ name: string; value: number; percentage: number }>;
  categories: Array<{ name: string; value: number; percentage: number }>;
  recentOrders: Order[];
};
