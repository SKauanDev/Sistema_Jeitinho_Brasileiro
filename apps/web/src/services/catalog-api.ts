import { API_URL } from "./admin-api";
import type { CatalogCategory, CatalogProduct, ProductInput } from "../types/catalog";
import type { PublicCoupon } from "../types/promotion";

const localPizzaImages: Record<string, string> = {
  "/images/pizzas/4_queijos.jpg": "/images/pizza-menu.png#pizza=0",
  "/images/pizzas/bacon.jpg": "/images/pizza-menu.png#pizza=1",
  "/images/pizzas/calabresa.jpg": "/images/pizza-menu.png#pizza=2",
  "/images/pizzas/camarao.jpg": "/images/pizza-menu.png#pizza=3",
  "/images/pizzas/portuguesa.jpg": "/images/pizza-menu.png#pizza=4",
  "/images/combos/combo_casal.jpeg": "/images/pizza-hero.png",
  "/images/combos/combo_familia.jpeg": "/images/pizza-hero.png",
  "/images/combos/combo_familia_prime.jpeg": "/images/pizza-hero.png",
  "/images/combos/combo_pizza&refri1l.jpeg": "/images/pizza-hero.png",
};
export const catalogImageUrl = (imageUrl?: string) => imageUrl?.startsWith("/uploads/") || imageUrl?.startsWith("/catalog/images/") ? `${API_URL}${imageUrl}` : localPizzaImages[imageUrl ?? ""] ?? imageUrl ?? "";

async function request<T>(path: string, init?: RequestInit, authenticated = false): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { ...init, headers: { "Content-Type": "application/json", ...(authenticated ? { Authorization: `Bearer ${localStorage.getItem("urfood_token")}` } : {}), ...init?.headers } });
  if (response.status === 204) return undefined as T;
  const data = await response.json() as T & { message?: string };
  if (!response.ok) throw new Error(data.message ?? "Falha ao consultar o catálogo.");
  return data;
}
export const catalogApi = {
  public: () => request<CatalogCategory[]>("/catalog"),
  publicCoupons: () => request<PublicCoupon[]>("/coupons"),
  admin: () => request<CatalogCategory[]>("/admin/catalog", undefined, true),
  trash: () => request<CatalogProduct[]>("/admin/catalog/trash", undefined, true),
  uploadImage: (file: File, categoryId?: string) => new Promise<{ imageUrl: string }>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error("Não foi possível ler a imagem.")); reader.onload = () => { void request<{ imageUrl: string }>("/admin/catalog/upload", { method: "POST", body: JSON.stringify({ mimeType: file.type, originalName: file.name, categoryId, data: reader.result }) }, true).then(resolve).catch(reject); }; reader.readAsDataURL(file); }),
  createCategory: (name: string) => request<CatalogCategory>("/admin/catalog/categories", { method: "POST", body: JSON.stringify({ name }) }, true),
  updateCategory: (id: string, changes: Partial<CatalogCategory>) => request<CatalogCategory>(`/admin/catalog/categories/${id}`, { method: "PATCH", body: JSON.stringify(changes) }, true),
  deleteCategory: (id: string) => request<void>(`/admin/catalog/categories/${id}`, { method: "DELETE" }, true),
  createProduct: (input: ProductInput) => request<CatalogProduct>("/admin/catalog/products", { method: "POST", body: JSON.stringify(input) }, true),
  updateProduct: (id: string, changes: Partial<ProductInput>) => request<CatalogProduct>(`/admin/catalog/products/${id}`, { method: "PATCH", body: JSON.stringify(changes) }, true),
  deleteProduct: (id: string) => request<void>(`/admin/catalog/products/${id}`, { method: "DELETE" }, true),
  trashProducts: (ids: string[]) => request<{ count: number }>("/admin/catalog/products/bulk-trash", { method: "POST", body: JSON.stringify({ ids }) }, true),
  restoreProducts: (ids: string[]) => request<{ count: number }>("/admin/catalog/products/bulk-restore", { method: "POST", body: JSON.stringify({ ids }) }, true),
};
