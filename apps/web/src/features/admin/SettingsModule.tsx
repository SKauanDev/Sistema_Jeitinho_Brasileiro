import { CouriersSettings } from "./CouriersSettings";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  Banknote,
  Bike,
  Clock3,
  CreditCard,
  LoaderCircle,
  MapPin,
  Plus,
  Search,
  Save,
  Settings,
  ShoppingBag,
  Smartphone,
  Store,
  Trash2,
  X,
} from "lucide-react";
import { settingsApi } from "../../services/settings-api";
import { API_URL } from "../../services/admin-api";
import { formatCurrencyField, parseCurrencyField } from "../../utils/currency-field";
import type {
  DeliveryZone,
  SettingsData,
  StoreHour,
  StoreSettings,
} from "../../types/settings";
const tabs = [
  { id: "store", label: "Loja", icon: Store },
  { id: "hours", label: "Funcionamento", icon: Clock3 },
  { id: "orders", label: "Pedidos", icon: ShoppingBag },
  { id: "delivery", label: "Entrega", icon: Bike },
  { id: "payments", label: "Pagamentos", icon: CreditCard },
] as const;
type Tab = (typeof tabs)[number]["id"];
const dayNames = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];
const formatContact = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits.replace(/^(\d{1,2})/, "($1");
  if (digits.length <= 6) return digits.replace(/^(\d{2})(\d+)/, "($1) $2");
  if (digits.length <= 10)
    return digits.replace(/^(\d{2})(\d{4})(\d+)/, "($1) $2-$3");
  return digits.replace(/^(\d{2})(\d{5})(\d+)/, "($1) $2-$3");
};
const formatPostalCode = (value: string) =>
  value
    .replace(/\D/g, "")
    .slice(0, 8)
    .replace(/^(\d{5})(\d+)/, "$1-$2");
