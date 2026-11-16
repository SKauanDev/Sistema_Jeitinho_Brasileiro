type Border = {
  id: string;
  name: string;
  type: "SAVORY" | "SWEET";
  price: number;
};
type Props = {
  borders: Border[];
  selectedId?: string;
  needsStyle: boolean;
  onChange: (id?: string) => void;
};
const money = (price: number) =>
  price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function PizzaBorderPicker({
  borders,
  selectedId,
  needsStyle,
  onChange,
}: Props) {
  return (
    <fieldset className="pizza-border-picker">
      <legend>Borda recheada · opcional</legend>
      {!borders.length ? (
        <p className="pizza-border-hint">
          {needsStyle
            ? "Escolha o estilo da massa para ver as bordas disponíveis."
            : "Sem borda recheada disponível para este estilo."}
        </p>
      ) : (
        <>
          <select
            className="pizza-border-desktop"
            aria-label="Borda recheada"
            value={selectedId ?? ""}
            onChange={(event) => onChange(event.target.value || undefined)}
          >
            <option value="">Sem borda recheada</option>
            {(["SAVORY", "SWEET"] as const).map((type) => (
              <optgroup
                key={type}
                label={type === "SAVORY" ? "Salgadas" : "Doces"}
              >
                {borders
                  .filter((border) => border.type === type)
                  .map((border) => (
                    <option key={border.id} value={border.id}>
                      {border.name} · + {money(border.price)}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <div
            className="pizza-border-mobile"
            role="group"
            aria-label="Escolha a borda recheada"
          >
            <button
              type="button"
              className="pizza-border-none"
              aria-pressed={!selectedId}
              onClick={() => onChange(undefined)}
            >
              Sem borda recheada
            </button>
            {(["SAVORY", "SWEET"] as const).map((type) => {
              const options = borders.filter((border) => border.type === type);
              return (
                !!options.length && (
                  <div className="pizza-border-type" key={type}>
                    <span>{type === "SAVORY" ? "Salgadas" : "Doces"}</span>
                    <div>
                      {options.map((border) => (
                        <button
                          type="button"
                          key={border.id}
                          aria-pressed={selectedId === border.id}
                          onClick={() => onChange(border.id)}
                        >
                          <strong>{border.name}</strong>
                          <small>+ {money(border.price)}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              );
            })}
          </div>
        </>
      )}
    </fieldset>
  );
}
