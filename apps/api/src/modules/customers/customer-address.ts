const lengths = {
  street: 180,
  number: 30,
  neighborhood: 120,
  city: 120,
  state: 2,
  postalCode: 8,
  complement: 120,
};
export function parseCustomerAddress(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw Error("Informe um endereço válido.");
  const value = input as Record<string, unknown>,
    address: Record<string, string> = {};
  for (const [key, max] of Object.entries(lengths)) {
    if (value[key] != null && typeof value[key] !== "string")
      throw Error("Endereço inválido.");
    let text = String(value[key] ?? "").trim();
    if (key === "postalCode") text = text.replace(/\D/g, "");
    if (key === "state") text = text.toUpperCase();
    if (
      text.length > max ||
      (key === "postalCode" && text && text.length !== 8) ||
      (key === "state" && text && !/^[A-Z]{2}$/.test(text))
    )
      throw Error("Confira o CEP, a UF e o tamanho dos campos do endereço.");
    address[key] = text;
  }
  return address;
}
