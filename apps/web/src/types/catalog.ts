export type PizzaSize = "P" | "M" | "G" | "GG";
export type SizePrice = { size: PizzaSize; price: number };
export type CatalogOption = { id: string; name: string; priceDelta: string; active: boolean };
export type CatalogOptionGroup = { id: string; name: string; selectionType: "SINGLE" | "MULTIPLE"; minSelections: number; maxSelections?: number; active: boolean; options: CatalogOption[] };
export type CatalogProduct = { id: string; categoryId: string; name: string; description?: string; imageUrl?: string; price: string; promotionalPrice?: string | null; featured: boolean; sizes?: SizePrice[] | null; pizzaSlots: number; position: number; active: boolean; trashedAt?: string | null; purgeAt?: string; categoryName?: string; optionGroups?: CatalogOptionGroup[] };
export type CatalogCategory = { id: string; name: string; slug: string; imageUrl?: string; position: number; active: boolean; products: CatalogProduct[]; trashedProductCount?: number };
export type ProductInput = { sizes?: SizePrice[]; categoryId: string; name: string; description: string; imageUrl: string; price: number; promotionalPrice?: number | null; featured: boolean; pizzaSlots: number; active: boolean };
