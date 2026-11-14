import type { Order } from "./admin";
export type Customer = { email?: string | null; id: string; name: string; phone: string; ordersCount: number; completedOrders: number; totalSpent: number; averageTicket: number; lastOrderAt: string; customerSince: string };
export type CustomerDetails = Customer & { orders: Order[]; email?: string | null; emailVerified?: boolean; claimedCouponCode?: string | null; usedCouponCodes?: string[] };
