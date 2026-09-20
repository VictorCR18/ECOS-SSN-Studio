// src/utils/id.ts

export function gerarId(prefixo = "modelo"): string {
  const aleatorio =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefixo}_${aleatorio}`;
}