export function SettingsModule() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [store, setStore] = useState<StoreSettings | null>(null);
  const [hours, setHours] = useState<StoreHour[]>([]);
  const [tab, setTab] = useState<Tab>("store");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [cepMessage, setCepMessage] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [zoneDialog, setZoneDialog] = useState<DeliveryZone | "new" | null>(
    null,
  );
  async function load() {
    try {
      const result = await settingsApi.get();
      setData(result);
      setStore({
        ...result.store,
        phone: formatContact(result.store.phone ?? ""),
      });
      setHours(result.hours);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Falha ao carregar configurações.",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function saveStore() {
    if (!store) return;
    setSaving(true);
    setError("");
    try {
      const updated = await settingsApi.saveStore(store);
      setStore({ ...updated, phone: formatContact(updated.phone ?? "") });
      setSuccess("Configurações salvas com sucesso.");
      setTimeout(() => setSuccess(""), 2500);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }
  async function lookupCep(value: string) {
    const postalCode = value.replace(/\D/g, "");
    if (postalCode.length !== 8) {
      setCepMessage("");
      return;
    }
    setCepLoading(true);
    setCepMessage("");
    try {
      const response = await fetch(
        `https://viacep.com.br/ws/${postalCode}/json/`,
      );
      const result = (await response.json()) as {
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };
      if (!response.ok || result.erro) throw new Error("CEP não encontrado.");
      setStore((current) =>
        current
          ? {
              ...current,
              postalCode: formatPostalCode(postalCode),
              street: result.logradouro ?? "",
              neighborhood: result.bairro ?? "",
              city: result.localidade ?? "",
              state: result.uf ?? "",
            }
          : current,
      );
      setCepMessage("Endereço localizado automaticamente.");
    } catch (reason) {
      setCepMessage(
        reason instanceof Error
          ? reason.message
          : "Não foi possível consultar o CEP.",
      );
    } finally {
      setCepLoading(false);
    }
  }
  async function saveHours() {
    setSaving(true);
    try {
      setHours(await settingsApi.saveHours(hours));
      setSuccess("Horários atualizados.");
      setTimeout(() => setSuccess(""), 2500);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Falha ao salvar horários.",
      );
    } finally {
      setSaving(false);
    }
  }
  if (loading || !store || !data)
    return (
      <div className="admin-state">
        <LoaderCircle className="spinner" />
        <h2>Carregando configurações...</h2>
      </div>
    );
  return (
    <div className="admin-module settings-module">
      <div className="module-title">
        <div>
          <span>ADMINISTRAÇÃO</span>
          <h1>Configurações</h1>
          <p>Dados e regras que controlam a operação da loja.</p>
        </div>
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
      {success && <div className="settings-success">✓ {success}</div>}
      <nav className="settings-tabs">
        {tabs.map((item) => {
          const Icon = item.icon;
          return (
            <button
              className={tab === item.id ? "active" : ""}
              onClick={() => setTab(item.id)}
              key={item.id}
            >
              <Icon />
              {item.label}
            </button>
          );
        })}
      </nav>
      {tab === "store" && (
        <SettingsPanel
          title="Dados da loja"
          description="Informações de contato e localização do estabelecimento."
        >
          <div className="settings-form">
            <Field label="Nome da loja">
              <input
                value={store.storeName}
                onChange={(e) =>
                  setStore({ ...store, storeName: e.target.value })
                }
              />
            </Field>
            <Field label="Telefone / WhatsApp">
              <input
                inputMode="tel"
                maxLength={15}
                placeholder="(00) 00000-0000"
                value={store.phone ?? ""}
                onChange={(e) =>
                  setStore({ ...store, phone: formatContact(e.target.value) })
                }
              />
            </Field>
            <div className="settings-address">
              <Field label="CEP">
                <div className="settings-cep">
                  <input
                    inputMode="numeric"
                    maxLength={9}
                    placeholder="00000-000"
                    value={store.postalCode ?? ""}
                    onChange={(e) => {
                      const value = formatPostalCode(e.target.value);
                      setStore({ ...store, postalCode: value });
                      void lookupCep(value);
                    }}
                  />
                  {cepLoading && <LoaderCircle className="spinner" />}
                </div>
                {cepMessage && (
                  <small
                    className={
                      cepMessage.includes("automaticamente")
                        ? "success"
                        : "error"
                    }
                  >
                    {cepMessage}
                  </small>
                )}
              </Field>
              <Field label="Rua">
                <input
                  value={store.street ?? ""}
                  onChange={(e) =>
                    setStore({ ...store, street: e.target.value })
                  }
                />
              </Field>
              <Field label="Número">
                <input
                  value={store.number ?? ""}
                  onChange={(e) =>
                    setStore({ ...store, number: e.target.value })
                  }
                />
              </Field>
              <Field label="Bairro">
                <input
                  value={store.neighborhood ?? ""}
                  onChange={(e) =>
                    setStore({ ...store, neighborhood: e.target.value })
                  }
                />
              </Field>
              <Field label="Cidade">
                <input
                  value={store.city ?? ""}
                  onChange={(e) => setStore({ ...store, city: e.target.value })}
                />
              </Field>
              <Field label="UF">
                <input
                  maxLength={2}
                  value={store.state ?? ""}
                  onChange={(e) =>
                    setStore({
                      ...store,
                      state: e.target.value
                        .toUpperCase()
                        .replace(/[^A-Z]/g, "")
                        .slice(0, 2),
                    })
                  }
                />
              </Field>
              <Field label="Complemento" wide>
                <input
                  value={store.complement ?? ""}
                  onChange={(e) =>
                    setStore({ ...store, complement: e.target.value })
                  }
                  placeholder="Sala, bloco ou referência"
                />
              </Field>
            </div>
          </div>
          <SaveButton saving={saving} onClick={() => void saveStore()} />
        </SettingsPanel>
      )}
      {tab === "hours" && (
        <SettingsPanel
          title="Horário de funcionamento"
          description="Configure abertura e fechamento para cada dia."
        >
          <div className="hours-list">
            {hours.map((hour) => (
              <div key={hour.dayOfWeek}>
                <strong>{dayNames[hour.dayOfWeek]}</strong>
                <Toggle
                  checked={!hour.isClosed}
                  label={hour.isClosed ? "Fechado" : "Aberto"}
                  onChange={(checked) =>
                    setHours(
                      hours.map((item) =>
                        item.dayOfWeek === hour.dayOfWeek
                          ? { ...item, isClosed: !checked }
                          : item,
                      ),
                    )
                  }
                />
                {!hour.isClosed && (
                  <>
                    <input
                      type="time"
                      value={hour.opensAt?.slice(0, 5) ?? "18:00"}
                      onChange={(e) =>
                        setHours(
                          hours.map((item) =>
                            item.dayOfWeek === hour.dayOfWeek
                              ? { ...item, opensAt: e.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                    <span>até</span>
                    <input
                      type="time"
                      value={hour.closesAt?.slice(0, 5) ?? "23:30"}
                      onChange={(e) =>
                        setHours(
                          hours.map((item) =>
                            item.dayOfWeek === hour.dayOfWeek
                              ? { ...item, closesAt: e.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </>
                )}
              </div>
            ))}
          </div>
          <SaveButton saving={saving} onClick={() => void saveHours()} />
        </SettingsPanel>
      )}
      {tab === "orders" && (
        <SettingsPanel
          title="Regras dos pedidos"
          description="Defina como o checkout e o atendimento funcionam."
        >
          <div className="settings-options">
            <Option
              title="Aceitar pedidos automaticamente"
              description="Novos pedidos podem ser confirmados sem ação manual."
            >
              <Toggle
                checked={store.autoAcceptOrders}
                onChange={(value) =>
                  setStore({ ...store, autoAcceptOrders: value })
                }
              />
            </Option>
            <Option
              title="Permitir retirada"
              description="Cliente pode selecionar retirada no checkout."
            >
              <Toggle
                checked={store.allowPickup}
                onChange={(value) => setStore({ ...store, allowPickup: value })}
              />
            </Option>
            <Option
              title="Permitir entrega"
              description="Cliente pode solicitar delivery."
            >
              <Toggle
                checked={store.allowDelivery}
                onChange={(value) =>
                  setStore({ ...store, allowDelivery: value })
                }
              />
            </Option>
          </div>
          <div className="settings-form">
            <Field label="Tempo médio de preparo (min)">
              <input
                min="1"
                type="number"
                value={store.averagePreparationMinutes}
                onChange={(e) =>
                  setStore({
                    ...store,
                    averagePreparationMinutes: Number(e.target.value),
                  })
                }
              />
            </Field>
            <Field label="Pedido mínimo">
              <input
                inputMode="numeric"
                value={formatCurrencyField(store.minimumOrder)}
                onChange={(event) => setStore({ ...store, minimumOrder: String(parseCurrencyField(event.target.value) ?? "") })}
                placeholder="R$ 0,00"
              />
            </Field>
            {store.allowDelivery && (
              <Field label="Valor da entrega (taxa fixa)">
                <input
                  inputMode="numeric"
                  value={formatCurrencyField(store.fixedDeliveryFee ?? "")}
                  onChange={(event) => setStore({ ...store, fixedDeliveryFee: String(parseCurrencyField(event.target.value) ?? "") || null })}
                  placeholder="Taxa por bairro"
                  aria-describedby="fixed-delivery-fee-help"
                />
                <small id="fixed-delivery-fee-help">Ao preencher, a entrega usa este valor em toda a cidade da loja, sem exigir regiões cadastradas. Deixe vazio para usar as taxas por bairro.</small>
              </Field>
            )}
          </div>
          <SaveButton saving={saving} onClick={() => void saveStore()} />
        </SettingsPanel>
      )}
      {tab === "delivery" && <CouriersSettings />}
      {tab === "delivery" && (
        <SettingsPanel
          title="Regiões de entrega"
          description="Taxas, prazo e pedido mínimo por bairro."
        >
          <button className="settings-add" onClick={() => setZoneDialog("new")}>
            <Plus />
            Nova região
          </button>
          <div className="zone-table">
            <div>
              <span>Região</span>
              <span>Taxa</span>
              <span>Estimativa</span>
              <span>Mínimo</span>
              <span>Status</span>
              <span />
            </div>
            {data.zones.map((zone) => (
              <button key={zone.id} onClick={() => setZoneDialog(zone)}>
                <span>
                  <MapPin />
                  {zone.name}
                </span>
                <span>R$ {Number(zone.fee).toFixed(2).replace(".", ",")}</span>
                <span>
                  {zone.estimatedMinutesMin}–{zone.estimatedMinutesMax} min
                </span>
                <span>
                  R$ {Number(zone.minimumOrder).toFixed(2).replace(".", ",")}
                </span>
                <span className={zone.active ? "zone-active" : "zone-inactive"}>
                  {zone.active ? "Ativa" : "Inativa"}
                </span>
                <Settings />
              </button>
            ))}
          </div>
          {!data.zones.length && (
            <div className="settings-empty">
              <MapPin />
              <p>Nenhuma região cadastrada.</p>
            </div>
          )}
        </SettingsPanel>
      )}
      {tab === "payments" && (
        <SettingsPanel
          title="Formas de pagamento"
          description="Escolha as opções disponíveis no checkout."
        >
          <div className="settings-options payment-options">
            <Option
              icon={<Smartphone />}
              title="PIX"
              description="Pagamento por chave PIX."
            >
              <Toggle
                checked={store.pixEnabled}
                onChange={(value) => setStore({ ...store, pixEnabled: value })}
              />
            </Option>
            <Option
              icon={<Banknote />}
              title="Dinheiro"
              description="Pagamento em dinheiro na entrega."
            >
              <Toggle
                checked={store.cashEnabled}
                onChange={(value) => setStore({ ...store, cashEnabled: value })}
              />
            </Option>
            <Option
              icon={<CreditCard />}
              title="Cartão na entrega"
              description="Crédito ou débito na maquininha."
            >
              <Toggle
                checked={store.cardOnDeliveryEnabled}
                onChange={(value) =>
                  setStore({ ...store, cardOnDeliveryEnabled: value })
                }
              />
            </Option>
            <Option
              icon={<CreditCard />}
              title="Pagamento online"
              description="Registro sem cobrança automática. A equipe confirma o recebimento no pedido."
            >
              <Toggle
                checked={store.onlinePaymentEnabled}
                onChange={(value) =>
                  setStore({ ...store, onlinePaymentEnabled: value })
                }
              />
            </Option>
          </div>
          {store.pixEnabled && (
            <div className="settings-form">
              <Field label="Chave PIX" wide>
                <input
                  value={store.pixKey ?? ""}
                  onChange={(e) =>
                    setStore({ ...store, pixKey: e.target.value })
                  }
                  placeholder="CPF, CNPJ, telefone, e-mail ou chave aleatória"
                />
              </Field>
            </div>
          )}
          <SaveButton saving={saving} onClick={() => void saveStore()} />
        </SettingsPanel>
      )}
      {zoneDialog && (
        <ZoneDialog
          zone={zoneDialog === "new" ? null : zoneDialog}
          saving={saving}
          onClose={() => setZoneDialog(null)}
          onDelete={
            zoneDialog !== "new"
              ? async () => {
                  if (confirm("Excluir esta região?")) {
                    await settingsApi.removeZone(zoneDialog.id);
                    setZoneDialog(null);
                    await load();
                  }
                }
              : undefined
          }
          onSave={async (input) => {
            setSaving(true);
            try {
              if (zoneDialog === "new") await settingsApi.createZone(input);
              else await settingsApi.updateZone(zoneDialog.id, input);
              setZoneDialog(null);
              await load();
              setSuccess("Região salva.");
            } catch (reason) {
              setError(
                reason instanceof Error
                  ? reason.message
                  : "Falha ao salvar região.",
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
function SettingsPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel settings-panel">
      <header>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </header>
      <div>{children}</div>
    </section>
  );
}
function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={wide ? "wide" : ""}>
      {label}
      {children}
    </label>
  );
}
function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label?: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={`settings-toggle ${checked ? "on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <i />
      <span>{label}</span>
    </button>
  );
}
function Option({
  icon,
  title,
  description,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <article>
      {icon}
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      {children}
    </article>
  );
}
function SaveButton({
  saving,
  onClick,
}: {
  saving: boolean;
  onClick: () => void;
}) {
  return (
    <footer>
      <button className="settings-save" disabled={saving} onClick={onClick}>
        {saving ? <LoaderCircle className="spinner" /> : <Save />}Salvar
        alterações
      </button>
    </footer>
  );
}
function ZoneDialog({
  zone,
  saving,
  onClose,
  onSave,
  onDelete,
}: {
  zone: DeliveryZone | null;
  saving: boolean;
  onClose: () => void;
  onSave: (input: {
    name: string;
    fee: number;
    estimatedMinutesMin: number;
    estimatedMinutesMax: number;
    minimumOrder: number;
    active: boolean;
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [locationQuery, setLocationQuery] = useState("");
  const [locationResults, setLocationResults] = useState<
    Array<{ name: string; city: string; state: string; label: string }>
  >([]);
  const [locationMessage, setLocationMessage] = useState("");
  const [locationLoading, setLocationLoading] = useState(false);
  const [form, setForm] = useState({
    name: zone?.name ?? "",
    fee: Number(zone?.fee ?? 0),
    estimatedMinutesMin: zone?.estimatedMinutesMin ?? 30,
    estimatedMinutesMax: zone?.estimatedMinutesMax ?? 45,
    minimumOrder: Number(zone?.minimumOrder ?? 0),
    active: zone?.active ?? true,
  });
  async function searchNeighborhood() {
    const query = locationQuery.trim();
    if (query.length < 3) {
      setLocationMessage("Digite ao menos 3 caracteres do bairro.");
      return;
    }
    setLocationLoading(true);
    setLocationMessage("");
    setLocationResults([]);
    try {
      const response = await fetch(
        `${API_URL}/delivery/locations?q=${encodeURIComponent(query)}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("urfood_token")}`,
          },
        },
      );
      const result = (await response.json()) as Array<{
        name: string;
        city: string;
        state: string;
        label: string;
      }> & { message?: string };
      if (!response.ok)
        throw new Error(
          result.message ?? "Não foi possível consultar localidades.",
        );
      setLocationResults(result);
      if (!result.length)
        setLocationMessage(
          "Nenhum bairro encontrado. Inclua a cidade ou UF na busca.",
        );
    } catch (reason) {
      setLocationMessage(
        reason instanceof Error
          ? reason.message
          : "Não foi possível consultar localidades.",
      );
    } finally {
      setLocationLoading(false);
    }
  }
  return (
    <div className="inventory-dialog-overlay">
      <section className="inventory-dialog">
        <header>
          <h2>{zone ? "Editar região" : "Nova região"}</h2>
          <button onClick={onClose}>
            <X />
          </button>
        </header>
        <form
          className="inventory-form"
          onSubmit={(e) => {
            e.preventDefault();
            void onSave(form);
          }}
        >
          <label>
            Região / bairro
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="zone-location-search">
            Localizar bairro
            <div className="settings-location-search">
              <input
                value={locationQuery}
                onChange={(event) => setLocationQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void searchNeighborhood();
                  }
                }}
                placeholder="Ex.: Vila Caxias"
              />
              <button
                type="button"
                disabled={locationLoading}
                onClick={() => void searchNeighborhood()}
              >
                {locationLoading ? (
                  <LoaderCircle className="spinner" />
                ) : (
                  <Search />
                )}{" "}
                Buscar
              </button>
            </div>
            {locationMessage && (
              <small className="error">{locationMessage}</small>
            )}
            {!!locationResults.length && (
              <div className="location-results">
                {locationResults.map((item) => (
                  <button
                    type="button"
                    key={`${item.name}-${item.city}-${item.state}`}
                    onClick={() => {
                      setForm((current) => ({ ...current, name: item.name }));
                      setLocationQuery(item.label);
                      setLocationResults([]);
                      setLocationMessage("");
                    }}
                  >
                    <MapPin />
                    <span>
                      <strong>{item.name}</strong>
                      <small>
                        {item.city} / {item.state}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
            )}
            <small className="location-attribution">
              Município validado pelo CEP da loja · Dados © OpenStreetMap
              contributors
            </small>
          </label>
          <label>
            Taxa de entrega
            <input
              min="0"
              step="0.01"
              type="number"
              value={form.fee}
              onChange={(e) =>
                setForm({ ...form, fee: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Tempo mínimo
            <input
              min="1"
              type="number"
              value={form.estimatedMinutesMin}
              onChange={(e) =>
                setForm({
                  ...form,
                  estimatedMinutesMin: Number(e.target.value),
                })
              }
            />
          </label>
          <label>
            Tempo máximo
            <input
              min="1"
              type="number"
              value={form.estimatedMinutesMax}
              onChange={(e) =>
                setForm({
                  ...form,
                  estimatedMinutesMax: Number(e.target.value),
                })
              }
            />
          </label>
          <label>
            Pedido mínimo
            <input
              inputMode="numeric"
              value={formatCurrencyField(form.minimumOrder)}
              onChange={(event) => setForm({ ...form, minimumOrder: parseCurrencyField(event.target.value) ?? 0 })}
              placeholder="R$ 0,00"
            />
          </label>
          <label className="zone-check">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            Região ativa
          </label>
          <footer>
            {onDelete && (
              <button
                type="button"
                className="zone-delete"
                onClick={() => void onDelete()}
              >
                <Trash2 />
                Excluir
              </button>
            )}
            <button type="button" onClick={onClose}>
              Cancelar
            </button>
            <button className="save" disabled={saving}>
              Salvar
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
