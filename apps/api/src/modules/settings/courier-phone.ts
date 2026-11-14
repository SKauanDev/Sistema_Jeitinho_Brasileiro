export function courierPhone(value: unknown) {
  if (value == null || value === "") return "";
  if (typeof value !== "string" || /[^\d\s()+.\-]/.test(value)) throw Error("Informe um telefone válido com DDD.");
  let digits = value.replace(/\D/g, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) digits = digits.slice(2);
  if (![10, 11].includes(digits.length)) throw Error("Informe o telefone completo com DDD.");
  const split = digits.length === 11 ? 7 : 6;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, split)}-${digits.slice(split)}`;
}
