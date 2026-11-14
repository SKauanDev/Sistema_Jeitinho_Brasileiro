import { Trash2 } from "lucide-react";
import { formatPhone } from "../../utils/phone";
import { useEffect, useState } from "react";
import { authFetch } from "../../services/admin-api";
export type Courier = { id: string; name: string; phone: string; active: boolean };
export function CouriersSettings() {
  const [items, setItems] = useState<Courier[]>([]), [name, setName] = useState(""), [phone, setPhone] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const load = () => authFetch<Courier[]>("/admin/couriers").then(setItems);
  useEffect(() => { void load().catch(reason => setError(reason.message)); }, []);
  return <section className="panel couriers-settings"><header><h2>Motoboys</h2><p>Cadastre a equipe de entrega para selecionar no pedido.</p></header>
    {error && <p role="alert">{error}</p>}<form onSubmit={async event => { event.preventDefault(); setBusy(true); setError(""); try { await authFetch("/admin/couriers", { method: "POST", body: JSON.stringify({ name, phone }) }); setName(""); setPhone(""); await load(); } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); } }}>
      <label>Nome<input required maxLength={120} value={name} onChange={event => setName(event.target.value)} /></label><label>Telefone<input type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(11) 99999-9999" maxLength={15} value={phone} onChange={event => setPhone(formatPhone(event.target.value))} /></label><button disabled={busy}>Cadastrar motoboy</button>
    </form><div className="couriers-list">{items.map(item => <div key={item.id}><span><b>{item.name}</b><small>{formatPhone(item.phone || "") || "Sem telefone"}</small></span><button disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await authFetch(`/admin/couriers/${item.id}`, { method: "PATCH", body: JSON.stringify({ active: !item.active }) }); await load(); } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); } }}>{item.active ? "Desativar" : "Reativar"}</button><button type="button" className="courier-delete" disabled={busy} aria-label={`Excluir motoboy ${item.name}`} title="Excluir motoboy" onClick={async () => { if (!window.confirm(`Excluir o motoboy ${item.name}? Os pedidos e as taxas anteriores ser\u00e3o preservados.`)) return; setBusy(true); setError(""); try { await authFetch(`/admin/couriers/${item.id}`, { method: "DELETE" }); await load(); } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); } }}><Trash2 size={17} /></button></div>)}{!items.length && <p>Nenhum motoboy cadastrado.</p>}</div>
  </section>;
}
