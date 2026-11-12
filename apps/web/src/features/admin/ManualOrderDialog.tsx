import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import App from "../../App";
export function ManualOrderDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="manual-order-dialog" onCancel={onClose}><header><div><h2>Adicionar pedido manual</h2><p>Monte o pedido e preencha os dados do cliente.</p></div><button autoFocus aria-label="Fechar pedido manual" onClick={onClose}><X /></button></header><App manual onManualComplete={onCreated} /></dialog>;
}
