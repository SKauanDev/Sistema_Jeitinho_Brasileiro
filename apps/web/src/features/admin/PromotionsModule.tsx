import { FoodImage } from "../../components/FoodImage";
import { FormEvent, useEffect, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  Copy,
  Edit3,
  Eye,
  EyeOff,
  ImageOff,
  LoaderCircle,
  Plus,
  Tag,
  TicketPercent,
  Trash2,
  X,
} from "lucide-react";
import { catalogImageUrl } from "../../services/catalog-api";
import { promotionApi, type CouponInput } from "../../services/promotion-api";
import type { Coupon, PromotionData } from "../../types/promotion";
const currency = (value: number | string) =>
  Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const activeNow = (coupon: Coupon) =>
  coupon.active &&
  new Date(coupon.startsAt) <= new Date() &&
  new Date(coupon.expiresAt) >= new Date() &&
  (!coupon.usageLimit || coupon.usageCount < coupon.usageLimit);
export function PromotionsModule() {
  const [data, setData] = useState<PromotionData | null>(null);
  const [editing, setEditing] = useState<Coupon | "new" | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const load = async () => {
    try {
      setData(await promotionApi.list());
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Falha ao carregar promoções.",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  if (loading)
    return (
      <div className="admin-state">
        <LoaderCircle className="spinner" />
        <h2>Carregando promoções...</h2>
      </div>
    );
  const coupons = data?.coupons ?? [];
  return (
    <div className="admin-module">
      <div className="module-title">
        <div>
          <span>VENDAS</span>
          <h1>Cupons e promoções</h1>
          <p>Crie incentivos com regras validadas diretamente no checkout.</p>
        </div>
        <button className="primary-admin" onClick={() => setEditing("new")}>
          <Plus /> Novo cupom
        </button>
      </div>
      {error && (
        <div className="admin-inline-error">
          <AlertCircle />
          {error}
          <button onClick={() => setError("")}>
            <X />
          </button>
        </div>
      )}
      <section className="promotion-summary">
        <article>
          <TicketPercent />
          <span>
            <small>Cupons cadastrados</small>
            <strong>{coupons.length}</strong>
          </span>
        </article>
        <article>
          <Eye />
          <span>
            <small>Cupons ativos agora</small>
            <strong>{coupons.filter(activeNow).length}</strong>
          </span>
        </article>
        <article>
          <Tag />
          <span>
            <small>Produtos em promoção</small>
            <strong>{data?.products.length ?? 0}</strong>
          </span>
        </article>
        <article>
          <Copy />
          <span>
            <small>Utilizações</small>
            <strong>
              {coupons.reduce((sum, coupon) => sum + coupon.usageCount, 0)}
            </strong>
          </span>
        </article>
      </section>
      <article className="panel coupons-panel">
        <header>
          <div>
            <h2>Cupons</h2>
            <p>Códigos disponíveis e regras de utilização</p>
          </div>
        </header>
        {coupons.length ? (
          <div className="coupon-grid">
            {coupons.map((coupon) => (
              <article
                className={!coupon.active ? "inactive" : ""}
                key={coupon.id}
              >
                <header>
                  <div>
                    <span>{coupon.code}</span>
                    <button
                      title="Copiar código"
                      onClick={() =>
                        void navigator.clipboard.writeText(coupon.code)
                      }
                    >
                      <Copy />
                    </button>
                  </div>
                  <i className={activeNow(coupon) ? "active" : "expired"}>
                    {activeNow(coupon) ? "Ativo" : "Inativo"}
                  </i>
                </header>
                <strong>
                  {coupon.discountType === "PERCENTAGE"
                    ? `${Number(coupon.discountValue)}% OFF`
                    : `${currency(coupon.discountValue)} OFF`}
                </strong>
                <p>{coupon.description || "Sem descrição"}</p>
                <ul>
                  <li>
                    Pedido mínimo <b>{currency(coupon.minimumOrder)}</b>
                  </li>
                  <li>
                    Validade{" "}
                    <b>
                      {new Date(coupon.expiresAt).toLocaleDateString("pt-BR")}
                    </b>
                  </li>
                  <li>
                    Utilizações{" "}
                    <b>
                      {coupon.usageCount}
                      {coupon.usageLimit ? ` / ${coupon.usageLimit}` : ""}
                    </b>
                  </li>
                </ul>
                <footer>
                  <button
                    onClick={async () => {
                      await promotionApi.update(coupon.id, {
                        active: !coupon.active,
                      });
                      await load();
                    }}
                  >
                    {coupon.active ? <EyeOff /> : <Eye />}
                    {coupon.active ? "Desativar" : "Ativar"}
                  </button>
                  <button onClick={() => setEditing(coupon)}>
                    <Edit3 /> Editar
                  </button>
                  <button
                    aria-label={`Excluir cupom ${coupon.code}`}
                    title="Excluir cupom"
                    disabled={deletingId === coupon.id}
                    onClick={async () => {
                      if (!window.confirm(`Excluir definitivamente o cupom ${coupon.code}?`)) return;
                      setDeletingId(coupon.id);
                      setError("");
                      try {
                        await promotionApi.remove(coupon.id);
                        await load();
                      } catch (reason) {
                        setError(reason instanceof Error ? reason.message : "Falha ao excluir o cupom.");
                      } finally {
                        setDeletingId(null);
                      }
                    }}
                  >
                    <Trash2 />
                  </button>
                </footer>
              </article>
            ))}
          </div>
        ) : (
          <div className="panel-empty">
            <TicketPercent />
            <p>Nenhum cupom cadastrado.</p>
          </div>
        )}
      </article>
      <article className="panel promoted-products">
        <header>
          <div>
            <h2>Produtos em promoção</h2>
            <p>Preços promocionais configurados no Cardápio</p>
          </div>
          <a href="/admin/cardapio">Gerenciar produtos</a>
        </header>
        {data?.products.length ? (
          <div>
            {data.products.map((product) => (
              <article key={product.id}>
                {product.imageUrl ? (
                  <FoodImage src={catalogImageUrl(product.imageUrl)} alt="" />
                ) : (
                  <i>
                    <ImageOff />
                  </i>
                )}
                <span>
                  <strong>{product.name}</strong>
                  <small>{product.category?.name}</small>
                </span>
                <del>{currency(product.price)}</del>
                <b>{currency(product.promotionalPrice)}</b>
              </article>
            ))}
          </div>
        ) : (
          <div className="panel-empty">
            <Tag />
            <p>Nenhum produto com preço promocional.</p>
          </div>
        )}
      </article>
      {editing && (
        <CouponDialog
          coupon={editing === "new" ? null : editing}
          saving={saving}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            setSaving(true);
            try {
              if (editing === "new") await promotionApi.create(input);
              else await promotionApi.update(editing.id, input);
              setEditing(null);
              await load();
            } catch (reason) {
              setError(
                reason instanceof Error
                  ? reason.message
                  : "Falha ao salvar cupom.",
              );
            } finally {
              setSaving(false);
            }
          }}
        />
      )}
    </div>
  );
}
function localDate(value: Date) {
  const offset = value.getTimezoneOffset();
  return new Date(value.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function MoneyInput({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const formatted = value
    ? value.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "";

  return (
    <div className="currency-input">
      <span>R$</span>
      <input
        inputMode="numeric"
        value={formatted}
        placeholder="0,00"
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, "");
          onChange(digits ? Number(digits) / 100 : null);
        }}
      />
    </div>
  );
}

