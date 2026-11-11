import { useEffect, useRef } from "react";
import { Check, X } from "lucide-react";
import type { Product } from "../data/menu";
import { FoodImage } from "./FoodImage";
import { productPrice } from "../utils/pizza";

type Props = {
  title: string;
  flavors: Product[];
  selectedId?: string;
  size?: string;
  showPrices: boolean;
  notice: string;
  onChoose: (id: string) => void;
  onClose: () => void;
};

export function PizzaFlavorPicker({ title, flavors, selectedId, size, showPrices, notice, onChoose, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => { if (element.open) element.close(); };
  }, []);

  return <dialog ref={dialog} className="pizza-flavor-picker" aria-labelledby="flavor-picker-title"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section>
      <header><div><span>{size ? `Tamanho ${size}` : "Monte sua pizza"}</span><h3 id="flavor-picker-title">{title}</h3></div>
        <button type="button" onClick={onClose} aria-label="Fechar sabores" autoFocus><X size={20} /></button>
      </header>
      {notice && <p className="pizza-flavor-notice" role="status">{notice}</p>}
      <div className="flavor-picker-list">{flavors.map(flavor => <button type="button" key={flavor.id}
        className={selectedId === flavor.id ? "chosen" : ""} aria-pressed={selectedId === flavor.id} onClick={() => onChoose(flavor.id)}>
        <FoodImage src={flavor.image} alt="" />
        <span><strong>{flavor.name}</strong>{showPrices && <small>{productPrice(flavor, size).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</small>}</span>
        {selectedId === flavor.id && <Check size={18} />}
      </button>)}</div>
      {!flavors.length && <p className="flavor-picker-empty">Nenhum outro sabor disponível neste tamanho.</p>}
    </section>
  </dialog>;
}
