import { Search, X } from "lucide-react";
import type { Product } from "../data/menu";

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
export function filterPizzaFlavors(flavors: Product[], query: string) {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  return flavors.filter((flavor) =>
    terms.every((term) => normalize(flavor.name).includes(term)),
  );
}
export function PizzaFlavorSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="pizza-flavor-search">
      <Search size={17} aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Buscar sabor de pizza"
        aria-label="Buscar sabor de pizza"
        autoComplete="off"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Limpar busca de sabores"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
