export type Coupon = { id: string; code: string; description?: string; discountType: "PERCENTAGE" | "FIXED"; discountValue: string; minimumOrder: string; maximumDiscount?: string; startsAt: string; expiresAt: string; usageLimit?: number; usageCount: number; active: boolean; createdAt: string };
export type PromotionProduct = { id: string; name: string; imageUrl?: string; price: string; promotionalPrice: string; active: boolean; category?: { name: string } };
export type PromotionData = { coupons: Coupon[]; products: PromotionProduct[] };
export type PublicCoupon = Pick<Coupon, "id" | "code" | "description" | "discountType" | "discountValue" | "minimumOrder" | "maximumDiscount" | "expiresAt">;