function CouponDialog({
  coupon,
  saving,
  onClose,
  onSave,
}: {
  coupon: Coupon | null;
  saving: boolean;
  onClose: () => void;
  onSave: (input: CouponInput) => Promise<void>;
}) {
  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + 30);
  const [form, setForm] = useState<CouponInput>({
    code: coupon?.code ?? "",
    description: coupon?.description ?? "",
    discountType: coupon?.discountType ?? "PERCENTAGE",
    discountValue: Number(coupon?.discountValue ?? 10),
    minimumOrder: Number(coupon?.minimumOrder ?? 0),
    maximumDiscount: coupon?.maximumDiscount
      ? Number(coupon.maximumDiscount)
      : null,
    startsAt: coupon ? localDate(new Date(coupon.startsAt)) : localDate(start),
    expiresAt: coupon ? localDate(new Date(coupon.expiresAt)) : localDate(end),
    usageLimit: coupon?.usageLimit ?? null,
    active: coupon?.active ?? true,
  });
  return (
    <div
      className="inventory-dialog-overlay"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="inventory-dialog coupon-dialog">
        <header>
          <h2>{coupon ? `Editar ${coupon.code}` : "Novo cupom"}</h2>
          <button onClick={onClose}>
            <X />
          </button>
        </header>
        <form
          className="inventory-form"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void onSave(form);
          }}
        >
          {!coupon && (
            <label>
              Código
              <input
                required
                maxLength={50}
                value={form.code}
                onChange={(event) =>
                  setForm({
                    ...form,
                    code: event.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9_-]/g, ""),
                  })
                }
                placeholder="PROMO10"
              />
            </label>
          )}
          <label>
            Tipo
            <select
              value={form.discountType}
              onChange={(event) =>
                setForm({
                  ...form,
                  discountType: event.target.value as "PERCENTAGE" | "FIXED",
                })
              }
            >
              <option value="PERCENTAGE">Percentual</option>
              <option value="FIXED">Valor fixo</option>
            </select>
          </label>
          <label>
            Desconto
            {form.discountType === "FIXED" ? (
              <MoneyInput
                value={form.discountValue}
                onChange={(discountValue) =>
                  setForm({ ...form, discountValue: discountValue ?? 0 })
                }
              />
            ) : (
              <div className="currency-input percentage-input">
                <input
                  required
                  min="0.01"
                  max="100"
                  step="0.01"
                  type="number"
                  value={form.discountValue || ""}
                  placeholder="0"
                  onChange={(event) =>
                    setForm({
                      ...form,
                      discountValue: Number(event.target.value),
                    })
                  }
                />
                <span>%</span>
              </div>
            )}
          </label>
          <label>
            Pedido mínimo
            <MoneyInput
              value={form.minimumOrder}
              onChange={(minimumOrder) =>
                setForm({ ...form, minimumOrder: minimumOrder ?? 0 })
              }
            />
          </label>
          <label>
            Desconto máximo
            <MoneyInput
              value={form.maximumDiscount ?? null}
              onChange={(maximumDiscount) =>
                setForm({ ...form, maximumDiscount })
              }
            />
          </label>
          <label>
            Limite de usos
            <input
              min="1"
              type="number"
              value={form.usageLimit ?? ""}
              onChange={(event) =>
                setForm({
                  ...form,
                  usageLimit: event.target.value
                    ? Number(event.target.value)
                    : null,
                })
              }
            />
          </label>
          <label>
            Início
            <input
              required
              type="datetime-local"
              value={form.startsAt}
              onChange={(event) =>
                setForm({ ...form, startsAt: event.target.value })
              }
            />
          </label>
          <label>
            Validade
            <input
              required
              type="datetime-local"
              value={form.expiresAt}
              onChange={(event) =>
                setForm({ ...form, expiresAt: event.target.value })
              }
            />
          </label>
          <label className="full">
            Descrição
            <input
              value={form.description}
              onChange={(event) =>
                setForm({ ...form, description: event.target.value })
              }
            />
          </label>
          <label className="coupon-active">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) =>
                setForm({ ...form, active: event.target.checked })
              }
            />{" "}
            Cupom ativo
          </label>
          <footer>
            <button type="button" onClick={onClose}>
              Cancelar
            </button>
            <button className="save" disabled={saving}>
              {saving && <LoaderCircle className="spinner" />} Salvar cupom
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
